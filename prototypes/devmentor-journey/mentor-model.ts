import { z } from 'zod';
import type { DemoUser } from './auth-model';
import { DEMO_NOW, INITIAL_SLOTS, type Slot } from './flow';

export const MENTOR_STACKS = ['TypeScript', 'React', 'Python', 'AI agents'] as const;
export type InvitationMode = 'valid' | 'expired' | 'invalid' | 'used';
export type ConnectStatus = 'incomplete' | 'pending' | 'enabled' | 'restricted';
export type MentorProfile = {
  ownerId: string;
  displayName: string;
  description: string;
  publicWorkUrl: string;
  stacks: string[];
  published: boolean;
  prices: { 25: number | null; 50: number | null };
  slots: Slot[];
  connect: ConnectStatus;
  acceptedAt: string | null;
  publishDueAt: string | null;
};
export type MentorResult =
  | { ok: true; data: MentorProfile }
  | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };
export type MentorProfileInput = Pick<MentorProfile, 'displayName' | 'description' | 'publicWorkUrl' | 'stacks'>;

export const mentorProfileSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter your name.').max(120, 'Use 120 characters or fewer.'),
  description: z.string().trim().min(1, 'Describe the work you can help with.').max(2000, 'Use 2,000 characters or fewer.'),
  publicWorkUrl: z.string().trim().url('Enter a complete link to your public work.')
    .refine(value => /^https?:\/\//i.test(value), 'Use an http or https link.'),
  stacks: z.array(z.enum(MENTOR_STACKS, 'Choose one of the available technologies.'))
    .min(1, 'Choose at least one technology.').transform(values => [...new Set(values)]),
});
export const mentorPricesSchema = z.object({
  25: z.number('Set your 25-minute price.').int('Use a whole PLN amount.').min(90, 'The minimum for 25 minutes is PLN 90.').max(600, 'The maximum for 25 minutes is PLN 600.'),
  50: z.number('Set your 50-minute price.').int('Use a whole PLN amount.').min(180, 'The minimum for 50 minutes is PLN 180.').max(1200, 'The maximum for 50 minutes is PLN 1,200.'),
});
const slotSchema = z.string().datetime({ offset: true, message: 'Choose a valid date and time.' })
  .refine(value => Date.parse(value) >= DEMO_NOW + 2 * 60 * 60_000, 'Choose a time at least two hours ahead.');
const connectSchema = z.enum(['incomplete', 'pending', 'enabled', 'restricted']);

const clone = (profile: MentorProfile): MentorProfile => ({
  ...profile, stacks: [...profile.stacks], prices: { ...profile.prices }, slots: profile.slots.map(slot => ({ ...slot })),
});
const success = (profile: MentorProfile): MentorResult => ({ ok: true, data: clone(profile) });
const failure = (code: string, message: string): MentorResult => ({ ok: false, error: { code, message } });
function validationFailure(error: z.ZodError): MentorResult {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, error: { code: 'validation_failed', message: 'Check the highlighted fields.', fieldErrors } };
}
function blankProfile(user: DemoUser): MentorProfile {
  return {
    ownerId: user.id, displayName: user.displayName, description: '', publicWorkUrl: '', stacks: [], published: false,
    prices: { 25: null, 50: null }, slots: [], connect: 'incomplete', acceptedAt: null, publishDueAt: null,
  };
}

