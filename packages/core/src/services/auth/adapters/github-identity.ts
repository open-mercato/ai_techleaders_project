import { z } from 'zod';
import type { AppEnv } from '../../../config/env';
import type { Logger } from '../../../logger';
import { ConflictError, ServiceUnavailableError } from '../../../http/errors';
import { fetchJson } from '../../../http/outbound';
import {
  GITHUB_CALLBACK_PATH,
  type AuthorizeUrlInput,
  type GithubIdentity,
  type GithubIdentityPort,
} from '../github-identity.port';

/**
 * The real GitHub identity adapter (platform primitives B14).
 *
 * **No SDK, three `fetchJson` calls, split across the two I/O methods:** one in
 * `exchangeCode` (`POST /login/oauth/access_token`) and two in `fetchIdentity`
 * (`GET /user` and `GET /user/emails`). `@octokit/*` would add a dependency tree, its own
 * retry policy and its own timeout defaults to reimplement three requests this file spells
 * out in full.
 *
 * `fetchJson` (B20) owns everything about the transport: the 10 s `AbortSignal.timeout`
 * that keeps a hung GitHub from holding a request scope open (edge case 7), the single
 * retryable 503 for any non-2xx (edge case 8) that never carries the upstream's status or
 * body to the client, and the guarantee that no request body or header — which here means
 * `client_secret` and the access token — can reach a log line. This adapter adds only what
 * `fetchJson` cannot know: the shape of each payload, and which outcomes are refusals
 * rather than outages.
 */

const AUTHORIZE_ENDPOINT = 'https://github.com/login/oauth/authorize';
const ACCESS_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';
const USER_ENDPOINT = 'https://api.github.com/user';
const USER_EMAILS_ENDPOINT = 'https://api.github.com/user/emails';

/**
 * `read:user` for the profile, `user:email` for `/user/emails`. Without the second, the
 * emails endpoint 403s and no account could ever produce a verified primary address.
 */
const SCOPE = 'read:user user:email';

/** api.github.com rejects a request without a `User-Agent`, so this is not optional. */
const USER_AGENT = 'DevMentor';

/** Pinned so a future default at GitHub cannot change the payloads parsed below. */
const API_VERSION = '2022-11-28';

/**
 * B6: *missing* configuration fails at the route, not at boot — an unset
 * `GITHUB_CLIENT_SECRET` must not take the marketing site down. The message names the
 * variables and never quotes a value.
 */
const NOT_CONFIGURED_MESSAGE =
  'GitHub sign-in is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to ' +
  'the credentials of the registered OAuth app.';

/** Shown for every upstream failure; deliberately says nothing about what GitHub returned. */
const UNAVAILABLE_MESSAGE =
  'GitHub sign-in is temporarily unavailable. Please try again in a moment.';

/**
 * Edge case 3. The address is what links a GitHub identity to an account, and linking on an
 * address the provider has not verified is an account-takeover vector — so an identity
 * without a primary *verified* email is refused here and no account is created.
 */
const NO_VERIFIED_EMAIL_MESSAGE =
  'Your GitHub account has no verified primary email address, so we cannot confirm who ' +
  'you are. Verify an email address on GitHub and try signing in again.';

/**
 * Only the fields sign-in reads. Unknown keys are stripped by zod, so a payload GitHub
 * grows tomorrow neither breaks the parse nor leaks into an entity.
 */
const accessTokenSchema = z.object({
  access_token: z.string().min(1).optional(),
  /** A refusal arrives as HTTP 200 with an `error` code, not as a failure status. */
  error: z.string().optional(),
});

const accountSchema = z.object({
  id: z.number().int(),
  login: z.string().min(1),
  name: z.string().nullish(),
  avatar_url: z.string().nullish(),
});

const emailsSchema = z.array(
  z.object({
    email: z.string().min(1),
    primary: z.boolean(),
    verified: z.boolean(),
  }),
);

/**
 * GitHub's `name` is optional and user-editable, so it can be absent, `null` or whitespace.
 * The login is always present and is what the account is called anyway.
 */
function displayNameFor(name: string | null | undefined, login: string): string {
  const trimmed = name?.trim() ?? '';
  return trimmed === '' ? login : trimmed;
}

export class GithubIdentityAdapter implements GithubIdentityPort {
  private readonly env: AppEnv;
  private readonly logger: Logger;

