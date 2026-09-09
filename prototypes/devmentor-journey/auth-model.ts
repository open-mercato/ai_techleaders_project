import { z } from 'zod';

export type DemoRole = 'mentee' | 'mentor' | 'operator';
export type DemoUser = { id: string; displayName: string; email: string; roles: DemoRole[] };
export type AuthDemoFailure = 'none' | 'rate-limited' | 'service-unavailable' | 'mail-unavailable';
export type AuthDemoGithubOutcome = 'success' | 'cancelled' | 'state' | 'unavailable' | 'email' | 'link';
export type AuthDemoState =
  | 'invalid-credentials' | 'unverified-email' | 'account-exists' | 'github-account'
  | 'verification-expired' | 'verification-invalid' | 'github-cancelled' | 'github-state'
  | 'github-unavailable' | 'github-email' | 'github-link'
  | Exclude<AuthDemoFailure, 'none'>;
export type AuthDemoResult =
  | { ok: true; data: { user: DemoUser | null; email?: string; notice?: string } }
  | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]>; state?: AuthDemoState } };

type DemoAccount = DemoUser & { name: string; source: 'email' | 'github' | 'pending' };
export const DEMO_PASSWORD = 'devmentor-demo';
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { id: 'jordan', name: 'Jordan Lee', displayName: 'Jordan Lee', email: 'jordan@example.test', roles: ['mentee'], source: 'email' },
  { id: 'alex', name: 'Alex Laurent', displayName: 'Alex Laurent', email: 'alex@example.test', roles: ['mentor'], source: 'email' },
  { id: 'taylor', name: 'Taylor Morgan', displayName: 'Taylor Morgan', email: 'taylor@example.test', roles: ['mentee', 'mentor'], source: 'email' },
  { id: 'sam', name: 'Sam Parker', displayName: 'Sam Parker', email: 'sam@example.test', roles: ['mentor', 'operator'], source: 'email' },
  { id: 'github-only', name: 'Casey Rivera', displayName: 'Casey Rivera', email: 'github@example.test', roles: ['mentee'], source: 'github' },
  { id: 'pending', name: 'Jamie Wilson', displayName: 'Jamie Wilson', email: 'pending@example.test', roles: ['mentee'], source: 'pending' },
  { id: 'new-github', name: 'Robin Chen', displayName: 'Robin Chen', email: 'robin@example.test', roles: ['mentee'], source: 'github' },
];

const emailSchema = z.string().trim().email('Enter a valid email address.').transform((email) => email.toLowerCase());
const passwordSchema = z.string().refine((value) => new TextEncoder().encode(value).length <= 72, 'Use a password of 72 bytes or fewer.');
export const loginSchema = z.object({ email: emailSchema, password: passwordSchema });
export const registrationSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter your name.').max(120, 'Use 120 characters or fewer.'),
  email: emailSchema,
  password: passwordSchema.refine((value) => value.length >= 12, 'Use at least 12 characters.'),
});

type AccountRecord = { user: DemoUser; password: string | null; verified: boolean };
const cloneUser = (user: DemoUser): DemoUser => ({ id: user.id, displayName: user.displayName, email: user.email, roles: [...user.roles] });
const failure = (code: string, message: string, state: AuthDemoState): AuthDemoResult => ({ ok: false, error: { code, message, state } });
const validationFailure = (error: z.ZodError): AuthDemoResult => {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const name = String(issue.path[0]);
    (fieldErrors[name] ??= []).push(issue.message);
  }
  return { ok: false, error: { code: 'validation_failed', message: 'Check the highlighted fields.', fieldErrors } };
};

