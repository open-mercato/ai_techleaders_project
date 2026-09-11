/**
 * The seam between DevMentor and GitHub's OAuth identity (platform primitives B14).
 *
 * Three methods, in the order the sign-in flow calls them:
 *
 * 1. `authorizeUrl` — where to send the browser to start the flow.
 * 2. `exchangeCode` — the `?code` the callback was handed, traded for an access token.
 * 3. `fetchIdentity` — that token, resolved to the account behind it.
 *
 * **The port fixes the shape of the seam, not its selection.** Which adapter is registered
 * is configuration (`AUTH_IDENTITY_ADAPTER=mock` *and* `INTEGRATION_TEST_RUN=1`, enforced
 * in `container.ts` and refused at parse time by `config/env.ts`), because the integration
 * harness builds and runs the app as a child process and so cannot compose the container
 * in-process. See "Selecting the identity adapter" in
 * `.ai/specs/2026-09-04-accounts-and-roles.md`.
 *
 * What the port buys is that the *route* has no test branch at all: an env-keyed "sign in
 * as anyone" branch inside the callback would be an authentication bypass living in
 * production code. Behind this interface the fake is a whole adapter, and the only place
 * that can choose it is the composition root.
 */

/**
 * The path the app serves the OAuth callback on.
 *
 * One constant because **both adapters must agree on it**: the real one sends it to GitHub
 * as `redirect_uri` (where it must match the registered OAuth app exactly), and the mock
 * bounces the browser straight back to it in place of a round trip to github.com. Two
 * hand-written copies would drift, and the drift would only show up as a failed sign-in.
 */
export const GITHUB_CALLBACK_PATH = '/api/auth/github/callback';

/**
 * A GitHub account, reduced to what sign-in needs and already proven by the provider.
 *
 * Structurally identical to `UserService`'s `GithubIdentityInput`, which that service
 * declares for itself: a consumer-declared input keeps `UserService` testable without an
 * adapter, and `core` services must not depend on adapters. `github-identity.port.test.ts`
 * asserts the two shapes stay assignable, so the duplication cannot drift silently.
 */
export interface GithubIdentity {
  /** GitHub's numeric account id, as text. The only identifier that survives a rename. */
  githubId: string;
  /** Display only. A GitHub user may change it at any time. */
  githubLogin: string;
  /**
   * GitHub's **primary verified** address. An adapter that cannot produce one refuses the
   * identity rather than returning an unverified address (edge case 3), so every consumer
   * may treat this field as proven.
   */
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AuthorizeUrlInput {
  /**
   * The signed OAuth state, echoed back to the callback. Opaque to the adapter — it is
   * minted and verified by `TokenService`.
   */
  state: string;
  /**
   * GitHub's own account hint. `?login=` on the authorize endpoint pre-selects an account,
   * so the real adapter forwards it and nothing else changes.
   *
   * The mock derives its **whole identity** from it, which is what makes the mentee,
   * mentor and operator scenarios runnable from one adapter: `operator` authority is
   * derived live from `OPERATOR_EMAILS`, so a single fixed fake identity would be either
   * always an operator or never one.
   */
  login?: string;
}

export interface GithubIdentityPort {
  /** Where to redirect the browser to begin authorisation. Never performs I/O. */
  authorizeUrl(input: AuthorizeUrlInput): string;
  /** Trade the callback's `?code` for an access token. */
  exchangeCode(code: string): Promise<string>;
  /** Resolve an access token to the account that granted it. */
  fetchIdentity(accessToken: string): Promise<GithubIdentity>;
}
