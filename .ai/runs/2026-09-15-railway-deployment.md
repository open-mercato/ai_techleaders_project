# Railway deployment

## Requested

Deploy DevMentor to Railway with all required services and settings, and enable
per-pull-request preview environments.

## Done

- Created the Railway project `DevMentor` in the configured workspace.
- Added the GitHub-backed `app` service from the repository root and a managed
  PostgreSQL service with a persistent volume.
- Connected the app source to the repository's canonical
  `open-mercato/ai_techleaders_project` identity so GitHub PR webhooks target the
  same repository Railway tracks.
- Generated Railway domains for the production and staging app instances.
- Configured the app to use the managed database, production mode, immutable
  migration snapshots, the Railway deployment domain, and the repository's safe
  proxy setting.
- Added a generated production session secret and configured the existing Resend
  credential without writing either secret to this record.
- Configured `npm run db:migrate` as the pre-deploy command, with
  `DB_MIGRATIONS_SNAPSHOT=false` supplied as a service variable, and `/api/health` as
  the deployment health check.
- Created a dedicated `staging` base environment for PR previews. It uses its own
  session secret and intentionally nonfunctional mail credentials so pull-request
  code cannot access the production Resend key.
- Enabled Railway PR environments for human- and bot-authored pull requests, using
  `staging` as the base environment.
- Applied all committed migrations to the new production and staging databases, then
  verified fresh GitHub-source deployments with the migration command restored.
- Registered the existing local public SSH key with the Railway workspace to diagnose
  the initial database bootstrap from inside the service container. No private key was
  copied or recorded.
- Triggered a documentation-only pull request to exercise Railway's GitHub PR hook and
  ephemeral environment lifecycle end to end.
- Corrected the deployment guide after the probe established that Railway rejects a
  leading shell-style environment assignment in its pre-deploy command.

## Files touched

- `.ai/runs/2026-09-15-railway-deployment.md`
- `.ai/lessons.md`
- `docs/DEVELOPMENT.md`

## Outcome

Production and the staging preview base deployed successfully from `master` and each
returned `/api/health` with `status: "ok"` and `database: "up"`. Probe PR #63 created
the ephemeral `ai_techleaders_project-pr-63` environment from `staging`, provisioned
its own PostgreSQL service and volume, selected the PR branch, applied all eight
migrations on the fresh database, generated a unique domain, and returned the same
healthy response.

## Follow-ups

- Configure production GitHub OAuth credentials and operator emails if those
  optional capabilities should be enabled.
- Replace the temporary Resend sender with a sender on a verified production domain
  before relying on general outbound email delivery.
- Add independent uptime/database monitoring because Railway's deployment health
  check only evaluates the HTTP status returned by `/api/health`.
