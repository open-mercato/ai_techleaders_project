import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@devmentor/core';
import { elements, text } from '../../../test/element-tree';
import { AcceptInvitationAction, InvitationSignOutAction } from './invitation-actions';

const harness = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  withCookieScope: vi.fn(),
  lookup: vi.fn(),
  viewer: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: harness.cookieGet }),
}));
vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  withCookieScope: harness.withCookieScope,
}));

const { default: InvitationPage } = await import('./page');

function render(token = 'raw token') {
  return InvitationPage({ params: Promise.resolve({ token }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.cookieGet.mockReturnValue({ value: 'session-cookie' });
  harness.lookup.mockResolvedValue({
    email: 'ada@example.com',
    stackTags: ['TypeScript', 'AI agents'],
    expiresAt: '2026-09-24T12:00:00.000Z',
  });
  harness.viewer.mockResolvedValue(null);
  harness.withCookieScope.mockImplementation(
    (_cookie: string | null, run: (cradle: unknown) => unknown) =>
      run({ invitationService: { lookup: harness.lookup, viewer: harness.viewer } }),
  );
});

describe('/invitation/[token] page', () => {
  it('opens one cookie scope and shows GitHub first for a signed-out visitor', async () => {
    const tree = await render();
    const copy = text(tree);
    expect(harness.withCookieScope).toHaveBeenCalledWith('session-cookie', expect.any(Function));
    expect(copy).toContain('ada@example.com');
    expect(copy).toContain('TypeScript');
    expect(copy.indexOf('Sign in with GitHub')).toBeLessThan(
      copy.indexOf('Email sign-in is not available yet'),
    );
    const link = elements(tree).find((element) => element.type === 'a');
    expect((link?.props as { href: string }).href).toBe(
      '/api/auth/github?returnTo=%2Finvitation%2Fraw%2520token',
    );
  });

  it('uses a null cookie when the browser has no session cookie', async () => {
    harness.cookieGet.mockReturnValue(undefined);
    await render();
    expect(harness.withCookieScope).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it('offers acceptance only to the matching verified account', async () => {
    harness.viewer.mockResolvedValue({
      email: ' ADA@example.COM ',
      displayName: 'Ada Lovelace',
      emailVerified: true,
    });
    const tree = await render('secret');
    expect(text(tree).replace(/\s+/g, ' ')).toContain('Accept as Ada Lovelace');
    const action = elements(tree).find((element) => element.type === AcceptInvitationAction);
    expect((action?.props as { token: string }).token).toBe('secret');
    expect(elements(tree).some((element) => element.type === InvitationSignOutAction)).toBe(false);
  });

  it.each([
    { email: 'other@example.com', emailVerified: true },
    { email: 'ada@example.com', emailVerified: false },
  ])('explains a non-matching or unverified signed-in account and hides Accept', async (viewer) => {
    harness.viewer.mockResolvedValue({ ...viewer, displayName: 'Other account' });
    const tree = await render('secret');
    const copy = text(tree);
    expect(copy).toContain('ada@example.com');
    expect(copy).toContain(viewer.email);
    expect(elements(tree).some((element) => element.type === AcceptInvitationAction)).toBe(false);
    const signOut = elements(tree).find((element) => element.type === InvitationSignOutAction);
    expect((signOut?.props as { returnTo: string }).returnTo).toBe('/invitation/secret');
  });

  it('renders only the non-enumerating sentence for every invalid link', async () => {
    harness.lookup.mockRejectedValue(new NotFoundError('This invitation is not valid.'));
    const tree = await render();
    expect(text(tree)).toBe('This invitation is not valid.');
    expect(elements(tree).some((element) => element.type === AcceptInvitationAction)).toBe(false);
  });

  it('does not disguise an unexpected service failure as an invalid link', async () => {
    const failure = new Error('database offline');
    harness.lookup.mockRejectedValue(failure);
    await expect(render()).rejects.toBe(failure);
  });
});
