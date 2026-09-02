import { User, type EntityManager, type IUser } from '@devmentor/db';
import type { Logger } from '../../logger';
import type { EventBus } from '../../events/event-bus';
import type { UserCreateInput } from '../../validators/auth/user-create.schema';

/**
 * Plain, JSON-safe shape a user is exposed as over the API. Services own their output
 * shape (SRP) and return DTOs rather than ORM entities, so routes never risk
 * serializing a bidirectional relation cycle.
 */
export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  mentorProfile: { id: string; headline: string } | null;
}

function toUserDto(user: IUser): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
    mentorProfile: user.mentorProfile
      ? { id: user.mentorProfile.id, headline: user.mentorProfile.headline }
      : null,
  };
}

/**
 * Domain service for users. Constructor-injected by awilix (PROXY mode), so it
 * receives a request-scoped `em` (a forked EntityManager) plus the shared `logger`
 * and `eventBus`. All persistence goes through the `em` — services never touch
 * `process.env` or the ORM singleton directly, and never build an HTTP response.
 */
export class UserService {
  private readonly em: EntityManager;
  private readonly logger: Logger;
  private readonly eventBus: EventBus;

  constructor({
    em,
    logger,
    eventBus,
  }: {
    em: EntityManager;
    logger: Logger;
    eventBus: EventBus;
  }) {
    this.em = em;
    this.logger = logger;
    this.eventBus = eventBus;
  }

  /** List users with their mentor profile eagerly populated. */
  async list(): Promise<UserDto[]> {
    const users = await this.em.find(
      User,
      {},
      { populate: ['mentorProfile'], orderBy: { createdAt: 'desc' } },
    );
    return users.map(toUserDto);
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return this.em.findOne(User, { email });
  }

  /** Create and persist a user, then emit `auth.user.created`. */
  async create(data: UserCreateInput): Promise<UserDto> {
    const user = this.em.create(User, data);
    this.em.persist(user);
    await this.em.flush();
    this.logger.info({ userId: user.id }, 'created user');
    await this.eventBus.emit('auth.user.created', { userId: user.id, email: user.email });
    return toUserDto(user);
  }
}
