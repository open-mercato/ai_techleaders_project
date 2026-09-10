// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SlotTime } from './SlotTime';

afterEach(cleanup);

const startsAt = '2026-09-10T18:00:00.000Z';

it('renders an owner slot through LocalTime without a public state', () => {
  render(<SlotTime startsAt={startsAt} />);
  expect(screen.getByRole('time').getAttribute('datetime')).toBe(startsAt);
  expect(screen.queryByText('Available')).toBeNull();
  expect(screen.queryByText(/less than two hours/)).toBeNull();
});

it('marks a slot at or beyond the server lead-time boundary as available', () => {
  render(<SlotTime startsAt={startsAt} meetsLeadTime />);
  expect(screen.getByText('Available')).toBeTruthy();
});

it('explains why a slot beyond the cutoff is unavailable', () => {
  render(<SlotTime startsAt={startsAt} meetsLeadTime={false} />);
  expect(screen.getByText('Unavailable because this time starts in less than two hours.')).toBeTruthy();
});
