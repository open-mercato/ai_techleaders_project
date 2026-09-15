import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { EntityManager } from '@mikro-orm/postgresql';
import { MikroORM } from '@mikro-orm/postgresql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  RateLimiter,
  TooManyRequestsError,
  rateLimitKey,
  type RateLimitPolicy,
} from '@devmentor/core';
import { entities } from '@devmentor/db';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** The migrations under test, and the one that must survive their rollback. */
const BASE_MIGRATION = 'Migration20260901142829';
const AUTH_IDENTITY_MIGRATION = 'Migration20260909222320_auth_identity';
const AUTH_PASSWORD_MIGRATION = 'Migration20260910092433_auth_password';
const AUTH_RATE_LIMITS_MIGRATION = 'Migration20260910095701_auth_rate_limits';
const INVITATIONS_MIGRATION = 'Migration20260910130526_invitations';
const MENTOR_PAGE_MIGRATION = 'Migration20260910163000_mentor_page';
const AVAILABILITY_MIGRATION = 'Migration20260910170021_availability_slots';
const MENTOR_PRICES_MIGRATION = 'Migration20260910185543_mentor_prices';

/** A row created before `auth-identity` — the population the backfill exists for. */
const LEGACY_EMAIL = 'legacy@devmentor.test';

const NEW_COLUMNS = [
  'avatar_url',
  'email_verified_at',
  'github_id',
  'github_login',
  'roles',
  'session_version',
];

const NEW_CONSTRAINTS = ['users_github_id_unique', 'users_roles_check', 'users_roles_non_empty'];

/** The `users` column `auth-password` adds, on its own so the two migrations stay separable. */
const PASSWORD_COLUMN = 'password_hash';

/** The whole of `auth_rate_limits` — three columns, and deliberately no base columns. */
const RATE_LIMIT_COLUMNS = ['count', 'key', 'window_start'];

const INVITATION_COLUMNS = [
  'accepted_at',
  'accepted_by_id',
  'batch',
  'created_at',
  'email',
  'expires_at',
  'id',
  'publish_due_at',
  'revoked_at',
  'stack_tags',
  'token_hash',
  'updated_at',
];

const INVITATION_CONSTRAINTS = [
  'invitations_acceptance_complete',
  'invitations_accepted_by_id_foreign',
  'invitations_stack_tags_check',
  'invitations_token_hash_unique',
];

/**
 * `auth-identity` and `auth-password`, each up / down / up against a database of its own.
 *
 * `SDLC.md` requires a schema migration to prove both directions, and `auth-identity`
 * carries a data change as well as DDL, so "it applied cleanly" is not enough: the rollback
 * must leave the pre-existing rows intact, and a re-application must produce exactly the
 * same schema rather than a second, subtly different one.
 *
 * The two migrations share one container and one legacy row, and the `it` blocks run in
 * order, each one leaving the schema where the next expects it: identity up, password up,
 * password down, password up, both down, both up. That order is the point rather than an
 * accident — `auth-password` has to be shown surviving on top of `auth-identity` *and*
 * rolling back off it without taking the identity columns with it, which is the documented
 * rollback path ("revert Slice 4 before Slice 2 if both must go").
 *
 * The suite owns its infrastructure — its own Testcontainers PostgreSQL on a random
 * port, torn down on success and failure — because it deliberately rolls the schema
 * backwards, which the shared harness database (already migrated, seeded and serving the
 * app) cannot survive. `DB_MIGRATIONS_SNAPSHOT=false` keeps `migration:up`/`:down` from
 * rewriting the repository's committed schema snapshot from this throwaway database.
 */
