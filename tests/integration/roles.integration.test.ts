import { resolve } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
  signInCookieHeader,
} from './agent-browser';
import { expectAbsent, type NodeQuery } from './assertions';

/**
 * Role enforcement, end to end — step 20 of `.ai/specs/2026-09-04-accounts-and-roles.md`
 * and the acceptance criteria of story #14.
 *
 * What is exercised here is not `requirePageRole` (its branches are a unit test) but the
 * composition: a real session cookie, three real route groups whose layouts *and* pages each
 * guard, `homeFor` deciding where a refusal lands, `navLinksFor` deciding what a session may
 * see, and `/api/users` refusing the same data the screen refuses. Every scenario signs in
 * through the real start route via `signInAs`, so nothing here fabricates a session.
 *
 * Assertions are on roles and accessible names, never on CSS. The negatives go through
 * `expectAbsent`, which will not report an absence until the same tree has been shown to
 * contain the screen it is supposed to be.
 *
 * The seeded personas: `mock-mentee` (`mentee`), `mock-mentor` (`mentor`) and
 * `mock-operator` (`operator` **and** `mentor`). The last one is the interesting case and
 * has a scenario of its own — a founder who also mentors must reach both surfaces without
 * signing out, and a guard written as equality rather than membership would break exactly
 * there.
 */

/** A session name nothing else in the suite can collide with. */
function browserSession(scenario: string): string {
  return `devmentor-roles-${scenario}-${process.pid}`;
}

/** The path a landing URL points at, so an assertion never depends on the host or port. */
function pathOf(url: string): string {
  return new URL(url).pathname;
}

/** The action every signed-in surface carries; part of every screen's positive control. */
const SIGN_OUT: NodeQuery = { role: 'button', text: 'Sign out' };

/**
 * How a self-service route to the mentor role would be worded.
 *
 * R07 and D08 are the requirement — mentors join by invitation (#15), and no product path
 * grants a role — so the prohibition is on the *affordance*, not on one string. The pattern
 * is deliberately wider than the label anyone would actually ship, and deliberately narrow
 * enough not to collide with the two legitimate mentions of the word on these screens:
 * `AppShell`'s topbar reads "Your DevMentor workspace" and the mentor's own navigation link
 * reads "Mentor workspace".
 */
const MENTOR_RECRUITMENT =
  /become a mentor|becoming a mentor|apply to be a mentor|apply as a mentor|sign up as a mentor|join as a mentor|register as a mentor|mentor application|start mentoring/i;

/** The three shapes a "become a mentor" path could take in a tree. */
const RECRUITMENT_QUERIES: readonly NodeQuery[] = [
  // A link is the obvious one: a nav entry or an in-page call to action.
  { role: 'link', text: MENTOR_RECRUITMENT },
  // A `WorkflowAction` that grants the role in place would be a button, not a link.
  { role: 'button', text: MENTOR_RECRUITMENT },
  // And any prose pointing at one — a text run is a named node, so this catches copy that
  // tells the user where to go even when the affordance itself is elsewhere.
  { text: MENTOR_RECRUITMENT },
];

/** Every signed-in persona, with the home it lands on and what proves that screen rendered. */
const PERSONAS = [
  {
    login: 'mock-mentee',
    roles: 'mentee',
    home: '/home',
    provenBy: [
      { role: 'heading', text: 'My sessions' },
      { role: 'link', text: 'My sessions' },
      SIGN_OUT,
    ] as readonly NodeQuery[],
  },
  {
    login: 'mock-mentor',
    roles: 'mentor',
    home: '/mentor',
    provenBy: [
      { role: 'heading', text: 'Mentor workspace' },
      { role: 'link', text: 'Mentor workspace' },
      SIGN_OUT,
    ] as readonly NodeQuery[],
  },
  {
    login: 'mock-operator',
    roles: 'operator and mentor',
    home: '/admin',
    provenBy: [
      { role: 'heading', text: 'Dashboard' },
      { role: 'link', text: 'Dashboard' },
      { role: 'link', text: 'Users' },
      { role: 'link', text: 'Mentor workspace' },
      SIGN_OUT,
    ] as readonly NodeQuery[],
  },
] as const;

