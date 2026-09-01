import { MikroORM } from "@mikro-orm/postgresql";
import { createOrmConfig } from "../lib/db/config";

/**
 * Applies pending migrations. Run in its own process (via tsx) rather than from
 * inside the test runner: MikroORM imports migration files dynamically at
 * runtime, which bypasses Vitest's transform pipeline. tsx registers a global
 * loader hook, so the `.ts` migrations resolve correctly here.
 */
async function main(): Promise<void> {
  const orm = await MikroORM.init(createOrmConfig());
  try {
    const applied = await orm.migrator.up();
    if (applied.length === 0) {
      console.log("[db-migrate] already up to date");
    } else {
      for (const migration of applied) {
        console.log(`[db-migrate] applied ${migration.name}`);
      }
    }
  } finally {
    await orm.close(true);
  }
}

main().catch((err: unknown) => {
  console.error("[db-migrate] failed:", err);
  process.exit(1);
});
