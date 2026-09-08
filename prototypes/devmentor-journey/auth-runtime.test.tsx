import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { apiCall } from '@devmentor/ui/backend';
import { DEMO_PASSWORD, type AuthDemoResult } from './auth-model';
import { AUTH_ENDPOINT, authDemo, authHandlers, type AuthDemoAction, type AuthDemoEvent } from './auth-runtime';

const server = setupServer(...authHandlers);
const results: AuthDemoEvent[] = [];
const statuses: number[] = [];
const collect = (event: Event) => results.push((event as CustomEvent<AuthDemoEvent>).detail);
const login = { email: 'jordan@example.test', password: DEMO_PASSWORD };
const registration = { displayName: 'Avery Doe', email: 'avery@example.test', password: 'fictional-password-123' };
const request = (action: AuthDemoAction, body?: unknown) => apiCall(`${location.origin}${AUTH_ENDPOINT}/${action}`, { method: 'POST', body });

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('response:mocked', ({ response }) => statuses.push(response.status));
  document.addEventListener('devmentor:auth-result', collect);
});
beforeEach(() => { authDemo.reset(); results.length = 0; statuses.length = 0; });
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => {
  document.removeEventListener('devmentor:auth-result', collect);
  server.close();
});

it('connects shared apiCall to sign-in, emits only public results and signs out without a body', async () => {
  const result = await request('login', login);
  expect(result).toEqual({ ok: true, data: { user: { id: 'jordan', displayName: 'Jordan Lee', email: login.email, roles: ['mentee'] } } });
  expect(statuses).toEqual([200]);
  expect(results).toEqual([{ action: 'login', result }]);
  expect(JSON.stringify(results)).not.toContain(DEMO_PASSWORD);
  expect(JSON.stringify(results)).not.toContain('password');
  expect(authDemo.getSession()?.id).toBe('jordan');
  expect(await request('logout')).toEqual({ ok: true, data: { user: null } });
  expect(authDemo.getSession()).toBeNull();
  expect(await request('logout')).toEqual({ ok: true, data: { user: null } });
  expect(results.map(({ action }) => action)).toEqual(['login', 'logout', 'logout']);
});

it('connects pending registration, verification and provider sign-in through public envelopes', async () => {
  expect(await request('register', registration)).toMatchObject({ ok: true, data: { user: null, email: registration.email } });
  expect(authDemo.getSession()).toBeNull();
  expect(await request('verify', { mode: 'valid' })).toMatchObject({ ok: true, data: { user: { displayName: registration.displayName, roles: ['mentee'] } } });
  expect(await request('github', { accountId: 'sam', outcome: 'success' })).toMatchObject({ ok: true, data: { user: { id: 'sam', roles: ['mentor', 'operator'] } } });
  expect(results.map(({ action }) => action)).toEqual(['register', 'verify', 'github']);
  expect(JSON.stringify(results)).not.toContain(registration.password);
});

it.each([
  ['login', { ...login, password: 'incorrect' }, 401, 'unauthorized'],
  ['login', { ...login, email: 'pending@example.test' }, 403, 'forbidden'],
  ['register', { ...registration, email: login.email }, 409, 'conflict'],
  ['github', { accountId: 'new-github', outcome: 'unavailable' }, 503, 'service_unavailable'],
] as const)('returns the HTTP status for %s envelope errors', async (action, body, status, code) => {
  const result = await request(action, body);
  expect(result).toMatchObject({ ok: false, error: { code } });
  expect(statuses).toEqual([status]);
  expect(results).toEqual([{ action, result }]);
  expect(authDemo.getSession()).toBeNull();
});

it.each(['rate-limited', 'service-unavailable', 'mail-unavailable'] as const)('consumes %s once so retry can succeed', async (failure) => {
  authDemo.setFailure(failure);
  expect(await request('register', registration)).toMatchObject({ ok: false, error: { state: failure } });
  expect(statuses).toEqual([failure === 'rate-limited' ? 429 : 503]);
  expect(authDemo.getSession()).toBeNull();
  expect(await request('register', registration)).toMatchObject({ ok: true, data: { user: null } });
});

it.each([
  ['login', null], ['login', []], ['register', 'unreadable body'],
  ['verify', { mode: 'tampered' }], ['github', { accountId: '', outcome: 'unsupported' }],
] as const)('refuses unsupported %s bodies without changing account state', async (action, body) => {
  expect(await request(action, body)).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
  expect(statuses).toEqual([422]);
  expect(authDemo.getSession()).toBeNull();
  expect(authDemo.getPendingEmail()).toBeNull();
});

it('returns safe field errors and consumes the selected outcome even for an empty JSON body', async () => {
  const invalid = await request('register', { displayName: '', email: 'invalid', password: 'SECRET' });
  expect(invalid).toMatchObject({ ok: false, error: { code: 'validation_failed', fieldErrors: { displayName: ['Enter your name.'], email: ['Enter a valid email address.'], password: ['Use at least 12 characters.'] } } });
  expect(JSON.stringify(invalid)).not.toContain('SECRET');
  authDemo.setFailure('rate-limited');
  expect(await request('login')).toEqual({ ok: false, error: { code: 'validation_failed', message: 'This request could not be read. Please try again.' } });
  expect(await request('login', login)).toMatchObject({ ok: true });
  expect(statuses).toEqual([422, 422, 200]);
});

it('serializes overlapping sign-in and sign-out so the last completed action leaves no session', async () => {
  const requests = [request('login', login), request('logout')];
  const [signedIn, signedOut] = await Promise.all(requests);
  expect(signedIn).toMatchObject({ ok: true, data: { user: { id: 'jordan' } } });
  expect(signedOut).toEqual({ ok: true, data: { user: null } });
  expect(results.map(({ action }) => action)).toEqual(['login', 'logout']);
  expect(authDemo.getSession()).toBeNull();
});

it('uses a server error status for an unknown failure code without returning submitted data', async () => {
  const result: AuthDemoResult = { ok: false, error: { code: 'unexpected_demo_failure', message: 'Please try again.' } };
  vi.spyOn(authDemo, 'login').mockReturnValue(result);
  expect(await request('login', login)).toEqual(result);
  expect(statuses).toEqual([500]);
  expect(JSON.stringify(results)).not.toContain(DEMO_PASSWORD);
});
