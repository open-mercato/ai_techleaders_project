import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './return-to';

const FALLBACK = '/home';

describe('safeReturnTo accepts a same-origin page path', () => {
  it('passes a plain relative path through unchanged', () => {
    expect(safeReturnTo('/invitation/abc123', FALLBACK)).toBe('/invitation/abc123');
  });

  it('passes the site root', () => {
    expect(safeReturnTo('/', FALLBACK)).toBe('/');
  });

  it('keeps the query string, so the slot picker returns to the same slot', () => {
    expect(safeReturnTo('/mentors/ada?slot=2026-09-10T14%3A00%3A00Z', FALLBACK)).toBe(
      '/mentors/ada?slot=2026-09-10T14%3A00%3A00Z',
    );
  });

  it('keeps the fragment', () => {
    expect(safeReturnTo('/mentors/ada#reviews', FALLBACK)).toBe('/mentors/ada#reviews');
  });

  it('validates the path only, so an absolute URL inside the query is irrelevant', () => {
    expect(safeReturnTo('/sign-in?next=https://evil.example', FALLBACK)).toBe(
      '/sign-in?next=https://evil.example',
    );
  });

  it('allows a path that merely starts with the blocked words', () => {
    expect(safeReturnTo('/apiary', FALLBACK)).toBe('/apiary');
    expect(safeReturnTo('/_nextdoor', FALLBACK)).toBe('/_nextdoor');
  });

  it('allows percent-encoding that decodes to an ordinary path', () => {
    expect(safeReturnTo('/mentors/ada%20lovelace', FALLBACK)).toBe('/mentors/ada%20lovelace');
  });
});

describe('safeReturnTo falls back for a missing or non-relative value', () => {
  it('falls back for undefined', () => {
    expect(safeReturnTo(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for null, which B7 accepts as an input', () => {
    expect(safeReturnTo(null, FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for the empty string', () => {
    expect(safeReturnTo('', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for an https URL', () => {
    expect(safeReturnTo('https://evil.example/steal', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for any other scheme', () => {
    expect(safeReturnTo('javascript:alert(1)', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for a bare host with no leading slash', () => {
    expect(safeReturnTo('evil.example', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for a protocol-relative URL', () => {
    expect(safeReturnTo('//evil.example', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for the backslash variant browsers normalise to `//`', () => {
    expect(safeReturnTo('/\\evil.example', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for a double backslash, which never starts with a slash anyway', () => {
    expect(safeReturnTo('\\\\evil.example', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for a backslash anywhere in the path', () => {
    expect(safeReturnTo('/home\\evil.example', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for a tab, which a browser strips to leave `//evil.example`', () => {
    expect(safeReturnTo('/\t/evil.example', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for a newline, the response-splitting primitive', () => {
    expect(safeReturnTo('/home\r\nLocation: https://evil.example', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for a NUL byte', () => {
    expect(safeReturnTo('/home\u0000', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for DEL', () => {
    expect(safeReturnTo('/home\u007f', FALLBACK)).toBe(FALLBACK);
  });
});

describe('safeReturnTo falls back for a non-page path', () => {
  it('falls back for a route under /api/', () => {
    expect(safeReturnTo('/api/users', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for the OAuth start route, which would loop the browser back into it', () => {
    expect(safeReturnTo('/api/auth/github?returnTo=/home', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for exactly /api, with no trailing slash', () => {
    expect(safeReturnTo('/api', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for /api carrying only a query string', () => {
    expect(safeReturnTo('/api?x=1', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for /api carrying only a fragment', () => {
    expect(safeReturnTo('/api#top', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for a build asset under /_next/', () => {
    expect(safeReturnTo('/_next/static/chunks/main.js', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for exactly /_next', () => {
    expect(safeReturnTo('/_next', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back regardless of case', () => {
    expect(safeReturnTo('/API/users', FALLBACK)).toBe(FALLBACK);
    expect(safeReturnTo('/_NEXT/static/main.js', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for percent-encoding that decodes onto a blocked prefix', () => {
    expect(safeReturnTo('/%61pi/users', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for malformed percent-encoding rather than guessing', () => {
    expect(safeReturnTo('/mentors/%E0%A4%A', FALLBACK)).toBe(FALLBACK);
  });
});

describe('safeReturnTo returns the caller fallback verbatim', () => {
  it('uses whichever fallback the call site passed', () => {
    expect(safeReturnTo('https://evil.example', '/mentor/dashboard')).toBe('/mentor/dashboard');
  });
});
