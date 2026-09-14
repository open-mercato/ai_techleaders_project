// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MentorIdentity, MentorProfileCard, MentorDirectory } from './MentorProfileCard';

afterEach(cleanup);
const profile = { name: 'Alex Laurent', headline: 'Staff engineer', initials: 'AL', introduction: 'Practical TypeScript guidance.', stacks: ['TypeScript', 'React'], publicWork: [{ label: 'Open source work', href: 'https://example.com/work' }], availability: 'Next session: 9 September', actions: <a href="#book">Choose a time</a> };

it('shows optional review aggregates and technology icons on the profile', () => {
  render(<MentorProfileCard {...profile} status="published" rating={{ average: 14 / 3, reviewCount: 3 }} />);
  expect(screen.getByText('4.7')).toBeTruthy();
  expect(screen.getByText('(3 reviews)')).toBeTruthy();
  const technologyIcon = screen.getByText('TypeScript').previousElementSibling!;
  expect(technologyIcon.getAttribute('data-technology')).toBe('typescript');
  expect(technologyIcon.getAttribute('aria-hidden')).toBe('true');
});

it('renders identity with a fallback or supplied avatar without exposing decoration', () => {
  const { rerender } = render(<MentorIdentity {...profile} />);
  expect(screen.getByRole('heading', { name: 'Alex Laurent' })).toBeTruthy();
  expect(screen.getByText('AL').getAttribute('aria-hidden')).toBe('true');
  rerender(<MentorIdentity {...profile} avatar={<span>Portrait</span>} />);
  expect(screen.queryByText('AL')).toBeNull();
  expect(screen.getByText('Portrait').parentElement?.getAttribute('aria-hidden')).toBe('true');
});

it.each(['draft', 'incomplete', 'published'] as const)('documents %s profiles with links, stacks and text-only availability', status => {
  const { container } = render(<MentorProfileCard {...profile} status={status} />);
  expect(screen.getByText(status).dataset.tone).toBe(status === 'published' ? 'success' : 'neutral');
  expect(screen.getByRole('list', { name: 'Technology stacks' }).children).toHaveLength(2);
  expect(screen.getByRole('link', { name: /Open source work/ }).getAttribute('href')).toBe('https://example.com/work');
  expect(screen.getByText('Text mentoring sessions')).toBeTruthy();
  expect(screen.getByText(profile.availability)).toBeTruthy();
  expect(container.textContent).not.toMatch(/[·•]/);
  expect(screen.getByRole('link', { name: 'Choose a time' })).toBeTruthy();
});

it('filters by a single stack, clears the selection and preserves caller result order', () => {
  const onStackChange = vi.fn();
  const props = { stacks: ['React', 'TypeScript'], resultCount: 2, onStackChange, children: <><p>Second published</p><p>First published</p></>, empty: <p>No matching mentors</p> };
  const { rerender } = render(<MentorDirectory {...props} selectedStack={null} />);
  expect(screen.getByRole('button', { name: 'All stacks' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'React' }));
  expect(onStackChange).toHaveBeenLastCalledWith('React');
  rerender(<MentorDirectory {...props} selectedStack="React" />);
  expect(screen.getByRole('button', { name: 'React' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'All stacks' }).getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'All stacks' }));
  expect(onStackChange).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole('status').textContent).toBe('2 mentors available');
  rerender(<MentorDirectory {...props} selectedStack={null} resultCount={1} />);
  expect(screen.getByRole('status').textContent).toBe('1 mentor available');
  rerender(<MentorDirectory {...props} selectedStack={null} />);
  expect(screen.getByText('Second published').nextElementSibling?.textContent).toBe('First published');
  rerender(<MentorDirectory {...props} selectedStack="TypeScript" resultCount={0} />);
  expect(screen.getByText('No matching mentors')).toBeTruthy();
  expect(screen.queryByText('Second published')).toBeNull();
});