describe('TC-DB-001 the auth-identity and auth-password migrations', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM | undefined;
  let clientUrl: string;
  let childEnvironment: NodeJS.ProcessEnv;

  async function migrate(...extraArgs: string[]): Promise<void> {
    await execFileAsync(
      npmExecutable,
      ['run', 'migration:up', '--workspace', '@devmentor/db', '--', ...extraArgs],
      { cwd: root, env: childEnvironment, maxBuffer: 20 * 1024 * 1024, timeout: 120_000 },
    );
  }

  async function rollbackOne(): Promise<void> {
    await execFileAsync(
      npmExecutable,
      ['run', 'migration:down', '--workspace', '@devmentor/db'],
      { cwd: root, env: childEnvironment, maxBuffer: 20 * 1024 * 1024, timeout: 120_000 },
    );
  }

  /**
   * Revert every migration applied after `target`.
   *
   * `rollbackOne` reverts whatever happens to be last, which is only a useful thing to say
   * while the migration under test *is* last. A test about one migration being independently
   * revertable has to name it, or it silently starts testing a later one.
   */
  async function rollbackTo(target: string): Promise<void> {
    await execFileAsync(
      npmExecutable,
      ['run', 'migration:down', '--workspace', '@devmentor/db', '--', '--to', target],
      { cwd: root, env: childEnvironment, maxBuffer: 20 * 1024 * 1024, timeout: 120_000 },
    );
  }

  async function query<T extends object>(sql: string): Promise<T[]> {
    return (orm as MikroORM).em.getConnection().execute<T[]>(sql);
  }

  /** The single row a lookup must return, so an empty result fails loudly. */
  async function queryOne<T extends object>(sql: string): Promise<T> {
    const [row] = await query<T>(sql);
    if (!row) {
      throw new Error(`Expected exactly one row from: ${sql}`);
    }
    return row;
  }

  /** The `users` columns this migration adds, as the database reports them. */
  async function newColumns(): Promise<{ column_name: string; udt_name: string }[]> {
    return query(`
      select column_name, udt_name
      from information_schema.columns
      where table_name = 'users' and column_name in (${NEW_COLUMNS.map((c) => `'${c}'`).join(', ')})
      order by column_name
    `);
  }

  /**
   * `password_hash` as the database reports it, or `[]` when the column is absent.
   *
   * `text`, not `varchar(60)`: 60 is bcrypt's output width and this project hashes with
   * `scrypt`, so the width would pin the schema to an algorithm it does not use. Nullable
   * because a GitHub-only account has no password.
   */
  async function passwordColumn(): Promise<
    { column_name: string; udt_name: string; is_nullable: string; column_default: string | null }[]
  > {
    return query(`
      select column_name, udt_name, is_nullable, column_default
      from information_schema.columns
      where table_name = 'users' and column_name = '${PASSWORD_COLUMN}'
    `);
  }

  /** The `users` constraints this migration adds, with their definitions. */
  async function newConstraints(): Promise<{ conname: string; def: string }[]> {
    return query(`
      select con.conname, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      where rel.relname = 'users'
        and con.conname in (${NEW_CONSTRAINTS.map((c) => `'${c}'`).join(', ')})
      order by con.conname
    `);
  }

  /** `auth_rate_limits`'s columns as the database reports them, or `[]` when it is absent. */
  async function rateLimitColumns(): Promise<
    { column_name: string; udt_name: string; is_nullable: string }[]
  > {
    return query(`
      select column_name, udt_name, is_nullable
      from information_schema.columns
      where table_name = 'auth_rate_limits'
      order by column_name
    `);
  }

  async function rateLimitIndexes(): Promise<{ indexname: string; indexdef: string }[]> {
    return query(
      `select indexname, indexdef from pg_indexes where tablename = 'auth_rate_limits' order by indexname`,
    );
  }

  async function invitationColumns(): Promise<
    { column_name: string; udt_name: string; is_nullable: string }[]
  > {
    return query(`
      select column_name, udt_name, is_nullable
      from information_schema.columns
      where table_name = 'invitations'
      order by column_name
    `);
  }

  async function invitationConstraints(): Promise<{ conname: string; def: string }[]> {
    return query(`
      select con.conname, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      where rel.relname = 'invitations'
        and con.conname in (${INVITATION_CONSTRAINTS.map((c) => `'${c}'`).join(', ')})
      order by con.conname
    `);
  }

  async function invitationIndexes(): Promise<{ indexname: string; indexdef: string }[]> {
    return query(`
      select indexname, indexdef
      from pg_indexes
      where tablename = 'invitations'
        and indexname = 'invitations_pending_email_unique'
    `);
  }

  async function mentorDeadlineColumn(): Promise<
    { column_name: string; udt_name: string; is_nullable: string }[]
  > {
    return query(`
      select column_name, udt_name, is_nullable
      from information_schema.columns
      where table_name = 'mentor_profiles' and column_name = 'initial_publish_due_at'
    `);
  }

  async function mentorPageColumns(): Promise<
    { column_name: string; udt_name: string; is_nullable: string; column_default: string | null }[]
  > {
    return query(`
      select column_name, udt_name, is_nullable, column_default
      from information_schema.columns
      where table_name = 'mentor_profiles'
        and column_name in ('slug', 'public_work_url', 'stack_tags', 'published_at')
      order by column_name
    `);
  }

  async function mentorPageConstraints(): Promise<{ conname: string; def: string }[]> {
    return query(`
      select con.conname, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      where rel.relname = 'mentor_profiles'
        and con.conname in (
          'mentor_profiles_slug_unique',
          'mentor_profiles_stack_tags_check',
          'mentor_profiles_publication_has_slug'
        )
      order by con.conname
    `);
  }

  async function mentorPriceColumns(): Promise<
    { column_name: string; udt_name: string; is_nullable: string }[]
  > {
    return query(`
      select column_name, udt_name, is_nullable
      from information_schema.columns
      where table_name = 'mentor_profiles'
        and column_name in ('price_25_cents', 'price_50_cents')
      order by column_name
    `);
  }

  async function mentorPriceConstraints(): Promise<{ conname: string; def: string }[]> {
    return query(`
      select con.conname, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      where rel.relname = 'mentor_profiles'
        and con.conname in (
          'mentor_profiles_price_25_positive',
          'mentor_profiles_price_50_positive'
        )
      order by con.conname
    `);
  }

  async function constraintFrom(operation: () => Promise<unknown>): Promise<string> {
    try {
      await operation();
      return 'accepted';
    } catch (error) {
      return (error as { constraint?: string }).constraint ?? String(error);
    }
  }

  async function appliedMigrations(): Promise<string[]> {
    const rows = await query<{ name: string }>(
      `select name from mikro_orm_migrations order by executed_at, name`,
    );
    return rows.map((row) => row.name);
  }

  /** Attempt an insert and report the constraint that refused it, if any. */
  async function insertRoles(roles: string): Promise<string> {
    try {
      await query(`
        insert into users (id, created_at, updated_at, email, display_name, roles)
        values (gen_random_uuid(), now(), now(), 'probe-${Date.now()}@devmentor.test', 'Probe', ${roles})
      `);
      return 'accepted';
    } catch (error) {
      const violated = (error as { code?: string; constraint?: string }).constraint;
      return violated ?? String(error);
    }
  }

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('devmentor_migration_test')
      .withUsername('devmentor')
      .withPassword('devmentor')
      .start();

    clientUrl = postgres.getConnectionUri();
    childEnvironment = {
      ...process.env,
      DATABASE_URL: clientUrl,
      DB_POOL_MIN: '0',
      DB_POOL_MAX: '5',
      // Never let a throwaway database rewrite `packages/db/migrations/devmentor.json`:
      // `migration:up`/`:down` re-store the snapshot from introspection when it differs,
      // and this suite deliberately rolls the schema backwards, so it differs by design.
      //
      // MikroORM's own MIKRO_ORM_MIGRATIONS_SNAPSHOT — which this used to set — does not
      // reach the Migrator: the constructor merges as `Utils.merge(env, options)` unless
      // `preferEnvVars` is set, so `packages/db/src/config.ts`'s explicit `snapshot` wins.
      // `DB_MIGRATIONS_SNAPSHOT` is that config value's own input, so it actually applies.
      DB_MIGRATIONS_SNAPSHOT: 'false',
    };

    orm = await MikroORM.init({
      clientUrl,
      entities: [],
      discovery: { warnWhenNoEntities: false },
      // Room for the concurrency case below to hold several connections at once: with a
      // pool of two, "twelve simultaneous attempts" would be six pairs and the lost-update
      // this asserts against could hide behind the queue.
      pool: { min: 0, max: 12 },
    });
    await orm.connect();

    // Stop one migration short, then create the row the backfill has to find.
    await migrate('--to', BASE_MIGRATION);
    await query(`
      insert into users (id, created_at, updated_at, email, display_name)
      values (gen_random_uuid(), now(), now(), '${LEGACY_EMAIL}', 'Legacy Row')
    `);
  });

  afterAll(async () => {
    await orm?.close(true);
    await postgres?.stop();
  });

  it('applies: adds the columns and constraints and verifies every existing row', async () => {
    // Stop at `auth-identity` so the two migrations are asserted apart; the next block
    // brings the database the rest of the way.
    await migrate('--to', AUTH_IDENTITY_MIGRATION);

    expect(await appliedMigrations()).toEqual([BASE_MIGRATION, AUTH_IDENTITY_MIGRATION]);
    expect(await newColumns()).toEqual([
      { column_name: 'avatar_url', udt_name: 'text' },
      { column_name: 'email_verified_at', udt_name: 'timestamptz' },
      { column_name: 'github_id', udt_name: 'varchar' },
      { column_name: 'github_login', udt_name: 'varchar' },
      // `_text` is a native `text[]`. `varchar(255)[]` or `jsonb` here would break `@>`
      // membership querying, which every authorization decision rests on.
      { column_name: 'roles', udt_name: '_text' },
      { column_name: 'session_version', udt_name: 'int4' },
    ]);
    expect(await newConstraints()).toEqual([
      { conname: 'users_github_id_unique', def: 'UNIQUE (github_id)' },
      {
        conname: 'users_roles_check',
        def: "CHECK ((roles <@ ARRAY['mentee'::text, 'mentor'::text, 'operator'::text]))",
      },
      { conname: 'users_roles_non_empty', def: 'CHECK ((cardinality(roles) >= 1))' },
    ]);

    const legacy = await queryOne<{ roles: string[]; verified: boolean; session_version: number }>(
      `select roles, email_verified_at is not null as verified, session_version
       from users where email = '${LEGACY_EMAIL}'`,
    );
    // The backfill is the point: a row left unverified could never link a GitHub
    // identity, and deleting it instead would take Ada Lovelace's row with it.
    expect(legacy.verified).toBe(true);
    expect(legacy.roles).toEqual(['mentee']);
    expect(legacy.session_version).toBe(0);
  });

  it('enforces the roles constraints, including the empty array', async () => {
    // `array_length('{}', 1)` is NULL and a CHECK passes on NULL, so the empty case is
    // the one a plausible `array_length` implementation would let through.
    expect(await insertRoles(`'{}'`)).toBe('users_roles_non_empty');
    expect(await insertRoles(`'{admin}'`)).toBe('users_roles_check');
    expect(await insertRoles(`array['mentee', null]`)).toBe('users_roles_check');
    expect(await insertRoles(`'{operator,mentor}'`)).toBe('accepted');
  });

  it('applies auth-password: one nullable text column and nothing else', async () => {
    // `--to` again rather than a bare `migrate()`: `auth-rate-limits` sits behind this one
    // and has to be asserted on its own, the same way `auth-password` is asserted apart
    // from `auth-identity`.
    await migrate('--to', AUTH_PASSWORD_MIGRATION);

    expect(await appliedMigrations()).toEqual([
      BASE_MIGRATION,
      AUTH_IDENTITY_MIGRATION,
      AUTH_PASSWORD_MIGRATION,
    ]);
    expect(await passwordColumn()).toEqual([
      {
        column_name: 'password_hash',
        // `text`. A `varchar` here would report `varchar` and pin the column to bcrypt's
        // 60-character output width, closing the argon2id upgrade path the spec keeps open.
        udt_name: 'text',
        // A GitHub-only account has no password, so `not null` could not be satisfied by
        // the rows `auth-identity` just verified — and a default would be a fake credential.
        is_nullable: 'YES',
        column_default: null,
      },
    ]);
    // Additive means additive: the identity columns and constraints are untouched, and no
    // row acquired a credential it did not have.
    expect((await newColumns()).map((column) => column.column_name)).toEqual(NEW_COLUMNS);
    expect((await newConstraints()).map((constraint) => constraint.conname)).toEqual(
      NEW_CONSTRAINTS,
    );
    const legacy = await queryOne<{ display_name: string; password_hash: string | null }>(
      `select display_name, password_hash from users where email = '${LEGACY_EMAIL}'`,
    );
    expect(legacy).toEqual({ display_name: 'Legacy Row', password_hash: null });
  });

  it('rolls back auth-password: the column goes, the identity columns stay', async () => {
    await rollbackOne();

    expect(await appliedMigrations()).toEqual([BASE_MIGRATION, AUTH_IDENTITY_MIGRATION]);
    expect(await passwordColumn()).toEqual([]);
    // The documented rollback path is "revert Slice 4 before Slice 2 if both must go", so
    // reverting the password column alone has to leave every GitHub account able to sign in.
    expect((await newColumns()).map((column) => column.column_name)).toEqual(NEW_COLUMNS);
    expect((await newConstraints()).map((constraint) => constraint.conname)).toEqual(
      NEW_CONSTRAINTS,
    );
    const legacy = await queryOne<{ display_name: string; verified: boolean }>(
      `select display_name, email_verified_at is not null as verified
       from users where email = '${LEGACY_EMAIL}'`,
    );
    expect(legacy).toEqual({ display_name: 'Legacy Row', verified: true });
  });

  it('re-applies auth-password: the second up produces the same column', async () => {
    await migrate('--to', AUTH_PASSWORD_MIGRATION);

    expect(await appliedMigrations()).toEqual([
      BASE_MIGRATION,
      AUTH_IDENTITY_MIGRATION,
      AUTH_PASSWORD_MIGRATION,
    ]);
    expect(await passwordColumn()).toEqual([
      {
        column_name: 'password_hash',
        udt_name: 'text',
        is_nullable: 'YES',
        column_default: null,
      },
    ]);
  });

  it('applies auth-rate-limits: a three-column counter table with no base columns', async () => {
    await migrate('--to', AUTH_RATE_LIMITS_MIGRATION);

    expect(await appliedMigrations()).toEqual([
      BASE_MIGRATION,
      AUTH_IDENTITY_MIGRATION,
      AUTH_PASSWORD_MIGRATION,
      AUTH_RATE_LIMITS_MIGRATION,
    ]);
    expect(await rateLimitColumns()).toEqual([
      { column_name: 'count', udt_name: 'int4', is_nullable: 'NO' },
      { column_name: 'key', udt_name: 'text', is_nullable: 'NO' },
      { column_name: 'window_start', udt_name: 'timestamptz', is_nullable: 'NO' },
    ]);
    // The documented exception, asserted rather than described: no `id`, no `created_at`,
    // no `updated_at`. Every other table in this schema has all three.
    expect((await rateLimitColumns()).map((column) => column.column_name)).toEqual(
      RATE_LIMIT_COLUMNS,
    );
    // The primary key is the natural text key — that is what the upsert conflicts on —
    // and `window_start` carries the index the pruning delete runs on.
    expect(await rateLimitIndexes()).toEqual([
      {
        indexname: 'auth_rate_limits_pkey',
        indexdef:
          'CREATE UNIQUE INDEX auth_rate_limits_pkey ON public.auth_rate_limits USING btree (key)',
      },
      {
        indexname: 'auth_rate_limits_window_start_index',
        indexdef:
          'CREATE INDEX auth_rate_limits_window_start_index ON public.auth_rate_limits USING btree (window_start)',
      },
    ]);
    // Additive: `users` is exactly where `auth-password` left it.
    expect((await passwordColumn()).map((column) => column.column_name)).toEqual([
      PASSWORD_COLUMN,
    ]);
  });

  /**
   * `RateLimiter` against the table the migration above just created.
   *
   * This is where the *statement* is proven, as opposed to the module's decisions, which
   * `packages/core/src/http/rate-limit.test.ts` covers with a fake `EntityManager`. The
   * window rollover, the pruning delete and the behaviour of `INSERT … ON CONFLICT` under
   * concurrent connections are PostgreSQL semantics; a unit test could only assert them
   * against a hand-written model of PostgreSQL, which would prove that the model matches
   * itself.
   */
  describe('the rate limiter against the real table', () => {
    /** A tight policy, so a case spends three attempts rather than ten. */
    const POLICY: RateLimitPolicy = { limit: 3, windowMs: 15 * 60_000 };
    const START = new Date('2026-09-10T12:00:00.000Z');

    let now: Date;
    const limiter = () =>
      new RateLimiter({ em: (orm as MikroORM).em as EntityManager, clock: { now: () => now } });

    async function countFor(key: string): Promise<number | undefined> {
      const rows = await query<{ count: number }>(
        `select count from auth_rate_limits where key = '${key}'`,
      );
      return rows[0]?.count;
    }

    async function reset(): Promise<void> {
      now = START;
      await query(`delete from auth_rate_limits`);
    }

    it('passes the whole allowance and refuses the next attempt with a 429', async () => {
      await reset();
      const key = rateLimitKey('sign-in', 'email', 'ada@devmentor.dev') as string;

      for (let attempt = 0; attempt < POLICY.limit; attempt += 1) {
        await expect(limiter().consume(key, POLICY)).resolves.toBeUndefined();
      }

      const refusal = await limiter()
        .consume(key, POLICY)
        .catch((error: unknown) => error);
      expect(refusal).toBeInstanceOf(TooManyRequestsError);
      // The window opened at `now`, and nothing has advanced the clock, so the caller is
      // told to wait the whole window out.
      expect((refusal as TooManyRequestsError).retryAfterSeconds).toBe(900);
      // The refused attempt was counted too: the counter never decrements.
      expect(await countFor(key)).toBe(4);
    });

    it('rolls the window over inside the one statement', async () => {
      await reset();
      const key = rateLimitKey('sign-in', 'email', 'rollover@devmentor.dev') as string;

      for (let attempt = 0; attempt < POLICY.limit; attempt += 1) {
        await limiter().consume(key, POLICY);
      }
      await expect(limiter().consume(key, POLICY)).rejects.toThrow(TooManyRequestsError);

      // One second inside the window is still the same window.
      now = new Date(START.getTime() + POLICY.windowMs - 1000);
      await expect(limiter().consume(key, POLICY)).rejects.toThrow(TooManyRequestsError);

      // One second past it is a new one, reset to a single attempt rather than incremented.
      now = new Date(START.getTime() + POLICY.windowMs + 1000);
      await expect(limiter().consume(key, POLICY)).resolves.toBeUndefined();
      expect(await countFor(key)).toBe(1);
    });

    it('deletes rows older than the longest window, and only those', async () => {
      await reset();
      const stale = 'sign-in:email:stale';
      const live = 'sign-in:email:live';
      const charged = rateLimitKey('register', 'ip', '198.51.100.1') as string;

      // Two hours old: past the longest policy window (one hour), so it can never
      // influence a decision again.
      await query(
        `insert into auth_rate_limits (key, window_start, count)
         values ('${stale}', '${new Date(START.getTime() - 2 * 60 * 60_000).toISOString()}', 9)`,
      );
      // Thirty minutes old: still inside the one-hour registration window.
      await query(
        `insert into auth_rate_limits (key, window_start, count)
         values ('${live}', '${new Date(START.getTime() - 30 * 60_000).toISOString()}', 4)`,
      );

      await limiter().consume(charged, POLICY);

      expect(await countFor(stale)).toBeUndefined();
      // Pruning by this policy's fifteen-minute window instead of the longest one would
      // have handed this registration bucket a free reset.
      expect(await countFor(live)).toBe(4);
      expect(await countFor(charged)).toBe(1);
    });

    it('resets its own expired row rather than deleting it out from under the upsert', async () => {
      await reset();
      const key = rateLimitKey('sign-in', 'ip', '203.0.113.7') as string;

      // A row for this very key, old enough that the prune would remove it. Deleting it
      // and then landing on it with `ON CONFLICT DO UPDATE` in the same command is what
      // PostgreSQL refuses, which is why the prune excludes the key being charged.
      await query(
        `insert into auth_rate_limits (key, window_start, count)
         values ('${key}', '${new Date(START.getTime() - 5 * 60 * 60_000).toISOString()}', 99)`,
      );

      await expect(limiter().consume(key, POLICY)).resolves.toBeUndefined();
      expect(await countFor(key)).toBe(1);
    });

    it('keeps every concurrent attempt: no two callers share one increment', async () => {
      await reset();
      const key = rateLimitKey('sign-in', 'ip', '198.51.100.99') as string;
      const generous: RateLimitPolicy = { limit: 1000, windowMs: 15 * 60_000 };

      // Twelve attempts issued at once over separate pooled connections. A read-then-write
      // limiter loses updates here and finishes below twelve; the single
      // `INSERT … ON CONFLICT DO UPDATE` serialises them on the primary key.
      await Promise.all(
        Array.from({ length: 12 }, () => limiter().consume(key, generous)),
      );

      expect(await countFor(key)).toBe(12);
    });

    it('keeps the per-IP and per-email buckets apart', async () => {
      await reset();
      const email = rateLimitKey('sign-in', 'email', 'ada@devmentor.dev') as string;
      const ip = rateLimitKey('sign-in', 'ip', '198.51.100.1') as string;

      await limiter().consume(email, POLICY);
      await limiter().consume(ip, POLICY);

      expect(await countFor(email)).toBe(1);
      expect(await countFor(ip)).toBe(1);
      // Two rows, two different hashed keys, and neither one contains the address it was
      // built from.
      const keys = await query<{ key: string }>(`select key from auth_rate_limits order by key`);
      expect(keys).toHaveLength(2);
      for (const row of keys) {
        expect(row.key).not.toContain('ada@devmentor.dev');
        expect(row.key).not.toContain('198.51.100.1');
        expect(row.key).toMatch(/^sign-in:(email|ip):[0-9a-f]{64}$/);
      }
    });

    it('leaves the table empty for the rollback that follows', async () => {
      await reset();
      expect(await query(`select key from auth_rate_limits`)).toEqual([]);
    });
  });

  it('rolls back auth-rate-limits: the table goes, users is untouched', async () => {
    await rollbackOne();

    expect(await appliedMigrations()).toEqual([
      BASE_MIGRATION,
      AUTH_IDENTITY_MIGRATION,
      AUTH_PASSWORD_MIGRATION,
    ]);
    expect(await rateLimitColumns()).toEqual([]);
    expect(await rateLimitIndexes()).toEqual([]);
    // Dropping the counters is the whole cost of this rollback: they are a
    // fifteen-minute-to-one-hour record the limiter deletes on its own anyway. Nothing
    // about `users` moves — the table has no foreign key, by design.
    expect((await passwordColumn()).map((column) => column.column_name)).toEqual([
      PASSWORD_COLUMN,
    ]);
    expect((await newColumns()).map((column) => column.column_name)).toEqual(NEW_COLUMNS);
  });

  it('re-applies auth-rate-limits: the second up produces the same table', async () => {
    await migrate('--to', AUTH_RATE_LIMITS_MIGRATION);

    expect(await appliedMigrations()).toEqual([
      BASE_MIGRATION,
      AUTH_IDENTITY_MIGRATION,
      AUTH_PASSWORD_MIGRATION,
      AUTH_RATE_LIMITS_MIGRATION,
    ]);
    expect((await rateLimitColumns()).map((column) => column.column_name)).toEqual(
      RATE_LIMIT_COLUMNS,
    );
    expect((await rateLimitIndexes()).map((index) => index.indexname)).toEqual([
      'auth_rate_limits_pkey',
      'auth_rate_limits_window_start_index',
    ]);
  });

  it('applies invitations with its exact columns, constraints, partial index and deadline', async () => {
    await migrate('--to', INVITATIONS_MIGRATION);

    expect(await appliedMigrations()).toEqual([
      BASE_MIGRATION,
      AUTH_IDENTITY_MIGRATION,
      AUTH_PASSWORD_MIGRATION,
      AUTH_RATE_LIMITS_MIGRATION,
      INVITATIONS_MIGRATION,
    ]);
    expect((await invitationColumns()).map((column) => column.column_name)).toEqual(
      INVITATION_COLUMNS,
    );
    expect(await invitationColumns()).toEqual([
      { column_name: 'accepted_at', udt_name: 'timestamptz', is_nullable: 'YES' },
      { column_name: 'accepted_by_id', udt_name: 'uuid', is_nullable: 'YES' },
      { column_name: 'batch', udt_name: 'varchar', is_nullable: 'YES' },
      { column_name: 'created_at', udt_name: 'timestamptz', is_nullable: 'NO' },
      { column_name: 'email', udt_name: 'varchar', is_nullable: 'NO' },
      { column_name: 'expires_at', udt_name: 'timestamptz', is_nullable: 'NO' },
      { column_name: 'id', udt_name: 'uuid', is_nullable: 'NO' },
      { column_name: 'publish_due_at', udt_name: 'timestamptz', is_nullable: 'YES' },
      { column_name: 'revoked_at', udt_name: 'timestamptz', is_nullable: 'YES' },
      { column_name: 'stack_tags', udt_name: '_text', is_nullable: 'NO' },
      { column_name: 'token_hash', udt_name: 'varchar', is_nullable: 'NO' },
      { column_name: 'updated_at', udt_name: 'timestamptz', is_nullable: 'NO' },
    ]);
    expect((await invitationConstraints()).map(({ conname }) => conname)).toEqual(
      INVITATION_CONSTRAINTS,
    );
    expect(await invitationConstraints()).toContainEqual({
      conname: 'invitations_accepted_by_id_foreign',
      def: 'FOREIGN KEY (accepted_by_id) REFERENCES users(id) ON DELETE RESTRICT',
    });
    expect(await invitationIndexes()).toEqual([
      {
        indexname: 'invitations_pending_email_unique',
        indexdef:
          'CREATE UNIQUE INDEX invitations_pending_email_unique ON public.invitations USING btree (email) WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL))',
      },
    ]);
    expect(await mentorDeadlineColumn()).toEqual([
      {
        column_name: 'initial_publish_due_at',
        udt_name: 'timestamptz',
        is_nullable: 'YES',
      },
    ]);
  });

  it('enforces the invitation vocabulary, complete acceptance and one pending email', async () => {
    const insert = (values: string) =>
      query(`
        insert into invitations
          (id, created_at, updated_at, email, token_hash, stack_tags, expires_at,
           accepted_at, accepted_by_id, publish_due_at, revoked_at)
        values (${values})
      `);

    await insert(
      `gen_random_uuid(), now(), now(), 'invitee@devmentor.test', repeat('a', 64), ` +
        `'{TypeScript,React}', now() + interval '14 days', null, null, null, null`,
    );

    expect(
      await constraintFrom(() =>
        insert(
          `gen_random_uuid(), now(), now(), 'invitee@devmentor.test', repeat('b', 64), ` +
            `'{Python}', now() + interval '14 days', null, null, null, null`,
        ),
      ),
    ).toBe('invitations_pending_email_unique');

    expect(
      await constraintFrom(() =>
        insert(
          `gen_random_uuid(), now(), now(), 'another@devmentor.test', repeat('a', 64), ` +
            `'{React}', now() + interval '14 days', null, null, null, null`,
        ),
      ),
    ).toBe('invitations_token_hash_unique');

    await query(`update invitations set revoked_at = now() where email = 'invitee@devmentor.test'`);
    await expect(
      insert(
        `gen_random_uuid(), now(), now(), 'invitee@devmentor.test', repeat('b', 64), ` +
          `'{AI agents}', now() + interval '14 days', null, null, null, null`,
      ),
    ).resolves.toBeDefined();

    expect(
      await constraintFrom(() =>
        insert(
          `gen_random_uuid(), now(), now(), 'bad-tag@devmentor.test', repeat('c', 64), ` +
            `'{Rust}', now() + interval '14 days', null, null, null, null`,
        ),
      ),
    ).toBe('invitations_stack_tags_check');

    expect(
      await constraintFrom(() =>
        insert(
          `gen_random_uuid(), now(), now(), 'half@devmentor.test', repeat('d', 64), ` +
            `'{Python}', now() + interval '14 days', now(), null, now() + interval '14 days', null`,
        ),
      ),
    ).toBe('invitations_acceptance_complete');
  });

  it('allows historical invitations for one user and preserves their attribution', async () => {
    const { id: userId } = await queryOne<{ id: string }>(
      `select id from users where email = '${LEGACY_EMAIL}'`,
    );
    for (const [email, tokenCharacter] of [
      ['accepted-one@devmentor.test', 'e'],
      ['accepted-two@devmentor.test', 'f'],
    ]) {
      await query(`
        insert into invitations
          (id, created_at, updated_at, email, token_hash, stack_tags, expires_at,
           accepted_at, accepted_by_id, publish_due_at)
        values
          (gen_random_uuid(), now(), now(), '${email}', repeat('${tokenCharacter}', 64),
           '{TypeScript}', now(), now(), '${userId}', now() + interval '14 days')
      `);
    }

    const rows = await query<{ accepted_by_id: string }>(`
      select accepted_by_id from invitations where accepted_by_id = '${userId}'
    `);
    expect(rows).toHaveLength(2);
    expect(
      await constraintFrom(() => query(`delete from users where id = '${userId}'`)),
    ).toBe('invitations_accepted_by_id_foreign');
  });

  it('rolls back invitations without disturbing auth or existing profile columns', async () => {
    await rollbackOne();

    expect(await appliedMigrations()).toEqual([
      BASE_MIGRATION,
      AUTH_IDENTITY_MIGRATION,
      AUTH_PASSWORD_MIGRATION,
      AUTH_RATE_LIMITS_MIGRATION,
    ]);
    expect(await invitationColumns()).toEqual([]);
    expect(await mentorDeadlineColumn()).toEqual([]);
    expect((await newColumns()).map((column) => column.column_name)).toEqual(NEW_COLUMNS);
    const headline = await queryOne<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_name = 'mentor_profiles' and column_name = 'headline'
    `);
    expect(headline.column_name).toBe('headline');
  });

  it('re-applies invitations to the same schema', async () => {
    await migrate('--to', INVITATIONS_MIGRATION);

    expect((await invitationColumns()).map((column) => column.column_name)).toEqual(
      INVITATION_COLUMNS,
    );
    expect((await invitationConstraints()).map(({ conname }) => conname)).toEqual(
      INVITATION_CONSTRAINTS,
    );
    expect(await mentorDeadlineColumn()).toHaveLength(1);
  });

  it('applies the mentor-page fields and enforces publication and vocabulary constraints', async () => {
    await migrate('--to', MENTOR_PAGE_MIGRATION);

    expect(await appliedMigrations()).toContain(MENTOR_PAGE_MIGRATION);
    expect(await mentorPageColumns()).toEqual([
      { column_name: 'public_work_url', udt_name: 'text', is_nullable: 'YES', column_default: null },
      { column_name: 'published_at', udt_name: 'timestamptz', is_nullable: 'YES', column_default: null },
      { column_name: 'slug', udt_name: 'varchar', is_nullable: 'YES', column_default: null },
      { column_name: 'stack_tags', udt_name: '_text', is_nullable: 'NO', column_default: "'{}'::text[]" },
    ]);
    expect((await mentorPageConstraints()).map(({ conname }) => conname)).toEqual([
      'mentor_profiles_publication_has_slug',
      'mentor_profiles_slug_unique',
      'mentor_profiles_stack_tags_check',
    ]);

    const { id: userId } = await queryOne<{ id: string }>(
      `select id from users where email = '${LEGACY_EMAIL}'`,
    );
    await query(`
      insert into mentor_profiles
        (id, created_at, updated_at, user_id, headline, years_of_experience)
      values (gen_random_uuid(), now(), now(), '${userId}', 'Draft', 0)
      on conflict (user_id) do update set headline = excluded.headline
    `);
    expect(
      await constraintFrom(() =>
        query(`update mentor_profiles set stack_tags = '{Rust}' where user_id = '${userId}'`),
      ),
    ).toBe('mentor_profiles_stack_tags_check');
    expect(
      await constraintFrom(() =>
        query(`update mentor_profiles set published_at = now(), slug = null where user_id = '${userId}'`),
      ),
    ).toBe('mentor_profiles_publication_has_slug');
    await expect(
      query(`update mentor_profiles set slug = 'legacy', published_at = now() where user_id = '${userId}'`),
    ).resolves.toBeDefined();
  });

  it('rolls mentor-page back without removing invitation state, then reapplies it', async () => {
    await rollbackOne();
    expect(await mentorPageColumns()).toEqual([]);
    expect(await mentorPageConstraints()).toEqual([]);
    expect(await invitationColumns()).toHaveLength(INVITATION_COLUMNS.length);
    expect(await mentorDeadlineColumn()).toHaveLength(1);

    await migrate('--to', MENTOR_PAGE_MIGRATION);
    expect(await mentorPageColumns()).toHaveLength(4);
    expect(await appliedMigrations()).toContain(MENTOR_PAGE_MIGRATION);
  });

  it('rolls back: removes exactly what it added and keeps the pre-existing rows', async () => {
    // `auth-rate-limits` and `auth-password` sit on top, so reaching `auth-identity`'s
    // `down` means reverting them first — the same order a real rollback of the slice
    // would take.
    await rollbackOne();
    await rollbackOne();
    await rollbackOne();
    await rollbackOne();
    await rollbackOne();

    expect(await invitationColumns()).toEqual([]);
    expect(await mentorDeadlineColumn()).toEqual([]);
    expect(await rateLimitColumns()).toEqual([]);

    expect(await appliedMigrations()).toEqual([BASE_MIGRATION]);
    expect(await passwordColumn()).toEqual([]);
    expect(await newColumns()).toEqual([]);
    expect(await newConstraints()).toEqual([]);

    const legacy = await queryOne<{ display_name: string }>(
      `select display_name from users where email = '${LEGACY_EMAIL}'`,
    );
    expect(legacy.display_name).toBe('Legacy Row');
    // The base migration's own schema is untouched by the rollback.
    const emailUnique = await queryOne<{ conname: string }>(
      `select con.conname from pg_constraint con join pg_class rel on rel.oid = con.conrelid
       where rel.relname = 'users' and con.conname = 'users_email_unique'`,
    );
    expect(emailUnique.conname).toBe('users_email_unique');
  });

  it('re-applies: the second up produces the same schema and backfills again', async () => {
    await migrate('--to', MENTOR_PAGE_MIGRATION);

    expect(await appliedMigrations()).toEqual([
      BASE_MIGRATION,
      AUTH_IDENTITY_MIGRATION,
      AUTH_PASSWORD_MIGRATION,
      AUTH_RATE_LIMITS_MIGRATION,
      INVITATIONS_MIGRATION,
      MENTOR_PAGE_MIGRATION,
    ]);
    expect((await passwordColumn()).map((column) => column.column_name)).toEqual([
      PASSWORD_COLUMN,
    ]);
    expect((await rateLimitColumns()).map((column) => column.column_name)).toEqual(
      RATE_LIMIT_COLUMNS,
    );
    expect((await invitationColumns()).map((column) => column.column_name)).toEqual(
      INVITATION_COLUMNS,
    );
    expect(await mentorDeadlineColumn()).toHaveLength(1);
    expect((await newColumns()).map((column) => column.column_name)).toEqual(NEW_COLUMNS);
    expect((await newConstraints()).map((constraint) => constraint.conname)).toEqual(
      NEW_CONSTRAINTS,
    );

    const legacy = await queryOne<{ verified: boolean }>(
      `select email_verified_at is not null as verified from users where email = '${LEGACY_EMAIL}'`,
    );
    expect(legacy.verified).toBe(true);
  });

  it('applies positive nullable mentor prices after availability', async () => {
    await migrate();
    expect(await appliedMigrations()).toContain(AVAILABILITY_MIGRATION);
    expect(await appliedMigrations()).toContain(MENTOR_PRICES_MIGRATION);
    expect(await mentorPriceColumns()).toEqual([
      { column_name: 'price_25_cents', udt_name: 'int4', is_nullable: 'YES' },
      { column_name: 'price_50_cents', udt_name: 'int4', is_nullable: 'YES' },
    ]);
    expect(await mentorPriceConstraints()).toEqual([
      { conname: 'mentor_profiles_price_25_positive', def: 'CHECK ((price_25_cents > 0))' },
      { conname: 'mentor_profiles_price_50_positive', def: 'CHECK ((price_50_cents > 0))' },
    ]);

    const { id: userId } = await queryOne<{ id: string }>(
      `select id from users where email = '${LEGACY_EMAIL}'`,
    );
    await expect(
      query(`update mentor_profiles set price_25_cents = null, price_50_cents = 18000 where user_id = '${userId}'`),
    ).resolves.toBeDefined();
    expect(
      await constraintFrom(() =>
        query(`update mentor_profiles set price_25_cents = 0 where user_id = '${userId}'`),
      ),
    ).toBe('mentor_profiles_price_25_positive');
    expect(
      await constraintFrom(() =>
        query(`update mentor_profiles set price_50_cents = -1 where user_id = '${userId}'`),
      ),
    ).toBe('mentor_profiles_price_50_positive');
  });

  it('rolls back only prices, preserves availability, and reapplies them', async () => {
    // **To a named target, not "one step back".** This test is about prices being
    // independently revertable, and `migration:down` reverts whatever happens to be last —
    // which stopped being `mentor_prices` the moment E03 added migrations after it.
    await rollbackTo(AVAILABILITY_MIGRATION);
    expect(await mentorPriceColumns()).toEqual([]);
    expect(await mentorPriceConstraints()).toEqual([]);
    expect(await appliedMigrations()).toContain(AVAILABILITY_MIGRATION);
    expect(await appliedMigrations()).not.toContain(MENTOR_PRICES_MIGRATION);
    expect(
      await query<{ column_name: string }>(`
        select column_name from information_schema.columns
        where table_name = 'mentor_profiles' and column_name = 'last_published_availability_at'
      `),
    ).toHaveLength(1);
    expect(
      await query<{ table_name: string }>(`
        select table_name from information_schema.tables where table_name = 'slots'
      `),
    ).toHaveLength(1);

    // All the way back up, so the next test sees a fully migrated schema.
    await migrate();
    expect(await mentorPriceColumns()).toHaveLength(2);
    expect(await mentorPriceConstraints()).toHaveLength(2);
    expect(await appliedMigrations()).toContain(MENTOR_PRICES_MIGRATION);
  });

  it('matches the complete entity model after all migrations', async () => {

    const verifier = await MikroORM.init({ clientUrl, entities });
    await verifier.connect();
    try {
      expect((await verifier.schema.getUpdateSchemaSQL()).trim()).toBe('');
    } finally {
      await verifier.close(true);
    }
  });
});
