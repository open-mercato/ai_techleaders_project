import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import { createMentorDemo, type MentorResult } from './mentor-model';
import { authDemo } from './auth-runtime';

export const mentorDemo = createMentorDemo();
export const MENTOR_ENDPOINT = '/prototype-api/devmentor-journey/mentor';
export const mentorActions = ['accept', 'profile', 'publish', 'prices', 'add-slot', 'remove-slot', 'connect'] as const;
export type MentorAction = typeof mentorActions[number];
const modeSchema = z.object({ mode: z.enum(['valid', 'expired', 'invalid', 'used']) });
const startSchema = z.object({ startsAt: z.string() });
const idSchema = z.object({ id: z.string() });
const connectSchema = z.object({ state: z.enum(['incomplete', 'pending', 'enabled', 'restricted']) });
const invalid: MentorResult = { ok: false, error: { code: 'validation_failed', message: 'This request could not be read. Please try again.' } };
const statusByCode: Record<string, number> = {
  unauthorized: 401, forbidden: 403, not_found: 404, invitation_used: 409,
  invitation_expired: 410, invitation_invalid: 404, slot_conflict: 409,
  slot_booked: 409, slot_unavailable: 409, prices_missing: 422,
  validation_failed: 422, service_unavailable: 503,
};

/** Local demo endpoints. No invitation, account or payout is changed outside this visit. */
const mentorHandler = (action: MentorAction) => async ({ request }: { request: Request }) => {
  const user = authDemo.getSession();
  let result: MentorResult;
  try {
    const body: unknown = await request.json();
    await delay(180);
    // A form opened before sign-out must not apply to the next signed-in account.
    if (!user || authDemo.getSession()?.id !== user.id) {
      result = { ok: false, error: { code: 'unauthorized', message: 'Sign in again before saving these changes.' } };
    } else {
      switch (action) {
        case 'accept': {
          const data = modeSchema.safeParse(body);
          result = data.success ? mentorDemo.acceptInvitation(user, data.data.mode) : invalid;
          if (result.ok) {
            const accepted = authDemo.grantMentor();
            document.dispatchEvent(new CustomEvent('devmentor:auth-result', { detail: { action: 'invitation', result: accepted } }));
          }
          break;
        }
        case 'profile': result = mentorDemo.saveProfile(user, body); break;
        case 'publish': result = mentorDemo.publishProfile(user); break;
        case 'prices': result = mentorDemo.savePrices(user, body); break;
        case 'add-slot': {
          const data = startSchema.safeParse(body);
          result = data.success ? mentorDemo.addSlot(user, data.data.startsAt) : invalid;
          break;
        }
        case 'remove-slot': {
          const data = idSchema.safeParse(body);
          result = data.success ? mentorDemo.removeSlot(user, data.data.id) : invalid;
          break;
        }
        case 'connect': {
          const data = connectSchema.safeParse(body);
          result = data.success ? mentorDemo.setConnect(user, data.data.state) : invalid;
          break;
        }
      }
    }
  } catch {
    result = invalid;
  }
  document.dispatchEvent(new CustomEvent('devmentor:mentor-result', { detail: { action, result } }));
  return HttpResponse.json(result, { status: result.ok ? 200 : (statusByCode[result.error.code] ?? 500) });
};
export const mentorHandlers = [
  ...mentorActions.map(action => http.post(`${MENTOR_ENDPOINT}/${action}`, mentorHandler(action))),
  http.put(`${MENTOR_ENDPOINT}/profile`, mentorHandler('profile')),
];
