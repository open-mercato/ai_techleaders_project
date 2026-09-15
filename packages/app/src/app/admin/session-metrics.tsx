import { MetricSummary, type OperatorMetric } from '@devmentor/ui';
import type { BookingMetrics } from '@devmentor/core';

/** How far back the dashboard looks. Four weeks is D22's own check window. */
export const METRICS_WINDOW_DAYS = 28;

/**
 * Read the two decision metrics out in words (D16, D22).
 *
 * **An absent median is "not enough data", never `0`.** Nobody booking anything and everybody
 * booking at the last possible moment are opposite findings, and D22 is the one that would
 * be acted on.
 */
export function sessionMetrics(metrics: BookingMetrics): OperatorMetric[] {
  const best = metrics.weeks.reduce((most, week) => Math.max(most, week.count), 0);
  const median = metrics.medianBookingToStartMinutes;
  return [
    {
      id: 'paid-sessions',
      label: 'Best week',
      value: `${best} paid ${best === 1 ? 'session' : 'sessions'}`,
      context: 'D16 asks for 10 a week, two weeks running, by the end of 2026.',
    },
    {
      id: 'weeks-counted',
      label: 'Weeks with a paid session',
      value: String(metrics.weeks.length),
      context: 'Counted by the week a session was booked in; which week counts is undecided.',
    },
    {
      id: 'booking-to-start',
      label: 'Median booking to start',
      value: median === null ? 'Not enough data' : formatMinutes(median),
      context: 'D22 asks for under 48 hours in the first four weeks.',
    },
  ];
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

export function SessionMetrics({ metrics }: { metrics: BookingMetrics }) {
  return <MetricSummary
    period={`Last ${METRICS_WINDOW_DAYS} days`}
    metrics={sessionMetrics(metrics)}
    updatedLabel="Read when this page loaded"
  />;
}
