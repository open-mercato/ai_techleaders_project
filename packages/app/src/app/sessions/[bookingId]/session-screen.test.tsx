// @vitest-environment jsdom
import type { SessionViewDto } from '@devmentor/core';
import { SESSION_IS_TEXT_MESSAGE } from '@devmentor/ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ResourceOptions {
  pollMs?: number;
  pollWhile?: (data: SessionViewDto | undefined) => boolean;
}

const state = vi.hoisted(() => ({ resource: vi.fn(), apiCall: vi.fn() }));

vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  useApiResource: (path: string, options?: ResourceOptions) => state.resource(path, options),
  apiCall: state.apiCall,
}));

/** The options the screen handed the shared hook on its most recent render. */
function pollOptions(): ResourceOptions {
  const call = state.resource.mock.calls.at(-1);
  return (call?.[1] ?? {}) as ResourceOptions;
}

const {
  SESSION_POLL_MS,
  SessionScreen,
  closedReason,
  emptyTranscriptMessage,
  headerState,
  mergeAccepted,
  scheduleLabel,
  sendFailureMessage,
  transcriptMessages,
} = await import('./session-screen');

const BOOKING_ID = '50000000-0000-4000-8000-000000000001';
const VIEWER = 'mentee-id';
const ZONE = 'UTC';

function view(overrides: Partial<SessionViewDto> = {}): SessionViewDto {
  return {
    bookingId: BOOKING_ID,
    viewerUserId: VIEWER,
    counterpartName: 'Alex Laurent',
    lengthMinutes: 50,
    window: {
      state: 'open',
      startsAt: '2026-09-14T16:00:00.000Z',
      endsAt: '2026-09-14T16:50:00.000Z',
    },
    messages: [
      {
        id: 'm1',
        authorId: VIEWER,
        authorName: 'Jamie Chen',
        body: 'Where should I validate it?',
        createdAt: '2026-09-14T16:01:00.000Z',
      },
      {
        id: 'm2',
        authorId: 'mentor-id',
        authorName: 'Alex Laurent',
        body: 'At the boundary.',
        createdAt: '2026-09-14T16:02:00.000Z',
      },
    ],
    maxMessageLength: 4000,
    ...overrides,
  };
}

function loaded(data: SessionViewDto = view()): void {
  state.resource.mockReturnValue({
    data,
    loading: false,
    error: undefined,
    reload: vi.fn(),
  });
}

beforeEach(() => {
  state.resource.mockReset();
  state.apiCall.mockReset();
  loaded();
});
afterEach(cleanup);

describe('pure helpers', () => {
  it('adds an accepted message once and lets the poll that catches up change nothing', () => {
    const stored = view().messages;
    const accepted = {
      id: 'm3',
      authorId: VIEWER,
      authorName: 'Jamie Chen',
      body: 'Just sent',
      createdAt: '2026-09-14T16:03:00.000Z',
    };

    expect(mergeAccepted(stored, [accepted]).map((message) => message.id))
      .toEqual(['m1', 'm2', 'm3']);
    // Once the poll returns it, the local copy drops out rather than doubling.
    expect(mergeAccepted([...stored, accepted], [accepted]).map((message) => message.id))
      .toEqual(['m1', 'm2', 'm3']);
    expect(mergeAccepted(stored, [])).toEqual(stored);
  });

  it('prefers the field error to the envelope summary, which says nothing useful', () => {
    expect(sendFailureMessage({
      message: 'Validation failed',
      fieldErrors: { body: ['Write a message before sending it.'] },
    })).toBe('Write a message before sending it.');
    expect(sendFailureMessage({ message: 'This session has ended.' }))
      .toBe('This session has ended.');
    expect(sendFailureMessage({ message: 'Nope', fieldErrors: { other: ['x'] } })).toBe('Nope');
  });

  it('maps each window state to the design system chip', () => {
    expect(headerState('not_started')).toBe('upcoming');
    expect(headerState('open')).toBe('open');
    expect(headerState('ended')).toBe('ended');
  });

  it('prints the whole window in the viewer zone with the zone named', () => {
    expect(scheduleLabel(view().window, ZONE)).toBe('Monday 14 September 16:00 to 16:50 UTC');
  });

  it('separates the schedule facts without a dot or a middle dot', () => {
    expect(scheduleLabel(view().window, ZONE)).not.toMatch(/[·•]/);
  });

  it('says why the composer is closed, and nothing while the session is open', () => {
    expect(closedReason('not_started')).toBe('You can write here once the session starts.');
    expect(closedReason('ended')).toContain('The transcript stays here');
    expect(closedReason('open')).toBeUndefined();
  });

  it('says nothing about how soon the answer arrives', () => {
    expect(closedReason('ended')).not.toMatch(/minute|hour|soon|within/i);
  });

  it('tells an empty transcript apart by window state', () => {
    expect(emptyTranscriptMessage(view().window, ZONE)).toContain('No messages yet');
    expect(emptyTranscriptMessage({ ...view().window, state: 'not_started' }, ZONE))
      .toBe('Your text session starts Monday 14 September at 16:00 UTC.');
    expect(emptyTranscriptMessage({ ...view().window, state: 'ended' }, ZONE))
      .toBe('Nothing was written in this session.');
  });

  it('marks the viewer\'s own messages from the id, never from the name', () => {
    const sameName = view({
      messages: [
        { id: 'm1', authorId: VIEWER, authorName: 'Alex', body: 'Mine', createdAt: '2026-09-14T16:01:00.000Z' },
        { id: 'm2', authorId: 'other', authorName: 'Alex', body: 'Theirs', createdAt: '2026-09-14T16:02:00.000Z' },
      ],
    });

    expect(transcriptMessages(sameName, ZONE).map((message) => message.isOwn)).toEqual([true, false]);
    expect(transcriptMessages(sameName, ZONE)[0]?.timeLabel).toBe('16:01');
    expect(transcriptMessages(sameName, ZONE).every((message) => message.delivery === 'sent')).toBe(true);
  });
});

