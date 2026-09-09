import { describe, expect, it } from 'vitest';
import { createAuthDemo, DEMO_ACCOUNTS, type DemoUser } from './auth-model';
import { DEMO_NOW, INITIAL_SLOTS } from './flow';
import {
  createMentorDemo, MENTOR_STACKS, mentorPricesSchema, mentorProfileSchema,
  type ConnectStatus, type MentorProfileInput, type MentorResult,
} from './mentor-model';

const alex: DemoUser = DEMO_ACCOUNTS.find(user => user.id === 'alex')!;
const taylor: DemoUser = DEMO_ACCOUNTS.find(user => user.id === 'taylor')!;
const jordan: DemoUser = DEMO_ACCOUNTS.find(user => user.id === 'jordan')!;
const profileInput: MentorProfileInput = {
  displayName: 'Taylor Morgan', description: 'I help developers debug React forms and test the fixes.',
  publicWorkUrl: 'https://github.com/example', stacks: ['React', 'TypeScript'],
};
const prices = { 25: 200, 50: 380 };
const start = '2026-09-12T12:00:00Z';
const expectCode = (result: MentorResult, code: string) => expect(result).toMatchObject({ ok: false, error: { code } });

describe('mentor profile validation', () => {
  it('normalizes copy, accepts HTTP(S) links and deduplicates allowed technology tags', () => {
    expect(mentorProfileSchema.parse({ ...profileInput, displayName: ' Taylor Morgan ', description: ' Description ', publicWorkUrl: ' https://example.test/work ', stacks: ['React', 'React', ...MENTOR_STACKS] }))
      .toEqual({ displayName: 'Taylor Morgan', description: 'Description', publicWorkUrl: 'https://example.test/work', stacks: ['React', ...MENTOR_STACKS.filter(stack => stack !== 'React')] });
    expect(mentorProfileSchema.safeParse({ ...profileInput, publicWorkUrl: 'http://example.test/work' }).success).toBe(true);
    expect(mentorProfileSchema.safeParse({ ...profileInput, publicWorkUrl: 'HTTPS://example.test/work' }).success).toBe(true);
  });

  it('validates required values, text bounds, link scheme and the technology allowlist', () => {
    for (const input of [
      null, {}, { ...profileInput, displayName: '' }, { ...profileInput, displayName: 'a'.repeat(121) },
      { ...profileInput, description: ' ' }, { ...profileInput, description: 'a'.repeat(2001) },
      { ...profileInput, publicWorkUrl: '' }, { ...profileInput, publicWorkUrl: 'example.test' },
      { ...profileInput, publicWorkUrl: 'javascript:alert(1)' }, { ...profileInput, publicWorkUrl: 'ftp://example.test' },
      { ...profileInput, stacks: [] }, { ...profileInput, stacks: ['Not a listed technology'] },
    ]) expect(mentorProfileSchema.safeParse(input).success).toBe(false);
    expect(mentorProfileSchema.safeParse({ ...profileInput, displayName: 'a'.repeat(120), description: 'a'.repeat(2000) }).success).toBe(true);
  });

  it('validates both price bounds, whole amounts and missing or non-number values', () => {
    for (const input of [{ 25: 90, 50: 180 }, { 25: 600, 50: 1200 }, prices]) expect(mentorPricesSchema.safeParse(input).success).toBe(true);
    for (const input of [
      null, {}, { 25: null, 50: null }, { 25: '200', 50: 380 },
      { ...prices, 25: 89 }, { ...prices, 25: 601 }, { ...prices, 25: 90.5 },
      { ...prices, 50: 179 }, { ...prices, 50: 1201 }, { ...prices, 50: 180.5 },
    ]) expect(mentorPricesSchema.safeParse(input).success).toBe(false);
  });
});

