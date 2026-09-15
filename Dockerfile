# syntax=docker/dockerfile:1

FROM node:24-alpine AS dependencies

WORKDIR /app

# Copy workspace manifests first so dependency installation remains cached until a
# manifest or the lockfile changes.
COPY package.json package-lock.json ./
COPY packages/app/package.json packages/app/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci

FROM dependencies AS build

ENV NEXT_TELEMETRY_DISABLED=1

COPY tsconfig.json tsconfig.base.json ./
COPY packages ./packages

RUN npm run build

# Migration tooling is a production dependency of @devmentor/db. Prune the test,
# lint, Storybook, and build-only packages after the compiled Next output exists.
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Keep the workspace source because MikroORM migrations are TypeScript. The pruned
# dependency tree still contains the CLI, dotenv, and tsx as deliberate production
# dependencies of @devmentor/db. Everything is owned by the unprivileged process user.
COPY --from=build --chown=node:node /app /app

USER node

EXPOSE 3000

# The health route intentionally does not resolve the DI container, so this preflight
# runs its production-only SESSION_SECRET and MAIL_API_KEY checks directly. That
# prevents an invalid release from being marked healthy before auth is first used.
CMD ["/bin/sh", "-c", "npm run deploy:preflight && exec ./node_modules/.bin/next start packages/app --hostname 0.0.0.0"]
