import { createHash, randomBytes } from 'node:crypto';
import { type StackTag } from '@devmentor/core';
import { Booking, Invitation, MentorProfile, MikroORM, Slot, User, entities } from '@devmentor/db';

export interface PublishedMentorFixture {
  profileId: string;
  slug: string;
  publicWorkUrl: string;
  bio: string;
}

export interface FutureMentorSlotFixture {
  slotId: string;
  startsAt: string;
}

export interface OfferReadyMentorFixture
  extends PublishedMentorFixture, FutureMentorSlotFixture {
  price25Cents: number;
  price50Cents: number;
  currency: 'PLN';
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
    profile.price25Cents = null;
    profile.price50Cents = null;
    profile.lastPublishedAvailabilityAt = null;
    // Bookings reference slots with `on delete restrict` — a booking is a money record and
    // must not vanish with the time it was made for. A fixture that resets a mentor
    // therefore clears its reservations first, in that order, or the slot delete is refused.
    await em.nativeDelete(Booking, { mentorProfile: profile.id });
    await em.nativeDelete(Slot, { mentorProfile: profile.id });
    await em.flush();
    return fixture;
  } finally {
    await orm.close(true);
  }
}

export interface MentorProfileMissingStackFixture {
  profileId: string;
  publicWorkUrl: string;
  bio: string;
}

/**
 * Seed the signed-in mock mentor with every publish requirement met except a chosen
 * technology, so a publish attempt fails on exactly one readiness item.
 */
export async function seedMentorProfileMissingStackTags(
  databaseUrl: string,
): Promise<MentorProfileMissingStackFixture> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { email: 'mock-mentor@devmentor.test' });
    const profile = await em.findOneOrFail(MentorProfile, { user: user.id });
    const fixture = {
      profileId: profile.id,
      publicWorkUrl: 'https://github.com/open-mercato',
      bio: 'I build TypeScript systems and help engineers make reliable architecture choices.',
    };
    profile.slug = null;
    profile.publicWorkUrl = fixture.publicWorkUrl;
    profile.bio = fixture.bio;
    profile.stackTags = [];
    profile.publishedAt = null;
    profile.lastPublishedAvailabilityAt = null;
    profile.price25Cents = null;
    profile.price50Cents = null;
    // Reservations before times, for the reason given in `seedPublishedMentorProfile`.
    await em.nativeDelete(Booking, { mentorProfile: profile.id });
    await em.nativeDelete(Slot, { mentorProfile: profile.id });
    await em.flush();
    return fixture;
  } finally {
    await orm.close(true);
  }
}

/** Seed one future slot owned by a fixture profile. */
export async function seedFutureMentorSlot(
  databaseUrl: string,
  profileId: string,
  startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000),
): Promise<FutureMentorSlotFixture> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    const em = orm.em.fork();
    const profile = await em.findOneOrFail(MentorProfile, { id: profileId });
    const slot = em.create(Slot, { mentorProfile: profile, startsAt, removedAt: null });
    profile.lastPublishedAvailabilityAt = new Date();
    em.persist(slot);
    await em.flush();
    return { slotId: slot.id, startsAt: startsAt.toISOString() };
  } finally {
    await orm.close(true);
  }
}

/** Compose a published page, exact approved prices and one future slot. */
export async function seedOfferReadyMentor(
  databaseUrl: string,
): Promise<OfferReadyMentorFixture> {
  try {
    const mentor = await seedPublishedMentorProfile(databaseUrl);
    const slot = await seedFutureMentorSlot(databaseUrl, mentor.profileId);
    let orm: MikroORM | undefined;
    try {
      orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
      await orm.connect();
      const em = orm.em.fork();
      const profile = await em.findOneOrFail(MentorProfile, { id: mentor.profileId });
      profile.price25Cents = 9_000;
      profile.price50Cents = 18_000;
      await em.flush();
    } finally {
      await orm?.close(true);
    }
    return {
      ...mentor,
      ...slot,
      price25Cents: 9_000,
      price50Cents: 18_000,
      currency: 'PLN',
    };
  } catch (error) {
    try {
      await resetPublishedMentorProfile(databaseUrl);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Offer-ready mentor setup failed and its compensating cleanup also failed.',
      );
    }
    throw error;
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
    // Reservations first: `bookings_slot_id_foreign` restricts, so deleting a booked slot
    // is refused. See the note in `seedPublishedMentorProfile`.
    await em.nativeDelete(Booking, { mentorProfile: profile.id });
    await em.nativeDelete(Slot, { mentorProfile: profile.id });
    profile.slug = null;
    profile.publicWorkUrl = null;
    profile.bio = 'Seeded so a mock GitHub sign-in lands on a mentor that already has a profile.';
    profile.stackTags = [];
    profile.publishedAt = null;
    profile.lastPublishedAvailabilityAt = null;
    profile.price25Cents = null;
    profile.price50Cents = null;
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
