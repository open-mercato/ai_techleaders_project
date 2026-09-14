// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const { MentorsDirectory, tagHref } = await import('./mentors-directory');

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const mentor = {
  slug: 'ada',
  displayName: 'Ada Lovelace',
  bio: 'I built compilers.',
  stackTags: ['TypeScript'] as const,
  prices: { price25Cents: 12_000, price50Cents: 22_000, currency: 'PLN' },
  nextAvailableAt: '2026-09-20T09:00:00.000Z',
};

const tags = ['TypeScript', 'React', 'Python', 'AI agents'];

describe('tagHref', () => {
  it('drops the parameter for the unfiltered list and escapes a tag with a space', () => {
    expect(tagHref(null)).toBe('/mentors');
    expect(tagHref('AI agents')).toBe('/mentors?tag=AI%20agents');
  });
});

describe('public mentor directory', () => {
  it('renders one card per mentor with both prices and a link to the mentor page', () => {
    render(<MentorsDirectory mentors={[mentor]} tags={tags} activeTag={null} />);

    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeTruthy();
    expect(screen.getByText('I built compilers.')).toBeTruthy();
    const prices = screen.getByRole('group', { name: 'Session prices' });
    expect(prices.textContent).toContain('25 min: PLN 120.00');
    expect(prices.textContent).toContain('50 min: PLN 220.00');
    expect(screen.getByRole('link', { name: 'View Ada Lovelace' }).getAttribute('href'))
      .toBe('/m/ada');
    expect(screen.getByRole('status').textContent).toBe('1 mentor available');
  });

  it('builds decorative initials from the first two words of a display name', () => {
    render(<MentorsDirectory
      mentors={[{ ...mentor, displayName: '  Grace  Brewster Murray Hopper ' }]}
      tags={tags}
      activeTag={null}
    />);

    expect(screen.getByText('GB').getAttribute('aria-hidden')).toBe('true');
  });

  it('turns a filter choice into a navigation so the list can be shared and reloaded', () => {
    render(<MentorsDirectory mentors={[mentor]} tags={tags} activeTag="React" />);

    fireEvent.click(screen.getByRole('button', { name: 'Python' }));
    expect(router.push).toHaveBeenLastCalledWith('/mentors?tag=Python');

    fireEvent.click(screen.getByRole('button', { name: 'All stacks' }));
    expect(router.push).toHaveBeenLastCalledWith('/mentors');
  });

  it('offers a way back when a tag filter emptied the list', () => {
    render(<MentorsDirectory mentors={[]} tags={tags} activeTag="Python" />);

    expect(screen.getByText('No mentors with Python are bookable right now')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(router.push).toHaveBeenLastCalledWith('/mentors');
  });

  it('explains an empty unfiltered list without offering a filter to clear', () => {
    render(<MentorsDirectory mentors={[]} tags={tags} activeTag={null} />);

    expect(screen.getByText('No mentors are bookable yet')).toBeTruthy();
    expect(screen.getByText(/publish their page, their prices and a time/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear filter' })).toBeNull();
  });
});
