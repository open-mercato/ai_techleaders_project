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
import { expectAbsent } from './assertions';
import { resetTextSessions, seedTextSessions } from './fixtures/session';

const CSRF_HEADERS = {
  'content-type': 'application/json',
  'x-devmentor-request': '1',
};

/** The one sentence R03 requires on every session screen. */
const TEXT_ONLY = 'Sessions are text only.';

interface SessionView {
  bookingId: string;
  viewerUserId: string;
  counterpartName: string;
  lengthMinutes: number;
  window: { state: string; startsAt: string; endsAt: string };
  messages: { id: string; authorId: string; authorName: string; body: string }[];
  maxMessageLength: number;
}

async function readSession(baseUrl: string, cookie: string, id: string): Promise<Response> {
  return fetch(`${baseUrl}/api/sessions/${id}`, { headers: { cookie } });
}

async function postMessage(
  baseUrl: string,
  cookie: string,
  id: string,
  body: string,
): Promise<Response> {
  return fetch(`${baseUrl}/api/sessions/${id}/messages`, {
    method: 'POST',
    headers: { ...CSRF_HEADERS, cookie },
    body: JSON.stringify({ body }),
  });
}

async function sessionData(response: Response): Promise<SessionView> {
  expect(response.status).toBe(200);
  const payload = (await response.json()) as { ok: true; data: SessionView };
  expect(payload.ok).toBe(true);
  return payload.data;
}

describe('TC-SESSION-001 the two parties hold the session and nobody else can', () => {
  it('exchanges text inside the window, refuses a third user, and refuses a post after the end', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');

    try {
      const fixture = await seedTextSessions(databaseUrl);
      const menteeCookie = await signInCookieHeader(baseUrl, 'mock-mentee');
      const mentorCookie = await signInCookieHeader(baseUrl, 'mock-mentor');
      const strangerCookie = await signInCookieHeader(baseUrl, 'mock-operator');

      // The mentee's own view: the window the server computed, and the seeded message.
      const asMentee = await sessionData(
        await readSession(baseUrl, menteeCookie, fixture.openBookingId),
      );
      expect(asMentee.window.state).toBe('open');
      expect(asMentee.counterpartName).toBe(fixture.mentorName);
      expect(asMentee.messages.map((message) => message.body)).toEqual([fixture.firstMessage]);
      // 50 minutes after the start, decided by the server rather than by this test's clock.
      expect(new Date(asMentee.window.endsAt).getTime()
        - new Date(asMentee.window.startsAt).getTime()).toBe(50 * 60_000);

      // The mentor answers inside the window, and the mentee's next read shows it. This is
      // the acceptance criterion: both parties exchange text there.
      const answer = 'At the HTTP boundary, then pass a typed command into the service.';
      expect((await postMessage(baseUrl, mentorCookie, fixture.openBookingId, answer)).status)
        .toBe(200);
      const afterAnswer = await sessionData(
        await readSession(baseUrl, menteeCookie, fixture.openBookingId),
      );
      expect(afterAnswer.messages.map((message) => message.body))
        .toEqual([fixture.firstMessage, answer]);
      expect(afterAnswer.messages.at(-1)?.authorName).toBe(fixture.mentorName);

      // The mentor's own view of the same session names the other person.
      const asMentor = await sessionData(
        await readSession(baseUrl, mentorCookie, fixture.openBookingId),
      );
      expect(asMentor.counterpartName).toBe(fixture.menteeName);
      expect(asMentor.viewerUserId).not.toBe(asMentee.viewerUserId);
      expect(asMentor.messages.map((message) => message.id))
        .toEqual(afterAnswer.messages.map((message) => message.id));

      // A third signed-in user — who also holds `operator`, the strongest role in the
      // product — is refused, and is told nothing about the exchange.
      const refusedRead = await readSession(baseUrl, strangerCookie, fixture.openBookingId);
      expect(refusedRead.status).toBe(403);
      const refusedBody = await refusedRead.text();
      expect(refusedBody).toContain('forbidden');
      expect(refusedBody).not.toContain(fixture.firstMessage);
      expect(refusedBody).not.toContain(answer);
      expect((await postMessage(baseUrl, strangerCookie, fixture.openBookingId, 'let me in')).status)
        .toBe(403);

      // Signed out is a 401, not a 403: there is no caller to refuse yet.
      expect((await fetch(`${baseUrl}/api/sessions/${fixture.openBookingId}`)).status).toBe(401);

      // The booked length is over, so the session is ended and will not take a message —
      // while the transcript stays readable.
      const ended = await sessionData(
        await readSession(baseUrl, menteeCookie, fixture.endedBookingId),
      );
      expect(ended.window.state).toBe('ended');
      const late = await postMessage(baseUrl, menteeCookie, fixture.endedBookingId, 'one more');
      expect(late.status).toBe(409);
      expect(await late.text()).toContain('This session has ended');

      // Nothing was stored by the refused attempts.
      const unchanged = await sessionData(
        await readSession(baseUrl, menteeCookie, fixture.openBookingId),
      );
      expect(unchanged.messages).toHaveLength(2);
    } finally {
      await resetTextSessions(databaseUrl);
    }
  });
});

