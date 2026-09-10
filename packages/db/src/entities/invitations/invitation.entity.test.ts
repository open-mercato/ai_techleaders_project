import type { EntityProperty } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { User } from '../auth/user.entity';
import { Invitation } from './invitation.entity';

function typeName(property: EntityProperty): string {
  const { type } = property as unknown as { type: string | { name: string } };
  return typeof type === 'string' ? type : type.name;
}

const meta = Invitation.init().meta;
const properties = meta.properties;

describe('Invitation entity', () => {
  it('stores the hash and lifecycle fields without ever defining a raw token column', () => {
    expect(Object.keys(properties).sort()).toEqual([
      'acceptedAt',
      'acceptedBy',
      'batch',
      'createdAt',
      'email',
      'expiresAt',
      'id',
      'publishDueAt',
      'revokedAt',
      'stackTags',
      'tokenHash',
      'updatedAt',
    ]);
    expect(properties).not.toHaveProperty('token');
  });

  it('maps the fixed-width token hash and normalized address to invitations', () => {
    expect(meta.className).toBe('Invitation');
    expect(meta.tableName).toBe('invitations');
    expect(properties.email.length).toBeUndefined();
    expect(properties.email.nullable).toBeFalsy();
    expect(properties.tokenHash.length).toBe(64);
    expect(properties.tokenHash.unique).toBe(true);
  });

  it('stores only the four beachhead stack tags in a required native text array', () => {
    expect(typeName(properties.stackTags)).toBe('enum');
    expect(properties.stackTags.array).toBe(true);
    expect(properties.stackTags.items).toEqual(['TypeScript', 'React', 'Python', 'AI agents']);
    expect(properties.stackTags.nullable).toBeFalsy();
  });

  it('stores expiry as required and each lifecycle outcome as an optional instant', () => {
    expect(typeName(properties.expiresAt)).toBe('DateTimeType');
    expect(properties.expiresAt.nullable).toBeFalsy();
    for (const property of [properties.acceptedAt, properties.publishDueAt, properties.revokedAt]) {
      expect(typeName(property)).toBe('DateTimeType');
      expect(property.nullable).toBe(true);
    }
  });

  it('resolves the optional accepted user without making the relation unique', () => {
    expect(properties.acceptedBy.kind).toBe('m:1');
    expect(properties.acceptedBy.nullable).toBe(true);
    expect(properties.acceptedBy.unique).toBeFalsy();
    expect(properties.acceptedBy.deleteRule).toBe('restrict');
    expect(properties.acceptedBy.entity).toBeDefined();
    expect(User.meta.className).toBe('User');
  });

  it('keeps the operator batch label optional and bounded', () => {
    expect(properties.batch.length).toBe(64);
    expect(properties.batch.nullable).toBe(true);
  });

  it('declares the pending-address uniqueness and complete-acceptance invariants', () => {
    expect(meta.uniques).toEqual([
      {
        name: 'invitations_pending_email_unique',
        properties: ['email'],
        where: { acceptedAt: null, revokedAt: null },
      },
    ]);
    expect(meta.checks).toEqual([
      {
        name: 'invitations_acceptance_complete',
        expression: '("accepted_at" is null) = ("accepted_by_id" is null)',
      },
    ]);
  });
});
