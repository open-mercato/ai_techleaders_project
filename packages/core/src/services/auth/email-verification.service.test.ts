import type { EntityManager, Role } from '@devmentor/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../config/env';
import type { Logger } from '../../logger';
import type { Clock } from '../../time/clock';
import type { Mailer } from '../notifications/mailer.port';
import {
  EmailVerificationService,
  VERIFY_EMAIL_PATH,
  type VerifiedAccount,
} from './email-verification.service';
import { TokenService } from './token.service';

/**
 * `TokenService` is the **real** one here, not a stub.
 *
 * Two of the four things this file has to prove are statements about the token itself —
 * that it carries no credential material, and that a link signed for `email-verify` is
 * unreadable as anything else — and a stub returning `'token-1'` proves neither. The rest
 * of the seam is faked: `em` is a two-method fake because the only persistence question
 * here is "was `email_verified_at` written, and was it written *again* on a second visit",
 * and the mailer is a spy because delivery belongs to its adapters' own tests.
 */

const SECRET = 'verification-secret-'.padEnd(48, 'v');
const APP_URL = 'https://devmentor.example';
const T0 = new Date('2030-03-01T09:00:00.000Z');
const VERIFIED_AT = new Date('2029-01-01T00:00:00.000Z');
const USER_ID = '5f2b1c9e-0000-4000-8000-000000000001';
const EMAIL = 'ada@devmentor.dev';

interface Row {
  id: string;
  roles: Role[];
  emailVerifiedAt: Date | null;
  sessionVersion: number;
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: USER_ID,
    roles: ['mentee'],
    emailVerifiedAt: null,
    sessionVersion: 0,
    ...overrides,
  };
}

class FakeEm {
  rows: Row[] = [];
  /** Every write, so "the idempotent path wrote nothing" is observable rather than assumed. */
  flushes = 0;
  /** Every lookup, so "refused before the database was touched" is observable. */
  finds = 0;

  /** The single row a case seeded. A helper because `noUncheckedIndexedAccess` is on. */
  stored(): Row {
    const [only] = this.rows;
    if (only === undefined) {
      throw new Error('this case seeded no row');
    }
    return only;
  }

  readonly em = {
    findOne: async (_entity: unknown, where: { id: string }): Promise<Row | null> => {
      this.finds += 1;
      return this.rows.find((candidate) => candidate.id === where.id) ?? null;
    },
    flush: async (): Promise<void> => {
      this.flushes += 1;
    },
  } as unknown as EntityManager;
}

function fakeClock(start: Date = T0): Clock & { advance(ms: number): void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

interface Harness {
  service: EmailVerificationService;
  db: FakeEm;
  mailer: { send: ReturnType<typeof vi.fn> };
  logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  clock: ReturnType<typeof fakeClock>;
  tokenService: TokenService;
}

function harness(overrides: { env?: Partial<AppEnv>; clock?: ReturnType<typeof fakeClock> } = {}): Harness {
  const clock = overrides.clock ?? fakeClock();
  const env = { SESSION_SECRET: SECRET, APP_URL, ...overrides.env } as AppEnv;
  const db = new FakeEm();
  const mailer = { send: vi.fn(async () => undefined) };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const tokenService = new TokenService({ env, clock });

  return {
    db,
    mailer,
    logger,
    clock,
    tokenService,
    service: new EmailVerificationService({
      em: db.em,
      env,
      clock,
      logger: logger as unknown as Logger,
      mailer: mailer as unknown as Mailer,
      tokenService,
    }),
  };
}

/** The one message the spy captured. */
function sentMessage(mailer: Harness['mailer']): { to: string; subject: string; text: string } {
  expect(mailer.send).toHaveBeenCalledTimes(1);
  return mailer.send.mock.calls[0]?.[0] as { to: string; subject: string; text: string };
}

/** The link out of a captured message body — the only line that parses as a URL. */
function linkFrom(text: string): URL {
  const found = text.split('\n').find((line) => line.startsWith('http'));
  expect(found).toBeDefined();
  return new URL(found as string);
}

/** The token off a captured link. */
function tokenFrom(mailer: Harness['mailer']): string {
  const token = linkFrom(sentMessage(mailer).text).searchParams.get('token');
  expect(token).not.toBeNull();
  return token as string;
}

/** Everything written to the logger in this test, as one searchable string. */
function loggedText(logger: Harness['logger']): string {
  return JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]);
}

