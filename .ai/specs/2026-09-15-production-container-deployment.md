# Production container deployment

## Problem and goal

DevMentor has a placeholder `Dockerfile` and a Compose file intended only for local
PostgreSQL. It cannot currently be deployed safely as a production container on
Dokploy or Railway.

Prepare one production image that both platforms can build from the repository root,
plus a dedicated Dokploy-compatible Compose definition and operator documentation.
The deployment must start the Next.js workspace on the platform-provided network,
apply committed MikroORM migrations before serving, preserve PostgreSQL data, and keep
all credentials outside the image and repository.

## Non-goals

- Deploying to either provider, creating provider projects, domains, databases, or
  secrets.
- Adding CI/CD, automated backups, horizontal scaling, or zero-downtime schema-change
  orchestration.
- Seeding production data.
- Changing the local `docker-compose.yml` or `npm run setup` workflow.
- Reworking the existing `/api/health` contract.

## Approach

1. Replace the placeholder image with a Node 24 multi-stage Docker build that uses the
   committed lockfile, builds the npm-workspaces Next.js app, retains the migration
   production dependency tree (including the tooling needed by platform release
   commands), runs as the unprivileged `node` user, validates production-only secrets
   before serving, binds Next to `0.0.0.0`, and exposes port 3000.
2. Harden `.dockerignore` so local dependencies, build outputs, test evidence, VCS
   metadata, and every real `.env` file stay out of the build context while
   `.env.example` remains available as documentation.
3. Add `docker-compose.deploy.yml` for Dokploy. It builds the image, exposes (but does
   not publish) the application port, waits for PostgreSQL health, runs migrations
   before starting Next, uses a named database volume, and requires production
   credentials through Compose interpolation. Dokploy's native Domains feature owns
   external routing and TLS.
4. Document a Railway deployment using the same auto-detected root Dockerfile, a
   managed PostgreSQL service, and a provider pre-deploy migration command. Do not add
   legacy `railway.json`/`railway.toml` Config-as-Code because Railway has deprecated
   that format; document the current dashboard/CLI settings instead.
5. Document required variables, migration behavior, health checks, and first-deploy
   verification for both targets.

## Acceptance criteria

- `docker build .` produces a production image and does not embed a local `.env`.
- The image starts Next on `0.0.0.0`, honors `PORT`, has `/api/health`, and runs as a
  non-root user.
- Missing production boot credentials fail the container preflight before Next starts.
- The runtime image contains everything `npm run db:migrate` needs.
- `docker-compose.deploy.yml config` validates only when its required production
  inputs are supplied, has no fixed `container_name`, publishes no database port, and
  persists PostgreSQL data in a named volume.
- Compose applies migrations only after PostgreSQL is healthy and does not seed data.
- Railway instructions use a pre-deploy command rather than racing migrations in each
  web replica, and set `DB_MIGRATIONS_SNAPSHOT=false` for the immutable container.
- Dokploy instructions identify the production Compose path, service name, internal
  port, domain setup, required variables, and health endpoint.
- Existing build, lint, typecheck, and unit-coverage gates remain green.
