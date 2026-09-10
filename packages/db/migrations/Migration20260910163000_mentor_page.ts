import { Migration } from '@mikro-orm/migrations';

/** Add the draft/public mentor-page state while keeping every existing profile valid. */
export class Migration20260910163000_mentor_page extends Migration {
  override name = 'Migration20260910163000_mentor_page';

  override up(): void {
    this.addSql(`alter table "mentor_profiles" add column "slug" varchar(60) null, add column "public_work_url" text null, add column "stack_tags" text[] not null default '{}', add column "published_at" timestamptz null;`);
    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_slug_unique" unique ("slug");`);
    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_stack_tags_check" check ("stack_tags" <@ array['TypeScript'::text, 'React'::text, 'Python'::text, 'AI agents'::text]);`);
    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_publication_has_slug" check ("published_at" is null or "slug" is not null);`);
  }

  override down(): void {
    this.addSql(`alter table "mentor_profiles" drop constraint if exists "mentor_profiles_slug_unique";`);
    this.addSql(`alter table "mentor_profiles" drop constraint if exists "mentor_profiles_stack_tags_check";`);
    this.addSql(`alter table "mentor_profiles" drop constraint if exists "mentor_profiles_publication_has_slug";`);
    this.addSql(`alter table "mentor_profiles" drop column "slug", drop column "public_work_url", drop column "stack_tags", drop column "published_at";`);
  }
}