describe('TC-SESSION-002 the session screen says sessions are text and offers no call', () => {
  it('shows both parties the transcript and a composer, with no audio or video control', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = `devmentor-text-session-${process.pid}`;

    try {
      const fixture = await seedTextSessions(databaseUrl);
      await signInAs(session, baseUrl, 'mock-mentee');
      await runAgentBrowser(session, 'open', `${baseUrl}/sessions/${fixture.openBookingId}`);
      const snapshot = await runAgentBrowser(session, 'snapshot');

      expect(snapshot).toContain(TEXT_ONLY);
      expect(snapshot).toContain(fixture.firstMessage);
      expect(snapshot).toContain('In Progress');
      // The composer is open, because the window is.
      expect(snapshot).toMatch(/textbox "Your message"/);

      // N01, as a negative assertion about *controls*: R03's own sentence contains the words
      // "audio" and "video", so a text search would fail on the promise itself.
      for (const pattern of [/video|audio|camera|microphone/i, /join|dial|call/i]) {
        expectAbsent(
          snapshot,
          { role: 'button', text: pattern },
          {
            tree: 'the open text session screen',
            provenBy: [{ role: 'button', text: 'Send' }],
          },
        );
        expectAbsent(
          snapshot,
          { role: 'link', text: pattern },
          {
            tree: 'the open text session screen',
            provenBy: [{ role: 'link', text: 'Sign out' }],
          },
        );
      }

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'text-session-open-mentee.png'),
        '--full',
      );

      // The ended session keeps its transcript and closes its composer.
      await runAgentBrowser(session, 'open', `${baseUrl}/sessions/${fixture.endedBookingId}`);
      const endedSnapshot = await runAgentBrowser(session, 'snapshot');
      expect(endedSnapshot).toContain(TEXT_ONLY);
      expect(endedSnapshot).toContain('Ended');
      expect(endedSnapshot).toContain('written answer comes next');
      expectAbsent(
        endedSnapshot,
        { role: 'textbox' },
        {
          tree: 'the ended text session screen',
          provenBy: [{ role: 'link', text: 'Sign out' }],
        },
      );
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'text-session-ended-mentee.png'),
        '--full',
      );

      // A third user opening the same address is refused on the screen as well as in JSON.
      await signInAs(session, baseUrl, 'mock-operator');
      await runAgentBrowser(session, 'open', `${baseUrl}/sessions/${fixture.openBookingId}`);
      const refusedSnapshot = await runAgentBrowser(session, 'snapshot');
      expect(refusedSnapshot).toContain('belongs to the mentee and the mentor');
      expect(refusedSnapshot).not.toContain(fixture.firstMessage);
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'text-session-refused-third-user.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'text-session');
      throw error;
    } finally {
      try {
        await closeAgentBrowser(session);
      } finally {
        await resetTextSessions(databaseUrl);
      }
    }
  });
});
