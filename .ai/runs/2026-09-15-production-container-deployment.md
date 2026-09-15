# Production container deployment run

## Requested

Prepare DevMentor for deployment on Dokploy and/or Railway with the appropriate
Docker Compose file and supporting deployment artifacts.

## Done

- Wrote a deployment spec before implementation and had the plan reviewed as a
  production-readiness change.
- Replaced the placeholder image with a Node 24 multi-stage npm-workspaces build that
  starts Next as a non-root user, retains the TypeScript migration runtime, and prunes
  unrelated development dependencies after building.
- Reduced the Docker build context and excluded real environment files, local build
  output, test output, and repository run evidence.
- Added a production preflight that reuses the core production-secret gate before the
  web server starts.
- Added a dedicated Dokploy Compose stack with private PostgreSQL, a persistent named
  volume, a healthy-database dependency, a one-shot migration service, an app readiness
  check, and required secret interpolation.
- Added a deployment environment template and ignored its filled local copy.
- Documented exact Dokploy and Railway setup, migrations, proxy hops, health semantics,
  resource sizing, and backup responsibility. Deliberately omitted Railway's deprecated
  `railway.json`/`railway.toml` format.

## Files touched

- `.ai/specs/2026-09-15-production-container-deployment.md`
- `.dockerignore`
- `.gitignore`
- `Dockerfile`
- `docs/DEVELOPMENT.md`
- `deploy.env.example`
- `docker-compose.deploy.yml`
- `package.json`
- `packages/core/src/container/container.ts`
- `packages/core/src/container/index.ts`
- `packages/core/src/index.ts`

## Outcome

- `docker build -t devmentor-deploy:test .` passed.
- A disposable Compose project built both application targets, created a fresh
  PostgreSQL 17 volume, applied all eight migrations, started the app only afterward,
  reported the app healthy, ran it as UID/GID 1000, and returned
  `{"status":"ok","environment":"production","database":"up"}` from `/api/health`.
  The disposable containers, network, and volume were removed afterward.
- `docker compose -f docker-compose.deploy.yml config --quiet` passed with placeholder
  required values.
- The production preflight passed with valid placeholder secrets and failed as expected
  when `SESSION_SECRET` was absent.
- `npm run typecheck` passed.
- `npm run lint` passed with zero errors; existing generated/scratch files produced
  warnings.
- `npm run test:unit:coverage` passed: 152 files and 1,775 tests, with 100% statements,
  branches, functions, and lines.

## Follow-ups

- A human still needs to create the provider resources, set real secrets/domains, and
  configure tested database backups.
- No implementation follow-up remains. The provider resources and operational setup
  above are intentionally outside this local preparation task.
