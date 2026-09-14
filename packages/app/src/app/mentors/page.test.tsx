import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cradle } from '@devmentor/core';
import { elements } from '../../test/element-tree';
import { MentorsDirectory } from './mentors-directory';

const state = vi.hoisted(() => ({ listPublished: vi.fn() }));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  withScope: async (run: (cradle: Cradle) => unknown) =>
    run({ mentorProfileService: { listPublished: state.listPublished } } as unknown as Cradle),
}));

const { default: MentorsPage } = await import('./page');

const mentor = {
  slug: 'ada',
  displayName: 'Ada Lovelace',
  bio: 'I built compilers.',
  stackTags: ['TypeScript'],
  prices: { price25Cents: 12_000, price50Cents: 22_000, currency: 'PLN' },
  nextAvailableAt: '2026-09-20T09:00:00.000Z',
};

function directoryProps(tree: Awaited<ReturnType<typeof MentorsPage>>) {
  const found = elements(tree).find((element) => element.type === MentorsDirectory);
  return found?.props as Parameters<typeof MentorsDirectory>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  state.listPublished.mockResolvedValue([mentor]);
});

describe('public mentor list page', () => {
  it('lists every bookable mentor when no tag is chosen', async () => {
    const props = directoryProps(await MentorsPage({}));

    expect(state.listPublished).toHaveBeenCalledExactlyOnceWith(null);
    expect(props.mentors).toEqual([mentor]);
    expect(props.activeTag).toBeNull();
    // Every approved tag is offered, not only the ones the current results carry.
    expect(props.tags).toEqual(['TypeScript', 'React', 'Python', 'AI agents']);
  });

  it('narrows to a known tag taken from the URL', async () => {
    const props = directoryProps(
      await MentorsPage({ searchParams: Promise.resolve({ tag: 'React' }) }),
    );

    expect(state.listPublished).toHaveBeenCalledExactlyOnceWith('React');
    expect(props.activeTag).toBe('React');
  });

  it('reads the first value when a tag is repeated in the query string', async () => {
    await MentorsPage({ searchParams: Promise.resolve({ tag: ['Python', 'React'] }) });

    expect(state.listPublished).toHaveBeenCalledExactlyOnceWith('Python');
  });

  it('shows the whole list for a mistyped tag rather than an error page', async () => {
    const props = directoryProps(
      await MentorsPage({ searchParams: Promise.resolve({ tag: 'javascript' }) }),
    );

    expect(state.listPublished).toHaveBeenCalledExactlyOnceWith(null);
    expect(props.activeTag).toBeNull();
  });

  it('is dynamic, because the list changes whenever a mentor publishes a time', async () => {
    const { dynamic } = await import('./page');

    expect(dynamic).toBe('force-dynamic');
  });
});
