# 0.1.0 (2026-09-15)

## Highlights

<!-- TODO: Highlights — auto-update-changelog leaves this blank for the human author to fill in. -->

## ✨ Features

- ✨ Bootstrap the npm-workspaces monorepo — Next.js app plus the core, db and ui packages, wired with MikroORM and awilix. (#2) *(@pkarw)*
- ✨ Adopt the domain-concept folder structure and the reusable API and UI layers that every route and page now builds on. (#4, #3) *(@pkarw)*
- ✨ One command sets up a fresh clone: `npm run setup` installs, writes `.env`, reuses any PostgreSQL already listening, migrates and seeds, and reports every step as ran or skipped (fixes #37). (#38) *(@pkarw)*
- ✨ Add the DevMentor design system, the Storybook catalogue and the clickable journey prototype. (#40) *(@zielivia)*
- ✨ Complete the E01 and E02 design handoff with the screen designs each epic is reviewed against. (#42) *(@zielivia)*
- ✨ Sign in with GitHub or with an email and password, with roles, route guards and email verification. (#47) *(@pat-lewczuk)*
- ✨ Mentors can be invited, publish a shareable profile page, set an approved session price and open availability slots (fixes #15, #16, #17, #18). (#46, #48) *(@pkarw)*

## 🐛 Fixes

- 📦 Launch Storybook through an npm runner isolated from an ancestor Yarn PnP install, so the catalogue starts outside a clean checkout. (#43) *(@pkarw)*

## 🧪 Testing

- 🧪 Refuse to publish a mentor page that has no technology selected, and cover the refusal. (#50) *(@pkarw)*

## 📝 Specs & Documentation

- 📝 Add the DevMentor 1.0 product brief, the research behind it, and the agent pipeline configuration. (#6) *(@zielivia)*
- 📝 Add the E01 accounts-and-roles spec, the platform-primitives catalogue and the grilling skills. (#39) *(@pat-lewczuk)*
- 📝 Add the E02 mentors-become-bookable spec and the domain-primitives catalogue. (#41) *(@pat-lewczuk)*

## 🚀 CI/CD & Infrastructure

- 🚀 Run typecheck, lint, unit tests and browser integration tests as independent pull-request checks. (#5) *(@pkarw)*

## 👥 Contributors

- @pkarw
- @zielivia
- @pat-lewczuk
