import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthContext, useAuthController } from './auth-context';
import { DEMO_PASSWORD } from './auth-model';
import { authDemo } from './auth-runtime';
import { LandingScreen } from './LandingScreen';
import { navigate } from './navigation';
import { INITIAL_REVIEWS } from './reviews';

vi.mock('./navigation', () => ({ navigate: vi.fn(), scrollToSection: vi.fn() }));

function LandingWithAuth() {
  const auth = useAuthController(false);
  return <AuthContext.Provider value={auth}><LandingScreen reviews={INITIAL_REVIEWS} /></AuthContext.Provider>;
}

beforeEach(() => { authDemo.reset(); vi.mocked(navigate).mockReset(); });
afterEach(cleanup);

it.each([true, false])('routes signed-out visitors to sign-in with context=%s', withContext => {
  render(withContext ? <LandingWithAuth /> : <LandingScreen reviews={INITIAL_REVIEWS} />);
  for (const name of ['Main navigation', 'Footer navigation']) {
    const navigation = within(screen.getByRole('navigation', { name }));
    fireEvent.click(navigation.getByRole('button', { name: 'Sign in' }));
    expect(navigate).toHaveBeenLastCalledWith('s12');
    expect(navigation.queryByRole('button', { name: 'My workspace' })).toBeNull();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Already have an account? Sign in' }));
  expect(navigate).toHaveBeenLastCalledWith('s12');
});

it.each([
  ['jordan@example.test', 's6'],
  ['alex@example.test', 's11'],
  ['taylor@example.test', 's11'],
  ['sam@example.test', 's24'],
])('routes %s to its role home from every homepage account action', (email, target) => {
  expect(authDemo.login({ email, password: DEMO_PASSWORD }).ok).toBe(true);
  render(<LandingWithAuth />);
  for (const name of ['Main navigation', 'Footer navigation']) {
    const navigation = within(screen.getByRole('navigation', { name }));
    fireEvent.click(navigation.getByRole('button', { name: 'My workspace' }));
    expect(navigate).toHaveBeenLastCalledWith(target);
    expect(navigation.queryByRole('button', { name: 'Sign in' })).toBeNull();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Open my workspace' }));
  expect(navigate).toHaveBeenLastCalledWith(target);
  expect(screen.queryByRole('button', { name: 'Already have an account? Sign in' })).toBeNull();
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: 'Find your mentor' }));
  expect(navigate).toHaveBeenLastCalledWith('s19');
});
