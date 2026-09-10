import {
  EmailVerificationService,
  EventBus,
  InvitationService,
  PasswordService,
  RateLimiter,
  TokenService,
  UserService,
  type AppEnv,
  type Clock,
  type Logger,
  type Session,
} from '@devmentor/core';
import {
  Invitation,
  LockMode,
  MentorProfile,
  MikroORM,
  User,
  entities,
  type EntityManager,
} from '@devmentor/db';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

const NOW = new Date('2026-09-10T12:00:00.000Z');
const PUBLISH_DUE_AT = new Date('2026-09-24T12:00:00.000Z');
const BATCH = `invitation-concurrency-${process.pid}`;
const EMAIL_PREFIX = `${BATCH}-`;
const INSERT_GATE_KEY = 2_026_091_001;

const env = {
  APP_URL: 'https://devmentor.test',
  INVITATION_TTL_DAYS: 14,
  MENTOR_PUBLISH_WINDOW_DAYS: 14,
  OPERATOR_EMAILS: [],
} as unknown as AppEnv;
const clock: Clock = { now: () => NOW };
const logger = {
  info: () => undefined,
  error: () => undefined,
} as unknown as Logger;
const eventBus = new EventBus({ logger });
const tokenService = new TokenService({ env, clock });

function sessionFor(userId: string | null): Promise<Session | null> {
  return Promise.resolve(userId === null ? null : { userId, roles: ['mentee'] });
}

/**
 * Build the real invitation and role services around one independent ORM fork.
 *
 * Acceptance only calls UserService's staged-role methods. The unrelated password,
 * rate-limit and mail collaborators remain inert because reaching one of them here would
 * be a production regression, not test behaviour to emulate.
 */
function serviceFor(em: EntityManager, userId: string | null = null): InvitationService {
  const session = sessionFor(userId);
  const userService = new UserService({
    em,
    logger,
    eventBus,
    env,
    clock,
    session,
    passwordService: {} as unknown as PasswordService,
    rateLimiter: {} as unknown as RateLimiter,
    emailVerificationService: {} as unknown as EmailVerificationService,
  });
  return new InvitationService({
    em,
    env,
    clock,
    tokenService,
    userService,
    eventBus,
    session,
  });
}

function errorCode(result: PromiseSettledResult<unknown>): string | undefined {
  return result.status === 'rejected'
    ? (result.reason as { code?: string }).code
    : undefined;
}

function assertOneWinner(results: PromiseSettledResult<unknown>[], loserCode: string): void {
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const loser = results.filter((result) => result.status === 'rejected');
  expect(loser).toHaveLength(1);
  expect(errorCode(loser[0] as PromiseRejectedResult)).toBe(loserCode);
}

