import { createHash, randomBytes } from 'node:crypto';
import { type StackTag } from '@devmentor/core';
import { Invitation, MentorProfile, MikroORM, Slot, User, entities } from '@devmentor/db';

export interface PublishedMentorFixture {
  profileId: string;
  slug: string;
  publicWorkUrl: string;
  bio: string;
}

/** Seed the signed-in mock mentor's complete public page and return its stable URL fields. */
export async function seedPublishedMentorProfile(
  databaseUrl: string,
): Promise<PublishedMentorFixture> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { email: 'mock-mentor@devmentor.test' });
    const profile = await em.findOneOrFail(MentorProfile, { user: user.id });
    const fixture = {
      profileId: profile.id,
      slug: `mock-mentor-${process.pid}`,
      publicWorkUrl: 'https://github.com/open-mercato',
      bio: 'I build TypeScript systems and help engineers make reliable architecture choices.',
    };
    profile.slug = fixture.slug;
    profile.publicWorkUrl = fixture.publicWorkUrl;
    profile.bio = fixture.bio;
    profile.stackTags = ['TypeScript', 'AI agents'];
    profile.publishedAt = new Date();
    await em.flush();
    return fixture;
  } finally {
    await orm.close(true);
  }
}

/** Restore the mock mentor's page fields without touching its long-lived seed profile. */
export async function resetPublishedMentorProfile(databaseUrl: string): Promise<void> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { email: 'mock-mentor@devmentor.test' });
    const profile = await em.findOneOrFail(MentorProfile, { user: user.id });
    await em.nativeDelete(Slot, { mentorProfile: profile.id });
    profile.slug = null;
    profile.publicWorkUrl = null;
    profile.bio = 'Seeded so a mock GitHub sign-in lands on a mentor that already has a profile.';
    profile.stackTags = [];
    profile.publishedAt = null;
    profile.lastPublishedAvailabilityAt = null;
    await em.flush();
  } finally {
    await orm.close(true);
  }
}

/** Seed one invitation while returning the raw token only to its owning scenario. */
export async function seedPendingInvitation(
  databaseUrl: string,
  email: string,
  stackTags: StackTag[] = ['TypeScript', 'React'],
): Promise<{ id: string; token: string }> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    const em = orm.em.fork();
    const normalizedEmail = email.trim().toLowerCase();
    const user = await em.findOne(User, { email: normalizedEmail });
    if (user === null) {
      throw new Error(`Cannot seed an invitation: ${normalizedEmail} is not a seeded user.`);
    }
    const token = randomBytes(32).toString('base64url');
    const entity = em.create(Invitation, {
      email: normalizedEmail,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      stackTags,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      batch: 'integration',
    });
    em.persist(entity);
    await em.flush();
    return { id: entity.id, token };
  } finally {
    await orm.close(true);
  }
}

/** Restore the shared mock mentee after a role-grant scenario. */
export async function resetInvitationInvitee(
  databaseUrl: string,
  invitationId: string,
  email: string,
): Promise<void> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    const em = orm.em.fork();
    const invitation = await em.findOne(Invitation, { id: invitationId });
    if (invitation !== null) em.remove(invitation);
    const user = await em.findOne(User, { email: email.trim().toLowerCase() });
    if (user !== null) {
      const mentorProfile = await em.findOne(MentorProfile, { user: user.id });
      if (mentorProfile !== null) em.remove(mentorProfile);
      user.roles = ['mentee'];
      user.sessionVersion += 1;
    }
    await em.flush();
  } finally {
    await orm.close(true);
  }
}
