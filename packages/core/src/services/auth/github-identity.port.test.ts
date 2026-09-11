import { describe, expect, it } from 'vitest';
import { GITHUB_CALLBACK_PATH, type GithubIdentity } from './github-identity.port';
import type { GithubIdentityInput } from './user.service';

describe('the GitHub identity port', () => {
  it('names the callback path the app mounts the route at', () => {
    // Both adapters build this into a URL — the real one as GitHub's `redirect_uri`, the
    // mock as the address it bounces the browser to — and the route (step 14) is mounted
    // at `app/api/auth/github/callback/route.ts`. A change here without the matching
    // directory rename breaks sign-in in a way no type checks.
    expect(GITHUB_CALLBACK_PATH).toBe('/api/auth/github/callback');
  });

  it('produces an identity `findOrCreateFromGithub` accepts', () => {
    const identity: GithubIdentity = {
      githubId: '42',
      githubLogin: 'ada',
      email: 'ada@devmentor.dev',
      displayName: 'Ada Lovelace',
      avatarUrl: null,
    };

    // The assignment is the assertion: `UserService` declares its own input shape rather
    // than importing the port, so nothing but a check like this stops the two from
    // drifting apart. `npm run typecheck` fails here if a field is renamed, retyped or
    // added on one side only.
    const input: GithubIdentityInput = identity;

    expect(input).toBe(identity);
  });
});
