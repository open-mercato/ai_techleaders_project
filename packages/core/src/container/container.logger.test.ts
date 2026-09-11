import { beforeEach, describe, expect, it, vi } from 'vitest';
import { symbols, type Logger } from 'pino';
import type { AppEnv } from '../config/env';

/**
 * The one test that resolves the **real** logger from a **real** awilix container.
 *
 * `container.test.ts` stubs three edges: `@devmentor/db`, `../config/env` and — crucially —
 * `../logger`. That third stub is why a container that could not build at all still had a
 * green suite: nothing anywhere resolved the real `createLogger` through a real container,
 * so nobody noticed that `InjectionMode.PROXY` was handing the cradle proxy to pino as a
 * destination stream, pino was probing `stream.emit`, and every request was dying with
 * `AwilixResolutionError: Could not resolve 'emit'` (resolution path
 * `eventBus -> logger -> emit`).
 *
 * This file keeps the first two stubs — the ORM graph and the environment are genuinely
 * external — and deliberately leaves `../logger` real. It is a separate file rather than a
 * case in `container.test.ts` because `vi.mock` is module-wide: the two intentions cannot
 * coexist in one module.
 */

/** A forked EntityManager stand-in; nothing here touches it, it just has to exist. */
const fakeOrm = { em: { fork: () => ({ findOne: async () => null }) } };

vi.mock('@devmentor/db', () => ({
  getOrm: async () => fakeOrm,
  User: {},
  ROLES: ['mentee', 'mentor', 'operator'],
}));
vi.mock('../config/env', () => ({ getEnv: () => currentEnv }));
// `../logger` is NOT mocked. That is the entire point of this file.

const { getContainer } = await import('./container');

/** The container is cached on `globalThis` to survive HMR; tests must clear that cache. */
const globalForContainer = globalThis as unknown as { __devmentorContainer?: unknown };

/** The environment the container under test sees. */
let currentEnv: AppEnv;

const BASE_ENV = {
  NODE_ENV: 'development',
  APP_NAME: 'DevMentor',
  LOG_LEVEL: 'info',
  DB_HOST: '127.0.0.1',
  DB_PORT: 5432,
  DB_NAME: 'devmentor',
  DB_USER: 'devmentor',
  DB_PASSWORD: 'devmentor',
  OPERATOR_EMAILS: [],
  APP_URL: 'http://localhost:3000',
  TRUSTED_PROXY_HOPS: 0,
  INTEGRATION_TEST_RUN: false,
} as unknown as AppEnv;

beforeEach(() => {
  delete globalForContainer.__devmentorContainer;
  currentEnv = { ...BASE_ENV };
});

/** pino keeps its destination on a symbol it exports; each case gets a freshly built one. */
type WithDestination = { [symbols.streamSym]: { write(chunk: string): void } };

/**
 * Read back what a container-resolved logger writes.
 *
 * A production logger is constructed with no destination argument — that is the property
 * under test — so it writes to pino's own stdout stream. `symbols.streamSym` is pino's
 * public handle on that stream, which lets the emitted line be captured (and kept out of
 * the test output) without changing how the logger was built. The container cache is
 * cleared per case, so the stream swapped here belongs to that case's logger alone.
 */
function captureLines(logger: Logger): string[] {
  const lines: string[] = [];
  const destination = (logger as unknown as WithDestination)[symbols.streamSym];
  destination.write = (chunk: string) => {
    lines.push(chunk);
  };
  return lines;
}

describe('the logger registered on the container', () => {
  it('resolves and logs, instead of throwing "Could not resolve \'emit\'"', async () => {
    // Pre-fix this line alone threw: `build()` wires the default event subscribers, which
    // resolves `eventBus`, whose constructor depends on `logger`.
    const container = await getContainer();
    const logger = container.cradle.logger;
    const lines = captureLines(logger);

    logger.info({ userId: 'user-1' }, 'auth.user.created');

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines.join(''))).toMatchObject({
      // `app` proves this is the repository's configured pino instance and not a stub,
      // i.e. that `loggerOptions()` was applied to a real destination.
      app: 'DevMentor',
      userId: 'user-1',
      msg: 'auth.user.created',
    });
  });

  it('never hands the cradle to the logger factory as a destination', async () => {
    // The mechanism, asserted directly. In PROXY mode awilix invokes the factory with the
    // cradle proxy; pino then does `typeof stream.emit === 'function'` on whatever it was
    // given. If the cradle ever reaches pino again, that property read becomes a resolution
    // of a registration named `emit` and this fails the way production did.
    const container = await getContainer();

    const destination = (container.cradle.logger as unknown as WithDestination)[
      symbols.streamSym
    ];

    expect(destination).not.toBe(container.cradle);
    expect(() => container.cradle.logger).not.toThrow();
  });

  it('logs the default auth.user.created subscriber through the real logger', async () => {
    // The end-to-end path the app actually takes: an emitted domain event reaching stdout.
    const container = await getContainer();
    const lines = captureLines(container.cradle.logger);

    await container.cradle.eventBus.emit('auth.user.created', {
      userId: 'user-1',
      email: 'ada@devmentor.test',
    });

    expect(JSON.parse(lines.join(''))).toMatchObject({
      userId: 'user-1',
      msg: 'auth.user.created',
    });
  });
});
