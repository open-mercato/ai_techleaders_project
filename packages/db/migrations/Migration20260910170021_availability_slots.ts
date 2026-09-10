import { Migration } from '@mikro-orm/migrations';

/** Add booking-agnostic mentor availability and its discovery ordering key. */
export class Migration20260910170021_availability_slots extends Migration {
  override name = 'Migration20260910170021_availability_slots';

  override up(): void | Promise<void> {
    this.addSql(`create table "slots" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "mentor_profile_id" uuid not null, "starts_at" timestamptz not null, "removed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "slots_mentor_profile_starts_at_index" on "slots" ("mentor_profile_id", "starts_at");`);
    this.addSql(`create unique index "slots_active_mentor_profile_starts_at_unique" on "slots" ("mentor_profile_id", "starts_at") where "removed_at" is null;`);

    this.addSql(`alter table "mentor_profiles" add "last_published_availability_at" timestamptz null;`);

    this.addSql(`alter table "slots" add constraint "slots_mentor_profile_id_foreign" foreign key ("mentor_profile_id") references "mentor_profiles" ("id") on delete cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "slots" cascade;`);

    this.addSql(`alter table "mentor_profiles" drop column "last_published_availability_at";`);
  }
}
