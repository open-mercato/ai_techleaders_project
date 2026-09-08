// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MentorRatingSummary, MentorReviewForm, MentorReviews } from './MentorReviews';

afterEach(cleanup);

it('distinguishes an unrated mentor from real averages and pluralizes the count', () => {
  const { rerender } = render(<MentorRatingSummary average={0} reviewCount={0} />);
  expect(screen.getByText('No reviews yet')).toBeTruthy();
  rerender(<MentorRatingSummary average={5} reviewCount={1} />);
  expect(screen.getByText('5.0')).toBeTruthy();
  expect(screen.getByText('(1 review)')).toBeTruthy();
  rerender(<MentorRatingSummary average={14 / 3} reviewCount={3} />);
  expect(screen.getByText('4.7')).toBeTruthy();
  expect(screen.getByText('(3 reviews)')).toBeTruthy();
});

it('exposes ordered written reviews, their star values and semantic dates without inventing verification', () => {
  const { container, rerender } = render(<MentorReviews reviews={[]} />);
  expect(screen.getByRole('region', { name: 'Mentee reviews' })).toBeTruthy();
  expect(screen.getByText('No reviews yet')).toBeTruthy();
  expect(screen.queryByRole('list')).toBeNull();
  rerender(<MentorReviews title="Fictional demo reviews" reviews={[
    { id: 'new', reviewerName: 'Jordan', rating: 4, createdAt: '2026-09-06', dateLabel: '6 September 2026', text: 'Helpful context.\nClear next steps.' },
    { id: 'old', reviewerName: 'Casey', rating: 5, createdAt: '2026-09-01', dateLabel: '1 September 2026', text: '<script>Private code is not needed.</script>' },
  ]} />);
  expect(screen.getByRole('region', { name: 'Fictional demo reviews' })).toBeTruthy();
  expect(screen.getAllByRole('article')[0]?.getAttribute('aria-label')).toBe('Review by Jordan');
  expect(screen.getByRole('img', { name: '4 out of 5 stars' }).querySelectorAll('[data-filled="true"]')).toHaveLength(4);
  expect(screen.getByRole('img', { name: '5 out of 5 stars' })).toBeTruthy();
  expect(screen.getByText('6 September 2026').getAttribute('datetime')).toBe('2026-09-06');
  expect(container.querySelector('script')).toBeNull();
  expect(container.textContent).not.toMatch(/[·•]/);
});

it('links validation to the rating and written review, focuses the first invalid control and rejects whitespace', () => {
  const onSubmit = vi.fn();
  render(<MentorReviewForm mentorName="Alex" onSubmit={onSubmit} />);
  const form = screen.getByRole('form', { name: 'Review your session with Alex' });
  const textarea = screen.getByRole('textbox', { name: 'Your review' });
  fireEvent.submit(form);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: '1 star' }));
  const ratingError = screen.getByText('Choose a rating from 1 to 5 stars.');
  expect(screen.getByRole('group', { name: 'Your rating' }).getAttribute('aria-describedby')).toContain(ratingError.id);
  expect(textarea.getAttribute('aria-describedby')).toContain(screen.getByText('Write a few words about your session.').id);
  expect(textarea.getAttribute('aria-invalid')).toBe('true');
  fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
  fireEvent.change(textarea, { target: { value: '   ' } });
  fireEvent.submit(form);
  expect(screen.queryByText('Choose a rating from 1 to 5 stars.')).toBeNull();
  expect(document.activeElement).toBe(textarea);
  expect(onSubmit).not.toHaveBeenCalled();
});

it('requires a rating even with valid text and rejects reviews longer than 2,000 characters', () => {
  const onSubmit = vi.fn();
  render(<MentorReviewForm mentorName="Alex" onSubmit={onSubmit} />);
  const form = screen.getByRole('form');
  const textarea = screen.getByRole('textbox');
  fireEvent.change(textarea, { target: { value: 'A helpful conversation.' } });
  fireEvent.submit(form);
  expect(screen.queryByText('Write a few words about your session.')).toBeNull();
  expect(screen.getByText('Choose a rating from 1 to 5 stars.')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: '5 stars' }));
  fireEvent.change(textarea, { target: { value: 'x'.repeat(2001) } });
  fireEvent.submit(form);
  expect(screen.getByText('Keep your review to 2,000 characters or fewer.')).toBeTruthy();
  expect(onSubmit).not.toHaveBeenCalled();
});

it('submits trimmed values, blocks duplicate in-flight submissions, retains failed input and allows retry', async () => {
  let rejectSave!: (reason: Error) => void;
  const onSubmit = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; })).mockResolvedValue(undefined);
  render(<MentorReviewForm mentorName="Alex" onSubmit={onSubmit} />);
  const form = screen.getByRole('form');
  const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
  for (const value of [1, 2, 3, 4, 5]) fireEvent.click(screen.getByRole('radio', { name: value === 1 ? '1 star' : `${value} stars` }));
  fireEvent.change(textarea, { target: { value: '  Clear reasoning and a useful next step.  ' } });
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ rating: 5, text: 'Clear reasoning and a useful next step.' });
  expect(form.getAttribute('aria-busy')).toBe('true');
  expect((screen.getByRole('button', { name: 'Saving review…' }) as HTMLButtonElement).disabled).toBe(true);
  expect(textarea.disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toBe('Saving your review.');
  await act(async () => { rejectSave(new Error('Offline')); });
  expect(screen.getByRole('alert').textContent).toContain('Your text is still here');
  expect(textarea.value).toBe('  Clear reasoning and a useful next step.  ');
  expect((screen.getByRole('radio', { name: '5 stars' }) as HTMLInputElement).checked).toBe(true);
  expect(form.getAttribute('aria-busy')).toBe('false');
  expect(textarea.disabled).toBe(false);
  await act(async () => { fireEvent.submit(form); });
  expect(onSubmit).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
});

it('keeps radio groups and field descriptions isolated when two forms are rendered', async () => {
  const onSubmit = vi.fn();
  render(<><MentorReviewForm mentorName="Alex" onSubmit={onSubmit} /><MentorReviewForm mentorName="Sam" onSubmit={onSubmit} /></>);
  const first = screen.getByRole('form', { name: 'Review your session with Alex' });
  const second = screen.getByRole('form', { name: 'Review your session with Sam' });
  expect(within(first).getByRole('radio', { name: '1 star' }).getAttribute('name')).not.toBe(within(second).getByRole('radio', { name: '1 star' }).getAttribute('name'));
  expect(within(first).getByRole('textbox').id).not.toBe(within(second).getByRole('textbox').id);
  fireEvent.click(within(second).getByRole('radio', { name: '3 stars' }));
  fireEvent.change(within(second).getByRole('textbox'), { target: { value: 'x'.repeat(2000) } });
  await act(async () => { fireEvent.submit(second); });
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ rating: 3, text: 'x'.repeat(2000) });
});
