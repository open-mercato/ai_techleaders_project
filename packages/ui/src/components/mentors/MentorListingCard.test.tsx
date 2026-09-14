// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MentorListingCard } from './MentorListingCard';

afterEach(cleanup);

const listing = {
  name: 'Alex Laurent',
  headline: 'Staff engineer: developer tooling',
  initials: 'AL',
  stacks: ['TypeScript', 'React'],
  price25: 'PLN 240',
  price50: 'PLN 420',
  nextAvailableAt: '2026-09-20T09:00:00.000Z',
  profileHref: '/m/alex-laurent',
};

it('compares a mentor by stack, both prices and the next available time', () => {
  const { container } = render(<MentorListingCard {...listing} />);

  expect(screen.getByRole('heading', { name: 'Alex Laurent' })).toBeTruthy();
  expect(screen.getByText('Staff engineer: developer tooling')).toBeTruthy();
  expect(screen.getByRole('list', { name: 'Technology stacks' }).children).toHaveLength(2);

  const prices = screen.getByRole('group', { name: 'Session prices' });
  expect(prices.children).toHaveLength(2);
  expect(prices.textContent).toContain('25 min: PLN 240');
  expect(prices.textContent).toContain('50 min: PLN 420');

  expect(screen.getByRole('time').getAttribute('datetime')).toBe(listing.nextAvailableAt);
  expect(screen.getByRole('link', { name: 'View Alex Laurent' }).getAttribute('href'))
    .toBe('/m/alex-laurent');

  // R13/N02: the card ranks nothing and rates nothing, and the two prices stay separate
  // chips rather than a dot-separated line.
  expect(container.textContent).not.toMatch(/[·•]/);
  expect(screen.queryByRole('img', { name: /star/i })).toBeNull();
});

it('says so plainly when a mentor has published no upcoming time', () => {
  render(<MentorListingCard {...listing} nextAvailableAt={null} />);

  expect(screen.getByText('No upcoming times')).toBeTruthy();
  expect(screen.queryByRole('time')).toBeNull();
});