describe('TC-ROLE-001 a mentee opening a screen that is not theirs', () => {
  it('is sent to their own home, with no mentor or operator surface rendered', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('mentee-refused');

    try {
      await signInAs(session, baseUrl, 'mock-mentee');

      // Edge case 19: refused, and sent *home* rather than to `/sign-in`. Bouncing a
      // signed-in user to sign-in would ask them to re-authenticate into the same refusal.
      await runAgentBrowser(session, 'open', `${baseUrl}/mentor`);
      const mentorAttempt = await runAgentBrowser(session, 'get', 'url');
      const home = await runAgentBrowser(session, 'snapshot');

      expect(pathOf(mentorAttempt)).toBe('/home');
      expect(home).toContain('heading "My sessions"');

      // Nothing of the mentor surface leaked: not its heading, and not a link to it in the
      // navigation, which is built from the roles this session actually holds.
      const menteeHome = { tree: "the mentee's /home", provenBy: PERSONAS[0].provenBy };
      expectAbsent(home, { role: 'heading', text: 'Mentor workspace' }, menteeHome);
      expectAbsent(home, { role: 'link', text: 'Mentor workspace' }, menteeHome);

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'roles-mentee-refused-mentor.png'),
        '--full',
      );

      // The same refusal for the operator's list screen — the page half of "a mentee
      // listing users is refused" (story #14); the API half is TC-ROLE-005.
      await runAgentBrowser(session, 'open', `${baseUrl}/admin/users`);
      const usersAttempt = await runAgentBrowser(session, 'get', 'url');
      const afterUsers = await runAgentBrowser(session, 'snapshot');

      expect(pathOf(usersAttempt)).toBe('/home');
      expectAbsent(afterUsers, { role: 'heading', text: 'Users' }, menteeHome);
      expectAbsent(afterUsers, { role: 'link', text: 'Users' }, menteeHome);

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'roles-mentee-refused-users.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'roles-mentee-refused');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });
});

