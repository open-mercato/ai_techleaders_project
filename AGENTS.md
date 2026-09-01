# AGENTS.md

Instructions for any AI agent (Claude Code, other CLIs, autonomous runs) working in
this repository.

## Project

Next.js + TypeScript app. Standard scripts: `npm run dev`, `npm run build`,
`npm run typecheck`, `npm run lint`.

## Spec-Driven Development (SDD)

Nontrivial work in this repo is defined by a spec before it's implemented. All SDD
artifacts live under `.ai/`.

```
.ai/
  specs/                  active specs
    implemented/          specs whose implementation has landed
    archive/               specs that were superseded or abandoned
  runs/                   logs of autonomous AI runs
  lessons.md              index of lessons learned
  lessons/                detailed lesson write-ups
```

### Specs — `.ai/specs/`

- Naming: `YYYY-MM-DD-slug.md`, dated the day the spec was written, `slug` a short
  kebab-case description (e.g. `2026-09-01-user-auth-refresh-tokens.md`).
- Lifecycle:
  1. New/active work: file lives directly in `.ai/specs/`.
  2. Once the implementation is complete, verified, and merged: `git mv` the file into
     `.ai/specs/implemented/`.
  3. If a spec is superseded, abandoned, or no longer accurate: `git mv` it into
     `.ai/specs/archive/` instead of deleting it.
- Rules:
  - Before starting a nontrivial feature or fix, check `.ai/specs/` and
    `.ai/specs/implemented/` for a spec that already covers it.
  - If none exists, write one first for anything beyond a small/obvious change.
  - Never edit a spec after it has moved to `implemented/` or `archive/` — if
    requirements change, write a new spec instead.
  - A spec should cover: Problem/Goal, Non-goals, Approach, Acceptance criteria.

### Runs — `.ai/runs/`

- Every autonomous AI run (an agent operating on a task without a human reviewing
  each step — e.g. a workflow, an unattended long-running session) produces exactly
  one run log.
- Naming: `YYYY-MM-DD-slug.md`, dated the day the run happened.
- A run log should cover: what was requested, what was done, files touched, outcome,
  and any follow-ups left for a human or a future run.

### Lessons — `.ai/lessons.md` + `.ai/lessons/`

- `.ai/lessons.md` is a chronological index — one line per lesson, most recent first.
  Short lessons can be stated inline; anything longer gets its own file in
  `.ai/lessons/slug.md` and is linked from the index.
- Add a lesson when:
  - a nontrivial bug is fixed (what was wrong, why, the fix, how to avoid it again),
  - a project-specific gotcha or convention is discovered,
  - the user corrects an agent's approach in a way that should persist beyond the
    current session.
- Check `.ai/lessons.md` at the start of related work before repeating a known
  mistake.

### Enforcement

- Use this `.ai/` structure for specs, run logs, and lessons — don't create ad hoc
  scratch docs elsewhere in the repo for these purposes.
- Keep the `YYYY-MM-DD-slug.md` naming convention exactly as specified above.

## Working Rules

Distilled from [Boris Cherny's Claude Code
tips](https://ykdojo.github.io/claude-code-tips/content/boris-claude-code-tips).
These govern *how* you work; the SDD section above governs *what artifacts* you leave
behind.

1. **Plan first, and re-plan instead of patching.** Front-load the thinking: a
   detailed spec beats an ambiguous prompt every time. When implementation goes
   sideways, stop and revise the plan/spec rather than reactively troubleshooting on
   top of a bad foundation. For high-stakes plans, get a second opinion — have a
   subagent review the plan as a skeptical staff engineer before you write code.

2. **Capture every correction the moment it happens.** When the user corrects your
   approach, write the lesson to `.ai/lessons.md` (and update this file if it's a
   standing rule) *before* continuing the task. Rules that only live in the current
   conversation are lost; the point is that the same mistake never recurs.

3. **Promote anything repeated into a skill or command.** If you find yourself doing
   the same multi-step task more than a couple of times, propose codifying it as a
   project skill or slash command in `.claude/` instead of re-deriving the steps each
   run.

4. **Don't ship the first draft — grill it.** Before declaring work done or moving a
   spec to `implemented/`, check the diff against the spec's acceptance criteria and
   actively try to break it. If the result is merely adequate, scrap it and implement
   the elegant version rather than iterating on a mediocre base. Report failures
   plainly; never self-report success you haven't verified.

5. **Delegate breadth to subagents; keep the main context for judgment.** Push wide
   searches, multi-file reads, and independent parallel work into subagents and keep
   only their conclusions in the main thread. A clean context window is a
   correctness feature, not just a cost saving.
