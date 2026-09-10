import { randomBytes } from 'node:crypto';

/**
 * A fresh signing secret per harness run. Generated rather than hard-coded so nothing
 * in the suite can come to depend on a fixed secret, and so a captured cookie from one
 * run is worthless in the next. Module scope, not per call, because migrate/seed/build
 * and the app process must all agree on it within a single run.
 */
const SESSION_SECRET = randomBytes(32).toString('hex');

/**
 * The seeded operator persona. `.github/workflows/ci.yml` sets the same obviously-fake
 * address, and the fallback keeps a local run identical to CI. Real founder addresses
 * live only in deployment configuration — neither this file nor CI is a second editor
 * of the operator allowlist.
 */
const MOCK_OPERATOR_EMAIL = 'mock-operator@devmentor.test';

/**
 * Test infrastructure is the sole exception to the application's config rule: it
 * inherits the parent environment only to pass an ephemeral database URL to child
 * processes. Production code continues to read environment through zod config.
 */
export function integrationChildEnvironment(
  databaseUrl: string,
  appUrl: string,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_URL: databaseUrl,
    DB_POOL_MIN: '0',
    DB_POOL_MAX: '5',
    // Keep migration:up aligned with the repository's committed snapshot name so a
    // test run never creates a duplicate migrations/devmentor.json artifact.
    MIKRO_ORM_MIGRATIONS_SNAPSHOT_NAME: '.snapshot-devmentor',
    // The app runs here as production, so the container's boot gate applies: without a
    // session secret the process would refuse to start.
    SESSION_SECRET,
    // The harness cannot compose the container in-process — the app is a child process
    // — so adapter selection crosses the boundary as configuration. Both signals are
    // required: `AUTH_IDENTITY_ADAPTER=mock` on its own makes the app fail at boot
    // rather than quietly fall back to real GitHub sign-in.
    AUTH_IDENTITY_ADAPTER: 'mock',
    INTEGRATION_TEST_RUN: '1',
    OPERATOR_EMAILS: process.env.OPERATOR_EMAILS ?? MOCK_OPERATOR_EMAIL,
    // The app's own address, so nothing it emits can name an origin the harness is not
    // serving. **No route in a mock-adapter run reads this any more** (2026-09-10):
    // `MockGithubIdentityAdapter.authorizeUrl` used to resolve `/api/auth/github/callback`
    // against `APP_URL` and therefore handed the browser a callback on
    // `http://localhost:3000` — nothing listening, every signed-in scenario failing with a
    // connection error rather than an assertion. It now returns an origin-relative callback,
    // so the flow stays on the harness's ephemeral port by construction.
    //
    // Still threaded, and still a **required parameter**, because `APP_URL` remains the real
    // adapter's `redirect_uri` and is the natural input for any later absolute self-URL (a
    // verification-mail link, say). Leaving it correct costs one argument; an optional
    // `appUrl` would be one forgotten call site away from the schema default again.
    APP_URL: appUrl,
  };
}
