import { pino, type Logger } from 'pino';
import { getEnv } from './config/env';

/**
 * Root application logger. In development we keep raw JSON (no `pino-pretty` dep in
 * the base install); wire up a transport later if desired.
 */
export function createLogger(): Logger {
  const env = getEnv();
  return pino({
    level: env.LOG_LEVEL,
    base: { app: env.APP_NAME },
  });
}

export type { Logger };
