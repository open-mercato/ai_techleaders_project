// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MentorPageView } from './MentorPageView';

afterEach(cleanup);

const profile = {
  displayName: 'Ada Lovelace',
  publicWorkUrl: 'https://example.com/ada',
  bio: 'I help developers reason about systems and communicate technical decisions.',
  stackTags: ['TypeScript', 'AI agents'],
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
  expect(document.body.textContent).not.toMatch(/rating|score|review|ranking/i);
  expect(document.querySelector('footer')).toBeNull();
});

it('renders supplied preview actions in a distinct footer', () => {
  const { container } = render(<MentorPageView profile={profile} actions={<a href="/mentor/profile">Back to editing</a>} />);
  expect(container.querySelector('footer')?.contains(screen.getByRole('link', { name: 'Back to editing' }))).toBe(true);
});
