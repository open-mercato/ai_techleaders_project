import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { SignOutAction } from '@devmentor/ui';
import { AppShell } from '@devmentor/ui/backend';
import type { Session } from '@devmentor/core';
import { elements, text } from '../test/element-tree';

/**
 * The shared signed-in chrome, invoked directly (AGENTS.md, "Testing React components and
 * pages"): it is an async Server Component, so the test calls it and asserts on the element
 * tree it returned.
 *
 * `AppShell` is not rendered here — it is a `'use client'` component with its own jsdom
 * test in `ui`. What matters at this level is what this file *decided*: which links, in
 * which order, which name, and which action. Those are props, so they are asserted as
 * props.
 */

const workspaceUser = vi.hoisted(() => ({ displayNameFor: vi.fn() }));
vi.mock('../lib/workspace-user', () => ({ displayNameFor: workspaceUser.displayNameFor }));

const { WorkspaceShell } = await import('./workspace-shell');

function sessionWith(...roles: Session['roles']): Session {
  return { userId: 'u-1', roles };
}

/** The `AppShell` element the shell returned, with its props still readable. */
async function shellFor(session: Session): Promise<ReactElement> {
  const tree = await WorkspaceShell({ session, children: 'page' });
  const shell = elements(tree).find((element) => element.type === AppShell);
  if (shell === undefined) {
    throw new Error('WorkspaceShell did not render an AppShell');
  }
  return shell;
}

/** `[href, label]` for every link in the shell's `nav` slot, in order. */
async function navOf(session: Session): Promise<[string, string][]> {
  const { nav } = (await shellFor(session)).props as { nav: ReactNode };
  return elements(nav)
    .filter((element) => element.type === Link)
    .map((element) => [(element.props as { href: string }).href, text(element)]);
}

beforeEach(() => {
  vi.clearAllMocks();
  workspaceUser.displayNameFor.mockResolvedValue('Mock Operator');
});

describe('WorkspaceShell', () => {
  it('names the signed-in user from the session it was handed', async () => {
    const shell = await shellFor(sessionWith('mentee'));

    expect(workspaceUser.displayNameFor).toHaveBeenCalledWith('u-1');
    expect((shell.props as { user: { displayName: string } }).user).toEqual({
      displayName: 'Mock Operator',
    });
  });

  it('renders the page inside the shell', async () => {
    expect(text(await shellFor(sessionWith('mentee')))).toContain('page');
  });

  it('offers sign out as the shell action', async () => {
    const { actions } = (await shellFor(sessionWith('mentee'))).props as { actions: ReactNode };

    expect(elements(actions).some((element) => element.type === SignOutAction)).toBe(true);
  });

  it('navigates a single-role mentee to their sessions', async () => {
    expect(await navOf(sessionWith('mentee'))).toEqual([['/home', 'My sessions']]);
  });

  it('navigates a single-role mentor to their workspace tools', async () => {
    expect(await navOf(sessionWith('mentor'))).toEqual([
      ['/mentor', 'Mentor workspace'],
      ['/mentor/profile', 'Mentor profile'],
      ['/mentor/prices', 'Session prices'],
      ['/mentor/slots', 'Available times'],
    ]);
  });

  it('keeps an accessible Users link for an operator', async () => {
    // `admin.integration.test.ts` asserts `link "Users"`; this is that link before the
    // browser sees it.
    expect(await navOf(sessionWith('operator'))).toEqual([
      ['/admin', 'Dashboard'],
      ['/admin/users', 'Users'],
    ]);
  });

  it('gives a combined-role operator both surfaces', async () => {
    expect(await navOf(sessionWith('operator', 'mentor'))).toEqual([
      ['/admin', 'Dashboard'],
      ['/admin/users', 'Users'],
      ['/mentor', 'Mentor workspace'],
      ['/mentor/profile', 'Mentor profile'],
      ['/mentor/prices', 'Session prices'],
      ['/mentor/slots', 'Available times'],
    ]);
  });

  it('gives every link a stable key so the list is not re-created on navigation', async () => {
    const { nav } = (await shellFor(sessionWith('operator', 'mentor'))).props as { nav: ReactNode };

    expect(elements(nav).map((element) => element.key)).toEqual([
      '/admin',
      '/admin/users',
      '/mentor',
      '/mentor/profile',
      '/mentor/prices',
      '/mentor/slots',
    ]);
  });
});
