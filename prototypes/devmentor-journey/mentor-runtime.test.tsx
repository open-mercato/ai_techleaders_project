import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { apiCall } from '@devmentor/ui/backend';
import type { AuthDemoResult } from './auth-model';
import { authDemo } from './auth-runtime';
import type { MentorProfile, MentorResult } from './mentor-model';
import { MENTOR_ENDPOINT, mentorActions, mentorDemo, mentorHandlers, type MentorAction } from './mentor-runtime';

const server = setupServer(...mentorHandlers);
type MentorEvent = { action: MentorAction; result: MentorResult };
type InvitationEvent = { action: 'invitation'; result: AuthDemoResult };
const results: MentorEvent[] = [];
const authResults: InvitationEvent[] = [];
const eventOrder: string[] = [];
const statuses: number[] = [];
const collect = (event: Event) => { results.push((event as CustomEvent<MentorEvent>).detail); eventOrder.push('mentor'); };
const collectAuth = (event: Event) => { authResults.push((event as CustomEvent<InvitationEvent>).detail); eventOrder.push('auth'); };
const request = (action: MentorAction, body?: unknown) => apiCall<MentorProfile>(`${location.origin}${MENTOR_ENDPOINT}/${action}`, { method: 'POST', body });
const profile = { displayName: 'Taylor Morgan', description: 'I help you debug React forms.', publicWorkUrl: 'https://github.com/example', stacks: ['React'] };
const prices = { 25: 200, 50: 380 };
const bodies = { accept: { mode: 'valid' }, profile, publish: {}, prices, 'add-slot': { startsAt: '2026-09-12T12:00:00Z' }, 'remove-slot': { id: 'afternoon' }, connect: { state: 'pending' } } satisfies Record<MentorAction, unknown>;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('response:mocked', ({ response }) => statuses.push(response.status));
  document.addEventListener('devmentor:mentor-result', collect);
  document.addEventListener('devmentor:auth-result', collectAuth);
});
beforeEach(() => {
  authDemo.reset(); mentorDemo.reset(); results.length = 0; authResults.length = 0; eventOrder.length = 0; statuses.length = 0;
});
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => {
  document.removeEventListener('devmentor:mentor-result', collect);
  document.removeEventListener('devmentor:auth-result', collectAuth);
  server.close();
});

it('connects acceptance to an additive auth event and consumes the same invitation across accounts', async () => {
  authDemo.github('jordan', 'success');
  const accepted = await request('accept', { mode: 'valid' });
  expect(accepted).toMatchObject({ ok: true, data: { ownerId: 'jordan', published: false, prices: { 25: null, 50: null } } });
  expect(authDemo.getSession()?.roles).toEqual(['mentee', 'mentor']);
  expect(authResults).toEqual([{ action: 'invitation', result: { ok: true, data: { user: authDemo.getSession() } } }]);
  expect(results).toEqual([{ action: 'accept', result: accepted }]);
  expect(eventOrder).toEqual(['auth', 'mentor']);
  expect(statuses).toEqual([200]);
  expect(await request('accept', { mode: 'valid' })).toMatchObject({ ok: false, error: { code: 'invitation_used' } });
  authDemo.logout();
  authDemo.github('github-only', 'success');
  expect(await request('accept', { mode: 'valid' })).toMatchObject({ ok: false, error: { code: 'invitation_used' } });
  expect(authDemo.getSession()?.roles).toEqual(['mentee']);
  expect(mentorDemo.getProfile(authDemo.getSession()!).acceptedAt).toBeNull();
  expect(authResults).toHaveLength(1);
  expect(statuses).toEqual([200, 409, 409]);
});

it('saves, publishes and prices the same profile, then adds/removes availability and updates payout state', async () => {
  authDemo.github('taylor', 'success');
  expect(await request('profile', profile)).toMatchObject({ ok: true, data: { ...profile, published: false } });
  expect(mentorDemo.getPublic('taylor')).toBeNull();
  expect(await request('publish', {})).toMatchObject({ ok: true, data: { published: true } });
  expect(await request('prices', prices)).toMatchObject({ ok: true, data: { prices } });
  expect(await request('add-slot', bodies['add-slot'])).toMatchObject({ ok: true, data: { slots: [{ id: 'mentor-slot-1', start: '2026-09-12T12:00:00.000Z' }] } });
  expect(mentorDemo.getPublic('taylor')).toMatchObject({ ...profile, published: true, prices });
  expect(await request('remove-slot', { id: 'mentor-slot-1' })).toMatchObject({ ok: true, data: { slots: [] } });
  for (const state of ['pending', 'enabled', 'restricted', 'incomplete']) expect(await request('connect', { state })).toMatchObject({ ok: true, data: { connect: state } });
  expect(mentorDemo.getPublic('alex')?.displayName).toBe('Alex Laurent');
  expect(statuses).toEqual(Array(9).fill(200));
  expect(results.map(({ action }) => action)).toEqual(['profile', 'publish', 'prices', 'add-slot', 'remove-slot', 'connect', 'connect', 'connect', 'connect']);
  expect(authResults).toEqual([]);
});

it('accepts the shared editor PUT method for profile updates with the same model validation and event', async () => {
  authDemo.github('taylor', 'success');
  const response = await apiCall(`${location.origin}${MENTOR_ENDPOINT}/profile`, { method: 'PUT', body: profile });
  expect(response).toMatchObject({ ok: true, data: { ...profile, ownerId: 'taylor' } });
  expect(results).toEqual([{ action: 'profile', result: response }]);
  expect(statuses).toEqual([200]);
});

