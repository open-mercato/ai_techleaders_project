// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MentorPageView } from './MentorPageView';

afterEach(cleanup);

const profile = {
  displayName: 'Ada Lovelace',
  publicWorkUrl: 'https://example.com/ada',
  bio: 'I help developers reason about systems and communicate technical decisions.',
  stackTags: ['TypeScript', 'AI agents'],
  prices: { price25Cents: 9_001, price50Cents: 18_090, currency: 'PLN' },
  slots: [
    { id: 'boundary', startsAt: '2026-09-10T18:00:00.000Z', meetsLeadTime: true },
    { id: 'late', startsAt: '2026-09-10T18:30:00.000Z', meetsLeadTime: false },
  ],
};

it('renders the public mentor projection and safe public-work link without reputation markup', () => {
  render(<MentorPageView profile={profile} />);
  expect(screen.getByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeTruthy();
  expect(screen.getByText(profile.bio)).toBeTruthy();
  const link = screen.getByRole('link', { name: 'View public work' });
  expect(link.getAttribute('href')).toBe(profile.publicWorkUrl);
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noreferrer');
  expect(screen.getByRole('list', { name: 'Technology stacks' }).textContent).toContain('TypeScript');
  expect(screen.getByRole('heading', { name: 'Available times' })).toBeTruthy();
  expect(within(screen.getByRole('list', { name: 'Session prices' })).getAllByRole('listitem')
    .map((item) => item.textContent)).toEqual(['25 minutes: PLN 90.01', '50 minutes: PLN 180.90']);
  expect(screen.getAllByRole('time')).toHaveLength(2);
  expect(screen.getByText('Available')).toBeTruthy();
  expect(screen.getByText(/less than two hours/)).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/rating|score|review|ranking/i);
  expect(document.querySelector('footer')).toBeNull();
});

it('shows a specific empty state when no future slots are published', () => {
  render(<MentorPageView profile={{ ...profile, slots: [] }} />);
  expect(screen.getByText('No future times are published. Check this page again later.')).toBeTruthy();
});

it('prints the current missing-description value on a legacy public profile', () => {
  render(<MentorPageView profile={{ ...profile, bio: undefined as unknown as string }} />);
  expect(screen.getByText('undefined')).toBeTruthy();
});

it.each([null, undefined])('shows an unpriced state without hiding availability for prices %j', (prices) => {
  render(<MentorPageView profile={{ ...profile, prices }} />);
  expect(screen.getByText('Not bookable yet')).toBeTruthy();
  expect(screen.getAllByRole('time')).toHaveLength(2);
  expect(screen.queryByRole('link', { name: /book|checkout/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /book|checkout/i })).toBeNull();
});

it('renders supplied preview actions in a distinct footer', () => {
  const { container } = render(<MentorPageView profile={profile} actions={<a href="/mentor/profile">Back to editing</a>} />);
  expect(container.querySelector('footer')?.contains(screen.getByRole('link', { name: 'Back to editing' }))).toBe(true);
});
