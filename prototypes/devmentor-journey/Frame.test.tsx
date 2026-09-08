import { useEffect, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { apiCall } from '@devmentor/ui/backend';
import { AuthContext, useAuthController, type AuthFlow } from './auth-context';
import { authDemo, authHandlers, AUTH_ENDPOINT } from './auth-runtime';
import { DEMO_PASSWORD } from './auth-model';
import { Screen, PublicPage, Workspace } from './Frame';
import { navigate } from './navigation';

const server = setupServer(...authHandlers);
const visited: string[] = [];
const focusedByEngine: string[] = [];
const engine = (event: Event) => {
  const id = (event as CustomEvent<string>).detail;
  visited.push(id);
  history.replaceState(null, '', `#${id}`);
  for (const node of document.querySelectorAll('.screen')) node.classList.remove('is-current');
  const target = document.getElementById(id);
  target?.classList.add('is-current');
  document.dispatchEvent(new CustomEvent('devmentor:screen-change', { detail: id }));
  const heading = target?.querySelector<HTMLElement>('.frame h1, .frame h2');
  if (heading) {
    focusedByEngine.push(heading.textContent ?? '');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
};
function mount(children: ReactNode, confirmed = false) {
  let current: AuthFlow;
  function Harness() {
    const auth = useAuthController(false, confirmed);
    useEffect(() => { current = auth; });
    return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
  }
  const view = render(<Harness/>);
  return { ...view, controller: () => current };
}
const guarded = (id: string) => <Screen id={id} title="Protected sample" description="Review screen" refs={['E01']}><Workspace><p>Private account detail</p></Workspace></Screen>;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  document.addEventListener('devmentor:navigate', engine);
});
beforeEach(() => { authDemo.reset(); history.replaceState(null, '', '#s17'); visited.length = 0; focusedByEngine.length = 0; });
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => { document.removeEventListener('devmentor:navigate', engine); server.close(); });

