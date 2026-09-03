/**
 * Test infrastructure is the sole exception to the application's config rule: it
 * inherits the parent environment only to pass an ephemeral database URL to child
 * processes. Production code continues to read environment through zod config.
 */
export function integrationChildEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
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
  };
}