describe('account-scoped mentor prototype state', () => {
  it('starts Alex with a published fixture and a reserved session, while other accounts start empty', () => {
    const demo = createMentorDemo();
    expect(demo.getPublic('alex')).toMatchObject({ ownerId: 'alex', published: true, prices: { 25: 180, 50: 320 }, stacks: ['TypeScript', 'React'] });
    expect(demo.getProfile(alex).slots[1]).toMatchObject({ ...INITIAL_SLOTS[1], blockedReason: 'Booked' });
    expect(INITIAL_SLOTS[1]).not.toHaveProperty('blockedReason');
    expect(demo.getPublic('unknown')).toBeNull();
    expect(demo.getPublic('taylor')).toBeNull();
    expect(demo.getProfile(taylor)).toEqual({ ownerId: 'taylor', displayName: 'Taylor Morgan', description: '', publicWorkUrl: '', stacks: [], published: false, prices: { 25: null, 50: null }, slots: [], connect: 'incomplete', acceptedAt: null, publishDueAt: null });
    expect(demo.getPublic('taylor')).toBeNull();
  });

  it('returns defensive copies for private, public and mutation results', () => {
    const demo = createMentorDemo();
    const initial = demo.getProfile(alex);
    for (const copy of [demo.getProfile(alex), demo.getPublic('alex')!]) {
      copy.displayName = 'Changed';
      copy.stacks.push('Python');
      copy.prices[25] = 999;
      copy.slots[0].start = 'invalid';
      copy.slots.push({ id: 'fake', start });
    }
    expect(demo.getProfile(alex)).toEqual(initial);
    const result = demo.saveProfile(taylor, profileInput);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected profile save');
    result.data.stacks.push('Python');
    expect(demo.getProfile(taylor).stacks).toEqual(profileInput.stacks);
  });

  it('saves and publishes validated profile data without exposing a draft or another account', () => {
    const demo = createMentorDemo();
    expectCode(demo.publishProfile(taylor), 'validation_failed');
    expect(demo.getPublic('taylor')).toBeNull();
    expect(demo.saveProfile(taylor, { ...profileInput, ignored: 'removed' })).toMatchObject({ ok: true, data: { ...profileInput, published: false } });
    expect(demo.getPublic('taylor')).toBeNull();
    expect(demo.publishProfile(taylor)).toMatchObject({ ok: true, data: { published: true } });
    expect(demo.publishProfile(taylor).ok).toBe(true);
    expect(demo.getPublic('taylor')).toMatchObject(profileInput);
    expect(demo.getProfile(alex).displayName).toBe('Alex Laurent');
    expect(demo.saveProfile(taylor, { ...profileInput, displayName: 'Updated Taylor' }).ok).toBe(true);
    expect(demo.getPublic('taylor')?.displayName).toBe('Updated Taylor');
    expectCode(demo.saveProfile(taylor, { ...profileInput, publicWorkUrl: '' }), 'validation_failed');
    expect(demo.getPublic('taylor')?.displayName).toBe('Updated Taylor');
    expect(demo.saveProfile(taylor, null)).toMatchObject({ ok: false, error: { fieldErrors: { undefined: expect.any(Array) } } });
    expect(demo.saveProfile(taylor, { ...profileInput, publicWorkUrl: '' })).toMatchObject({ ok: false, error: { fieldErrors: { publicWorkUrl: ['Enter a complete link to your public work.', 'Use an http or https link.'] } } });
  });

  it('requires an authenticated mentor for every profile, price, availability and payout mutation', () => {
    const demo = createMentorDemo();
    for (const user of [null, jordan]) {
      for (const result of [
        demo.saveProfile(user, profileInput), demo.publishProfile(user), demo.savePrices(user, prices),
        demo.addSlot(user, start), demo.removeSlot(user, 'morning'), demo.setConnect(user, 'pending'),
      ]) expectCode(result, user ? 'forbidden' : 'unauthorized');
    }
    expect(demo.getPublic('jordan')).toBeNull();
    expect(demo.getProfile(jordan).slots).toEqual([]);
  });

  it('consumes service failure once before each mutation and lets the unchanged request retry', () => {
    const operations: ((demo: ReturnType<typeof createMentorDemo>) => MentorResult)[] = [
      demo => demo.acceptInvitation(jordan, 'valid'), demo => demo.saveProfile(alex, profileInput),
      demo => demo.publishProfile(alex), demo => demo.savePrices(alex, prices),
      demo => demo.addSlot(alex, start), demo => demo.removeSlot(alex, 'afternoon'),
      demo => demo.bookSlot('alex', 'afternoon'), demo => demo.setConnect(alex, 'enabled'),
    ];
    for (const mutate of operations) {
      const demo = createMentorDemo();
      const initial = demo.getProfile(alex);
      demo.setFailure(true);
      expectCode(mutate(demo), 'service_unavailable');
      expect(demo.getProfile(alex)).toEqual(initial);
      expect(mutate(demo).ok).toBe(true);
    }
    const demo = createMentorDemo();
    demo.setFailure(true);
    demo.setFailure(false);
    expect(demo.savePrices(alex, prices).ok).toBe(true);
  });

  it('resets the fixture, new profiles, accepted invitations, failure and slot numbering', () => {
    const demo = createMentorDemo();
    demo.acceptInvitation(jordan, 'valid');
    demo.saveProfile(taylor, profileInput);
    demo.publishProfile(taylor);
    demo.savePrices(alex, prices);
    demo.addSlot(alex, start);
    demo.setConnect(alex, 'enabled');
    demo.setFailure(true);
    demo.reset();
    expect(demo.getPublic('taylor')).toBeNull();
    expect(demo.getProfile(alex).prices).toEqual({ 25: 180, 50: 320 });
    expect(demo.getProfile(alex).connect).toBe('incomplete');
    expect(demo.acceptInvitation(jordan, 'valid').ok).toBe(true);
    const added = demo.addSlot(alex, start);
    expect(added).toMatchObject({ ok: true, data: { slots: expect.arrayContaining([{ id: 'mentor-slot-1', start: '2026-09-12T12:00:00.000Z' }]) } });
  });
});

