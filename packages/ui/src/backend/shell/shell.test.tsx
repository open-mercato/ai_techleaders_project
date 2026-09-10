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
it('frames the workspace with brand chrome, a named nav landmark, a user block and topbar actions', () => {
  const { rerender }=render(<AppShell className="custom" nav={<a href="/mentor/slots">Slots</a>} user={{displayName:'Sam Rivers'}} actions={<button>Sign out</button>}><p>Slot list</p></AppShell>);
  const brand=screen.getByText('DevMentor');
  expect(brand.classList.contains('dm-app-brand')).toBe(true);
  expect(brand.textContent).toBe('DevMentorWorkspace');
  expect(screen.getByText('Your DevMentor workspace')).toBeTruthy();
  expect(document.querySelector('.dm-app-shell')!.classList.contains('custom')).toBe(true);
  const nav=screen.getByRole('navigation', {name:'Workspace navigation'});
  const slots=screen.getByRole('link', {name:'Slots'});
  expect(nav.contains(slots)).toBe(true);
  expect(slots.closest('main')).toBeNull();
  // The shell owns no routing: the only links in the tree are the caller's slot and the skip link.
  expect(screen.getAllByRole('link').length).toBe(2);
  expect(screen.getByText('Signed in as').parentElement!.textContent).toBe('Signed in asSam Rivers');
  expect(screen.getByRole('button', {name:'Sign out'}).closest('header')).not.toBeNull();
  expect(screen.getByRole('main').textContent).toBe('Slot list');
  rerender(<AppShell nav={<><a href="/admin/users">Users</a><span>Operator tools</span></>} user={{displayName:'Alex Chen'}}><p>Admin home</p></AppShell>);
  expect(screen.getByRole('navigation', {name:'Workspace navigation'}).textContent).toBe('UsersOperator tools');
  expect(screen.getByText('Signed in as').parentElement!.textContent).toBe('Signed in asAlex Chen');
  expect(screen.queryByRole('button')).toBeNull();
  expect(document.querySelector('.dm-app-shell')!.classList.contains('custom')).toBe(false);
});
it('gives authentication a heading, descriptive copy and form/footer slots', () => {
  const { rerender }=render(<AuthLayout title="Welcome back" description="Continue your mentorship." footer={<a href="/help">Get help</a>}><button>Continue with GitHub</button></AuthLayout>);
  expect(screen.getByRole('heading', {level:1,name:'Welcome back'})).toBeTruthy();
  expect(screen.getByRole('link', {name:'Get help'})).toBeTruthy();
  rerender(<AuthLayout title="Check your inbox" description="Open your verification email."><p>Verification sent</p></AuthLayout>);
  expect(screen.getByText('Verification sent')).toBeTruthy();
});