describe('invitation service PostgreSQL concurrency', () => {
  let orm: MikroORM;

  async function cleanOwnedRows(): Promise<void> {
    const em = orm.em.fork();
    await em.execute('delete from invitations where batch = ?', [BATCH]);
    await em.execute(
      'delete from mentor_profiles where user_id in (select id from users where email like ?)',
      [`${EMAIL_PREFIX}%`],
    );
    await em.execute('delete from users where email like ?', [`${EMAIL_PREFIX}%`]);
  }

  async function seedInviteeAndInvitation(
    suffix: string,
  ): Promise<{ invitationId: string; token: string; userId: string }> {
    const em = orm.em.fork();
    const email = `${EMAIL_PREFIX}${suffix}@devmentor.test`;
    const user = em.create(User, {
      email,
      displayName: `Race ${suffix}`,
      roles: ['mentee'],
      emailVerifiedAt: NOW,
    });
    const token = `token-${BATCH}-${suffix}`;
    const invitation = em.create(Invitation, {
      email,
      tokenHash: tokenService.hashToken(token),
      stackTags: ['TypeScript'],
      expiresAt: new Date('2026-09-24T12:00:00.000Z'),
      batch: BATCH,
    });
    em.persist([user, invitation]);
    await em.flush();
    return { invitationId: invitation.id, token, userId: user.id };
  }

  /** Wait until PostgreSQL, rather than a timer, proves every contender is at the gate. */
  async function waitForBlockedQueries(fragment: string, expected: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    const em = orm.em.fork();
    while (Date.now() < deadline) {
      const rows = await em.execute<Array<{ query: string }>>(
        `select query
           from pg_stat_activity
          where datname = current_database()
            and cardinality(pg_blocking_pids(pid)) > 0
            and lower(query) like ?`,
        [`%${fragment.toLowerCase()}%`],
      );
      if (rows.length >= expected) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error(`Timed out waiting for ${expected} blocked queries matching ${fragment}`);
  }

  async function lockUser(userId: string): Promise<EntityManager> {
    const gate = orm.em.fork();
    await gate.begin();
    await gate.findOneOrFail(User, { id: userId }, { lockMode: LockMode.PESSIMISTIC_WRITE });
    return gate;
  }

  async function lockInvitation(invitationId: string): Promise<EntityManager> {
    const gate = orm.em.fork();
    await gate.begin();
    await gate.findOneOrFail(
      Invitation,
      { id: invitationId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    return gate;
  }

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: inject('integrationDatabaseUrl'),
      entities,
      pool: { min: 0, max: 10 },
    });
    await orm.connect();
  });

  beforeEach(async () => {
    await cleanOwnedRows();
  });

  afterAll(async () => {
    if (orm) {
      const em = orm.em.fork();
      await em.execute('drop trigger if exists test_hold_invitation_insert on invitations');
      await em.execute('drop function if exists test_hold_invitation_insert()');
      await cleanOwnedRows();
      await orm.close(true);
    }
  });

  it('lets exactly one transaction accept the same token and grants the role once', async () => {
    const seeded = await seedInviteeAndInvitation('same-token');
    const first = serviceFor(orm.em.fork(), seeded.userId);
    const second = serviceFor(orm.em.fork(), seeded.userId);
    const gate = await lockUser(seeded.userId);

    const settled = Promise.allSettled([
      first.accept(seeded.token, NOW),
      second.accept(seeded.token, NOW),
    ]);
    let waitFailure: unknown;
    try {
      await waitForBlockedQueries('from "users"', 2);
    } catch (error) {
      waitFailure = error;
    } finally {
      await gate.commit();
    }
    const results = await settled;
    if (waitFailure !== undefined) throw waitFailure;

    assertOneWinner(results, 'not_found');

    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { id: seeded.userId });
    const invitation = await em.findOneOrFail(
      Invitation,
      { id: seeded.invitationId },
      { populate: ['acceptedBy'] },
    );
    const profiles = await em.find(MentorProfile, { user: seeded.userId });
    expect(user.roles).toEqual(['mentee', 'mentor']);
    expect(user.sessionVersion).toBe(1);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.initialPublishDueAt).toEqual(PUBLISH_DUE_AT);
    expect(invitation.acceptedAt).toEqual(NOW);
    expect(invitation.acceptedBy?.id).toBe(seeded.userId);
    expect(invitation.publishDueAt).toEqual(PUBLISH_DUE_AT);
  });

  it('uses the partial unique index to arbitrate concurrent normalized-email creation', async () => {
    const control = orm.em.fork();
    await control.execute(`
      create or replace function test_hold_invitation_insert() returns trigger
      language plpgsql as $$
      begin
        perform pg_advisory_xact_lock(${INSERT_GATE_KEY});
        return new;
      end
      $$
    `);
    await control.execute(`
      create trigger test_hold_invitation_insert
      before insert on invitations
      for each row execute function test_hold_invitation_insert()
    `);

    const gate = orm.em.fork();
    await gate.begin();
    await gate.execute(`select pg_advisory_xact_lock(${INSERT_GATE_KEY})`);
    const first = serviceFor(orm.em.fork());
    const second = serviceFor(orm.em.fork());
    const settled = Promise.allSettled([
      first.create({
        email: `  ${EMAIL_PREFIX}Normalized@DevMentor.Test  `,
        stackTags: ['TypeScript'],
        batch: BATCH,
      }),
      second.create({
        email: `${EMAIL_PREFIX}normalized@devmentor.test`,
        stackTags: ['React'],
        batch: BATCH,
      }),
    ]);

    let waitFailure: unknown;
    try {
      await waitForBlockedQueries('insert into "invitations"', 2);
    } catch (error) {
      waitFailure = error;
    } finally {
      await gate.commit();
    }
    const results = await settled;
    await control.execute('drop trigger test_hold_invitation_insert on invitations');
    await control.execute('drop function test_hold_invitation_insert()');
    if (waitFailure !== undefined) throw waitFailure;

    assertOneWinner(results, 'conflict');
    const rows = await orm.em.fork().find(Invitation, {
      email: `${EMAIL_PREFIX}normalized@devmentor.test`,
      acceptedAt: null,
      revokedAt: null,
    });
    expect(rows).toHaveLength(1);
  });

  it('serializes acceptance ahead of revoke without a partial revoke', async () => {
    const seeded = await seedInviteeAndInvitation('revoke');
    const accept = serviceFor(orm.em.fork(), seeded.userId);
    const revoke = serviceFor(orm.em.fork());
    const gate = await lockInvitation(seeded.invitationId);

    const accepted = accept.accept(seeded.token, NOW);
    await waitForBlockedQueries('from "invitations"', 1);
    const revoked = revoke.revoke(seeded.invitationId, NOW);
    const settled = Promise.allSettled([accepted, revoked]);
    let waitFailure: unknown;
    try {
      await waitForBlockedQueries('from "invitations"', 2);
    } catch (error) {
      waitFailure = error;
    } finally {
      await gate.commit();
    }
    const results = await settled;
    if (waitFailure !== undefined) throw waitFailure;

    assertOneWinner(results, 'conflict');
    expect(results[0]?.status).toBe('fulfilled');

    const em = orm.em.fork();
    const invitation = await em.findOneOrFail(Invitation, { id: seeded.invitationId });
    const user = await em.findOneOrFail(User, { id: seeded.userId });
    expect(invitation.acceptedAt).toEqual(NOW);
    expect(invitation.revokedAt).toBeNull();
    expect(invitation.publishDueAt).toEqual(PUBLISH_DUE_AT);
    expect(user.roles).toEqual(['mentee', 'mentor']);
    expect(user.sessionVersion).toBe(1);
  });

  it('serializes resend ahead of acceptance so the old token cannot grant anything', async () => {
    const seeded = await seedInviteeAndInvitation('resend');
    const originalHash = tokenService.hashToken(seeded.token);
    const resend = serviceFor(orm.em.fork());
    const accept = serviceFor(orm.em.fork(), seeded.userId);
    const gate = await lockInvitation(seeded.invitationId);

    const resent = resend.resend(seeded.invitationId, NOW);
    await waitForBlockedQueries('from "invitations"', 1);
    const accepted = accept.accept(seeded.token, NOW);
    const settled = Promise.allSettled([resent, accepted]);
    let waitFailure: unknown;
    try {
      await waitForBlockedQueries('from "invitations"', 2);
    } catch (error) {
      waitFailure = error;
    } finally {
      await gate.commit();
    }
    const results = await settled;
    if (waitFailure !== undefined) throw waitFailure;

    assertOneWinner(results, 'not_found');
    expect(results[0]?.status).toBe('fulfilled');

    const em = orm.em.fork();
    const invitation = await em.findOneOrFail(Invitation, { id: seeded.invitationId });
    const user = await em.findOneOrFail(User, { id: seeded.userId });
    expect(invitation.tokenHash).not.toBe(originalHash);
    expect(invitation.acceptedAt).toBeNull();
    expect(invitation.acceptedBy).toBeNull();
    expect(invitation.publishDueAt).toBeNull();
    expect(invitation.revokedAt).toBeNull();
    expect(user.roles).toEqual(['mentee']);
    expect(user.sessionVersion).toBe(0);
    expect(await em.count(MentorProfile, { user: seeded.userId })).toBe(0);
  });
});