describe('sendVerificationLink', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it('mails an absolute link built from APP_URL to the address being proven', async () => {
    await h.service.sendVerificationLink({ user: { id: USER_ID, email: EMAIL } });

    const message = sentMessage(h.mailer);
    expect(message.to).toBe(EMAIL);
    expect(message.subject).toBe('Confirm your email address for DevMentor');

    const link = linkFrom(message.text);
    // Absolute, and on the configured origin. A relative link is not a link in an inbox —
    // the documented exception to "any absolute self-URL is a latent cookie bug".
    expect(link.origin).toBe(APP_URL);
    expect(link.pathname).toBe(VERIFY_EMAIL_PATH);
  });

  it('tells the reader how long the link lasts and how to recover an expired one', async () => {
    await h.service.sendVerificationLink({ user: { id: USER_ID, email: EMAIL } });

    const { text } = sentMessage(h.mailer);
    // The number in the copy is derived from the constant, so the promise cannot drift
    // away from the `exp` claim the next assertion pins.
    expect(text).toContain('The link works for 24 hours.');
    expect(text).toContain('register again with the same address');
    expect(text).toContain('If you did not sign up for DevMentor');
  });

  it('signs the link for 24 hours, from the injected clock', async () => {
    await h.service.sendVerificationLink({ user: { id: USER_ID, email: EMAIL } });

    const [, payload] = decode(tokenFrom(h.mailer));

    expect(payload.iat).toBe(T0.getTime() / 1000);
    expect(payload.exp).toBe(T0.getTime() / 1000 + 24 * 60 * 60);
  });

  it('puts nothing in the token but the user id', async () => {
    // The load-bearing test of this file. `signPurposeToken` produces a **signed but
    // unencrypted** JWT that travels in a URL, through a mail relay, into an inbox — so
    // every claim in it is public. Assert the whole claim set, not the absence of one
    // field, so that a later change adding *anything* fails here.
    await h.service.sendVerificationLink({ user: { id: USER_ID, email: EMAIL } });

    const [header, payload] = decode(tokenFrom(h.mailer));

    expect(header).toEqual({ alg: 'HS256' });
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'sub']);
    expect(payload.sub).toBe(USER_ID);
    expect(payload.aud).toBe('email-verify');
    // Spelled out as well, because the key-set assertion above is the kind of line a future
    // change "fixes" by adding the new key to the list.
    expect(JSON.stringify(payload)).not.toContain(EMAIL);
    expect(JSON.stringify(payload)).not.toContain('mentee');
  });

  it('carries a safe returnTo as an ordinary query parameter', async () => {
    await h.service.sendVerificationLink({
      user: { id: USER_ID, email: EMAIL },
      returnTo: '/mentors/ada?slot=1',
    });

    const link = linkFrom(sentMessage(h.mailer).text);
    expect(link.searchParams.get('returnTo')).toBe('/mentors/ada?slot=1');
    // It is *not* in the token: the subject says who the user is and nothing else.
    expect(decode(tokenFrom(h.mailer))[1].sub).toBe(USER_ID);
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['off-site', 'https://evil.example/pwn'],
    ['protocol-relative', '//evil.example'],
    ['an API path', '/api/users'],
  ])('mails no returnTo at all when it is %s', async (_label, returnTo) => {
    // We never *mail* an off-site destination, whatever the route would do with it: a
    // message whose link points at another origin reads as phishing to the person opening
    // it, and the route's own `safeReturnTo` cannot un-send that.
    await h.service.sendVerificationLink({ user: { id: USER_ID, email: EMAIL }, returnTo });

    const link = linkFrom(sentMessage(h.mailer).text);
    expect(link.searchParams.has('returnTo')).toBe(false);
    expect([...link.searchParams.keys()]).toEqual(['token']);
  });

  it('logs the user id and never the link, the token or the address', async () => {
    await h.service.sendVerificationLink({ user: { id: USER_ID, email: EMAIL } });

    expect(h.logger.info).toHaveBeenCalledWith(
      { userId: USER_ID },
      'sent an email verification link',
    );
    const logged = loggedText(h.logger);
    // A token inside a URL is invisible to pino's `redact`, which matches key names — so
    // the only defence is never composing the string into a log line (2026-09-10 lesson).
    expect(logged).not.toContain(tokenFrom(h.mailer));
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(APP_URL);
  });

  it('fails closed when delivery fails, and reports nothing sent', async () => {
    // Edge case 29: registration must not report success for an account nobody can confirm.
    const failure = new Error('provider refused');
    h.mailer.send.mockRejectedValueOnce(failure);

    await expect(
      h.service.sendVerificationLink({ user: { id: USER_ID, email: EMAIL } }),
    ).rejects.toBe(failure);
    expect(h.logger.info).not.toHaveBeenCalled();
  });

  it('propagates a missing SESSION_SECRET rather than mailing an unsigned link', async () => {
    const broken = harness({ env: { SESSION_SECRET: undefined } });

    await expect(
      broken.service.sendVerificationLink({ user: { id: USER_ID, email: EMAIL } }),
    ).rejects.toThrow(/SESSION_SECRET is not configured/);
    expect(broken.mailer.send).not.toHaveBeenCalled();
  });
});

