import { describe, expect, it } from 'vitest';
import {
  REDACT_CENSOR,
  REDACT_PATHS,
  createLogger,
  createLoggerTo,
  loggerOptions,
} from './logger';

/**
 * Collects the JSON lines a logger emits. pino writes a string per record, so the
 * assertions below can look at both the parsed object and the raw text — the raw text
 * is what proves a secret is absent from the line *anywhere*, including inside a
 * stringified nested value.
 */
function capture(): { lines: string[]; write(chunk: string): void } {
  const lines: string[] = [];
  return {
    lines,
    write(chunk: string) {
      lines.push(chunk);
    },
  };
}

function logRecord(payload: Record<string, unknown>): { text: string; parsed: Record<string, unknown> } {
  const destination = capture();
  const logger = createLoggerTo(destination);
  logger.error(payload, 'test record');
  const text = destination.lines.join('');
  return { text, parsed: JSON.parse(text) as Record<string, unknown> };
}

describe('loggerOptions', () => {
  it('configures level, base fields and redaction from the environment', () => {
    const options = loggerOptions();

    expect(options.level).toBe('info');
    expect(options.base).toEqual({ app: 'DevMentor' });
    expect(options.redact).toEqual({ paths: [...REDACT_PATHS], censor: REDACT_CENSOR });
  });

  it('registers every secret key at the top level and one and two levels below', () => {
    for (const key of ['password', 'passwordHash', 'token', 'authorization', 'cookie']) {
      expect(REDACT_PATHS).toContain(key);
      expect(REDACT_PATHS).toContain(`*.${key}`);
      expect(REDACT_PATHS).toContain(`*.*.${key}`);
    }
  });
});

describe('createLogger redaction', () => {
  it('redacts secret keys at the top level', () => {
    const { text, parsed } = logRecord({
      password: 'plaintext-password-value',
      passwordHash: 'scrypt-hash-value',
      token: 'purpose-token-value',
      authorization: 'Bearer access-token-value',
      cookie: 'devmentor_session=jwt-value',
      userId: 'user-1',
    });

    expect(parsed.password).toBe(REDACT_CENSOR);
    expect(parsed.passwordHash).toBe(REDACT_CENSOR);
    expect(parsed.token).toBe(REDACT_CENSOR);
    expect(parsed.authorization).toBe(REDACT_CENSOR);
    expect(parsed.cookie).toBe(REDACT_CENSOR);
    expect(parsed.userId).toBe('user-1');
    expect(text).not.toContain('plaintext-password-value');
    expect(text).not.toContain('scrypt-hash-value');
    expect(text).not.toContain('purpose-token-value');
    expect(text).not.toContain('access-token-value');
    expect(text).not.toContain('jwt-value');
  });

  it('redacts secrets one level down, whatever the container key is called', () => {
    const { text, parsed } = logRecord({
      input: { password: 'plaintext-password-value', email: 'ada@devmentor.dev' },
      user: { passwordHash: 'scrypt-hash-value', id: 'user-1' },
      state: { token: 'purpose-token-value' },
      headers: { cookie: 'devmentor_session=jwt-value', 'user-agent': 'agent-browser' },
    });

    expect(parsed.input).toEqual({ password: REDACT_CENSOR, email: 'ada@devmentor.dev' });
    expect(parsed.user).toEqual({ passwordHash: REDACT_CENSOR, id: 'user-1' });
    expect(parsed.state).toEqual({ token: REDACT_CENSOR });
    expect(parsed.headers).toEqual({ cookie: REDACT_CENSOR, 'user-agent': 'agent-browser' });
    expect(text).not.toContain('plaintext-password-value');
    expect(text).not.toContain('scrypt-hash-value');
    expect(text).not.toContain('purpose-token-value');
    expect(text).not.toContain('jwt-value');
  });

  it('redacts request headers two levels down', () => {
    const { text, parsed } = logRecord({
      req: {
        method: 'POST',
        headers: {
          authorization: 'Bearer access-token-value',
          cookie: 'devmentor_session=jwt-value',
          'content-type': 'application/json',
        },
      },
    });

    expect(parsed.req).toEqual({
      method: 'POST',
      headers: {
        authorization: REDACT_CENSOR,
        cookie: REDACT_CENSOR,
        'content-type': 'application/json',
      },
    });
    expect(text).not.toContain('access-token-value');
    expect(text).not.toContain('jwt-value');
  });

  it('redacts secrets attached to a thrown error, the shape apiHandler logs', () => {
    const error = Object.assign(new Error('scrypt failed'), {
      password: 'plaintext-password-value',
      token: 'purpose-token-value',
    });

    const { text, parsed } = logRecord({ err: error, path: '/api/auth/login' });
    const serialized = parsed.err as Record<string, unknown>;

    expect(serialized.message).toBe('scrypt failed');
    expect(serialized.password).toBe(REDACT_CENSOR);
    expect(serialized.token).toBe(REDACT_CENSOR);
    expect(parsed.path).toBe('/api/auth/login');
    expect(text).not.toContain('plaintext-password-value');
    expect(text).not.toContain('purpose-token-value');
  });

  it('writes to stdout when no destination is given', () => {
    expect(typeof createLogger().error).toBe('function');
  });

  it('keeps the container-registered factory at zero arity', () => {
    // Not pedantry: `container.ts` registers `createLogger` in an `InjectionMode.PROXY`
    // container, which calls every factory with the cradle proxy as its first argument.
    // The optional `destination` parameter this function used to carry was therefore
    // filled with the cradle and handed to pino as a stream, and every request that built
    // the container threw `Could not resolve 'emit'`. A test destination goes through
    // `createLoggerTo`, which nothing registers, so its parameter can be required.
    expect(createLogger).toHaveLength(0);
    expect(createLoggerTo).toHaveLength(1);
  });
});