describe('SessionScreen', () => {
  it('reads the session named in the address and polls an unfinished one', () => {
    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    expect(state.resource.mock.calls[0]?.[0]).toBe(`/api/sessions/${BOOKING_ID}`);
    expect(pollOptions().pollMs).toBe(SESSION_POLL_MS);
    expect(pollOptions().pollWhile?.(view())).toBe(true);
    // Also while it has not started, so the screen opens itself at the booked minute.
    expect(pollOptions().pollWhile?.(view({
      window: { state: 'not_started', startsAt: '2026-09-14T16:00:00.000Z', endsAt: '2026-09-14T16:50:00.000Z' },
    }))).toBe(true);
    // And before the first answer has arrived at all.
    expect(pollOptions().pollWhile?.(undefined)).toBe(true);
  });

  it('shows the transcript, the counterpart and the text-only line', () => {
    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    expect(screen.getByRole('heading', { name: 'Text session with Alex Laurent' })).toBeTruthy();
    expect(screen.getByText('You and Alex Laurent')).toBeTruthy();
    expect(screen.getByText('Monday 14 September 16:00 to 16:50 UTC')).toBeTruthy();
    expect(screen.getByText(SESSION_IS_TEXT_MESSAGE)).toBeTruthy();
    expect(screen.getByText('Where should I validate it?')).toBeTruthy();
    expect(screen.getByText('At the boundary.')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
  });

  // N01 as a negative assertion. It deliberately checks for *controls* rather than for the
  // words: R03's own sentence says "no audio or video", so a text search would fail on the
  // line that makes the promise.
  it('offers no audio or video control anywhere on the screen', () => {
    const { container } = render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('audio')).toBeNull();
    expect(container.querySelector('[type="file"]')).toBeNull();
    const interactive = [
      ...screen.queryAllByRole('button'),
      ...screen.queryAllByRole('link'),
    ].map((element) => element.textContent ?? '');
    expect(interactive.filter((name) => /video|audio|call|camera|microphone|join/i.test(name)))
      .toEqual([]);
  });

  it('says the text-only line exactly once', () => {
    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    expect(screen.getAllByText(SESSION_IS_TEXT_MESSAGE)).toHaveLength(1);
  });

  it('draws a session that has not started as upcoming, with a closed composer', () => {
    loaded(view({
      window: { state: 'not_started', startsAt: '2026-09-14T16:00:00.000Z', endsAt: '2026-09-14T16:50:00.000Z' },
      messages: [],
    }));

    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.getByRole('note').textContent).toBe('You can write here once the session starts.');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps an ended session readable, stops polling it, and points at the answer', () => {
    loaded(view({
      window: { state: 'ended', startsAt: '2026-09-14T16:00:00.000Z', endsAt: '2026-09-14T16:50:00.000Z' },
    }));

    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    expect(screen.getByText('Ended')).toBeTruthy();
    expect(screen.getByText('Where should I validate it?')).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('written answer comes next');
    // An ended session cannot change, so a tab left open on one stops asking.
    expect(pollOptions().pollWhile?.(view({
      window: { state: 'ended', startsAt: '2026-09-14T16:00:00.000Z', endsAt: '2026-09-14T16:50:00.000Z' },
    }))).toBe(false);
  });

  it('opens the composer while the session is open, and nothing else', () => {
    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    expect(screen.getByLabelText('Your message')).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('says it is opening the session while the first read is in flight', () => {
    state.resource.mockReturnValue({
      data: undefined, loading: true, error: undefined, reload: vi.fn(),
    });

    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    expect(screen.getByText('Opening your text session')).toBeTruthy();
  });

  it('shows the refusal the server gave, with a way back to the right list', () => {
    state.resource.mockReturnValue({
      data: undefined,
      loading: false,
      error: 'This session belongs to the mentee and the mentor who booked it.',
      reload: vi.fn(),
    });

    render(<SessionScreen bookingId={BOOKING_ID} backHref="/mentor/sessions" />);

    expect(screen.getByRole('alert').textContent).toContain('belongs to the mentee and the mentor');
    expect(screen.getByRole('link', { name: 'Back to your sessions' }).getAttribute('href'))
      .toBe('/mentor/sessions');
  });

  it('does not render a session it was given no data for', () => {
    state.resource.mockReturnValue({
      data: undefined, loading: false, error: undefined, reload: vi.fn(),
    });

    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    expect(screen.getByRole('alert').textContent).toContain('We could not open this text session.');
  });
});

describe('sending a message', () => {
  it('posts the draft, shows it at once, and empties the box', async () => {
    state.apiCall.mockResolvedValue({
      ok: true,
      data: {
        id: 'm3',
        authorId: VIEWER,
        authorName: 'Jamie Chen',
        body: 'That helps, thank you.',
        createdAt: '2026-09-14T16:03:00.000Z',
      },
    });
    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    const field = screen.getByLabelText('Your message');
    fireEvent.change(field, { target: { value: 'That helps, thank you.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByText('That helps, thank you.')).toBeTruthy());
    expect(state.apiCall).toHaveBeenCalledExactlyOnceWith(
      `/api/sessions/${BOOKING_ID}/messages`,
      { body: { body: 'That helps, thank you.' } },
    );
    // The message is on screen from the server's own answer, not from an optimistic guess,
    // and the box is empty again.
    expect((screen.getByLabelText('Your message') as HTMLTextAreaElement).value).toBe('');
  });

  it('shows a refusal where it was typed and keeps the text', async () => {
    state.apiCall.mockResolvedValue({
      ok: false,
      error: { code: 'conflict', message: 'This session has ended. The mentor\u2019s written answer comes next.' },
    });
    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Too late?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('This session has ended.');
    // Nobody should have to retype what they wrote.
    expect((screen.getByLabelText('Your message') as HTMLTextAreaElement).value).toBe('Too late?');
  });

  it('surfaces a field error rather than the envelope summary', async () => {
    state.apiCall.mockResolvedValue({
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Validation failed',
        fieldErrors: { body: ['Write a message before sending it.'] },
      },
    });
    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent)
      .toBe('Write a message before sending it.'));
  });

  it('locks the controls while the send is in flight', async () => {
    let finish!: (value: { ok: true; data: unknown }) => void;
    state.apiCall.mockReturnValue(new Promise((resolve) => { finish = resolve as never; }));
    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Hold on' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sending\u2026' })).toBeTruthy());
    expect(screen.getByLabelText('Your message').hasAttribute('disabled')).toBe(true);

    finish({
      ok: true,
      data: { id: 'm4', authorId: VIEWER, authorName: 'Jamie Chen', body: 'Hold on', createdAt: '2026-09-14T16:04:00.000Z' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy());
  });

  it('clears a previous refusal when the next send is attempted', async () => {
    state.apiCall
      .mockResolvedValueOnce({ ok: false, error: { code: 'conflict', message: 'Not yet.' } })
      .mockResolvedValueOnce({
        ok: true,
        data: { id: 'm5', authorId: VIEWER, authorName: 'Jamie Chen', body: 'Again', createdAt: '2026-09-14T16:05:00.000Z' },
      });
    render(<SessionScreen bookingId={BOOKING_ID} backHref="/home" />);

    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Again' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Not yet.'));

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