/** Fictional, account-scoped UI transitions. This model makes no network or storage calls. */
export function createMentorDemo() {
  const profiles = new Map<string, MentorProfile>();
  let injectedFailure = false;
  let slotSequence = 0;
  let invitationUsed = false;

  function reset() {
    profiles.clear();
    injectedFailure = false;
    slotSequence = 0;
    invitationUsed = false;
    profiles.set('alex', {
      ownerId: 'alex', displayName: 'Alex Laurent',
      description: 'I help you simplify complex types, untangle React state and decide how your API should respond.',
      publicWorkUrl: 'https://github.com/alex-laurent', stacks: ['TypeScript', 'React'], published: true,
      prices: { 25: 180, 50: 320 }, connect: 'incomplete', acceptedAt: null, publishDueAt: null,
      slots: INITIAL_SLOTS.map(slot => slot.id === 'morning' ? { ...slot, blockedReason: 'Booked' } : { ...slot }),
    });
  }
  reset();

  function profileFor(user: DemoUser): MentorProfile {
    let profile = profiles.get(user.id);
    if (!profile) {
      profile = blankProfile(user);
      profiles.set(user.id, profile);
    }
    return profile;
  }

  function serviceFailure(): MentorResult | null {
    if (!injectedFailure) return null;
    injectedFailure = false;
    return failure('service_unavailable', 'We could not save this change. Your details are still here. Try again.');
  }

  function authorize(user: DemoUser | null): MentorResult | null {
    if (!user) return failure('unauthorized', 'Sign in to continue.');
    if (!user.roles.includes('mentor')) return failure('forbidden', 'You need a mentor account to change these details.');
    return serviceFailure();
  }

  return {
    getProfile(user: DemoUser): MentorProfile { return clone(profileFor(user)); },
    getPublic(ownerId: string): MentorProfile | null {
      const profile = profiles.get(ownerId);
      return profile?.published ? clone(profile) : null;
    },
    getInvitation(mode: InvitationMode) {
      if (mode === 'valid' && invitationUsed) mode = 'used';
      const content = {
        valid: { title: 'You are invited to mentor', message: 'Publish your page, set both session prices and add your first bookable time within 14 days of accepting.' },
        expired: { title: 'This invitation has expired', message: 'Ask the person who invited you for a new invitation.' },
        invalid: { title: 'We could not find this invitation', message: 'Check the complete link or ask for a new invitation.' },
        used: { title: 'This invitation has already been used', message: 'Sign in to the account that accepted it to open your mentor workspace.' },
      }[mode];
      return { mode, status: mode, canAccept: mode === 'valid', ...content, expiresAt: mode === 'valid' ? '2026-09-17T08:00:00.000Z' : null };
    },
    acceptInvitation(user: DemoUser | null, mode: InvitationMode): MentorResult {
      if (!user) return failure('unauthorized', 'Sign in to accept your invitation.');
      if (mode !== 'valid') return failure(`invitation_${mode}`, 'This invitation cannot be accepted. Ask for a new invitation.');
      const unavailable = serviceFailure();
      if (unavailable) return unavailable;
      if (invitationUsed) return failure('invitation_used', 'This invitation has already been accepted. Sign in to the account that accepted it.');
      const profile = profileFor(user);
      invitationUsed = true;
      profile.acceptedAt = new Date(DEMO_NOW).toISOString();
      profile.publishDueAt = new Date(DEMO_NOW + 14 * 86_400_000).toISOString();
      return success(profile);
    },
    saveProfile(user: DemoUser | null, input: unknown): MentorResult {
      const denied = authorize(user);
      if (denied) return denied;
      const parsed = mentorProfileSchema.safeParse(input);
      if (!parsed.success) return validationFailure(parsed.error);
      const profile = profileFor(user!);
      Object.assign(profile, parsed.data);
      return success(profile);
    },
    publishProfile(user: DemoUser | null): MentorResult {
      const denied = authorize(user);
      if (denied) return denied;
      const profile = profileFor(user!);
      const parsed = mentorProfileSchema.safeParse(profile);
      if (!parsed.success) return validationFailure(parsed.error);
      profile.published = true;
      return success(profile);
    },
    savePrices(user: DemoUser | null, input: unknown): MentorResult {
      const denied = authorize(user);
      if (denied) return denied;
      const parsed = mentorPricesSchema.safeParse(input);
      if (!parsed.success) return validationFailure(parsed.error);
      const profile = profileFor(user!);
      profile.prices = parsed.data;
      return success(profile);
    },
    addSlot(user: DemoUser | null, startISO: string): MentorResult {
      const denied = authorize(user);
      if (denied) return denied;
      const parsed = slotSchema.safeParse(startISO);
      if (!parsed.success) return { ok: false, error: { code: 'validation_failed', message: 'Check the start time.', fieldErrors: { startsAt: parsed.error.issues.map(issue => issue.message) } } };
      const profile = profileFor(user!);
      if (profile.slots.some(slot => Date.parse(slot.start) === Date.parse(startISO))) return failure('slot_conflict', 'You already have a session starting at this time.');
      profile.slots.push({ id: `mentor-slot-${++slotSequence}`, start: new Date(startISO).toISOString() });
      profile.slots.sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
      return success(profile);
    },
    removeSlot(user: DemoUser | null, id: string): MentorResult {
      const denied = authorize(user);
      if (denied) return denied;
      const profile = profileFor(user!);
      const slot = profile.slots.find(slot => slot.id === id);
      if (!slot) return failure('not_found', 'This time is no longer available. Refresh your availability.');
      if (slot.blockedReason === 'Booked') return failure('slot_booked', 'This time has a booking. Open the session to review cancellation options.');
      profile.slots = profile.slots.filter(slot => slot.id !== id);
      return success(profile);
    },
    // Called after the prototype checkout confirms a booking, never by the mentor form.
    bookSlot(ownerId: string, id: string): MentorResult {
      const unavailable = serviceFailure();
      if (unavailable) return unavailable;
      const profile = profiles.get(ownerId);
      if (!profile?.published) return failure('not_found', 'This mentor page is not published.');
      if (Object.values(profile.prices).includes(null)) return failure('prices_missing', 'This mentor has not set both session prices yet.');
      const slot = profile.slots.find(slot => slot.id === id);
      if (!slot) return failure('not_found', 'This time is no longer available. Choose another time.');
      if (slot.blockedReason) return failure('slot_unavailable', 'This time cannot be booked. Choose another time.');
      slot.blockedReason = 'Booked';
      return success(profile);
    },
    setConnect(user: DemoUser | null, status: ConnectStatus): MentorResult {
      const denied = authorize(user);
      if (denied) return denied;
      if (!connectSchema.safeParse(status).success) return failure('validation_failed', 'Choose a valid payout status.');
      const profile = profileFor(user!);
      profile.connect = status;
      return success(profile);
    },
    setFailure(value: boolean) { injectedFailure = value; },
    reset,
  };
}
