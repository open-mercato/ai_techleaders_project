import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, CircleCheck, Clock3, MessageSquare } from 'lucide-react';
import { z } from 'zod';
import {
  AccessStatus,
  Badge,
  Button,
  Card,
  MentorReviewForm,
  MentorReviews,
  NoteReview,
  SessionCard,
  SessionTranscript,
  VersionHistory,
  WrittenAnswer,
  type NoteVersion,
  type SessionMessage,
  type MentorReview,
  type MentorReviewValues,
} from '@devmentor/ui';
import { CrudForm, DataTable, EmptyState } from '@devmentor/ui/backend';
import { PublicPage, Screen, Workspace } from './Frame';
import './text-session.css';
import { navigate } from './navigation';
import { DEMO_NOW, money, timeLabel as formatTime, type Slot } from './flow';

export interface SessionScreensProps {
  duration: 25 | 50;
  startsAt: string;
  dateLabel: string;
  timeLabel: string;
  timeZone: string;
  slots: Slot[];
  sessionPrice: number;
  prices: { 25: number; 50: number };
  onPricesChange: (prices: { 25: number; 50: number }) => void;
  onSlotAdded: (startsAt: string) => void;
  submittedReview: MentorReview | null;
  onReviewSubmit: (values: MentorReviewValues) => Promise<void>;
}

const endpoint = '/prototype-api/devmentor-journey/save';
const mentor = 'Alex Laurent';
const mentee = 'Jordan Lee';
const noteTitle = 'A clearer result type at the API boundary';
const initialNote = 'Use an explicit ok discriminator for the API result. Keep successful data and error details in separate branches, so callers can narrow the result before reading it. Validate the incoming request at the boundary and keep ownership checks in the service. Add tests for a successful response and an invalid-input response.';
const suggestedRevision = `${initialNote}\n\nDuring migration, existing consumers must keep receiving the current response shape. Add an adapter at the boundary and a regression test for the existing consumer.`;

const messageSchema = z.object({
  message: z.string().trim().min(1, 'Write a message before sending.').max(4000, 'Keep this message under 4,000 characters.'),
});
const declineSchema = z.object({
  comment: z.string().trim().min(1, 'Tell Alex what needs to change.').max(2000, 'Keep your comment under 2,000 characters.'),
});
const noteSchema = z.object({
  body: z.string().trim().min(20, 'Include the agreed decisions and next steps.'),
});
const priceSchema = z.object({
  price25: z.number('Set your 25-minute price.').min(90, 'The minimum for 25 minutes is PLN 90.').max(600, 'The maximum for 25 minutes is PLN 600.'),
  price50: z.number('Set your 50-minute price.').min(180, 'The minimum for 50 minutes is PLN 180.').max(1200, 'The maximum for 50 minutes is PLN 1,200.'),
});
const localTimeSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Choose a date and time.')
  .refine(value => Number.isFinite(Date.parse(`${value}:00Z`)), 'Choose a valid UTC date and time.')
  .refine(value => Date.parse(`${value}:00Z`) >= DEMO_NOW + 2 * 60 * 60_000, 'Choose 10 September 2026 at 10:00 UTC or later.');

function atMinute(startsAt: string, minute: number) {
  return new Date(Date.parse(startsAt) + minute * 60_000).toISOString();
}

function slotLabel(startsAt: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(startsAt));
}

