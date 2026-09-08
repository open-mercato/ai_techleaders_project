import { describe, expect, it } from 'vitest';
import {
  allowedScreen, createAuthDemo, DEMO_ACCOUNTS, DEMO_PASSWORD, homeFor,
  loginSchema, registrationSchema, safeDestination,
  type AuthDemoGithubOutcome, type AuthDemoResult, type DemoRole, type DemoUser,
} from './auth-model';

const registration = { displayName: 'Avery Doe', email: 'avery@example.test', password: DEMO_PASSWORD };
const login = { email: 'jordan@example.test', password: DEMO_PASSWORD };
function userOf(result: AuthDemoResult): DemoUser {
  if (!result.ok || !result.data.user) throw new Error('Expected a signed-in user');
  return result.data.user;
}

describe('prototype auth schemas', () => {
  it('normalizes names and email while retaining the password exactly', () => {
    expect(registrationSchema.parse({ ...registration, displayName: ' Avery Doe ', email: ' AVERY@example.test ', password: ' twelve chars ' }))
      .toEqual({ displayName: 'Avery Doe', email: 'avery@example.test', password: ' twelve chars ' });
  });

  it('enforces name, email, registration minimum and password byte boundaries', () => {
    for (const displayName of ['', '  ', 'n'.repeat(121)]) expect(registrationSchema.safeParse({ ...registration, displayName }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...registration, displayName: 'n'.repeat(120) }).success).toBe(true);
    expect(registrationSchema.safeParse({ ...registration, email: 'invalid' }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...registration, password: 'a'.repeat(11) }).success).toBe(false);
    for (const password of ['a'.repeat(12), 'a'.repeat(72), 'é'.repeat(36)]) expect(registrationSchema.safeParse({ ...registration, password }).success).toBe(true);
    for (const password of ['a'.repeat(73), 'é'.repeat(37)]) {
      expect(registrationSchema.safeParse({ ...registration, password }).success).toBe(false);
      expect(loginSchema.safeParse({ ...login, password }).success).toBe(false);
    }
    expect(loginSchema.safeParse({ ...login, password: 'short' }).success).toBe(true);
    expect(loginSchema.safeParse({ ...login, password: '' }).success).toBe(true);
  });
});

