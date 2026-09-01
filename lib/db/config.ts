import { Migrator } from "@mikro-orm/migrations";
import { defineConfig } from "@mikro-orm/postgresql";
import { Message } from "./entities/message";

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local, or let the " +
        "integration harness provide an ephemeral Postgres container.",
    );
  }
  return url;
}

export function createOrmConfig(clientUrl: string = databaseUrl()) {
  return defineConfig({
    clientUrl,
    entities: [Message],
    extensions: [Migrator],
    migrations: {
      path: "./migrations",
      pathTs: "./migrations",
      // The snapshot is a dev-time cache used to diff the schema when generating
      // migrations. Committing it causes spurious conflicts, and CI never generates.
      snapshot: false,
      transactional: true,
      allOrNothing: true,
    },
    // Entities are listed statically above rather than by glob, so MikroORM never
    // scans the filesystem — discovery works inside the Next.js server bundle.
    debug: process.env.MIKRO_ORM_DEBUG === "true",
  });
}
