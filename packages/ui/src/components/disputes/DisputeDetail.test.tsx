// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DisputeDetail } from './DisputeDetail';
afterEach(cleanup);
it('shows authorized dispute evidence and records an outcome separately from a refund', () => {
  const props = { reference: 'D-101', sessionLabel: 'Text session on 9 September', reason: 'Written answer does not cover the agreed question.', evidence: <p>Permitted transcript excerpt</p> };
  const { rerender } = render(<DisputeDetail {...props} state="open" actions={<button>Record outcome</button>} />);
  expect(screen.getByText('open').dataset.tone).toBe('warning');
  expect(screen.queryByText('Recorded outcome')).toBeNull();
  expect(screen.getByText('Permitted transcript excerpt')).toBeTruthy();
  rerender(<DisputeDetail {...props} state="resolved" outcome="A follow-up written answer was provided." />);
  expect(screen.getByText('resolved').dataset.tone).toBe('success');
  expect(screen.getByText('A follow-up written answer was provided.')).toBeTruthy();
  expect(screen.getByText('Recording an outcome does not automatically issue a refund.')).toBeTruthy();
});
