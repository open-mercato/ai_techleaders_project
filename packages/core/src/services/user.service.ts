import { User, type EntityManager, type IUser, type RequiredEntityData } from '@devmentor/db';
import type { Logger } from '../logger';

/**
 * Domain service for users. Constructor-injected by awilix (PROXY mode), so it
 * receives a request-scoped `em` (a forked EntityManager) and the shared `logger`.
 * All persistence goes through the `em` — services never touch `process.env` or the
 * ORM singleton directly.
 */
export class UserService {
  private readonly em: EntityManager;
  private readonly logger: Logger;

  constructor({ em, logger }: { em: EntityManager; logger: Logger }) {
    this.em = em;
    this.logger = logger;
  }

  /** List users with their mentor profile eagerly populated. */
  async list(): Promise<IUser[]> {
    return this.em.find(User, {}, { populate: ['mentorProfile'], orderBy: { createdAt: 'desc' } });
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return this.em.findOne(User, { email });
  }

  /** Create and persist a user. */
  async create(data: RequiredEntityData<IUser>): Promise<IUser> {
    const user = this.em.create(User, data);
    this.em.persist(user);
    await this.em.flush();
    this.logger.info({ userId: user.id }, 'created user');
    return user;
  }
}