describe('prototype email auth', () => {
  it('returns field errors without creating pending registration or a session', () => {
    const demo = createAuthDemo();
    expect(demo.register({ displayName: '', email: 'not an email', password: 'short' })).toMatchObject({
      ok: false, error: { code: 'validation_failed', fieldErrors: { displayName: ['Enter your name.'], email: ['Enter a valid email address.'], password: ['Use at least 12 characters.'] } },
    });
    expect(demo.login({ email: 'bad', password: 'a'.repeat(73) })).toMatchObject({ ok: false, error: { code: 'validation_failed', fieldErrors: { email: expect.any(Array), password: expect.any(Array) } } });
    expect(demo.getSession()).toBeNull();
    expect(demo.getPendingEmail()).toBeNull();
  });

  it('uses the identical generic response for unknown email, wrong password and a GitHub-only account', () => {
    const demo = createAuthDemo();
    const unknown = demo.login({ ...login, email: 'unknown@example.test' });
    expect(unknown).toEqual({ ok: false, error: { code: 'unauthorized', message: 'Invalid credentials', state: 'invalid-credentials' } });
    expect(demo.login({ ...login, password: 'wrong' })).toEqual(unknown);
    expect(demo.login({ ...login, email: 'github@example.test' })).toEqual(unknown);
    expect(demo.getSession()).toBeNull();
  });

  it('preserves every fixture role on login and returns no credentials', () => {
    const demo = createAuthDemo();
    for (const account of DEMO_ACCOUNTS.filter(({ source }) => source === 'email')) {
      const user = userOf(demo.login({ email: account.email.toUpperCase(), password: DEMO_PASSWORD }));
      expect(user).toEqual({ id: account.id, displayName: account.displayName, email: account.email, roles: account.roles });
      expect(Object.keys(user).sort()).toEqual(['displayName', 'email', 'id', 'roles']);
      expect(JSON.stringify(user)).not.toContain(DEMO_PASSWORD);
      user.roles.push('operator');
      user.email = 'changed@example.test';
      expect(demo.getSession()?.roles).toEqual(account.roles);
      expect(demo.getSession()?.email).toBe(account.email);
    }
  });

  it('requires verification, then reuses the same verified link without creating duplicate accounts', () => {
    const demo = createAuthDemo();
    expect(demo.register(registration)).toEqual({ ok: true, data: { user: null, email: registration.email, notice: 'Check your inbox for a verification link.' } });
    expect(demo.getSession()).toBeNull();
    expect(demo.getPendingEmail()).toBe(registration.email);
    expect(demo.login(registration)).toMatchObject({ ok: false, error: { code: 'forbidden', state: 'unverified-email' } });
    expect(demo.getSession()).toBeNull();
    const user = userOf(demo.verify('valid'));
    expect(user).toMatchObject({ displayName: registration.displayName, email: registration.email, roles: ['mentee'] });
    expect(demo.verify('valid')).toEqual({ ok: true, data: { user } });
    demo.logout();
    expect(demo.getSession()).toBeNull();
    expect(userOf(demo.verify('valid'))).toEqual(user);
    expect(userOf(demo.login(registration))).toEqual(user);
  });

  it('retains pending registration for expired/invalid link recovery and rejects a missing link', () => {
    const demo = createAuthDemo();
    expect(demo.verify('valid')).toMatchObject({ ok: false, error: { state: 'verification-invalid' } });
    demo.register(registration);
    for (const mode of ['expired', 'invalid'] as const) {
      expect(demo.verify(mode)).toMatchObject({ ok: false, error: { state: `verification-${mode}` } });
      expect(demo.getSession()).toBeNull();
      expect(demo.getPendingEmail()).toBe(registration.email);
    }
    expect(demo.register(registration).ok).toBe(true);
    expect(demo.verify('valid').ok).toBe(true);
  });

  it('claims pending addresses on re-registration and makes only the newest password usable after verification', () => {
    const demo = createAuthDemo();
    const input = { ...registration, email: 'pending@example.test', password: 'first-demo-password' };
    expect(demo.register(input).ok).toBe(true);
    expect(demo.getSession()).toBeNull();
    expect(demo.register({ ...input, password: 'second-demo-password' }).ok).toBe(true);
    expect(userOf(demo.verify('valid')).id).toBe('pending');
    demo.logout();
    expect(demo.login(input)).toMatchObject({ ok: false, error: { state: 'invalid-credentials' } });
    expect(demo.login({ ...input, password: 'second-demo-password' }).ok).toBe(true);
  });

  it('distinguishes verified password and GitHub registration conflicts without replacing either account', () => {
    const demo = createAuthDemo();
    expect(demo.register({ ...registration, email: login.email })).toMatchObject({ ok: false, error: { code: 'conflict', state: 'account-exists' } });
    expect(demo.register({ ...registration, email: 'github@example.test' })).toMatchObject({ ok: false, error: { code: 'conflict', state: 'github-account' } });
    expect(demo.getSession()).toBeNull();
    expect(userOf(demo.login(login)).displayName).toBe('Jordan Lee');
  });

  it('keeps pending details when mail delivery fails and allows registration retry', () => {
    const demo = createAuthDemo();
    demo.setFailure('mail-unavailable');
    expect(demo.register(registration)).toMatchObject({ ok: false, error: { code: 'service_unavailable', state: 'mail-unavailable' } });
    expect(demo.getSession()).toBeNull();
    expect(demo.getPendingEmail()).toBe(registration.email);
    demo.setFailure('none');
    expect(demo.register(registration).ok).toBe(true);
    expect(demo.verify('valid').ok).toBe(true);
  });

  it.each(['rate-limited', 'service-unavailable'] as const)('models %s across auth operations without changing state', (state) => {
    const demo = createAuthDemo();
    demo.setFailure(state);
    for (const result of [demo.login(login), demo.register(registration), demo.verify('valid'), demo.github('new-github', 'success')]) {
      expect(result).toMatchObject({ ok: false, error: { state } });
    }
    expect(demo.getSession()).toBeNull();
    expect(demo.getPendingEmail()).toBeNull();
    demo.setFailure('none');
    expect(demo.login(login).ok).toBe(true);
  });
});