describe('verify', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  /** Send a link for `user` and hand back the token it contained. */
  async function issue(returnTo?: string): Promise<string> {
    await h.service.sendVerificationLink({ user: { id: USER_ID, email: EMAIL }, returnTo });
    return tokenFrom(h.mailer);
  }

  it('confirms the address and hands back what a route needs to sign a cookie', async () => {
    h.db.rows.push(row({ roles: ['mentee', 'mentor'], sessionVersion: 3 }));
    const token = await issue();

    const outcome = await h.service.verify(token);

    expect(outcome).toEqual<VerifiedAccount>({
      userId: USER_ID,
      roles: ['mentee', 'mentor'],
      sessionVersion: 3,
    });
    // Written from the injected clock, and written exactly once.
    expect(h.db.stored().emailVerifiedAt).toEqual(T0);
    expect(h.db.flushes).toBe(1);
    expect(h.logger.info).toHaveBeenCalledWith({ userId: USER_ID }, 'confirmed an email address');
  });

  it('does not bump session_version', async () => {
    // Verification is not on the closed list of triggers, and bumping here would invalidate
    // the very session the route is about to issue from this number.
    h.db.rows.push(row({ sessionVersion: 7 }));
    const token = await issue();

    const outcome = await h.service.verify(token);

    expect(outcome?.sessionVersion).toBe(7);
    expect(h.db.stored().sessionVersion).toBe(7);
  });

  it('returns the role set canonically ordered and duplicate-free', async () => {
    // Duplicate suppression is an application invariant — the CHECK constraint cannot
    // enforce it — so a route deciding a landing page must not see `['mentor', 'mentee']`.
    h.db.rows.push(row({ roles: ['mentor', 'mentee', 'mentee'] }));
    const token = await issue();

    expect((await h.service.verify(token))?.roles).toEqual(['mentee', 'mentor']);
  });

  it('is idempotent when the address was already confirmed', async () => {
    // Edge case 16. A mail scanner or link-prefetcher consumes the link before the human
    // ever clicks it, so the second visit has to produce the same answer as the first.
    h.db.rows.push(row({ emailVerifiedAt: VERIFIED_AT, sessionVersion: 2 }));
    const token = await issue();

    const outcome = await h.service.verify(token);

    // Still signed in: this is the half that matters, because without it the scanner would
    // have consumed the user's only way into their account.
    expect(outcome).toEqual<VerifiedAccount>({
      userId: USER_ID,
      roles: ['mentee'],
      sessionVersion: 2,
    });
    // The original timestamp survives: it records *when* the address was proven, and a
    // prefetcher must not be able to falsify that.
    expect(h.db.stored().emailVerifiedAt).toBe(VERIFIED_AT);
    // Nothing was written at all.
    expect(h.db.flushes).toBe(0);
    expect(h.logger.info).toHaveBeenCalledWith(
      { userId: USER_ID },
      'reopened a verification link for an already confirmed address',
    );
  });

  it('answers the scanner and the user identically', async () => {
    // The same link, opened twice, end to end — one write, two identical outcomes.
    h.db.rows.push(row());
    const token = await issue();

    const scanner = await h.service.verify(token);
    const human = await h.service.verify(token);

    expect(human).toEqual(scanner);
    expect(h.db.flushes).toBe(1);
  });

  it('refuses a link whose token expired', async () => {
    h.db.rows.push(row());
    const token = await issue();

    // One second inside the window is still good; one second past it is not. No sleeping.
    h.clock.advance(24 * 60 * 60 * 1000 - 1000);
    expect(await h.service.verify(token)).not.toBeNull();

    h.db.stored().emailVerifiedAt = null;
    h.clock.advance(2000);
    expect(await h.service.verify(token)).toBeNull();
    expect(h.db.stored().emailVerifiedAt).toBeNull();
  });

  it('refuses a token signed for a different purpose', async () => {
    // The audience separation B2/B5 promise, from this side: an OAuth `state` is not a
    // verification link, however valid its signature.
    h.db.rows.push(row());
    const state = await h.tokenService.signPurposeToken({
      purpose: 'oauth-state',
      subject: USER_ID,
      ttlSeconds: 600,
    });

    expect(await h.service.verify(state)).toBeNull();
    expect(h.db.finds).toBe(0);
    expect(h.db.stored().emailVerifiedAt).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['not a JWT', 'not-a-token'],
    ['two segments', 'aaa.bbb'],
  ])('refuses a malformed token (%s)', async (_label, token) => {
    h.db.rows.push(row());

    expect(await h.service.verify(token)).toBeNull();
    expect(h.db.finds).toBe(0);
  });

  it('refuses a tampered token without reading the database', async () => {
    h.db.rows.push(row());
    const token = await issue();
    const [header, payload, signature = ''] = token.split('.');
    const flipped = signature.startsWith('A') ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;

    expect(await h.service.verify(`${header}.${payload}.${flipped}`)).toBeNull();
    expect(h.db.finds).toBe(0);
  });

  it('refuses a token carrying an empty subject rather than querying for it', async () => {
    // `''` is a legitimate subject for a purpose token — the OAuth start route signs it for
    // "no particular destination" — so `verifyPurposeToken` accepts it and this service has
    // to refuse it. Left through, it would reach the driver as a `where` on a uuid column
    // and answer a browser navigation with a 500 instead of a redirect.
    h.db.rows.push(row());
    const token = await h.tokenService.signPurposeToken({
      purpose: 'email-verify',
      subject: '',
      ttlSeconds: 600,
    });

    expect(await h.service.verify(token)).toBeNull();
    expect(h.db.finds).toBe(0);
  });

  it('refuses a valid link for a user that no longer exists', async () => {
    const token = await issue();

    // The row was never added: a legitimately deleted account, not an error.
    expect(await h.service.verify(token)).toBeNull();
    expect(h.db.finds).toBe(1);
    expect(h.db.flushes).toBe(0);
  });

  it('propagates a missing SESSION_SECRET instead of refusing the link', async () => {
    // Our misconfiguration is not a claim about the token: the route answers it with
    // `?error=unavailable`, not with "that link is invalid".
    const token = await issue();
    const broken = harness({ env: { SESSION_SECRET: undefined } });

    await expect(broken.service.verify(token)).rejects.toThrow(
      /SESSION_SECRET is not configured/,
    );
  });

  it('round-trips a link end to end, returnTo and all', async () => {
    h.db.rows.push(row({ roles: ['operator', 'mentee'] }));
    await h.service.sendVerificationLink({
      user: { id: USER_ID, email: EMAIL },
      returnTo: '/mentors/ada',
    });
    const link = linkFrom(sentMessage(h.mailer).text);

    const outcome = await h.service.verify(link.searchParams.get('token') as string);

    expect(outcome).toEqual<VerifiedAccount>({
      userId: USER_ID,
      roles: ['mentee', 'operator'],
      sessionVersion: 0,
    });
    // The route reads the destination off the query, not out of the token.
    expect(link.searchParams.get('returnTo')).toBe('/mentors/ada');
  });
});

/** A compact JWT's header and payload, as plain objects. */
function decode(token: string): [Record<string, unknown>, Record<string, unknown>] {
  const [header, payload] = token
    .split('.')
    .slice(0, 2)
    .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')));
  return [header as Record<string, unknown>, payload as Record<string, unknown>];
}
