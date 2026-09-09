import {
  asClass,
  asFunction,
  asValue,
  createContainer,
  InjectionMode,
  type AwilixContainer,
} from 'awilix';
import { getOrm } from '@devmentor/db';
import { getEnv, type AppEnv } from '../config/env';
import { createLogger } from '../logger';
import { EventBus } from '../events/event-bus';
import { systemClock } from '../time/clock';
import { SessionService } from '../services/auth/session.service';
import { TokenService } from '../services/auth/token.service';
import { UserService } from '../services/auth/user.service';
import type { Cradle } from './cradle';

/**
 * The root container is cached on `globalThis` so Next.js HMR reuses a single
 * container (and the single ORM/pool it holds) across dev reloads. Registrations are
 * explicit — no `loadModules` globbing — so every binding is greppable.
 */
const globalForContainer = globalThis as unknown as {
  __devmentorContainer?: Promise<AwilixContainer<Cradle>>;
};

/**
 * Refuse to serve a production process that is missing a secret the whole request path
 * depends on. A deployment without `SESSION_SECRET` must not boot green and then 503
 * every sign-in until somebody notices.
 *
 * **This lives in the container and deliberately not in the zod schema.** `npm run
 * build` forces `NODE_ENV=production`, CI's Build job sets no environment at all, and
 * `getEnv()` is reachable at build time (`admin/page.tsx` renders it, and the pino
 * logger reads it), so a schema-level refine on a *missing* secret would fail every CI
 * build. The container is only ever created while serving a request. See B6 in
 * `.ai/specs/2026-09-04-platform-primitives.md` and the 2026-09-08 entry in
 * `.ai/lessons.md`.
 */
function assertProductionSecrets(env: AppEnv): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  if (!env.SESSION_SECRET) {
    throw new Error(
      'SESSION_SECRET is required when NODE_ENV=production: it signs every session ' +
        'cookie, so the app cannot authenticate anyone without it. Set it to at least ' +
        '32 characters of random data in the deployment environment.',
    );
  }

  // Slice 4 adds the second half of this gate here: MAIL_API_KEY is required in
  // production unless MAILER_ADAPTER=log is deliberately set (B14).
}

async function build(): Promise<AwilixContainer<Cradle>> {
  // Checked before anything is opened, so a misconfigured deployment fails on the
  // configuration rather than on a half-built container.
  const env = getEnv();
  assertProductionSecrets(env);

  // Resolve the ORM once up front so it can be registered as a shared singleton value.
  const orm = await getOrm();

  const container = createContainer<Cradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  container.register({
    env: asValue(env),
    logger: asFunction(createLogger).singleton(),
    orm: asValue(orm),
    eventBus: asClass(EventBus).singleton(),
    clock: asValue(systemClock),
    // SINGLETON, both of them: stateless, and both of their dependencies (`env`,
    // `clock`) are process singletons, so a per-request instance would be a fresh
    // object holding identical references. Nothing request-scoped may ever be added to
    // either — a session service that closed over one request's `em` or session would
    // be a bug that only showed up under concurrency. `SessionService` in particular
    // stays DB-free by design: the `session_version` lookup belongs to `requireSession`,
    // which has a scoped `em`.
    sessionService: asClass(SessionService).singleton(),
    tokenService: asClass(TokenService).singleton(),
    // A forked EntityManager per scope gives each request its own identity map / UoW.
    em: asFunction(({ orm }: Cradle) => orm.em.fork()).scoped(),
    userService: asClass(UserService).scoped(),
  });

  // Default in-process subscribers. Concept side effects (send a message, invalidate
  // a cache) register here; for now we just log so the event path is observable.
  container.cradle.eventBus.on('auth.user.created', ({ userId }) => {
    container.cradle.logger.info({ userId }, 'auth.user.created');
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
