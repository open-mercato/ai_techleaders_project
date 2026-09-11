import { z } from 'zod';

export interface VocabularyOption<Value extends string> {
  value: Value;
  label: Value;
}

/**
 * Define a closed product vocabulary once and derive every runtime representation
 * from that tuple.
 *
 * Values are already user-facing labels for the vocabularies in this product. Keeping
 * them identical prevents storage values, validation and form labels from acquiring
 * separate hard-coded lists. Database migrations still carry their own handwritten
 * CHECK literals because the `db` package may not import `core`.
 */
export function defineVocabulary<const Values extends readonly [string, ...string[]]>(
  values: Values,
) {
  return {
    values,
    options: values.map((value) => ({ value, label: value })) as {
      readonly [Index in keyof Values]: VocabularyOption<Values[Index] & string>;
    },
    schema: z.enum(values),
  };
}
