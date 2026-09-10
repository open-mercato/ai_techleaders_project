import { ValidationError, type FieldErrors } from '../http/errors';

export interface ReadinessItem<Key extends string = string> {
  key: Key;
  label: string;
  met: boolean;
}

export interface Readiness<Key extends string = string> {
  ready: boolean;
  items: ReadinessItem<Key>[];
}

export interface ReadinessRequirement<Input, Key extends string> {
  key: Key;
  label: string;
  met: (input: Input) => boolean;
}

export function defineReadiness<Input, const Key extends string>(
  requirements: readonly ReadinessRequirement<Input, Key>[],
) {
  function evaluate(input: Input): Readiness<Key> {
    const items = requirements.map(({ key, label, met }) => ({ key, label, met: met(input) }));
    return { ready: items.every((item) => item.met), items };
  }

  function assert(input: Input): Readiness<Key> {
    const readiness = evaluate(input);
    if (!readiness.ready) {
      const fieldErrors: FieldErrors = {};
      for (const item of readiness.items) {
        if (!item.met) fieldErrors[item.key] = [item.label];
      }
      throw new ValidationError('Complete the missing profile details before publishing.', fieldErrors);
    }
    return readiness;
  }

  return { evaluate, assert };
}