describe('mentor invitation and additive access', () => {
  it('describes valid, expired, invalid and used links without accepting the unusable links', () => {
    const demo = createMentorDemo();
    expect(demo.getInvitation('valid')).toMatchObject({ mode: 'valid', status: 'valid', canAccept: true, expiresAt: '2026-09-17T08:00:00.000Z' });
    for (const mode of ['expired', 'invalid', 'used'] as const) {
      expect(demo.getInvitation(mode)).toMatchObject({ mode, canAccept: false, expiresAt: null });
      expectCode(demo.acceptInvitation(jordan, mode), `invitation_${mode}`);
    }
    expectCode(demo.acceptInvitation(null, 'valid'), 'unauthorized');
    expect(demo.getProfile(jordan).acceptedAt).toBeNull();
  });

  it('accepts the single invitation once with a 14-day deadline and adds mentor access through the auth session', () => {
    const demo = createMentorDemo();
    const auth = createAuthDemo();
    auth.github('jordan', 'success');
    const user = auth.getSession()!;
    expect(demo.acceptInvitation(user, 'valid')).toMatchObject({ ok: true, data: { acceptedAt: new Date(DEMO_NOW).toISOString(), publishDueAt: new Date(DEMO_NOW + 14 * 86_400_000).toISOString(), published: false } });
    expect(user.roles).toEqual(['mentee']);
    expect(auth.grantMentor()).toMatchObject({ ok: true, data: { user: { roles: ['mentee', 'mentor'] } } });
    expect(demo.saveProfile(auth.getSession(), profileInput).ok).toBe(true);
    expectCode(demo.acceptInvitation(auth.getSession(), 'valid'), 'invitation_used');
    expectCode(demo.acceptInvitation(taylor, 'valid'), 'invitation_used');
    expect(demo.getInvitation('valid')).toMatchObject({ mode: 'used', status: 'used', canAccept: false, expiresAt: null });
    expect(demo.getProfile(taylor).description).toBe('');
    expect(demo.getProfile(taylor).acceptedAt).toBeNull();
  });
});

