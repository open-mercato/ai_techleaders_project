// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MentorOnboarding } from './MentorOnboarding';

afterEach(cleanup);

it('shows completed and remaining steps, a labelled progress bar, deadline and supplied actions', () => {
  const onEdit = vi.fn();
  render(<MentorOnboarding dueDateLabel="23 September 2026" steps={[
    { id: 'invitation', title: 'Accept your invitation', description: 'Your mentor access is active.', complete: true },
    { id: 'profile', title: 'Write your profile', description: 'Describe the problems you can help solve.', complete: false, action: <button onClick={onEdit}>Edit profile</button> },
  ]} />);
  expect(screen.getByRole('region', { name: 'Set up your mentor profile' })).toBeTruthy();
  expect(screen.getByText('Complete your profile, set your prices and add time for sessions.')).toBeTruthy();
  expect(screen.getByText('Publish by 23 September 2026')).toBeTruthy();
  expect(screen.getByText('1 of 2 steps complete')).toBeTruthy();
  const progress = screen.getByRole<HTMLProgressElement>('progressbar', { name: 'Mentor setup progress' });
  expect(progress.value).toBe(1);
  expect(progress.max).toBe(2);
  const done = screen.getAllByRole('listitem')[0]!;
  const pending = screen.getAllByRole('listitem')[1]!;
  expect(within(done).getByText('Complete')).toBeTruthy();
  expect(done.getAttribute('data-complete')).toBe('true');
  expect(within(pending).queryByText('Complete')).toBeNull();
  expect(pending.getAttribute('data-complete')).toBe('false');
  expect(within(pending).getByText('2').getAttribute('aria-hidden')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
  expect(onEdit).toHaveBeenCalledOnce();
});

it('accepts a completion heading and description without displaying an absent deadline', () => {
  render(<MentorOnboarding title="Your profile is ready" description="Your profile and session times are public." steps={[
    { id: 'published', title: 'Publish your profile', description: 'People can now open your profile link.', complete: true, action: <a href="/mentors/alex">View public profile</a> },
  ]} />);
  expect(screen.getByRole('region', { name: 'Your profile is ready' })).toBeTruthy();
  expect(screen.getByText('Your profile and session times are public.')).toBeTruthy();
  expect(screen.queryByText(/Publish by/)).toBeNull();
  expect(screen.getByRole<HTMLProgressElement>('progressbar').value).toBe(1);
  expect(screen.getByRole('link', { name: 'View public profile' }).getAttribute('href')).toBe('/mentors/alex');
});

it('renders an explicit empty state without a misleading progress bar', () => {
  render(<MentorOnboarding steps={[]} />);
  expect(screen.getByText('No setup tasks.')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByRole('list')).toBeNull();
});
