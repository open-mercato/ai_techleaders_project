export const MAX_SLUG_LENGTH = 60;

export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'home',
  'invitation',
  'invitations',
  'mentor',
  'mentors',
  'register',
  'sign-in',
]);

/** Convert a display name into a stable URL segment, with a useful empty fallback. */
export function slugify(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'mentor';
}

/**
 * Return the candidate for a one-based publication attempt.
 * Reserved bases start at `-2`; suffix room is reserved before truncating the base.
 */
export function uniqueSlug(value: string, attempt = 1): string {
  const base = slugify(value);
  const number = attempt + (RESERVED_SLUGS.has(base) ? 1 : 0);
  const suffix = number === 1 ? '' : `-${number}`;
  return `${base.slice(0, MAX_SLUG_LENGTH - suffix.length)}${suffix}`;
}
