import { User } from './auth/user.entity';
import { AuthRateLimit } from './auth/rate-limit.entity';
import { Slot } from './availability/slot.entity';
import { Invitation } from './invitations/invitation.entity';
import { MentorProfile } from './mentors/mentor-profile.entity';

export { User, type IUser } from './auth/user.entity';
export { AuthRateLimit, type IAuthRateLimit } from './auth/rate-limit.entity';
export { Slot, type ISlot } from './availability/slot.entity';
export { ROLES, type Role } from './auth/roles';
export { Invitation, type IInvitation } from './invitations/invitation.entity';
export { MentorProfile, type IMentorProfile } from './mentors/mentor-profile.entity';
export { baseProperties } from './base.entity';

/** Every entity the ORM should discover. Keep this in sync when adding entities. */
export const entities = [User, AuthRateLimit, MentorProfile, Invitation, Slot];
