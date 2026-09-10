import type { Configuration } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { Migration20260910185543_mentor_prices } from '../../migrations/Migration20260910185543_mentor_prices';

function migration(): Migration20260910185543_mentor_prices {
  return new Migration20260910185543_mentor_prices(
    undefined as unknown as AbstractSqlDriver,
    undefined as unknown as Configuration,
  );
}

describe('mentor prices migration', () => {
  it('adds only two nullable integer prices and their positive checks', () => {
    const subject = migration();
    subject.up();

    expect(subject.name).toBe('Migration20260910185543_mentor_prices');
    expect(subject.getQueries()).toEqual([
      'alter table "mentor_profiles" add "price_25_cents" int null, add "price_50_cents" int null;',
      'alter table "mentor_profiles" add constraint "mentor_profiles_price_25_positive" check ("price_25_cents" > 0);',
      'alter table "mentor_profiles" add constraint "mentor_profiles_price_50_positive" check ("price_50_cents" > 0);',
    ]);
  });

  it('removes only the price checks and columns', () => {
    const subject = migration();
    subject.down();

    expect(subject.getQueries()).toEqual([
      'alter table "mentor_profiles" drop constraint "mentor_profiles_price_25_positive";',
      'alter table "mentor_profiles" drop constraint "mentor_profiles_price_50_positive";',
      'alter table "mentor_profiles" drop column "price_25_cents", drop column "price_50_cents";',
    ]);
  });
});
