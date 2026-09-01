import { User } from './user.entity';
import { MentorProfile } from './mentor-profile.entity';

export { User, type IUser } from './user.entity';
export { MentorProfile, type IMentorProfile } from './mentor-profile.entity';
export { baseProperties } from './base.entity';

/** Every entity the ORM should discover. Keep this in sync when adding entities. */
export const entities = [User, MentorProfile];
