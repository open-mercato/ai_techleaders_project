import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MikroORM } from '@mikro-orm/postgresql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** The migrations under test, and the one that must survive their rollback. */
const BASE_MIGRATION = 'Migration20260901142829';
const AUTH_IDENTITY_MIGRATION = 'Migration20260909222320_auth_identity';
const AUTH_PASSWORD_MIGRATION = 'Migration20260910092433_auth_password';

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

    const clientUrl = postgres.getConnectionUri();
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
      pool: { min: 0, max: 2 },
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
    await migrate();

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
    await migrate();

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

  it('rolls back: removes exactly what it added and keeps the pre-existing rows', async () => {
    // `auth-password` sits on top, so reaching `auth-identity`'s `down` means reverting it
    // first — the same order a real rollback of both slices would take.
    await rollbackOne();
    await rollbackOne();

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
    await migrate();

    expect(await appliedMigrations()).toEqual([
      BASE_MIGRATION,
      AUTH_IDENTITY_MIGRATION,
      AUTH_PASSWORD_MIGRATION,
    ]);
    expect((await passwordColumn()).map((column) => column.column_name)).toEqual([
      PASSWORD_COLUMN,
    ]);
    expect((await newColumns()).map((column) => column.column_name)).toEqual(NEW_COLUMNS);
    expect((await newConstraints()).map((constraint) => constraint.conname)).toEqual(
      NEW_CONSTRAINTS,
    );

    const legacy = await queryOne<{ verified: boolean }>(
      `select email_verified_at is not null as verified from users where email = '${LEGACY_EMAIL}'`,
    );
    expect(legacy.verified).toBe(true);
  });
});
