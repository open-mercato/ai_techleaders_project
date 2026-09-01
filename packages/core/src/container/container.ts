import {
  asClass,
  asFunction,
  asValue,
  createContainer,
  InjectionMode,
  type AwilixContainer,
} from 'awilix';
import { getOrm } from '@devmentor/db';
import { getEnv } from '../config/env';
import { createLogger } from '../logger';
import { UserService } from '../services/user.service';
import type { Cradle } from './cradle';

/**
 * The root container is cached on `globalThis` so Next.js HMR reuses a single
 * container (and the single ORM/pool it holds) across dev reloads. Registrations are
 * explicit — no `loadModules` globbing — so every binding is greppable.
 */
const globalForContainer = globalThis as unknown as {
  __devmentorContainer?: Promise<AwilixContainer<Cradle>>;
};

async function build(): Promise<AwilixContainer<Cradle>> {
  // Resolve the ORM once up front so it can be registered as a shared singleton value.
  const orm = await getOrm();

  const container = createContainer<Cradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  container.register({
    env: asValue(getEnv()),
    logger: asFunction(createLogger).singleton(),
    orm: asValue(orm),
    // A forked EntityManager per scope gives each request its own identity map / UoW.
    em: asFunction(({ orm }: Cradle) => orm.em.fork()).scoped(),
    userService: asClass(UserService).scoped(),
  });

  return container;
}

export function getContainer(): Promise<AwilixContainer<Cradle>> {
  if (!globalForContainer.__devmentorContainer) {
    globalForContainer.__devmentorContainer = build();
  }
  return globalForContainer.__devmentorContainer;
}

/**
 * Run `fn` inside a fresh awilix scope. The scope owns a forked EntityManager and any
 * other SCOPED services; it is disposed (releasing scoped state) when `fn` settles.
 * This is the entry point request handlers should use to touch the domain.
 */
export async function withScope<T>(fn: (cradle: Cradle) => Promise<T> | T): Promise<T> {
  const container = await getContainer();
  const scope = container.createScope<Cradle>();
  try {
    return await fn(scope.cradle);
  } finally {
    await scope.dispose();
  }
}
