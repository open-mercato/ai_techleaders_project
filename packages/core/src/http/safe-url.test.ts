import { describe, expect, it } from 'vitest';
import { requestPath, withoutQuery } from './safe-url';

describe('withoutQuery', () => {
  it('drops the query string and keeps scheme, host and path', () => {
    expect(withoutQuery('https://api.resend.com/emails?api_key=re-secret')).toBe(
      'https://api.resend.com/emails',
    );
  });

  it('drops a fragment as well', () => {
    expect(withoutQuery('https://api.github.com/user#token=gho-secret')).toBe(
      'https://api.github.com/user',
    );
  });

  it('stops at the first separator, so a query containing a "#" goes too', () => {
    expect(withoutQuery('https://h/p?a=1#b=2')).toBe('https://h/p');
  });

  it('leaves a URL that has no query or fragment untouched', () => {
    expect(withoutQuery('https://api.github.com/user/emails')).toBe(
      'https://api.github.com/user/emails',
    );
  });

  it('handles an encoded newline in the query, which a naive "." regex would stop at', () => {
    expect(withoutQuery('https://h/p?a=1\nb=2')).toBe('https://h/p');
  });
});

describe('requestPath', () => {
  it('returns the path alone, dropping origin and query', () => {
    expect(
      requestPath('http://devmentor.test/api/auth/github/callback?code=abc&state=def'),
    ).toBe('/api/auth/github/callback');
  });

  it('drops a fragment', () => {
    expect(requestPath('http://devmentor.test/api/users#token=x')).toBe('/api/users');
  });

  it('drops userinfo, which can itself be a credential', () => {
    expect(requestPath('http://user:hunter2@devmentor.test/api/users')).toBe('/api/users');
  });

  it('returns "/" for an origin with no path', () => {
    expect(requestPath('http://devmentor.test')).toBe('/');
  });

  it('degrades to the query-stripped input when the URL cannot be parsed', () => {
    // The non-throwing contract: this runs inside `apiHandler`'s catch block, where a
    // second throw would replace a clean 500 with an unhandled rejection. A `Request`
    // always carries an absolute URL, so this branch is a guarantee for future callers
    // rather than a path a real request takes — but it must still not leak the query.
    expect(requestPath('/api/auth/verify-email?token=SECRET')).toBe('/api/auth/verify-email');
    expect(requestPath('not a url at all')).toBe('not a url at all');
  });
});
