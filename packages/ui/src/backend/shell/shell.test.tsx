// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AppShell } from './AppShell';
import { AuthLayout } from './AuthLayout';
afterEach(cleanup);
it('renders supplied navigation/actions and a unique skip target without inferring roles', () => {
  render(<><AppShell className="custom" nav={<a href="/admin/users">Users</a>} user={{displayName:'Alex'}} actions={<button>Sign out</button>}><h1>Workspace</h1></AppShell><AppShell nav={<a href="/sessions">Sessions</a>} user={{displayName:'Sam'}}>Second workspace</AppShell></>);
  expect(screen.getByRole('link', { name:'Users' }).getAttribute('href')).toBe('/admin/users');
  expect(screen.getByRole('button', { name:'Sign out' })).toBeTruthy();
  expect(screen.getByText('Alex')).toBeTruthy();
  const mains=screen.getAllByRole('main');
  const links=screen.getAllByRole('link', {name:'Skip to content'});
  expect(mains[0]!.id).not.toBe(mains[1]!.id);
  expect(links[0]!.getAttribute('href')).toBe(`#${mains[0]!.id}`);
  expect(mains[0]!.tabIndex).toBe(-1);
});
it('gives authentication a heading, descriptive copy and form/footer slots', () => {
  const { rerender }=render(<AuthLayout title="Welcome back" description="Continue your mentorship." footer={<a href="/help">Get help</a>}><button>Continue with GitHub</button></AuthLayout>);
  expect(screen.getByRole('heading', {level:1,name:'Welcome back'})).toBeTruthy();
  expect(screen.getByRole('link', {name:'Get help'})).toBeTruthy();
  rerender(<AuthLayout title="Check your inbox" description="Open your verification email."><p>Verification sent</p></AuthLayout>);
  expect(screen.getByText('Verification sent')).toBeTruthy();
});
