import { defineConfig } from 'vitest/config';

// No React plugin is configured on purpose. Vitest's built-in esbuild transform already
// compiles `.tsx` with the automatic JSX runtime (`"jsx": "react-jsx"` in tsconfig.base.json),
// which is everything a component test needs. `@vitejs/plugin-react` only adds Fast Refresh and
// Babel-only transforms (e.g. the React Compiler), neither of which runs under `vitest run`, so
// adding it here would be configuration that changes nothing.
export default defineConfig({
  test: {
    // Node is the default so the existing node-only tests keep running unchanged. React
    // component tests opt in per file with a `// @vitest-environment jsdom` pragma on line 1.
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      // The `npm run setup` installer lives outside packages/; without this its tests
      // would never be collected and its coverage gate would pass vacuously.
      'scripts/**/*.test.mjs',
      // The integration *harness* has logic of its own — `waitForMail` parses log lines and
      // has to time out cleanly — and that logic cannot be proven by the suite it serves: a
      // broken helper there shows up as a scenario that hangs, in a job that needs Docker
      // and a browser runtime. `*.test.ts` under `tests/` is collected here and run without
      // either; the browser scenarios are `*.integration.test.ts` and stay excluded below.
      'tests/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    exclude: [
      'tests/integration/**/*.integration.test.ts',
      '**/.next/**',
      '**/node_modules/**',
      '**/dist/**',
    ],
    coverage: {
      provider: 'v8',
      include: [
        // Route files with a decision in them. `/api/users` guards `GET` at the route as
        // well as in the service; the three auth routes decide the whole OAuth ordering,
        // the `?login` rule and the sign-out contract, so all of it is production behavior
        // and is covered like any other.
        'packages/app/src/app/api/auth/github/route.ts',
        'packages/app/src/app/api/auth/github/callback/route.ts',
        'packages/app/src/app/api/auth/login/route.ts',
        'packages/app/src/app/api/auth/logout/route.ts',
        'packages/app/src/app/api/auth/register/route.ts',
        'packages/app/src/app/api/auth/verify-email/route.ts',
        'packages/app/src/app/api/invitations/\\[token\\]/route.ts',
        'packages/app/src/app/api/invitations/\\[token\\]/accept/route.ts',
        'packages/app/src/app/api/mentors/me/onboarding/route.ts',
        'packages/app/src/app/api/mentors/me/route.ts',
        'packages/app/src/app/api/mentors/me/publish/route.ts',
        'packages/app/src/app/api/mentors/me/unpublish/route.ts',
        'packages/app/src/app/api/mentors/\[slug\]/route.ts',
        'packages/app/src/app/api/users/route.ts',
        // Every guarded page and layout. Page-level enforcement is per file by design — a
        // layout does not re-run on a client-side navigation — so each one is its own entry
        // and each one needs both the authorized and the redirected branch.
        //
        // **The parentheses of a Next route group must be escaped.** These entries are
        // globs, and `(auth)` unescaped is a picomatch group that matches the *directory*
        // `auth`, so the pattern silently matches nothing and the file drops out of the
        // report — a coverage gate that passes because it is measuring less than it says.
        'packages/app/src/app/\\(auth\\)/register/page.tsx',
        'packages/app/src/app/\\(auth\\)/return-to-href.ts',
        'packages/app/src/app/\\(auth\\)/sign-in/page.tsx',
        'packages/app/src/app/\\(mentee\\)/layout.tsx',
        'packages/app/src/app/\\(mentee\\)/home/page.tsx',
        'packages/app/src/app/\\(mentor\\)/layout.tsx',
        'packages/app/src/app/\\(mentor\\)/mentor/page.tsx',
        'packages/app/src/app/\\(mentor\\)/mentor/mentor-onboarding-status.tsx',
        'packages/app/src/app/\\(mentor\\)/mentor/profile/mentor-profile-client.tsx',
        'packages/app/src/app/\\(mentor\\)/mentor/profile/page.tsx',
        'packages/app/src/app/invitation/\\[token\\]/page.tsx',
        'packages/app/src/app/invitation/\\[token\\]/invitation-actions.tsx',
        'packages/app/src/app/m/\\[slug\\]/page.tsx',
        'packages/app/src/app/admin/layout.tsx',
        'packages/app/src/app/admin/page.tsx',
        'packages/app/src/app/admin/users/page.tsx',
        'packages/app/src/app/admin/users/users-list.tsx',
        // The email half of the two `(auth)` screens: a Client Component, so it is rendered
        // under jsdom rather than invoked, and every decision in it — the field types, the
        // two `autocomplete` values, the endpoint, where a sign-in navigates — is a way to
        // get a credential screen wrong.
        'packages/app/src/components/email-auth-form.tsx',
        // The signed-in chrome the three layouts above delegate to, and the two modules
        // it composes: which links a role set may see, and the name in the user block.
        'packages/app/src/components/workspace-shell.tsx',
        // The default landing, in its own module because the client form needs it too and
        // `lib/session.ts` imports `next/headers`.
        'packages/app/src/lib/home-for.ts',
        'packages/app/src/lib/nav.ts',
        'packages/app/src/lib/session.ts',
        'packages/app/src/lib/sign-in-redirect.ts',
        'packages/app/src/lib/workspace-user.ts',
        'packages/core/src/config/env.ts',
        'packages/core/src/container/container.ts',
        'packages/core/src/domain/vocabulary.ts',
        'packages/core/src/domain/readiness.ts',
        'packages/core/src/domain/slug.ts',
        'packages/core/src/domain/vocabularies/stack-tags.ts',
        'packages/core/src/http/apiHandler.ts',
        'packages/core/src/http/auth.ts',
        'packages/core/src/http/cookies.ts',
        'packages/core/src/http/errors.ts',
        'packages/core/src/http/makeCrudRoute.ts',
        'packages/core/src/http/owned-route.ts',
        'packages/core/src/http/outbound.ts',
        'packages/core/src/http/rate-limit.ts',
        'packages/core/src/http/return-to.ts',
        'packages/core/src/http/safe-url.ts',
        'packages/core/src/logger.ts',
        'packages/core/src/services/auth/adapters/github-identity.ts',
        'packages/core/src/services/auth/adapters/mock-github-identity.ts',
        'packages/core/src/services/auth/email-verification.service.ts',
        'packages/core/src/services/auth/github-identity.port.ts',
        'packages/core/src/services/auth/oauth-state.ts',
        'packages/core/src/services/auth/operator-authority.ts',
        'packages/core/src/services/auth/password.service.ts',
        'packages/core/src/services/auth/session-secret.ts',
        'packages/core/src/services/auth/session.service.ts',
        'packages/core/src/services/auth/token.service.ts',
        'packages/core/src/services/auth/user.service.ts',
        'packages/core/src/services/notifications/adapters/log-mailer.ts',
        'packages/core/src/services/notifications/adapters/resend-mailer.ts',
        'packages/core/src/services/notifications/mailer.port.ts',
        'packages/core/src/services/invitations/invitation.service.ts',
        'packages/core/src/services/mentors/mentor-profile.service.ts',
        'packages/core/src/services/mentors/readiness.ts',
        'packages/core/src/time/clock.ts',
        'packages/core/src/validators/auth/fields.ts',
        'packages/core/src/validators/auth/login.schema.ts',
        'packages/core/src/validators/auth/register.schema.ts',
        'packages/core/src/validators/mentors/mentor-profile-update.schema.ts',
        'packages/db/src/config.ts',
        'packages/db/src/env.ts',
        'packages/db/src/entities/auth/rate-limit.entity.ts',
        'packages/db/src/entities/auth/roles.ts',
        'packages/db/src/entities/auth/user.entity.ts',
        'packages/db/src/entities/availability/slot.entity.ts',
        'packages/db/src/entities/index.ts',
        'packages/db/src/entities/invitations/invitation.entity.ts',
        'packages/db/src/entities/mentors/mentor-profile.entity.ts',
        'packages/db/migrations/Migration20260910170021_availability_slots.ts',
        'packages/db/src/seeders/database.seeder.ts',
        'packages/db/src/seeders/seed-password.ts',
        'packages/ui/src/backend/actions/WorkflowAction.tsx',
        'packages/ui/src/backend/api/useApiResource.ts',
        'packages/ui/src/backend/feedback/EmptyState.tsx',
        'packages/ui/src/backend/feedback/ErrorMessage.tsx',
        'packages/ui/src/backend/feedback/LoadingMessage.tsx',
        'packages/ui/src/backend/feedback/ReadinessChecklist.tsx',
        'packages/ui/src/backend/forms/CrudForm.tsx',
        'packages/ui/src/backend/panels/ResourcePanel.tsx',
        'packages/ui/src/backend/forms/FormField.tsx',
        'packages/ui/src/backend/shell/AppShell.tsx',
        'packages/ui/src/backend/shell/AuthLayout.tsx',
        'packages/ui/src/backend/tables/DataTable.tsx',
        'packages/ui/src/components/auth/AccessStatus.tsx',
        'packages/ui/src/components/auth/AccountForm.tsx',
        'packages/ui/src/components/auth/AuthFeedback.tsx',
        'packages/ui/src/components/auth/SignOutAction.tsx',
        'packages/ui/src/components/availability/AvailabilityPicker.tsx',
        'packages/ui/src/components/bookings/BookingSummary.tsx',
        'packages/ui/src/components/disputes/DisputeDetail.tsx',
        'packages/ui/src/components/invitations/InvitationBatch.tsx',
        'packages/ui/src/components/mentors/MentorProfileCard.tsx',
        'packages/ui/src/components/mentors/MentorProfileEditor.tsx',
        'packages/ui/src/components/mentors/MentorPageView.tsx',
        'packages/ui/src/components/mentors/MentorOnboarding.tsx',
        'packages/ui/src/components/mentors/MentorReviews.tsx',
        'packages/ui/src/components/mentors/MentorSearch.tsx',
        'packages/ui/src/components/mentors/mentor-search.ts',
        'packages/ui/src/components/mentors/TechnologyChips.tsx',
        'packages/ui/src/components/mentors/technology-icons.ts',
        'packages/ui/src/components/notes/NoteReview.tsx',
        'packages/ui/src/components/operators/MetricSummary.tsx',
        'packages/ui/src/components/payments/PaymentStatus.tsx',
        'packages/ui/src/components/sessions/SessionCard.tsx',
        'packages/ui/src/components/sessions/WrittenAnswer.tsx',
        'packages/ui/src/components/ui/accordion.tsx',
        'packages/ui/src/components/ui/alert-dialog.tsx',
        'packages/ui/src/components/ui/alert.tsx',
        'packages/ui/src/components/ui/avatar.tsx',
        'packages/ui/src/components/ui/badge.tsx',
        'packages/ui/src/components/ui/breadcrumb.tsx',
        'packages/ui/src/components/ui/button.tsx',
        'packages/ui/src/components/ui/card.tsx',
        'packages/ui/src/components/ui/checkbox.tsx',
        'packages/ui/src/components/ui/dialog.tsx',
        'packages/ui/src/components/ui/dropdown-menu.tsx',
        'packages/ui/src/components/ui/input.tsx',
        'packages/ui/src/components/ui/label.tsx',
        'packages/ui/src/components/ui/pagination.tsx',
        'packages/ui/src/components/ui/popover.tsx',
        'packages/ui/src/components/ui/progress.tsx',
        'packages/ui/src/components/ui/radio-group.tsx',
        'packages/ui/src/components/ui/select.tsx',
        'packages/ui/src/components/ui/separator.tsx',
        'packages/ui/src/components/ui/skeleton.tsx',
        'packages/ui/src/components/ui/switch.tsx',
        'packages/ui/src/components/ui/tabs.tsx',
        'packages/ui/src/components/ui/textarea.tsx',
        'packages/ui/src/components/ui/tooltip.tsx',
        'packages/ui/src/time/formatInstant.ts',
        'packages/ui/src/time/LocalTime.tsx',
        'scripts/invite.ts',
        'scripts/setup/effects.mjs',
        'scripts/setup/index.mjs',
        'scripts/setup/run.mjs',
        'scripts/setup/steps.mjs',
        'scripts/storybook/effects.mjs',
        'scripts/storybook/index.mjs',
        'scripts/storybook/run.mjs',
        // Harness code, under the production gate on purpose: `waitForMail` parses log
        // lines, tolerates a half-written flush and has to time out rather than hang, and
        // every one of those branches is a way for an integration failure to be reported as
        // something it is not. The suite it serves cannot cover it — it needs Docker and a
        // browser runtime — so the unit gate is the only thing that can.
        'tests/integration/mail.ts',
      ],
      reportsDirectory: 'coverage/unit',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        perFile: true,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
