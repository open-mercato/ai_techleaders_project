import { createHash, randomBytes } from 'node:crypto';
import { type StackTag } from '@devmentor/core';
import { Invitation, MikroORM, User, entities } from '@devmentor/db';

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