describe('TC-ROLE-002 a mentor opening /admin', () => {
  it('is refused and left on the mentor workspace', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('mentor-refused');

    try {
      await signInAs(session, baseUrl, 'mock-mentor');

      // Edge case 20. `mock-mentor` holds `mentor` only, so `homeFor` sends the refusal to
      // `/mentor` — the distinction from the operator below, who holds both.
      await runAgentBrowser(session, 'open', `${baseUrl}/admin`);
      const landing = await runAgentBrowser(session, 'get', 'url');
      const snapshot = await runAgentBrowser(session, 'snapshot');

      expect(pathOf(landing)).toBe('/mentor');
      expect(snapshot).toContain('heading "Mentor workspace"');

      const mentorHome = { tree: "the mentor's /mentor", provenBy: PERSONAS[1].provenBy };
      expectAbsent(snapshot, { role: 'heading', text: 'Dashboard' }, mentorHome);
      expectAbsent(snapshot, { role: 'link', text: 'Dashboard' }, mentorHome);
      expectAbsent(snapshot, { role: 'link', text: 'Users' }, mentorHome);

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'roles-mentor-refused-admin.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'roles-mentor-refused');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });
});

describe('TC-ROLE-003 no signed-in role is offered a way to become a mentor', () => {
  // R07, as an acceptance criterion in the negative, run against every persona rather than
  // against one: the affordance would most plausibly be added to the surface of the role
  // that does not have it yet, and a single-persona assertion would miss it on the other two.
  for (const persona of PERSONAS) {
    it(`finds none in the ${persona.roles} navigation`, async () => {
      const baseUrl = inject('integrationBaseUrl');
      const session = browserSession(`r07-${persona.login}`);

      try {
        const landing = await signInAs(session, baseUrl, persona.login);
        const snapshot = await runAgentBrowser(session, 'snapshot');

        // Assert the landing first: an absence proven on the wrong screen is worth nothing,
        // and `expectAbsent`'s control below then proves the same screen has a navigation.
        expect(pathOf(landing)).toBe(persona.home);

        const proof = { tree: `${persona.roles} on ${persona.home}`, provenBy: persona.provenBy };
        for (const query of RECRUITMENT_QUERIES) {
          expectAbsent(snapshot, query, proof);
        }

        await runAgentBrowser(
          session,
          'screenshot',
          resolve(integrationArtifactsDirectory, `roles-r07-${persona.login}.png`),
          '--full',
        );
      } catch (error) {
        await captureBrowserFailure(session, `roles-r07-${persona.login}`);
        throw error;
      } finally {
        await closeAgentBrowser(session);
      }
    });
  }
});

describe('TC-ROLE-004 the operator, who also holds mentor', () => {
  it('reaches both surfaces from either one, and sees the users list', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('operator-both');

    try {
      const landing = await signInAs(session, baseUrl, 'mock-operator');
      expect(pathOf(landing)).toBe('/admin');

      // Roles are a union, not a winner: the operator's navigation carries the mentor link
      // as well, so reaching the other surface never requires guessing a URL or signing out.
      const dashboard = await runAgentBrowser(session, 'snapshot');
      expect(dashboard).toContain('heading "Dashboard"');
      expect(dashboard).toContain('link "Dashboard"');
      expect(dashboard).toContain('link "Users"');
      expect(dashboard).toContain('link "Mentor workspace"');

      // The mentee surface is *not* in it: the seeded operator holds `operator` and
      // `mentor`, so a `/home` link would mean the navigation stopped following the roles.
      expectAbsent(
        dashboard,
        { role: 'link', text: 'My sessions' },
        { tree: "the operator's /admin", provenBy: PERSONAS[2].provenBy },
      );

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'roles-operator-admin.png'),
        '--full',
      );

      // The mentor surface, admitted for the same session (story #14: "a mentor/operator is
      // admitted"). The same navigation is there, so the way back is one click.
      await runAgentBrowser(session, 'open', `${baseUrl}/mentor`);
      const mentor = await runAgentBrowser(session, 'get', 'url');
      const mentorSnapshot = await runAgentBrowser(session, 'snapshot');

      expect(pathOf(mentor)).toBe('/mentor');
      expect(mentorSnapshot).toContain('heading "Mentor workspace"');
      expect(mentorSnapshot).toContain('link "Dashboard"');
      expect(mentorSnapshot).toContain('link "Users"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'roles-operator-mentor.png'),
        '--full',
      );

      // And the list itself. The table is fetched client-side through `apiCall`, so the
      // wait is on a row rather than on the heading the server already rendered.
      await runAgentBrowser(session, 'open', `${baseUrl}/admin/users`);
      await runAgentBrowser(session, 'wait', '--text', 'Ada Lovelace');
      const users = await runAgentBrowser(session, 'snapshot');

      expect(users).toContain('heading "Users"');
      expect(users).toContain('cell "Ada Lovelace"');
      expect(users).toContain('cell "ada@devmentor.dev"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'roles-operator-users.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'roles-operator-both');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });
});

describe('TC-ROLE-005 /api/users refuses everyone but the operator', () => {
  it('answers a mentee 403 and the operator 200', async () => {
    const baseUrl = inject('integrationBaseUrl');

    // The operator half is the positive control for the negative one, in the same spirit as
    // `expectAbsent`: a 403 from a route that is broken, unrouted or answering 404 for
    // everyone would otherwise read as authorization working.
    const operator = await fetch(`${baseUrl}/api/users`, {
      headers: { cookie: await signInCookieHeader(baseUrl, 'mock-operator') },
    });
    const allowed = (await operator.json()) as { ok: boolean; data?: unknown[] };

    expect(operator.status).toBe(200);
    expect(allowed.ok).toBe(true);
    expect((allowed.data ?? []).length).toBeGreaterThan(0);

    // Signed in, and still refused: 403 rather than 401, because the caller is
    // authenticated and re-authenticating would change nothing (edge case 19's API half).
    const mentee = await fetch(`${baseUrl}/api/users`, {
      headers: { cookie: await signInCookieHeader(baseUrl, 'mock-mentee') },
    });
    const refused = (await mentee.json()) as {
      ok: boolean;
      error?: { code?: string };
      data?: unknown;
    };

    expect(mentee.status).toBe(403);
    expect(refused.ok).toBe(false);
    expect(refused.error?.code).toBe('forbidden');
    // The refusal carries no rows — not an empty list, nothing at all.
    expect(refused.data).toBeUndefined();
  });
});
