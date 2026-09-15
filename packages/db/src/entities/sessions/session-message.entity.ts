import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { baseProperties } from '../base.entity';
import { defineSingletonEntity } from '../define';
import { Booking } from '../bookings/booking.entity';
import { User } from '../auth/user.entity';

const p = defineEntity.properties;

/**
 * The longest message a text session accepts.
 *
 * Lives here, in the leaf package, because the database `CHECK` below is the last line of
 * defence and the validator at the HTTP boundary must agree with it — one source of truth, so
 * a body the schema accepts can never be refused by Postgres with a 500.
 */
export const MAX_MESSAGE_LENGTH = 4000;

/**
 * One message in one confirmed booking's text session (#26).
 *
 * **There is no `Session` entity and no session `status` column.** A session is this table
 * plus arithmetic: `startsAt + lengthMinutes` on the booking says whether the window is open,
 * and a clock is the only thing that can answer that. A stored `status` would be a copy of the
 * answer with nobody to update it — this project has no worker and no scheduler (`AGENTS.md`)
 * — so it would be wrong for the whole session rather than briefly.
 *
 * `booking` **cascades**: a message is *about* a booking, not a record beside it, so a
 * booking that goes takes its transcript with it. `author` **restricts**, which adds no new
 * blocker (a confirmed booking already restricts the deletion of both parties' user rows) and
 * prevents the one outcome worse than refusing the delete: half a conversation, with one
 * side's messages gone and the other side's left implying they were talking to themselves.
 *
 * `(booking, createdAt)` is indexed because reading a transcript in order is the only query
 * this table has, and ordering is by `createdAt` rather than `id` — the ids are uuid v4 and do
 * not sort by creation time (see `base.entity.ts`).
 */
export const SessionMessage = defineSingletonEntity('SessionMessage', () =>
  defineEntity({
    name: 'SessionMessage',
    tableName: 'session_messages',
    properties: {
      ...baseProperties,
      // Per-property thunks so the cross-entity references resolve lazily at discovery time.
      booking: () => p.manyToOne(Booking).deleteRule('cascade'),
      author: () => p.manyToOne(User).deleteRule('restrict'),
      body: p.text(),
    },
    indexes: [
      {
        name: 'session_messages_booking_created_at_index',
        properties: ['booking', 'createdAt'],
      },
    ],
    checks: [
      {
        // `length` on an empty string is 0, so this rejects the blank message as well as the
        // over-long one. The validator refuses both first; this is what holds if it is ever
        // bypassed.
        //
        // **Spelled as two comparisons, not `between`.** PostgreSQL rewrites `between` at parse
        // time and hands the constraint back as `(length(body) >= 1) AND (length(body) <= 4000)`,
        // and MikroORM compares that text against this string to decide whether the schema
        // matches the model. `between` therefore never compares equal to what the database
        // stores, and `getUpdateSchemaSQL()` reports permanent drift on a schema that is in fact
        // correct — which is exactly what it did.
        name: 'session_messages_body_length',
        expression: `length("body") >= 1 and length("body") <= ${MAX_MESSAGE_LENGTH}`,
      },
    ],
  }),
);

export type ISessionMessage = InferEntity<typeof SessionMessage>;
