import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LandingScreen } from './LandingScreen';
import { MentorCatalogueScreen } from './MentorCatalogueScreen';
import { MentorProfileScreen } from './MentorProfileScreen';
import { DEMO_NOW } from './flow';
import { getPrototypeMentors } from './mentors';
import { navigate } from './navigation';
import { INITIAL_REVIEWS } from './reviews';

vi.mock('./navigation', () => ({ navigate: vi.fn(), scrollToSection: vi.fn() }));
beforeEach(() => { vi.mocked(navigate).mockReset(); });
afterEach(cleanup);

const now = new Date(DEMO_NOW).toISOString();
const prices = { 25: 180, 50: 320 };

it('opens each selected mentor’s own details and returns focus to the clicked card', async () => {
  const mentors = getPrototypeMentors(prices, INITIAL_REVIEWS);
  render(<MentorCatalogueScreen mentors={mentors} now={now} />);
  for (const mentor of mentors) {
    const trigger = screen.getByRole('button', { name: `View ${mentor.name}'s profile` });
    // Pointer activation must restore focus even when the browser does not focus buttons on click.
    fireEvent.click(trigger);
    const dialog = within(await screen.findByRole('dialog', { name: mentor.name }));
    const title = dialog.getByRole('heading', { name: mentor.name });
    expect(document.activeElement).toBe(title);
    const details = dialog.getByRole('region', { name: `${mentor.name} profile details` });
    expect(details.tabIndex).toBe(0);
    details.focus();
    expect(document.activeElement).toBe(details);
    expect(dialog.getByText(mentor.bio[0])).toBeTruthy();
    expect(dialog.getByText(mentor.languages.join(', '))).toBeTruthy();
    expect(dialog.getByText(mentor.timeZone, { exact: true })).toBeTruthy();
    expect(dialog.getByText(`25 minutes: PLN ${mentor.price25}`)).toBeTruthy();
    expect(dialog.getByText(`50 minutes: PLN ${mentor.price50}`)).toBeTruthy();
    expect(dialog.queryByRole('button', { name: 'View full profile' }) !== null).toBe(mentor.id === 'alex-laurent');
    if (!mentor.availableSlots.length) expect(dialog.getByText('No times are published at the moment.')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Back to results' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  }
  expect(navigate).not.toHaveBeenCalled();
});

it('keeps a filtered result and its query after Escape or the close button', async () => {
  render(<MentorCatalogueScreen mentors={getPrototypeMentors(prices, INITIAL_REVIEWS)} now={now} />);
  const search = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search mentors' });
  fireEvent.change(search, { target: { value: 'Maya' } });
  const trigger = screen.getByRole('button', { name: "View Maya Patel's profile" });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Maya Patel' });
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(trigger);
  expect(search.value).toBe('Maya');
  expect(screen.getAllByRole('article')).toHaveLength(1);

  fireEvent.click(trigger);
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Maya Patel' })).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(trigger);
  expect(search.value).toBe('Maya');
});

it('opens Alex’s existing full profile while retaining catalogue state for the return visit', async () => {
  const mentors = getPrototypeMentors(prices, INITIAL_REVIEWS);
  const { rerender } = render(<MentorCatalogueScreen mentors={mentors} now={now} />);
  const search = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search mentors' });
  fireEvent.change(search, { target: { value: 'Alex TypeScript' } });
  fireEvent.click(screen.getByRole('button', { name: "View Alex Laurent's profile" }));
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Alex Laurent' })).getByRole('button', { name: 'View full profile' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('s1'));
  expect(screen.queryByRole('dialog')).toBeNull();
  rerender(<MentorCatalogueScreen mentors={getPrototypeMentors({ 25: 200, 50: 360 }, INITIAL_REVIEWS)} now={now} />);
  expect(search.value).toBe('Alex TypeScript');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText('25 min: PLN 200')).toBeTruthy();
});

it('closes the portalled profile on a screen change without refocusing the hidden catalogue', async () => {
  render(<MentorCatalogueScreen mentors={getPrototypeMentors(prices, INITIAL_REVIEWS)} now={now} />);
  const trigger = screen.getByRole('button', { name: "View Maya Patel's profile" });
  fireEvent.click(trigger);
  await screen.findByRole('dialog', { name: 'Maya Patel' });
  fireEvent(document, new CustomEvent('devmentor:screen-change', { detail: 's1' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).not.toBe(trigger);
  expect(navigate).not.toHaveBeenCalled();
  fireEvent(document, new CustomEvent('devmentor:screen-change', { detail: 's19' }));
  fireEvent.click(trigger);
  fireEvent.keyDown(await screen.findByRole('dialog', { name: 'Maya Patel' }), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(trigger);
});

it('routes homepage discovery actions to the catalogue and keeps Meet Alex on the named profile', () => {
  render(<LandingScreen reviews={INITIAL_REVIEWS} />);
  for (const button of screen.getAllByRole('button', { name: 'Find your mentor' })) {
    fireEvent.click(button);
    expect(navigate).toHaveBeenLastCalledWith('s19');
  }
  fireEvent.click(screen.getByRole('button', { name: 'Find a mentor' }));
  expect(navigate).toHaveBeenLastCalledWith('s19');
  fireEvent.click(screen.getByRole('button', { name: 'Meet Alex' }));
  expect(navigate).toHaveBeenLastCalledWith('s1');
});

it('provides a route back to the catalogue from the full mentor profile', () => {
  render(<MentorProfileScreen prices={prices} reviews={INITIAL_REVIEWS} />);
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: 'Mentors' }));
  expect(navigate).toHaveBeenCalledWith('s19');
});

it('uses Alex’s current prices, submitted reviews and selectable slots in catalogue data', () => {
  const [alex] = getPrototypeMentors({ 25: 220, 50: 400 }, INITIAL_REVIEWS.slice(0, 2), [
    { id: 'late', start: '2026-09-11T14:00:00Z' },
    { id: 'taken', start: '2026-09-10T10:00:00Z', blockedReason: 'Already booked' },
    { id: 'soon', start: '2026-09-10T09:00:00Z' },
    { id: 'early', start: '2026-09-11T10:00:00Z' },
  ]);
  expect(alex).toMatchObject({ price25: 220, price50: 400, reviewCount: 2, averageRating: 4.5, nextAvailableAt: '2026-09-11T10:00:00Z' });
  expect(alex.availableSlots).toEqual(['2026-09-11T10:00:00Z', '2026-09-11T14:00:00Z']);
  expect(getPrototypeMentors(prices, [], [])[0]).toMatchObject({ reviewCount: 0, averageRating: 0, nextAvailableAt: null, availableSlots: [] });
});
