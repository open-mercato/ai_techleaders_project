This is a [Next.js](https://nextjs.org) TypeScript project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates
as you edit the file. Run `npm run typecheck` to validate the TypeScript project
or `npm run build` for a production build.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Database

Persistence uses [MikroORM](https://mikro-orm.io) against PostgreSQL. Entities are
declared with `defineEntity` rather than decorators, because Next.js compiles with
SWC and cannot emit the decorator metadata the decorator API relies on.

```bash
cp .env.example .env.local
docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17-alpine
npm run db:migrate
```

| Script | Purpose |
| --- | --- |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:migration:create` | Generate a migration from entity changes |

`next build` never connects to the database. Anything that reads it is marked
`export const dynamic = "force-dynamic"`, so no `DATABASE_URL` is needed to build.

## Testing

Two layers, each with its own Vitest config.

**Unit** — `tests/unit/**/*.test.ts`. Pure TypeScript, no I/O, runs in ~1s.

```bash
npm test          # run once
npm run test:watch
```

**Integration** — `tests/integration/**/*.spec.ts`. Starts a throwaway Postgres
container via [testcontainers](https://testcontainers.com), applies migrations,
boots a production build of the app on a free port, and drives it with
[`agent-browser`](https://agent-browser.dev).

```bash
npm run browser:install   # once: downloads Chrome + Linux system libraries
npm run build             # `next start` needs a production build
npm run test:integration
```

Requires a running Docker daemon. The suite provisions its own database and
ignores `DATABASE_URL`.

- `tests/integration/global-setup.ts` owns the container and app lifecycle, and
  publishes `baseUrl` / `databaseUrl` to specs through Vitest's `inject()`.
- `tests/integration/agent-browser.ts` wraps the CLI. agent-browser is a binary,
  not a library, so each call shells out; the browser persists in a background
  daemon keyed by `--session`, giving each spec file an isolated browser.
- `health.spec.ts` deliberately uses no browser. If it fails, the fault is the
  container, the migrations or the app boot — not agent-browser.
- Failing browser specs write a screenshot to `test-results/`, which CI uploads.

Component-level tests are not set up; UI behaviour is covered by the browser
layer instead. Add `jsdom` and `@testing-library/react` to `vitest.config.mts` if
you want them.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `master`.
Jobs run in parallel so one failure does not mask another: **Lint**, **Typecheck**,
**Build**, **Unit tests**, and **Integration tests**.

`npm ci` requires `package-lock.json` to be committed.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