export function SessionScreens({ duration, startsAt, dateLabel, timeLabel, timeZone, slots, sessionPrice, prices, onPricesChange, onSlotAdded, submittedReview, onReviewSubmit }: SessionScreensProps) {
  const [sentMessages, setSentMessages] = useState<string[]>([]);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [hasMessageDraft, setHasMessageDraft] = useState(false);
  const conversationRef = useRef<HTMLDivElement>(null);
  const hasOpenedConversation = useRef(false);

  useEffect(() => {
    function revealLatestMessage() {
      const conversation = conversationRef.current;
      if (hasOpenedConversation.current || !conversation?.closest('.screen')?.classList.contains('is-current')) return;
      const history = conversation.querySelector<HTMLElement>('.dm-transcript-history');
      if (history) history.scrollTop = history.scrollHeight;
      hasOpenedConversation.current = true;
    }
    document.addEventListener('devmentor:screen-change', revealLatestMessage);
    const frame = requestAnimationFrame(revealLatestMessage);
    return () => { document.removeEventListener('devmentor:screen-change', revealLatestMessage); cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    if (sentMessages.length === 0 || sessionEnded) return;
    const conversation = conversationRef.current;
    if (!conversation?.closest('.screen')?.classList.contains('is-current')) return;
    const history = conversation.querySelector<HTMLElement>('.dm-transcript-history');
    if (history) history.scrollTop = history.scrollHeight;
    conversation.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true });
  }, [sentMessages.length, sessionEnded]);
  const [reviewState, setReviewState] = useState<'awaiting-approval' | 'approved' | 'declined'>('awaiting-approval');
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineComment, setDeclineComment] = useState('');
  const [noteBody, setNoteBody] = useState(initialNote);
  const [noteVersion, setNoteVersion] = useState(1);
  const [versions, setVersions] = useState<NoteVersion[]>([{ version: 1, author: mentor, updatedAt: atMinute(startsAt, duration + 10), dateLabel: 'After the text session', state: 'awaiting-approval', detail: 'First draft of the agreed API result and next steps.' }]);
  const [addedSlots, setAddedSlots] = useState<string[]>([]);
  const [savedPrices, setSavedPrices] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const messages: SessionMessage[] = [
    { id: 'question', author: mentee, isOwn: true, initials: 'JL', sentAt: atMinute(startsAt, 1), timeLabel: formatTime(atMinute(startsAt, 1), timeZone), body: 'My API result has optional data and error fields. Callers keep checking both. How can I make the type clearer without breaking the existing consumers?', delivery: 'sent' },
    { id: 'mentor-reply', author: mentor, initials: 'AL', sentAt: atMinute(startsAt, 2), timeLabel: formatTime(atMinute(startsAt, 2), timeZone), body: 'Use one explicit discriminator and separate the success and failure data into branches. Let\'s look at a caller and what needs to stay compatible during migration.', delivery: 'sent' },
    ...sentMessages.map((body, index): SessionMessage => ({ id: `message-${index}`, author: mentee, isOwn: true, initials: 'JL', sentAt: atMinute(startsAt, index + 3), timeLabel: formatTime(atMinute(startsAt, index + 3), timeZone), body, delivery: 'sent' })),
  ];
  const availabilityByStart = new Map<number, Slot>();
  for (const start of [startsAt, ...addedSlots]) availabilityByStart.set(Date.parse(start), { id: start, start });
  for (const slot of slots) availabilityByStart.set(Date.parse(slot.start), slot);
  const sharedAvailability = [...availabilityByStart.values()].sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
  const knownStarts = sharedAvailability.map(slot => slot.start);
  const slotSchema = z.object({ startsAt: localTimeSchema })
    .refine(value => !knownStarts.some(known => Date.parse(known) === Date.parse(`${value.startsAt}:00Z`)), { path: ['startsAt'], message: 'You already have a session starting at this time.' });
  let nextSlot = Date.parse(startsAt) + 86_400_000;
  while (knownStarts.some(known => Date.parse(known) === nextSlot)) nextSlot += 86_400_000;
  const nextSlotValue = new Date(nextSlot).toISOString().slice(0, 16);
  const availabilityRows = sharedAvailability.map(slot => ({
    id: slot.id,
    startsAt: slot.start,
    status: Date.parse(slot.start) === Date.parse(startsAt) ? 'Booked' : slot.blockedReason ? 'Not bookable' : 'Open',
    reason: slot.blockedReason,
  }));

  function approveNote() {
    setReviewState('approved');
    setShowDeclineForm(false);
    setVersions(current => current.map(version => version.version === noteVersion ? { ...version, state: 'approved', detail: 'Jordan approved this version in full. It remains private.' } : version));
    navigate('s15');
  }

  function requestChanges(data: unknown) {
    const { comment } = declineSchema.parse(data);
    setDeclineComment(comment);
    setReviewState('declined');
    setShowDeclineForm(false);
    setVersions(current => current.map(version => version.version === noteVersion ? { ...version, state: 'declined', detail: comment } : version));
    navigate('s10');
  }

  function sendRevision(data: unknown) {
    const { body } = noteSchema.parse(data);
    const nextVersion = noteVersion + 1;
    setNoteBody(body);
    setNoteVersion(nextVersion);
    setReviewState('awaiting-approval');
    setShowDeclineForm(false);
    setVersions(current => [{ version: nextVersion, author: mentor, updatedAt: atMinute(startsAt, duration + 10 + nextVersion), dateLabel: 'Revised after the requested changes', state: 'awaiting-approval', detail: 'Revised note sent to Jordan for a new review.' }, ...current]);
    navigate('s9');
  }

  return <>
    <Screen id="s6" title="6. Your booking is confirmed" description="The mentee can see their confirmed text session in My sessions." refs={['#22', '#23']}>
      <Workspace>
        <div className="dm-product-stack">
          <header><span className="dm-product-eyebrow">Your workspace</span><h1 className="dm-product-heading">{sessionEnded ? 'Your completed session' : 'Your upcoming session'}</h1><p className="dm-product-muted">{sessionEnded ? 'Your conversation and written answer are available below.' : 'Payment confirmed. Your time with Alex is reserved.'}</p></header>
          <SessionCard title="Make your TypeScript result easier to use" participant={mentor} startsAt={startsAt} dateLabel={`${dateLabel}, ${timeLabel}`} timeZone={timeZone} duration={duration} state={sessionEnded ? 'ended' : 'upcoming'} actions={<Button onClick={() => navigate('s7')}>{sessionEnded ? 'View conversation' : 'Open text session'}</Button>} />
          <p className="dm-product-caption">You and Alex can find this session in your workspaces. Session fee: {money(sessionPrice)}.</p>
        </div>
      </Workspace>
    </Screen>

    <Screen id="s7" title="Text session" description="Talk through the code with Alex. Session details stay available while you read and reply." refs={['#26', 'Q18']} note="This is a local text-session prototype. Q18 still determines the production session channel. Messages save only in this demo; the preview control below advances to a completed session without changing the real clock.">
      <PublicPage className="proto-session-page" navigation={<Button intent="neutral" appearance="stroke" onClick={() => navigate('s6')}><ArrowLeft aria-hidden="true" />My sessions</Button>} footer={<><span>Signed in as {mentee}</span><Button intent="neutral" appearance="ghost" onClick={() => navigate('s1')}>Mentor profile</Button></>}>
        <div className="proto-session-room" ref={conversationRef}>
          <header className="proto-session-heading">
            <div><p className="proto-eyebrow">Text session</p><h1>A clearer TypeScript result</h1></div>
            <details className="proto-session-details"><summary>Session details<ChevronDown aria-hidden="true" /></summary><dl>
              <div><dt>Participants</dt><dd>{mentor} and {mentee}</dd></div>
              <div><dt>Date and time</dt><dd>{dateLabel}, {timeLabel}</dd></div>
              <div><dt>Timezone</dt><dd>{timeZone}</dd></div>
              <div><dt>Duration</dt><dd>{duration} minutes</dd></div>
              <div><dt>Paid</dt><dd>{money(sessionPrice)}</dd></div>
            </dl></details>
          </header>
          <div className="proto-session-facts"><span><CalendarDays aria-hidden="true" />{dateLabel}, {timeLabel}</span><span><Clock3 aria-hidden="true" />{duration} minutes</span></div>
          <div className="proto-conversation-surface">
            <header className="proto-conversation-heading"><span className="proto-conversation-avatar" aria-hidden="true">AL</span><div><h2>{mentor}</h2><p>Your mentor</p></div><span className="dm-product-status" data-tone={sessionEnded ? 'neutral' : 'success'}><MessageSquare aria-hidden="true" />{sessionEnded ? 'Session ended' : 'In progress'}</span></header>
            <SessionTranscript messages={messages} composer={sessionEnded
              ? <div className="proto-conversation-ended" role="status"><CircleCheck aria-hidden="true" /><div><h2>This session has ended</h2><p>Alex&apos;s written answer is ready. You can still read the conversation above.</p></div><Button onClick={() => navigate('s8')}>Read the written answer<ArrowRight aria-hidden="true" /></Button></div>
              : <div className="proto-conversation-reply" onChange={event => { if (event.target instanceof HTMLTextAreaElement) setHasMessageDraft(event.target.value.length > 0); }}><CrudForm key={sentMessages.length} schema={messageSchema} fields={[{ name: 'message', label: 'Message to Alex', type: 'textarea', required: true, placeholder: 'Write a message or paste a code example...' }]} endpoint={endpoint} submitLabel="Send message" onSuccess={data => { const { message } = messageSchema.parse(data); setSentMessages(current => [...current, message]); setHasMessageDraft(false); }} /><p className="proto-composer-hint">Enter for a new line. Ctrl or ⌘ + Enter to send.</p><span className="sr-only" role="status">{sentMessages.length > 0 ? 'Message sent.' : ''}</span></div>} />
          </div>
          {!sessionEnded && <div className="proto-session-demo"><div><strong>Prototype preview</strong><p>{hasMessageDraft ? 'Send or clear your draft to preview the end of the session.' : 'Skip ahead to see the completed session and written answer.'}</p></div><Button size="sm" intent="neutral" appearance="ghost" disabled={hasMessageDraft} onClick={() => setSessionEnded(true)}>Preview session end<ArrowRight aria-hidden="true" /></Button></div>}
        </div>
      </PublicPage>
    </Screen>

    <Screen id="s8" title="8. Keep the written answer" description="The written answer is separate from the conversation." refs={['#27']}>
      <Workspace>
        <div className="dm-product-stack">
          <header><span className="dm-product-eyebrow">After your text session</span><h1 className="dm-product-heading">A result callers can narrow</h1></header>
          <WrittenAnswer state="posted" mentorName={mentor} publishedLabel="Posted after your text session" body={<><p>Use a discriminated union so the caller checks one property before accessing the result. A successful result contains data; a failed result contains an error.</p><pre role="region" tabIndex={0} aria-label="Example TypeScript result type"><code>{'type ApiResult<T> =\n  | { ok: true; data: T }\n  | { ok: false; error: { code: string; message: string } };'}</code></pre><p>Keep the existing response shape behind an adapter while you migrate the consumers. Validate the request at the HTTP boundary, then let the service enforce ownership.</p><h3 className="dm-product-title">Start with two tests</h3><ul><li>A successful response narrows to the data branch.</li><li>An invalid request returns a typed error without exposing an ORM entity.</li></ul></>} actions={<Button onClick={() => navigate('s9')}>Review your private note</Button>} />
          <div className="dm-product-actions"><Button intent="neutral" appearance="ghost" onClick={() => navigate('s7')}>Back to the text conversation</Button>{sessionEnded && <Button intent="neutral" appearance="stroke" onClick={() => navigate('s18')}>{submittedReview?'View your mentor review':'Review your mentor'}</Button>}</div>
        </div>
      </Workspace>
    </Screen>

    <Screen id="s9" title="9. Review the private note" description="Approve the entire version or tell the mentor what should change." refs={['#28', '#29']}>
      <Workspace>
        <div className="dm-product-stack">
          <NoteReview title={noteTitle} version={noteVersion} state={reviewState} body={<p>{noteBody}</p>} author={mentor} updatedLabel="Drafted after your text session" actions={reviewState === 'approved' ? <Button onClick={() => navigate('s15')}>Open your approved note</Button> : reviewState === 'declined' ? <Button intent="neutral" appearance="stroke" onClick={() => navigate('s10')}>View requested changes</Button> : showDeclineForm ? <CrudForm schema={declineSchema} fields={[{ name: 'comment', label: 'What should Alex change?', type: 'textarea', required: true, placeholder: 'Describe the missing context or correction.' }]} endpoint={endpoint} submitLabel="Send requested changes" onCancel={() => setShowDeclineForm(false)} onSuccess={requestChanges} /> : <><Button intent="neutral" appearance="stroke" onClick={() => setShowDeclineForm(true)}>Request changes</Button><Button onClick={approveNote}>Approve the full note</Button></>} />
          <VersionHistory versions={versions} />
          <Button intent="neutral" appearance="ghost" onClick={() => navigate('s8')}>Back to the written answer</Button>
        </div>
      </Workspace>
    </Screen>

    <Screen id="s10" title="10. Revise the note after feedback" description="The mentor edits the draft and sends the new version to the mentee for review." refs={['#29']}>
      <Workspace mentor>
        <div className="dm-product-stack">
          <NoteReview title={noteTitle} version={noteVersion} state="declined" body={<p>{noteBody}</p>} author={mentor} updatedLabel="Awaiting a revised version" declineComment={declineComment || 'Please include the error case and the migration constraint for existing consumers.'} />
          <Card className="dm-product-panel"><div><span className="dm-product-eyebrow">Mentor workspace</span><h2 className="dm-product-heading">Respond to Jordan&apos;s feedback</h2><p className="dm-product-muted">Jordan needs to approve the revised note. It stays private.</p></div><CrudForm key={`${noteVersion}-${declineComment}`} schema={noteSchema} fields={[{ name: 'body', label: 'Revised private note', type: 'textarea', required: true }]} initialValues={{ body: noteVersion === 1 ? suggestedRevision : noteBody }} endpoint={endpoint} submitLabel="Send revised note for approval" onSuccess={sendRevision} /></Card>
          <VersionHistory versions={versions} />
        </div>
      </Workspace>
    </Screen>

    <Screen id="s11" title="11. Publish mentor availability" description="Set both prices and add times that mentees can choose on the public profile." refs={['#17', '#18']} note="These demo price limits are example operator settings: PLN 90 to 600 for 25 minutes and PLN 180 to 1,200 for 50 minutes. The demo clock is 10 September 2026, 08:00 UTC. Enter new times in UTC; they also appear on the booking screens.">
      <Workspace mentor>
        <div className="dm-product-stack">
          <header><span className="dm-product-eyebrow">Mentor workspace</span><h1 className="dm-product-heading">Availability and prices</h1><p className="dm-product-muted">Set your prices and the times you are available for text sessions.</p></header>
          <div className="dm-product-grid">
            <Card className="dm-product-panel"><div><h2 className="dm-product-title">Session prices (PLN)</h2><p className="dm-fact-chips" role="group" aria-label="Allowed session prices"><Badge variant="outline">25 min: PLN 90 to 600</Badge><Badge variant="outline">50 min: PLN 180 to 1,200</Badge></p></div><CrudForm key={`${prices[25]}-${prices[50]}`} schema={priceSchema} fields={[{ name: 'price25', label: '25-minute price (PLN)', type: 'number', required: true }, { name: 'price50', label: '50-minute price (PLN)', type: 'number', required: true }]} initialValues={{ price25: prices[25], price50: prices[50] }} endpoint={endpoint} submitLabel="Save session prices" onSuccess={data => { const values = priceSchema.parse(data); onPricesChange({ 25: values.price25, 50: values.price50 }); setSavedPrices(true); }} />{savedPrices && <p role="status" className="dm-product-callout">Your prices are saved. The public profile and booking summary now use them.</p>}</Card>
            <Card className="dm-product-panel"><div><h2 className="dm-product-title">Add an available time</h2><p className="dm-product-muted">Enter the start time in UTC. Visitors see it in their selected timezone on your public profile.</p></div><CrudForm key={addedSlots.length} schema={slotSchema} fields={[{ name: 'startsAt', label: 'Session starts at (UTC)', type: 'datetime-local', required: true }]} initialValues={{ startsAt: nextSlotValue }} endpoint={endpoint} submitLabel="Publish available time" onSuccess={data => { const values = slotSchema.parse(data); const value = `${values.startsAt}:00Z`; setAddedSlots(current => [...current, value]); setLastAdded(value); onSlotAdded(value); }} />{lastAdded && <p role="status" className="dm-product-callout">Published: {slotLabel(lastAdded, 'UTC')} UTC. This time is available on your profile.</p>}</Card>
          </div>
          <Card className="dm-product-panel"><div><h2 className="dm-product-title">Your published times</h2><p className="dm-product-muted">Times shown in {timeZone}. A booked session cannot be removed here.</p></div><DataTable caption="Mentor availability" columns={[{ key: 'startsAt', header: 'Session time', render: row => <time dateTime={row.startsAt}>{slotLabel(row.startsAt, timeZone)}</time> }, { key: 'status', header: 'Status', render: row => <Badge variant={row.status === 'Booked' ? 'default' : 'outline'}>{row.status}</Badge> }]} rows={availabilityRows} getRowId={row => row.id} rowActions={row => row.status === 'Booked' ? <div className="dm-product-stack"><Button intent="error" appearance="ghost" size="xs" disabled aria-describedby="occupied-slot-removal-reason">Remove time</Button><p id="occupied-slot-removal-reason" className="dm-product-caption">{row.reason || 'This time has a confirmed booking.'}</p></div> : <span className="dm-product-caption">{row.reason || 'Ready to book'}</span>} /></Card>
          <div className="dm-product-actions"><Button onClick={() => navigate('s1')}>View your public profile</Button><Button intent="neutral" appearance="stroke" onClick={() => navigate('s3')}>Check available times</Button></div>
        </div>
      </Workspace>
    </Screen>

    <Screen id="s15" title="15. Your approved private note" description="You can return to the approved note and written answer after your session. The note stays private." refs={['#29']}>
      <Workspace>
        <div className="dm-product-stack"><NoteReview title={noteTitle} version={noteVersion} state="approved" body={<p>{noteBody}</p>} author={mentor} updatedLabel="Approved by Jordan Lee" actions={<><Button onClick={() => navigate('s6')}>Back to your sessions</Button><Button intent="neutral" appearance="stroke" onClick={() => navigate('s8')}>Read the written answer</Button></>} /><VersionHistory versions={versions} /></div>
      </Workspace>
    </Screen>

    <Screen id="s18" title="18. Review your mentor" description="A mentee can leave one rating and review after completing their session." refs={['Mentor reviews']} note="Reviews work locally in this demo. Finish the sample text session to submit one review. Viewing the public work sample does not make you eligible to review. Reloading the page resets submitted reviews but keeps reviewer annotations.">
      <Workspace><div className="proto-mentor-review-page">
        {submittedReview ? <div className="dm-product-stack"><header role="status"><h1 className="dm-product-heading">Your review is saved</h1><p className="dm-product-muted">You can now read it on Alex&apos;s profile.</p></header><Card className="dm-product-panel"><MentorReviews reviews={[submittedReview]} title="Your review" /></Card><div className="dm-product-actions"><Button onClick={() => navigate('s1')}>View Alex&apos;s profile</Button><Button intent="neutral" appearance="stroke" onClick={() => navigate('s6')}>Back to your sessions</Button></div></div>
          : sessionEnded ? <div className="dm-product-stack"><Card className="dm-product-panel"><MentorReviewForm mentorName={mentor} onSubmit={onReviewSubmit} /></Card><Button intent="neutral" appearance="ghost" onClick={() => navigate('s8')}>Back to the written answer</Button></div>
            : <EmptyState title="Complete your session to leave a review" description="Finish your text session with Alex before sharing your rating and review." action={<Button onClick={() => navigate('s7')}>Open your text session</Button>} />}
      </div></Workspace>
    </Screen>

    <Screen id="s16" title="16. Recover from restricted access" description="The page explains why access is restricted and links to the public mentor profile." refs={['#14']}>
      <Workspace><AccessStatus state="forbidden" actions={<Button onClick={() => navigate('s1')}>Go to the public mentor profile</Button>} /></Workspace>
    </Screen>
  </>;
}
