import { createHash } from 'node:crypto';
import { MikroORM, User, entities } from '@devmentor/db';

/** Where the mock GitHub adapter puts every login it vouches for. */
const MOCK_EMAIL_DOMAIN = 'devmentor.test';

/**
 * The only per-email rate-limit bucket (`user.service.ts` password sign-in). Registration is
 * keyed per IP, which the harness switches off (`TRUSTED_PROXY_HOPS=0`).
 */
const EMAIL_RATE_LIMIT_SCOPES = ['sign-in'] as const;

/** The mock GitHub start route drops a longer login and falls back to `mock-mentee`. */
const MAX_GITHUB_LOGIN_LENGTH = 39;

export interface ThrowawayAccount {
  /** The GitHub login the mock adapter turns into this identity. */
  login: string;
  /** `<login>@devmentor.test`, the address the mock adapter reports for that login. */
  email: string;
  /** `mock-<login>`, the GitHub id the mock adapter reports for that login. */
  githubId: string;
}

/** A login no other scenario or run can produce, and the identity the mock derives from it. */
export function throwawayAccount(scenario: string): ThrowawayAccount {
  const login = `acct-${scenario}-${process.pid}-${Date.now().toString(36)}`;
  if (login.length > MAX_GITHUB_LOGIN_LENGTH) {
    throw new Error(`Login "${login}" exceeds ${MAX_GITHUB_LOGIN_LENGTH} characters; shorten the scenario name.`);
  }
  return { login, email: `${login}@${MOCK_EMAIL_DOMAIN}`, githubId: `mock-${login}` };
}

export interface StoredAccount {
  id: string;
  githubId: string | null;
  hasPassword: boolean;
  emailVerified: boolean;
  roles: string[];
}

async function withOrm<T>(databaseUrl: string, work: (orm: MikroORM) => Promise<T>): Promise<T> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    return await work(orm);
  } finally {
    await orm.close(true);
  }
}

/** Every user row that holds this address or this GitHub id, so a duplicate cannot hide. */
export async function storedAccounts(
  databaseUrl: string,
  account: Pick<ThrowawayAccount, 'email' | 'githubId'>,
): Promise<StoredAccount[]> {
  return withOrm(databaseUrl, async (orm) => {
    const users = await orm.em.fork().find(User, {
      $or: [{ email: account.email }, { githubId: account.githubId }],
    });
    return users.map((user) => ({
      id: user.id,
      githubId: user.githubId ?? null,
      hasPassword: Boolean(user.passwordHash),
      emailVerified: Boolean(user.emailVerifiedAt),
      roles: [...user.roles],
    }));
  });
}

/** Delete the scenario's users and the per-email rate-limit counters it filled. */
export async function deleteAccounts(databaseUrl: string, emails: readonly string[]): Promise<void> {
  await withOrm(databaseUrl, async (orm) => {
    const em = orm.em.fork();
    const normalized = emails.map((email) => email.trim().toLowerCase());
    const keys = normalized.flatMap((email) => {
      const digest = createHash('sha256').update(email).digest('hex');
      return EMAIL_RATE_LIMIT_SCOPES.map((scope) => `${scope}:email:${digest}`);
    });
    await em.nativeDelete(User, { email: { $in: normalized } });
    for (const key of keys) {
      await em.execute('delete from auth_rate_limits where key = ?', [key]);
    }
  });
}