  constructor({ env, logger }: { env: AppEnv; logger: Logger }) {
    this.env = env;
    this.logger = logger;
  }

  authorizeUrl({ state, login }: AuthorizeUrlInput): string {
    const { clientId } = this.credentials();
    const url = new URL(AUTHORIZE_ENDPOINT);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('scope', SCOPE);
    url.searchParams.set('state', state);
    if (login !== undefined) {
      // GitHub's own hint parameter: it pre-selects an account on the authorisation
      // screen. Forwarding it is all this adapter does with it — the identity that comes
      // back is whoever actually authorised, not whoever was hinted.
      url.searchParams.set('login', login);
    }
    return url.toString();
  }

  async exchangeCode(code: string): Promise<string> {
    const { clientId, clientSecret } = this.credentials();

    const payload = await fetchJson<unknown>(ACCESS_TOKEN_ENDPOINT, {
      method: 'POST',
      body: {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: this.redirectUri(),
      },
    });

    const parsed = this.parse(accessTokenSchema, payload, 'malformed token-exchange response');
    if (parsed.access_token === undefined) {
      // A stale, replayed or forged `code` — and a wrong `client_secret` — all arrive this
      // way. The code is logged because it names which of those it was and is not a
      // credential; `error_description` is not, because it is upstream free text.
      throw this.unavailable(`token exchange refused: ${parsed.error ?? 'no access_token'}`);
    }
    return parsed.access_token;
  }

  async fetchIdentity(accessToken: string): Promise<GithubIdentity> {
    const headers = {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'user-agent': USER_AGENT,
      'x-github-api-version': API_VERSION,
    };

    // Concurrent because neither response feeds the other, and a sign-in pays for the
    // slower of the two rather than their sum. Each carries its own 10 s timeout.
    const [accountPayload, emailsPayload] = await Promise.all([
      fetchJson<unknown>(USER_ENDPOINT, { headers }),
      fetchJson<unknown>(USER_EMAILS_ENDPOINT, { headers }),
    ]);

    const account = this.parse(accountSchema, accountPayload, 'malformed account payload');
    const emails = this.parse(emailsSchema, emailsPayload, 'malformed email payload');

    // Primary *and* verified, not "any verified address": the primary is the one GitHub
    // treats as the account's address, and picking a different one would link the account
    // to an address the user does not think of as theirs.
    const primary = emails.find((entry) => entry.primary && entry.verified);
    if (primary === undefined) {
      throw new ConflictError(NO_VERIFIED_EMAIL_MESSAGE);
    }

    return {
      githubId: String(account.id),
      githubLogin: account.login,
      email: primary.email,
      displayName: displayNameFor(account.name, account.login),
      avatarUrl: account.avatar_url ?? null,
    };
  }

  /**
   * The credentials, or a 503 naming what is unset. Checked at the point of use rather
   * than at container creation so the app boots, builds and serves public pages without
   * GitHub configured (B6, edge case 1).
   */
  private credentials(): { clientId: string; clientSecret: string } {
    const { GITHUB_CLIENT_ID: clientId, GITHUB_CLIENT_SECRET: clientSecret } = this.env;
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableError(NOT_CONFIGURED_MESSAGE);
    }
    return { clientId, clientSecret };
  }

  /**
   * The absolute callback URL. GitHub compares it against the OAuth app's registered
   * redirect URI on both the authorize request and the token exchange, so it is built the
   * same way for both from the one path constant the callback route is mounted at.
   */
  private redirectUri(): string {
    return new URL(GITHUB_CALLBACK_PATH, this.env.APP_URL).toString();
  }

  private parse<T>(schema: z.ZodType<T>, payload: unknown, reason: string): T {
    const result = schema.safeParse(payload);
    if (!result.success) {
      // A shape we do not recognise is an upstream problem, not a client one. It must not
      // escape as a `ZodError`, which `apiHandler` would report as an unexpected 500.
      throw this.unavailable(reason, result.error);
    }
    return result.data;
  }

  /**
   * The one place a GitHub-level failure becomes an `AppError`. `fetchJson` already logs
   * transport failures; these are the ones it cannot see, because GitHub answered 200.
   */
  private unavailable(reason: string, cause?: unknown): ServiceUnavailableError {
    this.logger.warn({ reason }, 'github identity request failed');
    return new ServiceUnavailableError(UNAVAILABLE_MESSAGE, { cause });
  }
}
