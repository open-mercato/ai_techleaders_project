import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { baseProperties } from '../base.entity';
import { defineSingletonEntity } from '../define';
import { User } from '../auth/user.entity';

const p = defineEntity.properties;

/**
 * The four beachhead technologies an invitation can carry (R16).
 *
 * This literal deliberately lives at the database boundary rather than importing the
 * core vocabulary: `db` is the leaf package and may not import `@devmentor/core`. The
 * owning core vocabulary and the migration repeat these four values, with the database
 * integration test proving that the persisted constraint rejects anything outside them.
 */
const INVITATION_STACK_TAGS = ['TypeScript', 'React', 'Python', 'AI agents'] as const;

/**
 * A single-use invitation to the mentor role.
 *
 * The raw token never reaches this entity. Only its fixed-width SHA-256 hex digest is
 * stored, while expiry and the publication obligation are snapshotted instants. A user
 * relation is attached only on acceptance and is intentionally not unique: a role may
 * be removed and the same person deliberately invited again later.
 */
export const Invitation = defineSingletonEntity('Invitation', () =>
  defineEntity({
    name: 'Invitation',
    tableName: 'invitations',
    properties: {
      ...baseProperties,
      email: p.string(),
      tokenHash: p.string().length(64).unique(),
      stackTags: p.enum(INVITATION_STACK_TAGS).array(),
      expiresAt: p.datetime(),
      acceptedAt: p.datetime().nullable(),
      // Keep accepted history attributable. `set null` would contradict the acceptance
      // completeness CHECK as soon as an accepted user's row was deleted.
      acceptedBy: () => p.manyToOne(User).nullable().deleteRule('restrict'),
      publishDueAt: p.datetime().nullable(),
      revokedAt: p.datetime().nullable(),
      batch: p.string().length(64).nullable(),
    },
    uniques: [
      {
        name: 'invitations_pending_email_unique',
        properties: ['email'],
        where: { acceptedAt: null, revokedAt: null },
      },
    ],
    checks: [
      {
        name: 'invitations_acceptance_complete',
        expression: '("accepted_at" is null) = ("accepted_by_id" is null)',
      },
    ],
  }),
);

export type IInvitation = InferEntity<typeof Invitation>;
