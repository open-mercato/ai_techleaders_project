import { Migration } from "@mikro-orm/migrations";

export class Migration20260901120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "messages" (
        "id" serial primary key,
        "body" varchar(255) not null,
        "created_at" timestamptz not null
      );
    `);
    this.addSql(
      `create index "messages_created_at_index" on "messages" ("created_at");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "messages" cascade;`);
  }
}
