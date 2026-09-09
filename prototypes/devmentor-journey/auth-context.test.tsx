import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { apiCall } from '@devmentor/ui/backend';
import { useAuthController } from './auth-context';
import { DEMO_PASSWORD } from './auth-model';
import { AUTH_ENDPOINT, authDemo, authHandlers } from './auth-runtime';
import { navigate } from './navigation';

const server = setupServer(...authHandlers);
const visited: string[] = [];
const engine = (event: Event) => {
  const id = (event as CustomEvent<string>).detail;
  visited.push(id);
  history.replaceState(null, '', `#${id}`);
  document.dispatchEvent(new CustomEvent('devmentor:screen-change', { detail: id }));
};
const post = (action: 'login' | 'register', body: unknown) => apiCall(`${location.origin}${AUTH_ENDPOINT}/${action}`, { body });
const login = { email: 'jordan@example.test', password: DEMO_PASSWORD };
const registration = { displayName: 'Avery Doe', email: 'avery@example.test', password: DEMO_PASSWORD };
async function go(id: string) { await act(async () => { navigate(id); }); }

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  document.addEventListener('devmentor:navigate', engine);
});
beforeEach(() => { authDemo.reset(); history.replaceState(null, '', '#s17'); visited.length = 0; });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { document.removeEventListener('devmentor:navigate', engine); server.close(); });

it('returns from booking sign-in to the selected booking and clears that continuation afterward', async () => {
  const { result } = renderHook(() => useAuthController(true));
  await go('s3');
  await go('s12');
  expect(result.current.returnTo).toBe('s4');
  await act(async () => { await post('login', login); });
  expect(result.current.screen).toBe('s4');
  expect(result.current.user?.id).toBe('jordan');
  expect(result.current.returnTo).toBeNull();
  await act(async () => { await result.current.logout(); });
  expect(result.current.screen).toBe('s17');
  expect(result.current.notice).toBe('signed-out');
  await go('s12');
  expect(result.current.returnTo).toBeNull();
  await act(async () => { await post('login', login); });
  expect(result.current.screen).toBe('s6');
});

it('preserves an anonymous protected destination through the engine redirect to sign-in', async () => {
  const { result } = renderHook(() => useAuthController(false));
  await go('s9');
  await waitFor(() => expect(result.current.screen).toBe('s12'));
  expect(visited).toEqual(['s9', 's12']);
  expect(result.current.returnTo).toBe('s9');
  await act(async () => { await post('login', login); });
  expect(result.current.screen).toBe('s9');
});

it('returns invitation sign-in to the invitation and clears the destination after login', async () => {
  const { result } = renderHook(() => useAuthController(true));
  await go('s26');
  await go('s12');
  expect(result.current.returnTo).toBe('s26');
  await act(async () => { await post('login', login); });
  expect(result.current.screen).toBe('s26');
  expect(result.current.user?.roles).toEqual(['mentee']);
  expect(result.current.returnTo).toBeNull();
  await act(async () => { await result.current.logout(); });
  await go('s12');
  expect(result.current.returnTo).toBeNull();
});

it('keeps invitation continuation through registration, email verification and completion', async () => {
  const { result } = renderHook(() => useAuthController(false));
  await go('s26');
  await go('s12');
  act(() => result.current.switchMode('s20'));
  await act(async () => { await post('register', registration); });
  expect(result.current.returnTo).toBe('s26');
  await act(async () => { await result.current.verify(); });
  act(() => result.current.complete());
  expect(result.current.screen).toBe('s26');
  expect(result.current.returnTo).toBeNull();
  expect(result.current.user?.roles).toEqual(['mentee']);
});

it('uses the current booking selection and ignores a previously abandoned booking on standalone sign-in', async () => {
  const { result, rerender } = renderHook(({ selected }) => useAuthController(selected), { initialProps: { selected: false } });
  await go('s3');
  await go('s12');
  expect(result.current.returnTo).toBeNull();
  await go('s3');
  rerender({ selected: true });
  await go('s12');
  expect(result.current.returnTo).toBe('s4');
  await go('s17');
  await go('s12');
  expect(result.current.returnTo).toBeNull();
});

it('connects registration, pending inbox, verification recovery and final booking continuation', async () => {
  const { result } = renderHook(() => useAuthController(true));
  await go('s3');
  await go('s12');
  act(() => result.current.switchMode('s20'));
  await act(async () => { await post('register', registration); });
  expect(result.current.screen).toBe('s21');
  expect(result.current.user).toBeNull();
  expect(result.current.notice).toBe('check-inbox');
  expect(result.current.pendingEmail).toBe(registration.email);
  expect(result.current.returnTo).toBe('s4');
  act(() => result.current.setVerification('expired'));
  await act(async () => { await result.current.verify(); });
  expect(result.current.screen).toBe('s22');
  expect(result.current.notice).toBe('verification-expired');
  expect(result.current.user).toBeNull();
  act(() => result.current.setVerification('valid'));
  await act(async () => { await result.current.verify(); });
  expect(result.current.notice).toBe('verified');
  expect(result.current.user?.email).toBe(registration.email);
  expect(result.current.screen).toBe('s22');
  act(() => result.current.complete());
  expect(result.current.screen).toBe('s4');
  expect(result.current.returnTo).toBeNull();
  expect(result.current.notice).toBeNull();
});

