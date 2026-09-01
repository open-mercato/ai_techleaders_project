import { Migration } from '@mikro-orm/migrations';

export class Migration20260901142829 extends Migration {

  override name = 'Migration20260901142829';

  override up(): void | Promise<void> {
    this.addSql(`create table "users" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "email" varchar(255) not null, "display_name" varchar(255) not null, primary key ("id"));`);
    this.addSql(`alter table "users" add constraint "users_email_unique" unique ("email");`);

    this.addSql(`create table "mentor_profiles" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" uuid not null, "headline" varchar(255) not null, "bio" text null, "years_of_experience" int not null default 0, primary key ("id"));`);
    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_user_id_unique" unique ("user_id");`);

    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);
  }

}
