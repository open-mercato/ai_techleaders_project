import { MikroORM } from "@mikro-orm/postgresql";
import { Message } from "@/lib/db/entities/message";
import { createOrmConfig } from "@/lib/db/config";

// Imports `createOrmConfig` rather than `lib/db/orm`, which pulls in
// `server-only` and throws outside a React Server Component.
let ormPromise: Promise<MikroORM> | undefined;

export function testOrm(databaseUrl: string): Promise<MikroORM> {
  ormPromise ??= MikroORM.init(createOrmConfig(databaseUrl));
  return ormPromise;
}

/** Clears the table so each test starts from a known state. */
export async function resetMessages(databaseUrl: string): Promise<void> {
  const orm = await testOrm(databaseUrl);
  await orm.em
    .getConnection()
    .execute('truncate table "messages" restart identity cascade');
}

export async function seedMessages(
  databaseUrl: string,
  bodies: string[],
): Promise<void> {
  const orm = await testOrm(databaseUrl);
  const em = orm.em.fork();
  for (const body of bodies) {
    em.create(Message, { body });
  }
  await em.flush();
}

export async function countMessages(databaseUrl: string): Promise<number> {
  const orm = await testOrm(databaseUrl);
  return orm.em.fork().count(Message, {});
}

export async function closeTestOrm(): Promise<void> {
  if (!ormPromise) return;
  const orm = await ormPromise;
  ormPromise = undefined;
  await orm.close(true);
}
