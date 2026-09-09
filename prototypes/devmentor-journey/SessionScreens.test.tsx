import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiCall } from '../../packages/ui/src/backend/api/apiCall';
import { SessionScreens, type SessionScreensProps } from './SessionScreens';

vi.mock('../../packages/ui/src/backend/api/apiCall', () => ({ apiCall: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.mocked(apiCall).mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('uses the booked mentor and buyer throughout the conversation, reviews and profile callback', async () => {
  const onViewMentor = vi.fn();
  const props: SessionScreensProps = { hasBooking: true, mentorName: 'Taylor Morgan', menteeName: 'Robin Chen', duration: 50, startsAt: '2026-09-12T12:00:00Z', dateLabel: '12 September', timeLabel: '14:00', timeZone: 'Europe/Warsaw', slots: [], sessionPrice: 380, prices: { 25: 200, 50: 380 }, submittedReview: null, onReviewSubmit: vi.fn(), onPricesChange: vi.fn(), onSlotAdded: vi.fn(), onViewMentor };
  const { container, rerender } = render(<SessionScreens {...props}/>);
  const roomElement = container.querySelector<HTMLElement>('#s7')!;
  roomElement.classList.add('is-current');
  const room = within(roomElement);
  const home = within(container.querySelector<HTMLElement>('#s6')!);
  expect(home.getByText('Payment confirmed. Your time with Taylor is reserved.')).toBeTruthy();
  expect(room.getByText('Taylor Morgan and Robin Chen')).toBeTruthy();
  expect(room.getByText('Signed in as Robin Chen')).toBeTruthy();
  expect(roomElement.textContent).not.toContain('Alex');
  expect(roomElement.textContent).not.toContain('Jordan');
  vi.mocked(apiCall).mockResolvedValueOnce({ ok: true, data: { message: 'My form loses the value.' } });
  fireEvent.change(room.getByRole('textbox', { name: 'Message to Taylor' }), { target: { value: 'My form loses the value.' } });
  fireEvent.click(room.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(room.getAllByRole('listitem')).toHaveLength(3));
  expect(room.getAllByRole('listitem')[2].textContent).toContain('Robin Chen');
  rerender(<SessionScreens {...props} isMentor/>);
  expect(home.getByText('Payment confirmed. Your time with Robin is reserved.')).toBeTruthy();
  expect(room.getByText('Signed in as Taylor Morgan')).toBeTruthy();
  expect(room.getAllByRole('listitem')[2].textContent).toContain('Robin Chen');
  vi.mocked(apiCall).mockResolvedValueOnce({ ok: true, data: { message: 'Check the controlled input handler.' } });
  fireEvent.change(room.getByRole('textbox', { name: 'Message to Robin' }), { target: { value: 'Check the controlled input handler.' } });
  fireEvent.click(room.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(room.getAllByRole('listitem')).toHaveLength(4));
  expect(room.getAllByRole('listitem')[3].textContent).toContain('Taylor Morgan');
  fireEvent.click(room.getByRole('button', { name: 'Mentor profile' }));
  expect(onViewMentor).toHaveBeenCalledOnce();
  const review = within(container.querySelector<HTMLElement>('#s18')!);
  expect(review.getByText('Reviews are written by the mentee')).toBeTruthy();
  rerender(<SessionScreens {...props} submittedReview={{ id: 'robin-taylor', rating: 5, text: 'Taylor helped me test the form.', reviewerName: 'Robin Chen', createdAt: '2026-09-12T12:55:00Z', dateLabel: 'After your session' }}/>);
  fireEvent.click(review.getByRole('button', { name: "View Taylor's profile" }));
  expect(onViewMentor).toHaveBeenCalledTimes(2);
  expect(review.getByText("You can now read it on Taylor's profile.")).toBeTruthy();
});

function session(hasBooking = true) {
  const { container } = render(<SessionScreens hasBooking={hasBooking} duration={25} startsAt="2026-09-10T10:00:00Z" dateLabel="10 September" timeLabel="12:00" timeZone="Europe/Warsaw" slots={[]} sessionPrice={180} prices={{ 25: 180, 50: 320 }} submittedReview={null} onReviewSubmit={vi.fn()} onPricesChange={vi.fn()} onSlotAdded={vi.fn()} />);
  const room = container.querySelector<HTMLElement>('#s7')!;
  room.classList.add('is-current');
  return { room: within(room), workspace: within(container.querySelector<HTMLElement>('#s6')!) };
}

it('keeps the first input event while tracking a draft and clears/refocuses only after a successful send', async () => {
  const { room } = session();
  vi.mocked(apiCall).mockResolvedValue({ ok: true, data: { message: 'Keep the adapter.\nTest both paths.' } });
  const input = room.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message to Alex' });
  fireEvent.input(input, { target: { value: 'Keep the adapter.\nTest both paths.' } });
  expect(input.value).toBe('Keep the adapter.\nTest both paths.');
  expect(room.getByRole<HTMLButtonElement>('button', { name: 'Preview session end' }).disabled).toBe(true);
  fireEvent.click(room.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(room.getAllByRole('listitem')).toHaveLength(3));
  const cleared = room.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message to Alex' });
  expect(cleared.value).toBe('');
  expect(document.activeElement).toBe(cleared);
  expect(room.getByRole<HTMLButtonElement>('button', { name: 'Preview session end' }).disabled).toBe(false);
});

it('keeps a draft after a failed send; clearing the draft permits demo completion', async () => {
  const { room } = session();
  vi.mocked(apiCall).mockResolvedValue({ ok: false, error: { code: 'UNAVAILABLE', message: 'Connection lost. Try again.' } });
  const input = room.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message to Alex' });
  fireEvent.change(input, { target: { value: 'Keep my draft.' } });
  fireEvent.click(room.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(room.getByRole('alert').textContent).toContain('Connection lost'));
  expect(input.value).toBe('Keep my draft.');
  expect(room.getAllByRole('listitem')).toHaveLength(2);
  expect(room.getByRole<HTMLButtonElement>('button', { name: 'Preview session end' }).disabled).toBe(true);
  fireEvent.change(input, { target: { value: '' } });
  expect(room.getByRole<HTMLButtonElement>('button', { name: 'Preview session end' }).disabled).toBe(false);
});

it('offers the written answer only after completion and does not restart the session from My sessions', () => {
  const { room, workspace } = session();
  expect(room.queryByRole('button', { name: 'Read the written answer' })).toBeNull();
  fireEvent.click(room.getByRole('button', { name: 'Preview session end' }));
  expect(room.queryByRole('textbox')).toBeNull();
  expect(room.getByRole('button', { name: 'Read the written answer' })).toBeTruthy();
  expect(workspace.getByRole('heading', { name: 'Your completed session' })).toBeTruthy();
  fireEvent.click(workspace.getByRole('button', { name: 'View conversation' }));
  expect(room.queryByRole('textbox')).toBeNull();
  expect(room.getByRole('button', { name: 'Read the written answer' })).toBeTruthy();
});


it('shows a fresh workspace without confirmed-payment claims and links to the mentor catalogue', () => {
  const { workspace } = session(false);
  expect(workspace.getByRole('heading', { name: 'My sessions', level: 1 })).toBeTruthy();
  expect(workspace.getByText('No sessions yet')).toBeTruthy();
  expect(workspace.queryByText(/Payment confirmed/)).toBeNull();
  expect(workspace.queryByRole('button', { name: 'Open text session' })).toBeNull();
  const navigate = vi.fn();
  document.addEventListener('devmentor:navigate', navigate);
  try {
    fireEvent.click(workspace.getByRole('button', { name: 'Find a mentor' }));
    expect(navigate.mock.calls[0][0].detail).toBe('s19');
  } finally { document.removeEventListener('devmentor:navigate', navigate); }
});