/** Fictional UI state only. No cookies, storage, hashing, email or OAuth are involved. */
export function createAuthDemo() {
  let records: AccountRecord[] = [];
  let sessionId: string | null = null;
  let pendingId: string | null = null;
  let operatorEligible = true;
  let injectedFailure: AuthDemoFailure = 'none';

  function reset() {
    records = DEMO_ACCOUNTS.filter((account) => account.id !== 'new-github').map((account) => ({
      user: cloneUser(account), password: account.source === 'github' ? null : DEMO_PASSWORD, verified: account.source !== 'pending',
    }));
    sessionId = null;
    pendingId = null;
    operatorEligible = true;
    injectedFailure = 'none';
  }
  reset();

  function visibleUser(source: DemoUser): DemoUser {
    const user = cloneUser(source);
    if (user.id === 'sam') user.roles = operatorEligible ? ['mentor', 'operator'] : ['mentor'];
    return user;
  }

  function getSession(): DemoUser | null {
    const record = records.find(({ user }) => user.id === sessionId);
    return record ? visibleUser(record.user) : null;
  }

  function startSession(record: AccountRecord): AuthDemoResult {
    sessionId = record.user.id;
    return { ok: true, data: { user: getSession() } };
  }

  function serviceFailure(): AuthDemoResult | null {
    if (injectedFailure === 'rate-limited') return failure('rate_limited', 'Too many attempts. Wait a minute and try again.', 'rate-limited');
    if (injectedFailure === 'service-unavailable') return failure('service_unavailable', 'We could not sign you in right now. Please try again.', 'service-unavailable');
    return null;
  }

  return {
    login(input: z.input<typeof loginSchema>): AuthDemoResult {
      const parsed = loginSchema.safeParse(input);
      if (!parsed.success) return validationFailure(parsed.error);
      const unavailable = serviceFailure();
      if (unavailable) return unavailable;
      const record = records.find(({ user }) => user.email === parsed.data.email);
      if (!record || record.password !== parsed.data.password) return failure('unauthorized', 'Invalid credentials', 'invalid-credentials');
      if (!record.verified) {
        pendingId = record.user.id;
        return failure('forbidden', 'Verify your email address before signing in.', 'unverified-email');
      }
      return startSession(record);
    },

    register(input: z.input<typeof registrationSchema>): AuthDemoResult {
      const parsed = registrationSchema.safeParse(input);
      if (!parsed.success) return validationFailure(parsed.error);
      const unavailable = serviceFailure();
      if (unavailable) return unavailable;
      const { email, displayName, password } = parsed.data;
      let record = records.find(({ user }) => user.email === email);
      if (record?.verified) return record.password === null
        ? failure('conflict', 'This address uses GitHub sign-in. Continue with GitHub.', 'github-account')
        : failure('conflict', 'This address already has an account. Sign in to continue.', 'account-exists');
      if (record) {
        record.password = password;
        record.user.displayName = displayName;
      } else {
        record = { user: { id: `registered-${records.length}`, email, displayName, roles: ['mentee'] }, password, verified: false };
        records.push(record);
      }
      pendingId = record.user.id;
      if (injectedFailure === 'mail-unavailable') return failure('service_unavailable', 'We could not send the verification email. Please try again.', 'mail-unavailable');
      return { ok: true, data: { user: null, email, notice: 'Check your inbox for a verification link.' } };
    },

    verify(mode: 'valid' | 'expired' | 'invalid'): AuthDemoResult {
      const unavailable = serviceFailure();
      if (unavailable) return unavailable;
      if (mode === 'expired') return failure('unauthorized', 'This verification link has expired. Request a new link.', 'verification-expired');
      const record = records.find(({ user }) => user.id === pendingId);
      if (mode === 'invalid' || !record) return failure('unauthorized', 'This verification link is invalid. Request a new link.', 'verification-invalid');
      record.verified = true;
      return startSession(record);
    },

    github(accountId: string, outcome: AuthDemoGithubOutcome): AuthDemoResult {
      const unavailable = serviceFailure();
      if (unavailable) return unavailable;
      if (outcome === 'cancelled') return failure('unauthorized', 'Sign-in was cancelled. No account was created.', 'github-cancelled');
      if (outcome === 'state') return failure('unauthorized', 'We could not confirm this sign-in request. Try GitHub again.', 'github-state');
      if (outcome === 'unavailable') return failure('service_unavailable', 'GitHub sign-in is unavailable. Use email or try again later.', 'github-unavailable');
      if (outcome === 'email') return failure('forbidden', 'Verify your primary email on GitHub, then try again.', 'github-email');
      if (outcome === 'link') return failure('forbidden', 'Verify your DevMentor email address before linking GitHub.', 'github-link');
      let record = records.find(({ user }) => user.id === accountId);
      if (!record && accountId === 'new-github') {
        const identity = DEMO_ACCOUNTS.find((account) => account.id === 'new-github')!;
        record = records.find(({ user }) => user.email === identity.email);
        if (!record) {
          record = { user: cloneUser(identity), verified: true, password: null };
          records.push(record);
        }
      }
      if (!record) return failure('unauthorized', 'Choose a demo account to continue.', 'github-state');
      if (!record.verified) {
        pendingId = record.user.id;
        return failure('forbidden', 'Verify your DevMentor email address before linking GitHub.', 'github-link');
      }
      return startSession(record);
    },

    grantMentor(): AuthDemoResult {
      const record = records.find(({ user }) => user.id === sessionId);
      if (!record) return { ok: false, error: { code: 'unauthorized', message: 'Sign in to accept your invitation.' } };
      if (!record.user.roles.includes('mentor')) record.user.roles.push('mentor');
      return { ok: true, data: { user: getSession() } };
    },
    logout() { sessionId = null; },
    expire() { sessionId = null; },
    getSession,
    getUsers(): DemoUser[] { return records.map(record => visibleUser(record.user)); },
    getPendingEmail() { return records.find(({ user }) => user.id === pendingId)?.user.email ?? null; },
    setOperatorEligible(eligible: boolean) { operatorEligible = eligible; },
    setFailure(value: AuthDemoFailure) { injectedFailure = value; },
    reset,
  };
}

export function homeFor(roles: readonly DemoRole[]): 's24' | 's11' | 's6' {
  return roles.includes('operator') ? 's24' : roles.includes('mentor') ? 's11' : 's6';
}

const screenRoles: Record<string, readonly DemoRole[]> = {
  s4: ['mentee'], s5: ['mentee'], s13: ['mentee'], s14: ['mentee'], s18: ['mentee'],
  s6: ['mentee', 'mentor'], s7: ['mentee', 'mentor'], s8: ['mentee', 'mentor'],
  s9: ['mentee', 'mentor'], s10: ['mentee', 'mentor'], s15: ['mentee', 'mentor'],
  s11: ['mentor'], s24: ['operator'], s25: ['operator'], s27: ['mentor'], s28: ['mentor'], s29: ['mentor'],
};
const isKnownScreen = (screenId: string) => /^s([1-9]|1\d|2\d)$/.test(screenId);

export function allowedScreen(user: DemoUser | null, screenId: string): boolean {
  if (!isKnownScreen(screenId)) return false;
  const roles = screenRoles[screenId];
  return !roles || !!user?.roles.some((role) => roles.includes(role));
}

export function safeDestination(user: DemoUser, requested: string | null): string {
  if (requested && allowedScreen(user, requested)) return requested;
  const home = homeFor(user.roles);
  return allowedScreen(user, home) ? home : 's17';
}
