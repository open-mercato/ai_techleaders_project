// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResource } from '@devmentor/ui/backend';
import type { MentorProfileResource } from './mentor-profile-client';

const harness = vi.hoisted(() => ({
  useApiResource: vi.fn(),
  apiCall: vi.fn(),
}));

vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  useApiResource: harness.useApiResource,
  apiCall: harness.apiCall,
}));

const { MentorProfileClient } = await import('./mentor-profile-client');

const reload = vi.fn();
const stackOptions = [
  { label: 'TypeScript', value: 'TypeScript' },
  { label: 'React', value: 'React' },
  { label: 'Python', value: 'Python' },
  { label: 'AI agents', value: 'AI agents' },
];
const draft: MentorProfileResource = {
  id: 'profile-1',
  displayName: 'Ada Lovelace',
  publicWorkUrl: null,
  bio: null,
  stackTags: [],
  slug: null,
  publishedAt: null,
  readiness: {
    ready: false,
    items: [
      { key: 'publicWorkUrl', label: 'Add a link to your public work.', met: false },
      { key: 'bio', label: 'Write a description of the work you have done.', met: false },
      { key: 'stackTags', label: 'Choose at least one technology.', met: false },
    ],
  },
};
const published: MentorProfileResource = {
  ...draft,
  publicWorkUrl: 'https://example.com/ada',
  bio: 'I help developers reason about systems.',
  stackTags: ['TypeScript', 'AI agents'],
  slug: 'ada-lovelace',
  publishedAt: '2026-09-10T15:00:00.000Z',
  prices: { price25Cents: 9_000, price50Cents: 18_000, currency: 'PLN' },
  readiness: {
    ready: true,
    items: draft.readiness.items.map((item) => ({ ...item, met: true })),
  },
};

function resource(data: MentorProfileResource | undefined, overrides: Partial<ApiResource<MentorProfileResource>> = {}): ApiResource<MentorProfileResource> {
  return { data, loading: false, error: undefined, reload, ...overrides };
}

function renderClient() {
  return render(<MentorProfileClient appUrl="https://devmentor.example/base" stackOptions={stackOptions} />);
}

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  harness.useApiResource.mockReturnValue(resource(draft));
  harness.apiCall.mockResolvedValue({ ok: true, data: published });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders loading through ResourcePanel and offers only the server-supplied stack vocabulary', () => {
  harness.useApiResource.mockReturnValue(resource(undefined, { loading: true }));
  const { rerender } = renderClient();
  expect(screen.getByRole('status').textContent).toContain('Loading your mentor page…');

  harness.useApiResource.mockReturnValue(resource(draft));
  rerender(<MentorProfileClient appUrl="https://devmentor.example/base" stackOptions={stackOptions} />);
  const group = screen.getByRole('group', { name: 'Technologies' });
  expect(within(group).getAllByRole('checkbox').map((choice) => choice.getAttribute('value'))).toEqual([
    'TypeScript', 'React', 'Python', 'AI agents',
  ]);
  expect(screen.queryByText('Your share link')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Page preview' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Publish page' })).toBeTruthy();
});

it('publishes, reports its pending state and reloads the owner resource', async () => {
  let finish!: (result: { ok: true; data: MentorProfileResource }) => void;
  harness.apiCall.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  renderClient();
  fireEvent.click(screen.getByRole('button', { name: 'Publish page' }));

  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Publishing…' }).disabled).toBe(true);
  expect(harness.apiCall).toHaveBeenCalledWith('/api/mentors/me/publish', { method: 'POST' });
  await act(async () => finish({ ok: true, data: published }));
  expect(reload).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Publish page' })).toBeTruthy();
});

it('puts refused publication errors beside the fields that fix them', async () => {
  harness.apiCall.mockResolvedValue({
    ok: false,
    error: {
      code: 'validation_failed',
      message: 'Complete the missing profile details before publishing.',
      fieldErrors: { publicWorkUrl: ['Add a link to your public work.'] },
    },
  });
  renderClient();
  fireEvent.click(screen.getByRole('button', { name: 'Publish page' }));

  const input = screen.getByLabelText('Public work link');
  await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
  const descriptions = input.getAttribute('aria-describedby')!.split(' ')
    .map((id) => document.getElementById(id)?.textContent).join(' ');
  expect(descriptions).toContain('Add a link to your public work.');
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(screen.queryByText('Complete the missing profile details before publishing.')).toBeNull();
});

it('surfaces general and unexpected publication failures', async () => {
  harness.apiCall.mockResolvedValueOnce({
    ok: false,
    error: { code: 'unavailable', message: 'Publishing is unavailable.' },
  });
  renderClient();
  fireEvent.click(screen.getByRole('button', { name: 'Publish page' }));
  expect(await screen.findByText('Publishing is unavailable.')).toBeTruthy();

  harness.apiCall.mockRejectedValueOnce(new Error('unexpected'));
  fireEvent.click(screen.getByRole('button', { name: 'Publish page' }));
  expect(await screen.findByText('We could not update publication. Try again.')).toBeTruthy();
});

it('disables publication while the profile form saves and clears transition field errors', async () => {
  harness.apiCall.mockResolvedValueOnce({
    ok: false,
    error: { code: 'validation_failed', message: 'Missing', fieldErrors: { bio: ['Add bio.'] } },
  });
  const loadedDraft = { ...published, slug: null, publishedAt: null };
  harness.useApiResource.mockReturnValue(resource(loadedDraft));
  renderClient();
  fireEvent.click(screen.getByRole('button', { name: 'Publish page' }));
  await screen.findByText('Add bio.');

  let finishSave!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { finishSave = resolve; })));
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Publish page' }).disabled).toBe(true));
  expect(screen.queryByText('Add bio.')).toBeNull();

  await act(async () => finishSave(new Response(JSON.stringify({ ok: true, data: loadedDraft }))));
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Publish page' }).disabled).toBe(false));
});

it('shows a stable share link, copies it and unpublishes without deleting it', async () => {
  harness.useApiResource.mockReturnValue(resource(published));
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  let finish!: (result: { ok: true; data: MentorProfileResource }) => void;
  harness.apiCall.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  renderClient();

  const link = screen.getByRole('link', { name: 'https://devmentor.example/m/ada-lovelace' });
  expect(link.getAttribute('href')).toBe('https://devmentor.example/m/ada-lovelace');
  expect(screen.getByText('The link will not change if you rename yourself.')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Page preview' })).toBeTruthy();
  expect(screen.getByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeTruthy();
  expect(screen.getByText('25 minutes: PLN 90.00')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'View public work' }).getAttribute('href')).toBe(
    'https://example.com/ada',
  );
  expect(screen.queryByText('This page is hidden until you publish it again.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  expect((await screen.findByRole('status')).textContent).toContain('Link copied.');
  expect(writeText).toHaveBeenCalledWith('https://devmentor.example/m/ada-lovelace');

  fireEvent.click(screen.getByRole('button', { name: 'Unpublish page' }));
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Unpublishing…' }).disabled).toBe(true);
  expect(harness.apiCall).toHaveBeenCalledWith('/api/mentors/me/unpublish', { method: 'POST' });
  await act(async () => finish({ ok: true, data: { ...published, publishedAt: null } }));
  expect(reload).toHaveBeenCalledOnce();
});

it('keeps an unpublished page link visible and gives manual recovery when copying fails', async () => {
  harness.useApiResource.mockReturnValue(resource({ ...published, publishedAt: null }));
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
  });
  renderClient();
  expect(screen.getByText('This page is hidden until you publish it again.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Copy failed. Select the link and copy it manually.');
});
