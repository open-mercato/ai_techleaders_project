import { describe, expect, it } from 'vitest';
import type { BookingMetrics } from '@devmentor/core';
import { MetricSummary } from '@devmentor/ui';
import { elements } from '../../test/element-tree';
import { METRICS_WINDOW_DAYS, SessionMetrics, sessionMetrics } from './session-metrics';

const metrics: BookingMetrics = {
  weeks: [
    { weekStart: '2026-09-14', count: 4 },
    { weekStart: '2026-09-21', count: 11 },
  ],
  medianBookingToStartMinutes: 240,
};

function valueOf(id: string, from: BookingMetrics = metrics): string {
  return sessionMetrics(from).find((metric) => metric.id === id)!.value;
}

describe('sessionMetrics', () => {
  it('reports the best week against the number D16 asks for', () => {
    expect(valueOf('paid-sessions')).toBe('11 paid sessions');
    expect(sessionMetrics(metrics)[0]!.context).toContain('10 a week');
  });

  it('counts one session as one session', () => {
    expect(valueOf('paid-sessions', { ...metrics, weeks: [{ weekStart: 'x', count: 1 }] }))
      .toBe('1 paid session');
  });

  it('reports nothing booked as zero rather than as missing', () => {
    expect(valueOf('paid-sessions', { weeks: [], medianBookingToStartMinutes: null }))
      .toBe('0 paid sessions');
    expect(valueOf('weeks-counted', { weeks: [], medianBookingToStartMinutes: null })).toBe('0');
  });

  it.each([
    [45, '45 min'],
    [240, '4 h'],
    [47 * 60, '47 h'],
    [72 * 60, '3 days'],
  ])('reads %i minutes as %s', (minutes, expected) => {
    expect(valueOf('booking-to-start', { ...metrics, medianBookingToStartMinutes: minutes }))
      .toBe(expected);
  });

  it('says there is not enough data rather than showing a zero median', () => {
    // Nobody booking and everybody booking at the last moment are opposite findings, and
    // D22 is the one that would be acted on.
    expect(valueOf('booking-to-start', { ...metrics, medianBookingToStartMinutes: null }))
      .toBe('Not enough data');
  });

  it('says which week a session is counted in, because that is undecided', () => {
    expect(sessionMetrics(metrics)[1]!.context).toContain('undecided');
  });
});

describe('SessionMetrics', () => {
  it('names the window it read and does not claim to be live', () => {
    const summary = elements(SessionMetrics({ metrics }))
      .find((element) => element.type === MetricSummary);
    const props = summary?.props as { period: string; updatedLabel: string };

    expect(props.period).toBe(`Last ${METRICS_WINDOW_DAYS} days`);
    expect(props.updatedLabel).toBe('Read when this page loaded');
  });
});
