import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Copy, ExternalLink, Link2, Mail, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger, Badge, Button, Card, ConnectStatus, MentorOnboarding, MentorProfileEditor } from '@devmentor/ui';
import { apiCall, CrudForm, DataTable, EmptyState, ErrorMessage } from '@devmentor/ui/backend';
import { PublicPage, Screen, Workspace } from './Frame';
import { useAuth } from './auth-context';
import { dateLabel, DEMO_NOW, timeLabel, type Slot } from './flow';
import type { ConnectStatus as ConnectState, InvitationMode, MentorProfile } from './mentor-model';
import { mentorDemo, MENTOR_ENDPOINT, type MentorAction } from './mentor-runtime';
import { navigate } from './navigation';
import './mentor-flow.css';

const priceSchema = z.object({
  '25': z.number('Set your 25-minute price.').int('Use a whole PLN amount.').min(90, 'The minimum for 25 minutes is PLN 90.').max(600, 'The maximum for 25 minutes is PLN 600.'),
  '50': z.number('Set your 50-minute price.').int('Use a whole PLN amount.').min(180, 'The minimum for 50 minutes is PLN 180.').max(1200, 'The maximum for 50 minutes is PLN 1,200.'),
});
const slotSchema = z.object({ startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Choose a date and time.').refine(value => Date.parse(`${value}:00Z`) >= DEMO_NOW + 7_200_000, 'Choose 10 September 2026 at 10:00 UTC or later.') }).transform(value => ({ startsAt: `${value.startsAt}:00Z` }));

function useMentorRequest() {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  async function request(action: MentorAction, body: unknown = {}) {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await apiCall(`${MENTOR_ENDPOINT}/${action}`, { body });
      if (!result.ok) setError(result.error.fieldErrors ? [...new Set(Object.values(result.error.fieldErrors).flat())].join(' ') : result.error.message);
      return result.ok;
    } finally { pending.current = false; setBusy(false); }
  }
  return { busy, error, request };
}

export function MentorDemoControls({ mode, onModeChange, failNext, onFailChange }: { mode: InvitationMode; onModeChange: (value: InvitationMode) => void; failNext: boolean; onFailChange: (value: boolean) => void }) {
  return <aside className="proto-auth-controls" aria-label="Mentor demo controls">
    <div><h2>Mentor demo controls</h2><p>Review invitation and save failures with fictional data. Reload resets profiles, prices, times and payout states.</p></div>
    <div className="proto-auth-control-grid"><label>Invitation link<select value={mode} onChange={event => onModeChange(event.target.value as InvitationMode)}><option value="valid">Valid</option><option value="expired">Expired</option><option value="invalid">Unknown</option><option value="used">Already used</option></select></label><label className="proto-demo-checkbox"><input type="checkbox" checked={failNext} onChange={event => onFailChange(event.target.checked)}/>Fail the next mentor request</label></div>
    <Button intent="neutral" appearance="stroke" onClick={() => navigate('s26')}>Open invitation</Button>
  </aside>;
}

function InvitationContent({ mode }: { mode: InvitationMode }) {
  const auth = useAuth()!;
  const { busy, error, request } = useMentorRequest();
  const invitation = mentorDemo.getInvitation(mode);
  const [accepted, setAccepted] = useState(false);
  return <PublicPage><div className="proto-invitation-layout">
    <div className="proto-invitation-intro"><span className="proto-eyebrow">An invitation to mentor</span><h1>Mentor developers<br/>through text sessions.</h1><p>DevMentor sessions happen in text. You set your prices and choose when you are available.</p><div className="dm-fact-chips"><Badge variant="outline">25 or 50 minutes</Badge><Badge variant="outline">Written answer included</Badge></div><div className="proto-invitation-detail"><CalendarDays aria-hidden="true"/><p>After accepting, publish your first bookable session within two weeks. Your mentor workspace shows the exact date.</p></div></div>
    <Card className="dm-product-panel proto-invitation-card"><Mail aria-hidden="true"/><div><h2>{accepted ? 'Your mentor access is ready' : invitation.title}</h2><p>{accepted ? 'Your existing account now includes the mentor role.' : invitation.message}</p></div>
      {error && <ErrorMessage message={error}/>}
      {accepted ? <Button onClick={() => navigate('s11')}>Set up my mentor profile<ArrowRight aria-hidden="true"/></Button> : invitation.canAccept ? <>
        {auth.user ? <><p className="dm-product-caption">Accepting as {auth.user.email}</p><Button disabled={busy} onClick={async () => { if (await request('accept', { mode })) { setAccepted(true); navigate('s11'); } }}>{busy ? 'Accepting invitation…' : 'Accept invitation'}<ArrowRight aria-hidden="true"/></Button></> : <><p>Sign in or create a developer account, then return here to accept the invitation.</p><Button onClick={() => navigate('s12')}>Sign in to accept<ArrowRight aria-hidden="true"/></Button></>}
        <p className="dm-product-caption">Mentor access is by invitation. Creating an account alone does not grant this role.</p>
      </> : <><p>Ask the person who invited you for a new link. If you already accepted, sign in to open your mentor workspace.</p><Button intent="neutral" appearance="stroke" onClick={() => navigate(auth.user?.roles.includes('mentor') ? 's11' : 's12')}>{auth.user?.roles.includes('mentor') ? 'Open mentor workspace' : 'Sign in'}</Button></>}
    </Card>
  </div></PublicPage>;
}

function RemoveTime({ slot }: { slot: Slot }) {
  const booked = slot.blockedReason === 'Booked' || slot.blockedReason === 'Already booked';
  const [open, setOpen] = useState(false);
  const { busy, error, request } = useMentorRequest();
  return <AlertDialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><AlertDialogTrigger asChild><Button intent={booked ? 'neutral' : 'error'} appearance="ghost" size="sm">{booked ? 'Cancellation options' : 'Remove time'}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogTitle>{booked ? 'This time has a booking' : 'Remove this available time?'}</AlertDialogTitle><AlertDialogDescription>{booked ? 'Removing availability cannot cancel a paid session. Contact the DevMentor founders to arrange cancellation; the booking and its price stay unchanged.' : `${dateLabel(slot.start, 'UTC')}, ${timeLabel(slot.start, 'UTC')} UTC will disappear from your public profile. You can publish it again later.`}</AlertDialogDescription>{error && <ErrorMessage message={error}/>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>{booked ? 'Close' : 'Keep time'}</AlertDialogCancel>{!booked && <AlertDialogAction disabled={busy} onClick={async event => { event.preventDefault(); if (await request('remove-slot', { id: slot.id })) {setOpen(false);requestAnimationFrame(()=>document.getElementById('mentor-availability-heading')?.focus());} }}>{busy ? 'Removing…' : 'Remove time'}</AlertDialogAction>}</AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function MentorHome({ profile, onPreview }: { profile: MentorProfile; onPreview: (id: string) => void }) {
  const [pricesSaved, setPricesSaved] = useState(false);
  const [slotSaved, setSlotSaved] = useState(false);
  const hasPrices = profile.prices[25] !== null && profile.prices[50] !== null;
  const openSlots = profile.slots.filter(slot => !slot.blockedReason && Date.parse(slot.start) >= DEMO_NOW + 7_200_000);
  const complete = profile.published && hasPrices && openSlots.length > 0;
  return <Workspace mentor><div className="proto-mentor-stack">
    <header className="proto-mentor-heading"><div><span className="proto-eyebrow">Mentor workspace</span><h1>{complete ? 'Your mentor workspace' : 'Get ready for your first session'}</h1><p>{complete ? 'Manage your public profile, session prices and availability.' : 'Complete your profile, set both prices and publish a time so a mentee can book you.'}</p></div><Button intent="neutral" appearance="stroke" onClick={() => navigate('s27')}>Edit profile</Button></header>
    <MentorOnboarding dueDateLabel={profile.publishDueAt ? dateLabel(profile.publishDueAt, 'UTC') : undefined} steps={[
      { id: 'profile', title: 'Publish your mentor profile', description: 'Add your public work, a description and your technologies.', complete: profile.published, action: <Button intent="neutral" appearance="stroke" size="sm" onClick={() => navigate('s27')}>{profile.published ? 'Edit profile' : 'Complete profile'}</Button> },
      { id: 'prices', title: 'Set your session prices', description: 'Choose a price for 25 minutes and 50 minutes.', complete: hasPrices, action: <a href="#mentor-prices" className="proto-inline-link" onClick={event => { event.preventDefault(); document.getElementById('mentor-prices')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.querySelector<HTMLInputElement>('#mentor-prices input')?.focus({ preventScroll: true }); }}>Set prices</a> },
      { id: 'time', title: 'Publish an available time', description: 'Choose a start at least two hours after the demo clock.', complete: openSlots.length > 0, action: <a href="#mentor-time" className="proto-inline-link" onClick={event => { event.preventDefault(); document.getElementById('mentor-time')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.querySelector<HTMLInputElement>('#mentor-time input')?.focus({ preventScroll: true }); }}>Add time</a> },
    ]}/>
    <div className="proto-mentor-form-grid">
      <Card className="dm-product-panel" id="mentor-prices"><div><h2>Session prices</h2><p className="dm-product-muted">Both prices are required before anyone can book.</p></div><div className="dm-fact-chips" aria-label="Allowed session prices"><Badge variant="outline">25 min: PLN 90–600</Badge><Badge variant="outline">50 min: PLN 180–1,200</Badge></div><CrudForm key={`${profile.ownerId}-${profile.prices[25]}-${profile.prices[50]}`} schema={priceSchema} fields={[{ name: '25', label: '25-minute price (PLN)', type: 'number', required: true }, { name: '50', label: '50-minute price (PLN)', type: 'number', required: true }]} initialValues={profile.prices} endpoint={`${MENTOR_ENDPOINT}/prices`} submitLabel="Save session prices" onSuccess={() => setPricesSaved(true)}/>{pricesSaved && <p role="status" className="dm-product-callout">Prices saved. Existing bookings keep their original price.</p>}</Card>
      <Card className="dm-product-panel" id="mentor-time"><div><h2>Add an available time</h2><p className="dm-product-muted">Enter the start in UTC. Mentees see it in their chosen timezone.</p></div><CrudForm key={`${profile.ownerId}-${profile.slots.length}`} schema={slotSchema} fields={[{ name: 'startsAt', label: 'Session starts at (UTC)', type: 'datetime-local', required: true, description: 'Demo clock: 10 September 2026, 08:00 UTC. Choose 10:00 UTC or later.' }]} endpoint={`${MENTOR_ENDPOINT}/add-slot`} submitLabel="Publish available time" onSuccess={() => setSlotSaved(true)}/>{slotSaved && <p role="status" className="dm-product-callout">Time saved.{!profile.published || !hasPrices ? ' It becomes bookable when your profile is published and both prices are set.' : ' Mentees can now choose it.'}</p>}</Card>
    </div>
    <Card className="dm-product-panel"><div><h2 id="mentor-availability-heading" tabIndex={-1}>Your available times</h2><p className="dm-product-muted">All times below are in UTC. Paid bookings stay reserved.</p></div>{profile.slots.length ? <DataTable caption="Mentor availability" columns={[{ key: 'start', header: 'Start (UTC)', render: row => <time dateTime={row.start}>{dateLabel(row.start, 'UTC')}, {timeLabel(row.start, 'UTC')}</time> }, { key: 'blockedReason', header: 'Status', render: row => <Badge variant="outline">{row.blockedReason ?? 'Open'}</Badge> }]} rows={profile.slots} getRowId={row => row.id} rowActions={row => <RemoveTime slot={row}/>}/> : <EmptyState title="No times published" description="Add a time above. You can remove it until a mentee books it."/>}</Card>
    <Card className="dm-product-panel proto-mentor-footer-card"><div><h2>{complete ? 'Your profile is ready to share' : 'Your public profile'}</h2><p className="dm-product-muted">{profile.published ? 'Check what mentees see, including your current prices and availability.' : 'Publish your profile before sharing it with mentees.'}</p></div><div className="dm-form-actions"><Button intent="neutral" appearance="stroke" onClick={() => navigate('s28')}>Payout settings</Button><Button onClick={() => onPreview(profile.ownerId)}>View public profile<ArrowRight aria-hidden="true"/></Button></div></Card>
  </div></Workspace>;
}

function ProfileEditorContent({ profile, onPreview }: { profile: MentorProfile; onPreview: (id: string) => void }) {
  const { busy, error, request } = useMentorRequest();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const shareUrl = new URL(location.pathname, location.origin);
  shareUrl.searchParams.set('mentor', profile.ownerId); shareUrl.hash = 's1';
  return <Workspace mentor><div className="proto-mentor-stack"><header className="proto-mentor-heading"><div><span className="proto-eyebrow">Your public profile</span><h1>Show mentees how you can help</h1><p>Describe your work and the problems you know well. Your public work gives mentees an example to look at.</p></div><Badge variant="outline">{profile.published ? 'Published' : 'Draft'}</Badge></header>
    <div className="proto-mentor-editor-grid"><Card className="dm-product-panel"><div onChange={() => {setDirty(true);setSaved(false);}}><MentorProfileEditor key={`${profile.ownerId}-${formRevision}`} initialValues={profile} endpoint={`${MENTOR_ENDPOINT}/profile`} onSaved={() => { setSaved(true); setDirty(false); setCopyState('idle'); }} onSubmittingChange={setSaving} onCancel={() => {setFormRevision(value=>value+1);setDirty(false);setSaved(false);navigate('s11');}}/></div>{saved && <p role="status" className="dm-product-callout">Profile saved.{profile.published ? ' Your public page is updated.' : ' Publish it when you are ready.'}</p>}</Card>
    <aside className="proto-stack"><Card className="dm-product-panel"><Link2 aria-hidden="true"/><h2>{profile.published ? 'Share your profile' : 'Publish when you are ready'}</h2><p className="dm-product-muted">{profile.published ? 'This link identifies the local preview. Custom profiles last until this page reloads. The production page will use a permanent public link.' : 'Your profile stays private until you publish it. A public-work link, description and at least one technology are required.'}</p>{error && <ErrorMessage message={error}/>}<div className="proto-stack">{dirty && <p role="status">Save your changes before publishing or previewing the saved page.</p>}{!profile.published && <Button disabled={busy || saving || dirty} onClick={() => void request('publish')}>{busy ? 'Publishing…' : 'Publish profile'}</Button>}<Button intent="neutral" appearance="stroke" disabled={busy || saving} onClick={() => onPreview(profile.ownerId)}>Preview public page<ExternalLink aria-hidden="true"/></Button>{profile.published && <><label className="dm-field">Local preview link<input className="dm-input" readOnly value={shareUrl.href} onFocus={event => event.currentTarget.select()}/></label><Button intent="neutral" appearance="stroke" onClick={async () => { try { await navigator.clipboard.writeText(shareUrl.href); setCopyState('copied'); } catch { setCopyState('failed'); } }}><Copy aria-hidden="true"/>Copy profile link</Button>{copyState === 'copied' && <p role="status">Link copied.</p>}{copyState === 'failed' && <ErrorMessage message="The link could not be copied. Select the link above and copy it manually."/>}</>}</div></Card><p className="dm-product-caption">Session prices and availability are managed from your mentor workspace.</p></aside></div>
  </div></Workspace>;
}

function PayoutContent({ profile }: { profile: MentorProfile }) {
  const { busy, error, request } = useMentorRequest();
  return <Workspace mentor><div className="proto-mentor-stack proto-payouts"><header className="proto-mentor-heading"><div><span className="proto-eyebrow">Payout settings</span><h1>Set up your payouts</h1><p>Stripe handles your payout account details. DevMentor shows whether setup is complete and what needs attention.</p></div></header>
    <ConnectStatus state={profile.connect} actions={<>{profile.connect !== 'enabled' && <Button onClick={() => navigate('s29')}>{profile.connect === 'incomplete' ? 'Set up payouts' : profile.connect === 'restricted' ? 'Complete account requirements' : 'Continue setup'}<ExternalLink aria-hidden="true"/></Button>}<Button intent="neutral" appearance="stroke" disabled={busy} onClick={() => void request('connect', { state: profile.connect })}>{busy ? 'Checking…' : 'Refresh payout status'}</Button></>}/>
    {error && <ErrorMessage message={error}/>}
    {profile.connect === 'incomplete' || profile.connect === 'restricted' ? <Card className="dm-product-panel"><h2>What needs your attention</h2><p>{profile.connect === 'incomplete' ? 'Finish the account details requested in Stripe. Payouts remain on hold until Stripe confirms your account is eligible.' : 'Stripe needs updated identity information. Open the account requirements to review the request and submit it securely in Stripe.'}</p><p className="dm-product-caption">Do not send identity or bank details in a DevMentor message.</p></Card> : <p role="status" className="dm-product-callout">{profile.connect === 'pending' ? 'No action is required while Stripe reviews your information. Refresh the status when you return.' : 'Your payout setup is complete. This status does not confirm that any transfer has been sent.'}</p>}
    <Card className="dm-product-panel"><ShieldCheck aria-hidden="true"/><h2>Your payout information is private</h2><p>Only you and the DevMentor operators can see your payout status. It is not shown on your public mentor profile.</p></Card><div className="dm-form-actions"><Button intent="neutral" appearance="ghost" onClick={() => navigate('s11')}><ArrowLeft aria-hidden="true"/>Back to mentor workspace</Button></div>
  </div></Workspace>;
}

function StripePreview() {
  const { busy, error, request } = useMentorRequest();
  const [state, setState] = useState<ConnectState>('enabled');
  return <Workspace mentor><div className="proto-mentor-stack proto-payouts"><header><span className="proto-eyebrow">Local Stripe simulation</span><h1 className="proto-title">Preview the return from Stripe</h1><p>This step represents Stripe&apos;s hosted onboarding. No financial details are collected and Stripe is not contacted.</p></header><Card className="dm-product-panel proto-simulation"><h2>Choose a demo account status</h2><label className="dm-field">Return status<select className="dm-input" value={state} onChange={event => setState(event.target.value as ConnectState)}><option value="enabled">Complete: payouts enabled</option><option value="pending">Submitted: under review</option><option value="incomplete">Setup not completed</option><option value="restricted">More information needed</option></select></label>{error && <ErrorMessage message={error}/>}<div className="dm-form-actions"><Button intent="neutral" appearance="ghost" disabled={busy} onClick={() => navigate('s28')}>Cancel and return</Button><Button disabled={busy} onClick={async () => { if (await request('connect', { state })) navigate('s28'); }}>{busy ? 'Checking status…' : 'Return to DevMentor'}<ArrowRight aria-hidden="true"/></Button></div></Card></div></Workspace>;
}

export function MentorScreens({ profile, invitationMode, onPreview }: { profile: MentorProfile | null; invitationMode: InvitationMode; onPreview: (id: string) => void }) {
  const auth=useAuth();
  return <>
    <Screen id="s26" title="Mentor invitation" description="Accept an invitation after sign-in, or recover from an expired, unknown or used link." refs={['E02', '#15']} note="The demo invitation has no real recipient or token. Acceptance only adds the mentor role to the current fictional account."><InvitationContent key={`${invitationMode}-${auth?.user?.id}`} mode={invitationMode}/></Screen>
    <Screen id="s11" title="Mentor workspace" description="Complete your profile, set prices and manage the times mentees can book." refs={['E02', '#15', '#17', '#18']} note="Prices are sample operator settings in PLN. Dates use the fixed demo clock. Saves and cancellations are local simulations.">{profile && <MentorHome key={profile.ownerId} profile={profile} onPreview={onPreview}/>}</Screen>
    <Screen id="s27" title="Edit mentor profile" description="Save your public work and technologies, publish the page and copy its link." refs={['E02', '#16']}><>{profile && <ProfileEditorContent key={profile.ownerId} profile={profile} onPreview={onPreview}/>}</></Screen>
    <Screen id="s28" title="Payout settings" description="Review incomplete, pending, enabled or restricted payout setup and recover from failed requests." refs={['E02', '#19']} note="Stripe Connect is planned for production iteration 1.1. These screens define its UI; real onboarding, transfers and webhook processing are not implemented.">{profile && <PayoutContent key={profile.ownerId} profile={profile}/>}</Screen>
    <Screen id="s29" title="Stripe response preview" description="Simulate a return from hosted onboarding without using real financial information." refs={['E02', '#19']}><StripePreview/></Screen>
  </>;
}
