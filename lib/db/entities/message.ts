import { defineEntity, type InferEntity } from "@mikro-orm/core";

/**
 * Defined with `defineEntity` rather than decorators: Next.js compiles with SWC,
 * where `emitDecoratorMetadata` is unavailable, so decorator-based entities would
 * need a separate reflection step. This form is plain TypeScript.
 */
export const Message = defineEntity({
  name: "Message",
  tableName: "messages",
  properties: (p) => ({
    id: p.integer().primary().autoincrement(),
    body: p.string(),
    createdAt: p.datetime().onCreate(() => new Date()),
  }),
});

export type Message = InferEntity<typeof Message>;
