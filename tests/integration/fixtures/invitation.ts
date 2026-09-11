import { createHash, randomBytes } from 'node:crypto';
import { type StackTag } from '@devmentor/core';
import { Invitation, MentorProfile, MikroORM, User, entities } from '@devmentor/db';

export interface SeededInvitation {
  id: string;
  token: string;
}

export interface InvitationSeed {
  email: string;
  stackTags?: StackTag[];
  expiresAt?: Date;
  revokedAt?: Date | null;
}

export interface InviteeState {
  acceptedAt: Date | null;
  roles: string[] | null;
  hasMentorProfile: boolean;
}

async function withOrm<T>(databaseUrl: string, work: (orm: MikroORM) => Promise<T>): Promise<T> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    return await work(orm);
  } finally {
    await orm.close(true);
  }
}

/** Seed one invitation in any lifecycle state; the address need not belong to a user yet. */
export async function seedInvitation(
  databaseUrl: string,
  { email, stackTags = ['TypeScript'], expiresAt, revokedAt = null }: InvitationSeed,
): Promise<SeededInvitation> {
  return withOrm(databaseUrl, async (orm) => {
    const em = orm.em.fork();
    const token = randomBytes(32).toString('base64url');
    const invitation = em.create(Invitation, {
      email: email.trim().toLowerCase(),
      tokenHash: createHash('sha256').update(token).digest('hex'),
      stackTags,
      expiresAt: expiresAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      revokedAt,
      batch: 'integration',
    });
    em.persist(invitation);
    await em.flush();
    return { id: invitation.id, token };
  });
}

/** Mark a scenario-owned user's email as verified (`Date`) or unverified (`null`). */
export async function setEmailVerifiedAt(
  databaseUrl: string,
  email: string,
  verifiedAt: Date | null,
): Promise<void> {
  await withOrm(databaseUrl, async (orm) => {
    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { email: email.trim().toLowerCase() });
    user.emailVerifiedAt = verifiedAt;
    await em.flush();
  });
}

/** Read what an acceptance attempt could have changed for one invitation and one user. */
export async function readInviteeState(
  databaseUrl: string,
  invitationId: string,
  email: string,
): Promise<InviteeState> {
  return withOrm(databaseUrl, async (orm) => {
    const em = orm.em.fork();
    const invitation = await em.findOneOrFail(Invitation, { id: invitationId });
    const user = await em.findOne(User, { email: email.trim().toLowerCase() });
    const profile = user === null ? null : await em.findOne(MentorProfile, { user: user.id });
    return {
      acceptedAt: invitation.acceptedAt ?? null,
      roles: user === null ? null : [...user.roles],
      hasMentorProfile: profile !== null,
    };
  });
}

/** Delete every invitation and user a scenario created for its own unique addresses. */
export async function deleteInvitationScenario(
  databaseUrl: string,
  emails: readonly string[],
): Promise<void> {
  const normalized = emails.map((email) => email.trim().toLowerCase());
  await withOrm(databaseUrl, async (orm) => {
    const em = orm.em.fork();
    await em.nativeDelete(Invitation, { email: { $in: normalized } });
    await em.nativeDelete(User, { email: { $in: normalized } });
  });
}
