/**
 * Client-side view of the API response envelope. This is a *shape convention* shared
 * with the server (`@devmentor/core/http`), declared separately here because `ui` must
 * not import `core`. If the duplication ever becomes painful, that's an Ask-First
 * `packages/shared` change — not something to add while there are only two consumers.
 */
export type FieldErrors = Record<string, string[]>;

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fieldErrors?: FieldErrors } };
