// Types the values published by global-setup.ts via `project.provide()`,
// so `inject("baseUrl")` is checked rather than `any`.
declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
    databaseUrl: string;
  }
}

export {};
