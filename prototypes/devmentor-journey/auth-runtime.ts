import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import { createAuthDemo, loginSchema, registrationSchema, type AuthDemoResult } from './auth-model';

export const authDemo = createAuthDemo();
export const AUTH_ENDPOINT = '/prototype-api/devmentor-journey/auth';
export type AuthDemoAction = 'login' | 'register' | 'verify' | 'github' | 'logout';
export type AuthDemoEvent = { action: AuthDemoAction; result: AuthDemoResult };

const statusByCode: Record<string, number> = {
  unauthorized: 401, forbidden: 403, conflict: 409, validation_failed: 422,
  rate_limited: 429, service_unavailable: 503,
};

let pendingResponse: Promise<unknown> = Promise.resolve();

function invalidRequest(fieldErrors?: Record<string, string[]>): AuthDemoResult {
  return {
    ok: false,
    error: {
      code: 'validation_failed',
      message: fieldErrors ? 'Check the highlighted fields.' : 'This request could not be read. Please try again.',
      ...(fieldErrors ? { fieldErrors } : {}),
    },
  };
}

/**
 * Review controls select the next request's demo outcome. Each request consumes
 * that choice once; retries run normally. Serialize updates and response events
 * so a delayed sign-in cannot arrive after a later sign-out.
 */
function authHandler<T extends z.ZodType>(
  action: AuthDemoAction,
  schema: T,
  execute: (data: z.output<T>) => AuthDemoResult,
) {
  return http.post(`${AUTH_ENDPOINT}/${action}`, ({ request }) => {
    async function respond() {
      let result: AuthDemoResult;
      try {
        // Sign-out also works without a session or JSON body.
        const body: unknown = action === 'logout' ? undefined : await request.json();
        const parsed = schema.safeParse(body);
        if (parsed.success) result = execute(parsed.data);
        else {
          const fieldErrors: Record<string, string[]> = {};
          for (const issue of parsed.error.issues) {
            if (typeof issue.path[0] === 'string') (fieldErrors[issue.path[0]] ??= []).push(issue.message);
          }
          result = invalidRequest(Object.keys(fieldErrors).length ? fieldErrors : undefined);
        }
      } catch {
        result = invalidRequest();
      } finally {
        authDemo.setFailure('none');
      }
      await delay(180);
      // Only the model's public result leaves the handler. Never emit request data.
      document.dispatchEvent(new CustomEvent<AuthDemoEvent>('devmentor:auth-result', { detail: { action, result } }));
      return HttpResponse.json(result, { status: result.ok ? 200 : (statusByCode[result.error.code] ?? 500) });
    }
    const response = pendingResponse.then(respond, respond);
    pendingResponse = response;
    return response;
  });
}

export const authHandlers = [
  authHandler('login', loginSchema, (data) => authDemo.login(data)),
  authHandler('register', registrationSchema, (data) => authDemo.register(data)),
  authHandler('verify', z.object({ mode: z.enum(['valid', 'expired', 'invalid']) }), ({ mode }) => authDemo.verify(mode)),
  authHandler('github', z.object({ accountId: z.string().min(1), outcome: z.enum(['success', 'cancelled', 'state', 'unavailable', 'email', 'link']) }), ({ accountId, outcome }) => authDemo.github(accountId, outcome)),
  authHandler('logout', z.undefined(), () => {
    authDemo.logout();
    return { ok: true, data: { user: null } };
  }),
];