it('never mounts protected children while anonymous and provides sign-in recovery', () => {
  mount(guarded('s25'));
  expect(screen.queryByText('Private account detail')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Users' })).toBeNull();
  expect(screen.queryByText('Jordan Lee')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(visited).toEqual(['s12']);
});

it('withholds another role’s children and directs the current user to their own home', async () => {
  authDemo.github('jordan', 'success');
  mount(guarded('s11'));
  expect(screen.queryByText('Private account detail')).toBeNull();
  expect(screen.getByRole('heading', { name: 'This page needs another role' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open my workspace' }));
  await waitFor(() => expect(visited).toEqual(['s6']));
});

it('shows the union of mentor/operator links and withdraws operator children immediately on revocation', () => {
  authDemo.github('sam', 'success');
  const view = mount(guarded('s25'));
  expect(screen.getByText('Private account detail')).toBeTruthy();
  for (const name of ['Operator home', 'Users', 'My sessions', 'Private notes', 'Mentor workspace', 'Browse mentors']) expect(screen.getByRole('button', { name })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /become a mentor/i })).toBeNull();
  act(() => view.controller().operatorEligible(false));
  expect(screen.queryByText('Private account detail')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Users' })).toBeNull();
  act(() => view.controller().operatorEligible(true));
  expect(screen.getByText('Private account detail')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Users' })).toBeTruthy();
});

it('keeps mentor navigation after operator removal and renders correct destinations', () => {
  authDemo.github('sam', 'success');
  const view = mount(<Workspace>Workspace content</Workspace>);
  const destinations = { 'Operator home': 's24', Users: 's25', 'My sessions': 's6', 'Private notes': 's9', 'Mentor workspace': 's11', 'Browse mentors': 's19' };
  for (const [name, destination] of Object.entries(destinations)) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(visited.at(-1)).toBe(destination);
  }
  act(() => view.controller().operatorEligible(false));
  expect(screen.queryByRole('button', { name: 'Users' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Mentor workspace' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Private notes' })).toBeTruthy();
});

it('does not expose fixture private notes or session details to a new account', () => {
  authDemo.github('new-github', 'success');
  const workspace = mount(<Workspace>New account workspace</Workspace>);
  expect(screen.queryByRole('button', { name: 'Private notes' })).toBeNull();
  expect(screen.getByRole('button', { name: 'My sessions' })).toBeTruthy();
  workspace.unmount();
  mount(guarded('s9'));
  expect(screen.queryByText('Private account detail')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Choose a session first' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open my sessions' }));
  expect(visited.at(-1)).toBe('s6');
});

it('permits a new account’s session details once a booking has been confirmed', () => {
  authDemo.github('new-github', 'success');
  mount(guarded('s7'), true);
  expect(screen.getByText('Private account detail')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Private notes' })).toBeTruthy();
});

it('removes private children after expiry and signs out through the shared auth runtime', async () => {
  authDemo.github('jordan', 'success');
  const view = mount(guarded('s7'));
  expect(screen.getByText('Private account detail')).toBeTruthy();
  act(() => view.controller().expire());
  expect(screen.queryByText('Private account detail')).toBeNull();
  view.unmount();
  authDemo.github('jordan', 'success');
  mount(<Workspace>Signed-in workspace</Workspace>);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign out' }).disabled).toBe(true);
  await waitFor(() => expect(authDemo.getSession()).toBeNull());
  await waitFor(() => expect(visited.at(-1)).toBe('s17'));
});

it('uses the current identity in public navigation and returns to public signed-out feedback', async () => {
  authDemo.github('sam', 'success');
  mount(<PublicPage back="s19">Public content</PublicPage>);
  const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
  expect(nav.queryByRole('button', { name: 'Sign in' })).toBeNull();
  fireEvent.click(nav.getByRole('button', { name: 'My workspace' }));
  expect(visited.at(-1)).toBe('s24');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(visited.at(-1)).toBe('s19');
  fireEvent.click(nav.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(nav.getByRole('button', { name: 'Sign in' })).toBeTruthy());
  expect(screen.getByRole('status')).toBeTruthy();
  fireEvent.click(nav.getByRole('button', { name: 'My sessions' }));
  await waitFor(() => expect(visited.at(-1)).toBe('s12'));
});

it.each([
  ['public', 'network'], ['public', 'invalid response'],
  ['workspace', 'network'], ['workspace', 'invalid response'],
])('shows a recoverable %s sign-out error after a %s failure', async (layout, failure) => {
  authDemo.github('jordan', 'success');
  server.use(http.post(`${AUTH_ENDPOINT}/logout`, () => failure === 'network'
    ? HttpResponse.error()
    : HttpResponse.json({ unexpected: 'response' })));
  mount(layout === 'public' ? <PublicPage>Public content</PublicPage> : <Workspace>Workspace content</Workspace>);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('alert', { name: 'We could not complete the request' })).toBeTruthy();
  expect(authDemo.getSession()?.id).toBe('jordan');
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sign out' }).disabled).toBe(false);
  server.resetHandlers();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(visited.at(-1)).toBe('s17'));
  expect(authDemo.getSession()).toBeNull();
  expect(screen.queryByRole('alert', { name: 'We could not complete the request' })).toBeNull();
});

it('retains standalone design examples without an auth controller', () => {
  const view = render(guarded('s9'));
  expect(screen.getByText('Private account detail')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Mentor view' })).toBeTruthy();
  view.unmount();
  render(<Workspace mentor>Mentor example</Workspace>);
  expect(screen.getByRole('button', { name: 'Mentee view' })).toBeTruthy();
});

it('focuses the rendered private heading after sign-in replaces the engine’s focused guard', async () => {
  const view = mount(<>
    <Screen id="s12" title="Authentication" description="Sign-in example" refs={[]}><h1>Welcome back</h1><label>Email<input type="text" /></label></Screen>
    <Screen id="s6" title="Workspace" description="Sessions example" refs={[]}><h1>Your sessions</h1></Screen>
    <Screen id="s7" title="Conversation" description="Message example" refs={[]}><h1>Your conversation</h1><label>Message<textarea/></label></Screen>
  </>);
  act(() => navigate('s12'));
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Welcome back' }));
  const email = screen.getByRole('textbox', { name: 'Email' });
  email.focus();
  fireEvent.change(email, { target: { value: 'jordan@example.test' } });
  await act(async () => { await apiCall(`${location.origin}${AUTH_ENDPOINT}/login`, { body: { email: 'jordan@example.test', password: 'wrong' } }); });
  expect(document.activeElement).toBe(email);
  expect(view.controller().formError).toBe('invalid-credentials');

  await act(async () => { await apiCall(`${location.origin}${AUTH_ENDPOINT}/login`, { body: { email: 'jordan@example.test', password: DEMO_PASSWORD } }); });
  expect(focusedByEngine.at(-1)).toBe('Sign in to continue');
  expect(screen.queryByRole('heading', { name: 'Sign in to continue' })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your sessions' }));
  expect(document.activeElement?.closest('.screen')?.id).toBe('s6');

  act(() => navigate('s7'));
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your conversation' }));
  const message = screen.getByRole('textbox', { name: 'Message' });
  message.focus();
  fireEvent.change(message, { target: { value: 'My code example' } });
  act(() => view.controller().setGithubOutcome('cancelled'));
  expect(document.activeElement).toBe(message);
});