describe('mentor prices, availability and payouts', () => {
  it('validates price changes atomically and leaves existing snapshots unchanged', () => {
    const demo = createMentorDemo();
    const confirmedPrice = demo.getProfile(alex).prices[25];
    expect(demo.savePrices(alex, prices)).toMatchObject({ ok: true, data: { prices } });
    expectCode(demo.savePrices(alex, { 25: 200, 50: null }), 'validation_failed');
    expect(demo.getPublic('alex')?.prices).toEqual(prices);
    expect(confirmedPrice).toBe(180);
  });

  it('normalizes times, sorts slots, rejects duplicate instants and validates the two-hour boundary', () => {
    const demo = createMentorDemo();
    for (const invalid of ['', 'invalid', '2026-02-30T10:00:00Z', '2026-09-10T09:59:59Z']) expectCode(demo.addSlot(taylor, invalid), 'validation_failed');
    expect(demo.getProfile(taylor).slots).toEqual([]);
    expect(demo.addSlot(taylor, start).ok).toBe(true);
    expect(demo.addSlot(taylor, '2026-09-10T12:00:00+02:00').ok).toBe(true);
    expect(demo.getProfile(taylor).slots.map(slot => slot.start)).toEqual(['2026-09-10T10:00:00.000Z', '2026-09-12T12:00:00.000Z']);
    expectCode(demo.addSlot(taylor, '2026-09-10T10:00:00.000Z'), 'slot_conflict');
  });

  it('removes open times, refuses booked times and directs recovery after a missing time', () => {
    const demo = createMentorDemo();
    expectCode(demo.removeSlot(alex, 'missing'), 'not_found');
    expectCode(demo.removeSlot(alex, 'morning'), 'slot_booked');
    expect(demo.removeSlot(alex, 'afternoon').ok).toBe(true);
    expect(demo.getPublic('alex')?.slots.map(slot => slot.id)).toEqual(['too-soon', 'morning', 'tomorrow']);
    expectCode(demo.bookSlot('alex', 'afternoon'), 'not_found');
    expect(demo.removeSlot(alex, 'too-soon').ok).toBe(true);
  });

  it('prevents booking hidden pages, missing prices and blocked times, then shares the booked state', () => {
    const demo = createMentorDemo();
    expectCode(demo.bookSlot('missing', 'missing'), 'not_found');
    demo.getProfile(taylor);
    expectCode(demo.bookSlot('taylor', 'missing'), 'not_found');
    demo.saveProfile(taylor, profileInput);
    demo.publishProfile(taylor);
    expectCode(demo.bookSlot('taylor', 'missing'), 'prices_missing');
    demo.savePrices(taylor, prices);
    expectCode(demo.bookSlot('taylor', 'missing'), 'not_found');
    expectCode(demo.bookSlot('alex', 'too-soon'), 'slot_unavailable');
    expectCode(demo.bookSlot('alex', 'morning'), 'slot_unavailable');
    expect(demo.bookSlot('alex', 'afternoon').ok).toBe(true);
    expect(demo.getProfile(alex).slots.find(slot => slot.id === 'afternoon')?.blockedReason).toBe('Booked');
    expectCode(demo.removeSlot(alex, 'afternoon'), 'slot_booked');
    expectCode(demo.bookSlot('alex', 'afternoon'), 'slot_unavailable');
  });

  it('keeps every Connect state scoped to its mentor and rejects unknown values', () => {
    const demo = createMentorDemo();
    for (const status of ['pending', 'enabled', 'restricted', 'incomplete'] as const) expect(demo.setConnect(taylor, status)).toMatchObject({ ok: true, data: { connect: status } });
    expectCode(demo.setConnect(taylor, 'unknown' as ConnectStatus), 'validation_failed');
    expect(demo.getProfile(alex).connect).toBe('incomplete');
    expect(demo.getProfile(taylor).connect).toBe('incomplete');
  });
});
