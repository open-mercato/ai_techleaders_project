# DevMentor test-environment notes

The working Linux command is:

```sh
sh .ai/scripts/test-env-up.sh
```

This sandbox has PostgreSQL 17 server binaries under `/usr/lib/postgresql/17/bin`, but
no Docker daemon and no `jq`. The generated launcher therefore starts a disposable local
cluster on a random loopback port, runs migrations, runs the idempotent seed twice, builds
and starts the production Next.js app, then proves `/`, database health, and a seeded
mentee authentication round trip. This prevents the old macOS launcher from failing on
`launchctl`, BSD `date`, Docker, or `jq`. PostgreSQL's Unix socket must be placed in the
disposable data directory because `/var/run/postgresql` is not writable here; otherwise
`pg_ctl` fails even though the chosen TCP port is free.

Browser provisioning downloaded the repository-pinned Chrome runtime, but this sandbox
does not contain its Linux shared libraries and has no passwordless package installer.
`agent-browser doctor` therefore remains failed. The app can still be recorded with a
host browser; the descriptor must keep `browser.installed` false until doctor passes.

The Lesson 14 branch adds relative-time fixtures. Reset them between takes without
rebuilding the app:

```sh
set -a
. .ai/qa/test-env.env
set +a
npm run lesson:14:seed
```

The final verified launch took 23 seconds cold and 1 second warm. Application-only
source changes rebuild Next.js without rerunning `npm ci`, so an unrelated local dev server
does not lose modules while the recording environment refreshes.
