// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MetricSummary } from './MetricSummary';
afterEach(cleanup);
it('renders actual operator metric labels, period and unavailable values without inventing growth', () => {
  const { container } = render(<MetricSummary period="7–13 September" updatedLabel="Updated 10:00 UTC" metrics={[
    { id: 'paid', label: 'Paid sessions this week', value: '12', context: 'Confirmed payments only' },
    { id: 'lead', label: 'Median booking-to-start', value: 'Unavailable', context: 'No completed sample yet' },
    { id: 'declines', label: 'Note declines', value: '2', context: 'Count of declined versions' },
  ]} />);
  expect(screen.getByRole('region', { name: 'Operator metrics' })).toBeTruthy();
  expect(screen.getByText('Paid sessions this week')).toBeTruthy();
  expect(screen.getByText('Unavailable')).toBeTruthy();
  expect(screen.getByText('7–13 September')).toBeTruthy();
  expect(screen.getByText('Updated 10:00 UTC')).toBeTruthy();
  expect(container.textContent).not.toMatch(/[·•]/);
});