it('shows email errors without stale GitHub feedback or a fake service error for field validation', async () => {
  const { result } = renderHook(() => useAuthController(false));
  await go('s12');
  await act(async () => { await result.current.github(true); });
  expect(result.current.notice).toBe('github-cancelled');
  await act(async () => { await post('login', { ...login, password: 'wrong' }); });
  expect(result.current.formError).toBe('invalid-credentials');
  expect(result.current.notice).toBeNull();
  await act(async () => { await post('register', { ...registration, email: 'invalid' }); });
  expect(result.current.formError).toBeNull();
  expect(result.current.notice).toBeNull();
  expect(result.current.user).toBeNull();
});

it('keeps recovery state for unverified email and consumes only the selected next-request failure', async () => {
  const { result } = renderHook(() => useAuthController(false));
  await go('s12');
  await act(async () => { await post('login', { ...login, email: 'pending@example.test' }); });
  expect(result.current.formError).toBe('unverified-email');
  expect(result.current.pendingEmail).toBe('pending@example.test');
  act(() => result.current.setFailure('mail-unavailable'));
  expect(result.current.failure).toBe('mail-unavailable');
  await act(async () => { await post('register', registration); });
  expect(result.current.formError).toBe('mail-unavailable');
  expect(result.current.failure).toBe('none');
  await act(async () => { await post('register', registration); });
  expect(result.current.screen).toBe('s21');
});

it('handles GitHub failures, preserves multi-role identity and prevents duplicate provider requests', async () => {
  const { result } = renderHook(() => useAuthController(false));
  await go('s23');
  act(() => result.current.setGithubOutcome('state'));
  await act(async () => { await result.current.github(); });
  expect(result.current.screen).toBe('s12');
  expect(result.current.notice).toBe('github-state');
  act(() => { result.current.setGithubAccount('taylor'); result.current.setGithubOutcome('success'); });
  await act(async () => { await Promise.all([result.current.github(), result.current.github()]); });
  expect(result.current.user?.roles).toEqual(['mentee', 'mentor']);
  expect(result.current.screen).toBe('s11');
  expect(visited.filter((id) => id === 's11')).toHaveLength(1);
  expect(result.current.busy).toBe(false);
  await go('s12');
  await waitFor(() => expect(result.current.screen).toBe('s11'));
});

it('expires a private session and returns to that exact screen after reauthentication', async () => {
  authDemo.login(login);
  const { result } = renderHook(() => useAuthController(false));
  await go('s7');
  act(() => result.current.expire());
  expect(result.current.user).toBeNull();
  expect(result.current.screen).toBe('s12');
  expect(result.current.notice).toBe('session-expired');
  expect(result.current.returnTo).toBe('s7');
  await act(async () => { await post('login', login); });
  expect(result.current.screen).toBe('s7');
  expect(result.current.notice).toBeNull();
});

it('refuses another role, rechecks operator removal on navigation and restores additive access', async () => {
  authDemo.github('sam', 'success');
  const { result } = renderHook(() => useAuthController(false));
  await go('s24');
  authDemo.setOperatorEligible(false);
  await go('s25');
  await waitFor(() => expect(result.current.screen).toBe('s11'));
  expect(result.current.notice).toBe('forbidden');
  expect(result.current.user?.roles).toEqual(['mentor']);
  act(() => result.current.operatorEligible(true));
  expect(result.current.user?.roles).toEqual(['mentor', 'operator']);
  await go('s24');
  expect(result.current.screen).toBe('s24');
  act(() => result.current.operatorEligible(false));
  expect(result.current.screen).toBe('s11');
  expect(result.current.notice).toBe('operator-revoked');
  act(() => result.current.operatorEligible(true));
  expect(result.current.notice).toBeNull();
  expect(result.current.user?.roles).toEqual(['mentor', 'operator']);
  await go('s4');
  await waitFor(() => expect(result.current.screen).toBe('s24'));
  expect(result.current.notice).toBe('forbidden');
  act(() => result.current.operatorEligible(true));
  expect(result.current.notice).toBe('forbidden');
  expect(result.current.returnTo).toBeNull();
});

it('keeps new accounts away from fixture session details until they confirm their own booking', async () => {
  authDemo.github('new-github', 'success');
  const { result, rerender } = renderHook(({ confirmed }) => useAuthController(false, confirmed), { initialProps: { confirmed: false } });
  expect(result.current.hasSession).toBe(false);
  for (const id of ['s7', 's8', 's9', 's10', 's15', 's18']) {
    await go(id);
    await waitFor(() => expect(result.current.screen).toBe('s6'));
    expect(result.current.notice).toBeNull();
  }
  rerender({ confirmed: true });
  expect(result.current.hasSession).toBe(true);
  await go('s7');
  expect(result.current.screen).toBe('s7');
});

it.each(['taylor', 'sam'])('does not give %s another account’s fixture session without a matching booking', async account => {
  authDemo.github(account, 'success');
  const { result, rerender } = renderHook(({ confirmed }) => useAuthController(false, confirmed), { initialProps: { confirmed: false } });
  expect(result.current.hasSession).toBe(false);
  await go('s7');
  await waitFor(() => expect(result.current.screen).toBe('s6'));
  rerender({ confirmed: true });
  expect(result.current.hasSession).toBe(true);
  await go('s7');
  expect(result.current.screen).toBe('s7');
});

it.each(['network', 'invalid'])('shows recoverable feedback when the %s response never delivers an auth event', async (mode) => {
  server.use(http.post(`${AUTH_ENDPOINT}/github`, () => mode === 'network' ? HttpResponse.error() : new HttpResponse('unreadable', { status: 503 })));
  const { result } = renderHook(() => useAuthController(false));
  await act(async () => { await result.current.github(); });
  expect(result.current.notice).toBe('service-unavailable');
  expect(result.current.busy).toBe(false);
  expect(result.current.user).toBeNull();
});
