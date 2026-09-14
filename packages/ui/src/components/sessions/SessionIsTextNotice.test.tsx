// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SESSION_IS_TEXT_MESSAGE, SessionIsTextNotice } from './SessionIsTextNotice';

afterEach(cleanup);

it('states that sessions are written and promises nothing about timing', () => {
  render(<SessionIsTextNotice />);

  const notice = screen.getByRole('note');
  expect(notice.textContent).toBe(SESSION_IS_TEXT_MESSAGE);
  expect(notice.textContent).toMatch(/text only/);
  expect(notice.textContent).toMatch(/no promise/);
  // R14: no screen may suggest how quickly an answer arrives.
  expect(notice.textContent).not.toMatch(/within|fast|quick|hour|minutes|soon as/i);
  expect(notice.className).toBe('dm-product-callout');
});

it('drops to a caption where the screen has already said it', () => {
  render(<SessionIsTextNotice tone="inline" />);

  const notice = screen.getByRole('note');
  expect(notice.className).toBe('dm-product-caption');
  expect(notice.textContent).toBe(SESSION_IS_TEXT_MESSAGE);
});