it.each(mentorActions)('refuses unauthenticated %s requests with a recoverable 401 result', async action => {
  const before = mentorDemo.getPublic('alex');
  const response = await request(action, bodies[action]);
  expect(response).toMatchObject({ ok: false, error: { code: 'unauthorized' } });
  expect(statuses).toEqual([401]);
  expect(results).toEqual([{ action, result: response }]);
  expect(authResults).toEqual([]);
  expect(mentorDemo.getPublic('alex')).toEqual(before);
});

it.each(mentorActions.filter(action => action !== 'accept'))('requires mentor role for %s without modifying another account', async action => {
  authDemo.github('jordan', 'success');
  const before = mentorDemo.getPublic('alex');
  expect(await request(action, bodies[action])).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  expect(statuses).toEqual([403]);
  expect(mentorDemo.getPublic('alex')).toEqual(before);
  expect(mentorDemo.getPublic('jordan')).toBeNull();
});

it.each(['signed-out', 'different-account'] as const)('rejects an in-flight save after %s and preserves both accounts', async transition => {
  authDemo.github('alex', 'success');
  const alex = mentorDemo.getProfile(authDemo.getSession()!);
  const readJson = Request.prototype.json;
  vi.spyOn(Request.prototype, 'json').mockImplementationOnce(async function (this: Request) {
    const body = await readJson.call(this);
    authDemo.logout();
    if (transition === 'different-account') authDemo.github('taylor', 'success');
    return body;
  });
  expect(await request('profile', profile)).toMatchObject({ ok: false, error: { code: 'unauthorized' } });
  expect(statuses).toEqual([401]);
  expect(mentorDemo.getPublic('alex')).toEqual(alex);
  expect(mentorDemo.getPublic('taylor')).toBeNull();
  expect(authResults).toEqual([]);
});

it.each([
  ['accept', { mode: 'unsupported' }], ['profile', null], ['prices', { 25: 0, 50: null }],
  ['add-slot', { startsAt: null }], ['remove-slot', { id: 42 }], ['connect', { state: 'unknown' }],
] satisfies [MentorAction, unknown][])('validates %s bodies before any mutation', async (action, body) => {
  authDemo.github('alex', 'success');
  const before = mentorDemo.getPublic('alex');
  expect(await request(action, body)).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
  expect(statuses).toEqual([422]);
  expect(mentorDemo.getPublic('alex')).toEqual(before);
  expect(authResults).toEqual([]);
});

it.each(mentorActions)('rejects an unreadable JSON body for %s and emits no submitted data', async action => {
  authDemo.github('alex', 'success');
  vi.spyOn(Request.prototype, 'json').mockRejectedValueOnce(new SyntaxError('secret submitted request'));
  const before = mentorDemo.getPublic('alex');
  expect(await request(action, { secret: 'not for events' })).toEqual({ ok: false, error: { code: 'validation_failed', message: 'This request could not be read. Please try again.' } });
  expect(statuses).toEqual([422]);
  expect(mentorDemo.getPublic('alex')).toEqual(before);
  expect(JSON.stringify(results)).not.toContain('secret');
  expect(authResults).toEqual([]);
});

it('rejects an empty request without crashing or mutating a profile', async () => {
  authDemo.github('alex', 'success');
  expect(await request('publish')).toMatchObject({ ok: false, error: { code: 'validation_failed' } });
  expect(statuses).toEqual([422]);
});

it.each(mentorActions)('retries %s after one simulated service failure without losing data', async action => {
  authDemo.github('alex', 'success');
  const before = mentorDemo.getPublic('alex');
  mentorDemo.setFailure(true);
  expect(await request(action, bodies[action])).toMatchObject({ ok: false, error: { code: 'service_unavailable' } });
  expect(statuses).toEqual([503]);
  expect(mentorDemo.getPublic('alex')).toEqual(before);
  expect(authResults).toEqual([]);
  expect(await request(action, bodies[action])).toMatchObject({ ok: true });
  expect(statuses).toEqual([503, 200]);
});

it.each([
  ['accept', { mode: 'expired' }, 'invitation_expired', 410],
  ['accept', { mode: 'invalid' }, 'invitation_invalid', 404],
  ['accept', { mode: 'used' }, 'invitation_used', 409],
  ['add-slot', { startsAt: '2026-09-10T10:00:00Z' }, 'slot_conflict', 409],
  ['add-slot', { startsAt: '2026-09-10T09:00:00Z' }, 'validation_failed', 422],
  ['remove-slot', { id: 'morning' }, 'slot_booked', 409],
  ['remove-slot', { id: 'missing' }, 'not_found', 404],
] satisfies [MentorAction, unknown, string, number][])('maps %s %s to the matching HTTP status', async (action, body, code, status) => {
  authDemo.github('alex', 'success');
  expect(await request(action, body)).toMatchObject({ ok: false, error: { code } });
  expect(statuses).toEqual([status]);
  expect(authResults).toEqual([]);
});

it('returns model publication validation instead of marking a blank profile as published', async () => {
  authDemo.github('taylor', 'success');
  expect(await request('publish', {})).toMatchObject({ ok: false, error: { code: 'validation_failed', fieldErrors: { description: expect.any(Array), publicWorkUrl: expect.any(Array), stacks: expect.any(Array) } } });
  expect(mentorDemo.getPublic('taylor')).toBeNull();
  expect(statuses).toEqual([422]);
});

it('uses a server status for unrecognized model failures without exposing the request body', async () => {
  authDemo.github('alex', 'success');
  const failure: MentorResult = { ok: false, error: { code: 'unexpected_demo_failure', message: 'Please try again.' } };
  vi.spyOn(mentorDemo, 'saveProfile').mockReturnValueOnce(failure);
  expect(await request('profile', { secret: 'do not emit' })).toEqual(failure);
  expect(statuses).toEqual([500]);
  expect(results).toEqual([{ action: 'profile', result: failure }]);
});
