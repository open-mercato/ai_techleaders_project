import { User } from './auth/user.entity';
import { MentorProfile } from './mentors/mentor-profile.entity';

export { User, type IUser } from './auth/user.entity';
export { ROLES, type Role } from './auth/roles';
export { MentorProfile, type IMentorProfile } from './mentors/mentor-profile.entity';
export { baseProperties } from './base.entity';

/** Every entity the ORM should discover. Keep this in sync when adding entities. */
export const entities = [User, MentorProfile];
