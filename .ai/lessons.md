# Lessons

Index of lessons learned by AI agents working on this project — bug fixes, gotchas,
and conventions worth remembering long-term. See `AGENTS.md` for the full policy on
when and how to add entries.

Format: `- YYYY-MM-DD — one-line summary [(details)](lessons/slug.md)`
Omit the link for lessons short enough to state inline.

<!-- Add new entries below this line, most recent first. -->

- 2026-09-01 — MikroORM v7 + Next monorepo gotchas, see [details](lessons/2026-09-01-mikro-orm-v7-next-monorepo.md): (1) v7 has no core decorators — use `defineEntity` + `p` builders; (2) cross-entity relations need per-property thunks (`() => p.oneToOne(X)...`) because `oneToOne` already wraps its arg as `entity: () => target`; (3) register entities as `globalThis` singletons or Next's RSC/SSR/route graphs create duplicate schema instances and `populate` throws `Cannot read properties of undefined (reading 'filter')`; (4) `MikroORM.init()` no longer connects — call `orm.connect()` and don't cache the failed promise; (5) `em.persistAndFlush` removed — use `persist` + `flush`.
- 2026-09-01 — Turbopack does not rewrite `.js`→`.ts` in relative imports the way `tsc` does; use **extensionless** relative imports in TS-source workspace packages (works for tsc/Turbopack/tsx). Symptom was `Module not found: Can't resolve './foo.js'` at build.
- 2026-09-01 — This sandbox exports `NODE_ENV=development` globally, which poisons `next build` (React `_global-error` prerender fails with `useContext` of null). The app's `build`/`start` scripts force `NODE_ENV=production` to compensate.
