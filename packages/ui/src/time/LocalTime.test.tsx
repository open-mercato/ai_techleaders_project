// @vitest-environment jsdom

import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalTime } from './LocalTime';

const INSTANT = '2026-09-24T08:00:00.000Z';
const DATE_OPTIONS = { day: 'numeric', month: 'long', year: 'numeric' } as const;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function useViewerZone(timeZone: string) {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    locale: 'en-GB',
    calendar: 'gregory',
    numberingSystem: 'latn',
    timeZone,
  });
}

it('server-renders a UTC-labelled time with the source instant in dateTime', () => {
  const html = renderToString(
    <LocalTime value={INSTANT} className="deadline" aria-label="Publication deadline" />,
  );

  expect(html).toContain('dateTime="2026-09-24T08:00:00.000Z"');
  expect(html).toContain('class="deadline"');
  expect(html).toContain('aria-label="Publication deadline"');
  expect(html).toContain('24 September 2026 at 08:00 (UTC)');
});

it('switches to the viewer timezone after mounting', async () => {
  useViewerZone('Europe/Warsaw');
  const queued: VoidFunction[] = [];
  vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(callback => {
    queued.push(callback);
  });

  render(<LocalTime value={INSTANT} options={DATE_OPTIONS} />);

  expect(screen.getByText('24 September 2026 (UTC)')).toBeTruthy();
  expect(queued).toHaveLength(1);
  await act(async () => queued[0]!());
  expect(screen.getByText('24 September 2026 (Europe/Warsaw)')).toBeTruthy();
  expect(screen.getByText('24 September 2026 (Europe/Warsaw)').getAttribute('dateTime'))
    .toBe(INSTANT);
});

it('hydrates the byte-identical UTC render before applying the viewer timezone', async () => {
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <LocalTime value={INSTANT} locale="en-GB" options={DATE_OPTIONS} />,
  );
  document.body.append(container);
  expect(container.textContent).toBe('24 September 2026 (UTC)');

  useViewerZone('America/New_York');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let root: ReturnType<typeof hydrateRoot> | undefined;

  await act(async () => {
    root = hydrateRoot(
      container,
      <LocalTime value={INSTANT} locale="en-GB" options={DATE_OPTIONS} />,
    );
  });

  await waitFor(() => {
    expect(container.textContent).toBe('24 September 2026 (America/New_York)');
  });
  expect(consoleError).not.toHaveBeenCalled();

  await act(async () => root?.unmount());
  container.remove();
});
