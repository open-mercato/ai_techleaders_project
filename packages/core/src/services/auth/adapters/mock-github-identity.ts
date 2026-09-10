import { ServiceUnavailableError } from '../../../http/errors';
import {
  GITHUB_CALLBACK_PATH,
  type AuthorizeUrlInput,
  type GithubIdentity,
  type GithubIdentityPort,
} from '../github-identity.port';

/**
 * The fake GitHub identity adapter (platform primitives B14).
 *
 * It is not a convenience. It is the only way E01's headline acceptance criteria — "lands
 * on the mentee home", "a mentor's sign-in lands on the mentor home", the operator
 * sign-in in `admin.integration.test.ts` — can be exercised without CI calling github.com.
 *
 * **It is only ever reachable through the container**, which registers it when
 * `AUTH_IDENTITY_ADAPTER=mock` *and* `INTEGRATION_TEST_RUN=1` are both set; the env schema
 * refuses to parse — the app fails at boot — when the first is set without the second
 * (edge case 30). Nothing here checks those flags, and nothing here should: a fake that
 * decides for itself whether it is allowed to run is a fake that can be wrong about it.
 *
 * **Personas come from the `login` hint**, not from one fixed identity. `operator`
 * authority is derived live from `OPERATOR_EMAILS`, so a single fixed address would be
 * either always an operator or never one, and the mentee-landing and operator scenarios
 * could not both run. Every field is a pure function of the login, so the same login always
 * signs in as the same person and two logins are always two people.
 *
 * **The identities it mints link to the seeded personas.** The seeder creates
 * `mock-mentee`, `mock-mentor` and `mock-operator` at `<login>@devmentor.test` with
 * `email_verified_at` set and `github_id` null, so a first sign-in misses on `github_id`,
 * matches on the verified address and links the id onto that row —
 * `UserService.findOrCreateFromGithub`'s second branch. Ada Lovelace is deliberately not
 * reachable: her address is `ada@devmentor.dev`, no login can produce it, and
 * `users.email` is never rewritten.
 *
 * **It has no dependencies at all**, deliberately. It used to take `env` for one reason —
 * to resolve its callback against `APP_URL` — and that was the bug `authorizeUrl` now
 * documents. A fake that redirects the browser back into the same app needs to know nothing
 * about where that app thinks it lives.
 */

/** The persona a sign-in with no `?login=` lands on: the seeded mentee. */
export const DEFAULT_MOCK_LOGIN = 'mock-mentee';

/**
 * The domain every mock address is built from. `devmentor.test` is an RFC 2606 reserved
 * TLD, so an address minted here can never be deliverable to a real inbox.
 */
const MOCK_EMAIL_DOMAIN = 'devmentor.test';

/**
 * A mock `github_id` is `mock-<login>`: stable per login, distinct between logins, and —
 * because a real GitHub id is a decimal number — impossible to collide with a real
 * identity. A test database that later meets the real adapter can therefore never hand a
 * real user someone else's row.
 */
const ID_PREFIX = 'mock-';

/**
 * A base `new URL()` can resolve `GITHUB_CALLBACK_PATH` against so `URLSearchParams` does
 * the query encoding. It is discarded before anything is returned — see `authorizeUrl`.
 */
const RELATIVE_BASE = 'https://mock-github.invalid';

/** Prefixes so a value this adapter never minted is recognisable rather than decoded. */
const CODE_PREFIX = 'mock-code-';
const TOKEN_PREFIX = 'mock-token-';

/**
 * `mock-mentor` → `Mock Mentor`, which is exactly the display name the seeder gives that
 * persona. A scenario therefore reads the same whether the row was seeded or created by
 * the sign-in itself.
 */
function displayNameFor(login: string): string {
  return login
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

/** Every field derived from the login, so the mapping is total, stable and injective. */
function identityFor(login: string): GithubIdentity {
  return {
    githubId: `${ID_PREFIX}${login}`,
    githubLogin: login,
    email: `${login}@${MOCK_EMAIL_DOMAIN}`,
    displayName: displayNameFor(login),
    // No avatar: `refreshGithubProfile` writes this onto the row, and a fabricated URL
    // would be a broken image in every screenshot the harness captures.
    avatarUrl: null,
  };
}

export class MockGithubIdentityAdapter implements GithubIdentityPort {
  /**
   * Points back at the app's own callback instead of github.com, so the browser completes
   * the flow in one navigation with no network call. `state` is carried through unchanged
   * because the callback compares it against the state cookie before anything else — the
   * mock stands in for GitHub, not for the CSRF defence.
   *
   * **Deliberately origin-relative, and this is the whole point of the method.** The real
   * adapter builds an *absolute* callback from `APP_URL` because it has to: GitHub requires
   * a `redirect_uri` that matches the OAuth app's registered, absolute URL. The mock has the
   * opposite requirement. It is not a third party — it *is* this application — so it has no
   * reason to name an origin, and naming one is actively wrong: `APP_URL` describes the
   * deployment's canonical public origin, not "the origin this browser is currently talking
   * to". Whenever the two differ — `127.0.0.1` instead of `localhost`, a preview hostname, a
   * tunnel, the integration harness's ephemeral port — an absolute `Location` moves the
   * browser to another origin mid-flow, the `devmentor_oauth_state` cookie set on the
   * original origin is not sent to the new one, and the callback correctly refuses a state
   * it cannot match. The user sees `/sign-in?error=state`, which describes the symptom and
   * hides the cause. A relative `Location` (RFC 7231 §7.1.2) resolves against whatever
   * origin the browser is already on, so the flow is same-origin by construction and the
   * cookie always comes back. Never "simplify" this into an absolute URL.
   */
  authorizeUrl({ state, login }: AuthorizeUrlInput): string {
    // Resolved against a placeholder base purely to get the query encoding right; only the
    // path-and-query is returned, so no origin ever reaches the `Location` header.
    const url = new URL(GITHUB_CALLBACK_PATH, RELATIVE_BASE);
    url.searchParams.set('code', `${CODE_PREFIX}${login ?? DEFAULT_MOCK_LOGIN}`);
    url.searchParams.set('state', state);
    return `${url.pathname}${url.search}`;
  }

  async exchangeCode(code: string): Promise<string> {
    return `${TOKEN_PREFIX}${loginFrom(code, CODE_PREFIX, 'authorization code')}`;
  }

  async fetchIdentity(accessToken: string): Promise<GithubIdentity> {
    return identityFor(loginFrom(accessToken, TOKEN_PREFIX, 'access token'));
  }
}

/**
 * Recover the login this adapter encoded, refusing anything it did not mint.
 *
 * Refusing matters: a hand-written callback URL is the one way to reach this adapter with a
 * value it never produced, and silently treating the whole string as a login would sign
 * that caller in as an account of their choosing. The failure is a 503 so the callback
 * route treats it exactly like a real token-exchange failure and needs no branch for the
 * mock; the message names the mock so a scenario that is genuinely misconfigured says so.
 */
function loginFrom(value: string, prefix: string, kind: string): string {
  if (!value.startsWith(prefix) || value.length === prefix.length) {
    throw new ServiceUnavailableError(
      `The mock GitHub identity adapter was given an ${kind} it did not mint. Start the ` +
        'flow at /api/auth/github so the code and token come from authorizeUrl.',
    );
  }
  return value.slice(prefix.length);
}
