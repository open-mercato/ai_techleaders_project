import { User } from './auth/user.entity';
import { AuthRateLimit } from './auth/rate-limit.entity';
import { Slot } from './availability/slot.entity';
import { Booking } from './bookings/booking.entity';
import { ProcessedWebhookEvent } from './payments/processed-webhook-event.entity';
import { Notification } from './notifications/notification.entity';
import { Invitation } from './invitations/invitation.entity';
import { MentorProfile } from './mentors/mentor-profile.entity';

export { User, type IUser } from './auth/user.entity';
export { AuthRateLimit, type IAuthRateLimit } from './auth/rate-limit.entity';
export { Slot, type ISlot } from './availability/slot.entity';
export { Booking, type IBooking } from './bookings/booking.entity';
export {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUSES,
  PAYMENT_ISSUES,
  type ActiveBookingStatus,
  type BookingStatus,
  type PaymentIssue,
} from './bookings/booking-status';
export {
  ProcessedWebhookEvent,
  type IProcessedWebhookEvent,
} from './payments/processed-webhook-event.entity';
export { Notification, type INotification } from './notifications/notification.entity';
export {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from './notifications/notification-kind';
export { ROLES, type Role } from './auth/roles';
export { Invitation, type IInvitation } from './invitations/invitation.entity';
export { MentorProfile, type IMentorProfile } from './mentors/mentor-profile.entity';
export { baseProperties } from './base.entity';

/** Every entity the ORM should discover. Keep this in sync when adding entities. */
export const entities = [
  User,
  AuthRateLimit,
  MentorProfile,
  Invitation,
  Slot,
  Booking,
  ProcessedWebhookEvent,
  Notification,
];
