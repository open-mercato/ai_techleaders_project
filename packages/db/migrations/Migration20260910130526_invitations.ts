import { Migration } from '@mikro-orm/migrations';

/**
 * Single-use mentor invitations and the durable first-publication deadline (E02-S01).
 *
 * The partial unique index arbitrates concurrent creates for one normalized address,
 * while the acceptance CHECK prevents a half-consumed invitation. The stack vocabulary
 * is repeated literally because migrations in the `db` leaf may not import core domain
 * code. Accepted history restricts user deletion: `set null` would immediately violate
 * the completeness CHECK and would obscure who accepted the invitation.
 */
export class Migration20260910130526_invitations extends Migration {

  override name = 'Migration20260910130526_invitations';

  override up(): void | Promise<void> {
    this.addSql(`create table "invitations" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "email" varchar(255) not null, "token_hash" varchar(64) not null, "stack_tags" text[] not null, "expires_at" timestamptz not null, "accepted_at" timestamptz null, "accepted_by_id" uuid null, "publish_due_at" timestamptz null, "revoked_at" timestamptz null, "batch" varchar(64) null, primary key ("id"));`);
    this.addSql(`alter table "invitations" add constraint "invitations_token_hash_unique" unique ("token_hash");`);
    this.addSql(`create unique index "invitations_pending_email_unique" on "invitations" ("email") where "accepted_at" is null and "revoked_at" is null;`);

    this.addSql(`alter table "mentor_profiles" add "initial_publish_due_at" timestamptz null;`);

    this.addSql(`alter table "invitations" add constraint "invitations_accepted_by_id_foreign" foreign key ("accepted_by_id") references "users" ("id") on delete restrict;`);
    this.addSql(`alter table "invitations" add constraint "invitations_acceptance_complete" check (("accepted_at" is null) = ("accepted_by_id" is null));`);
    this.addSql(`alter table "invitations" add constraint "invitations_stack_tags_check" check ("stack_tags" <@ array['TypeScript'::text, 'React'::text, 'Python'::text, 'AI agents'::text]);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "invitations" cascade;`);

    this.addSql(`alter table "mentor_profiles" drop column "initial_publish_due_at";`);
  }

}