describe('prototype GitHub auth and session lifecycle', () => {
  it.each(['cancelled', 'state', 'unavailable', 'email', 'link'] satisfies AuthDemoGithubOutcome[])('recovers from GitHub %s without a new account or session', (outcome) => {
    const demo = createAuthDemo();
    expect(demo.github('new-github', outcome)).toMatchObject({ ok: false, error: { state: `github-${outcome}` } });
    expect(demo.getSession()).toBeNull();
    // Registering the provider address still succeeds because the failed callback created nothing.
    expect(demo.register({ ...registration, email: 'robin@example.test' }).ok).toBe(true);
  });

  it('creates a first-time GitHub mentee and reuses that identity on subsequent sign-in', () => {
    const demo = createAuthDemo();
    const first = userOf(demo.github('new-github', 'success'));
    expect(first).toMatchObject({ id: 'new-github', displayName: 'Robin Chen', roles: ['mentee'] });
    demo.logout();
    expect(userOf(demo.github('new-github', 'success'))).toEqual(first);
    expect(demo.register({ ...registration, email: first.email })).toMatchObject({ ok: false, error: { state: 'github-account' } });
  });

  it('preserves existing roles, refuses unknown identities and refuses unverified local links', () => {
    const demo = createAuthDemo();
    expect(demo.github('unknown', 'success')).toMatchObject({ ok: false, error: { state: 'github-state' } });
    expect(demo.github('pending', 'success')).toMatchObject({ ok: false, error: { state: 'github-link' } });
    expect(demo.getPendingEmail()).toBe('pending@example.test');
    expect(demo.getSession()).toBeNull();
    expect(userOf(demo.github('taylor', 'success')).roles).toEqual(['mentee', 'mentor']);
    demo.logout();
    expect(demo.verify('valid').ok).toBe(true);
    expect(demo.github('pending', 'success').ok).toBe(true);
  });

  it('links a first-time provider identity to an existing address only after local verification', () => {
    const demo = createAuthDemo();
    demo.register({ ...registration, email: 'robin@example.test' });
    expect(demo.github('new-github', 'success')).toMatchObject({ ok: false, error: { state: 'github-link' } });
    expect(demo.getSession()).toBeNull();
    const verified = userOf(demo.verify('valid'));
    demo.logout();
    expect(userOf(demo.github('new-github', 'success'))).toEqual(verified);
    expect(userOf(demo.github('new-github', 'success'))).toEqual(verified);
  });

  it('rechecks operator eligibility in both directions while retaining the mentor role', () => {
    const demo = createAuthDemo();
    expect(userOf(demo.github('sam', 'success')).roles).toEqual(['mentor', 'operator']);
    demo.setOperatorEligible(false);
    expect(demo.getSession()?.roles).toEqual(['mentor']);
    expect(allowedScreen(demo.getSession(), 's25')).toBe(false);
    expect(allowedScreen(demo.getSession(), 's11')).toBe(true);
    demo.setOperatorEligible(true);
    expect(demo.getSession()?.roles).toEqual(['mentor', 'operator']);
    expect(allowedScreen(demo.getSession(), 's25')).toBe(true);
    demo.setOperatorEligible(false);
    expect(userOf(demo.login({ ...login, email: 'sam@example.test' })).roles).toEqual(['mentor']);
  });

  it('expires and signs out sessions idempotently, then resets all fictional account changes', () => {
    const demo = createAuthDemo();
    demo.login(login);
    demo.expire();
    expect(demo.getSession()).toBeNull();
    demo.logout();
    demo.logout();
    expect(demo.getSession()).toBeNull();
    demo.register(registration);
    demo.verify('valid');
    demo.setOperatorEligible(false);
    demo.setFailure('rate-limited');
    demo.reset();
    expect(demo.getSession()).toBeNull();
    expect(demo.getPendingEmail()).toBeNull();
    expect(demo.login(registration)).toMatchObject({ ok: false, error: { state: 'invalid-credentials' } });
    expect(userOf(demo.github('sam', 'success')).roles).toEqual(['mentor', 'operator']);
  });
});

describe('prototype access and continuation', () => {
  const withRoles = (roles: DemoRole[]): DemoUser => ({ id: 'test', displayName: 'Demo User', email: 'demo@example.test', roles });

  it('prioritizes operator, mentor and mentee homes without losing additive access', () => {
    expect(homeFor(['mentee'])).toBe('s6');
    expect(homeFor(['mentee', 'mentor'])).toBe('s11');
    expect(homeFor(['operator', 'mentor'])).toBe('s24');
    expect(homeFor([])).toBe('s6');
    for (const screenId of ['s4', 's6', 's11', 's24', 's25']) expect(allowedScreen(withRoles(['mentee', 'mentor', 'operator']), screenId)).toBe(true);
  });

  it('guards each protected screen by its required role and keeps public screens public', () => {
    const menteeOnly = ['s4', 's5', 's13', 's14', 's18'];
    const shared = ['s6', 's7', 's8', 's9', 's10', 's15'];
    const mentorOnly = ['s11'];
    const operatorOnly = ['s24', 's25'];
    for (const screenId of [...menteeOnly, ...shared, ...mentorOnly, ...operatorOnly]) expect(allowedScreen(null, screenId)).toBe(false);
    for (const screenId of menteeOnly) {
      expect(allowedScreen(withRoles(['mentee']), screenId)).toBe(true);
      expect(allowedScreen(withRoles(['mentor']), screenId)).toBe(false);
    }
    for (const screenId of shared) {
      expect(allowedScreen(withRoles(['mentee']), screenId)).toBe(true);
      expect(allowedScreen(withRoles(['mentor']), screenId)).toBe(true);
      expect(allowedScreen(withRoles(['operator']), screenId)).toBe(false);
    }
    expect(allowedScreen(withRoles(['mentee']), 's11')).toBe(false);
    expect(allowedScreen(withRoles(['mentor']), 's24')).toBe(false);
    for (const screenId of ['s1', 's2', 's3', 's12', 's16', 's17', 's19', 's20', 's21', 's22', 's23']) expect(allowedScreen(null, screenId)).toBe(true);
    expect(allowedScreen(null, 's999')).toBe(false);
  });

  it('accepts only exact known, authorized screen IDs and falls back to a permitted destination', () => {
    const mentee = withRoles(['mentee']);
    expect(safeDestination(mentee, 's4')).toBe('s4');
    expect(safeDestination(mentee, 's19')).toBe('s19');
    for (const destination of [null, '', 's0', 's26', 's999', 's4?password=x', '#s4', ' s4', 'https://example.test', '//example.test', '/\\example.test', 's24']) {
      expect(safeDestination(mentee, destination)).toBe('s6');
    }
    expect(safeDestination(withRoles(['mentor']), 's4')).toBe('s11');
    expect(safeDestination(withRoles(['operator']), 's11')).toBe('s24');
    expect(safeDestination(withRoles([]), 's24')).toBe('s17');
  });
});
