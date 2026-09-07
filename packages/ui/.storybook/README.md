# DevMentor design system: local Storybook

Run from the repository root:

```sh
npm run storybook
```

Open `http://127.0.0.1:6006/?path=/story/design-system-components--gallery`.
The server binds only to loopback. Theme changes include portal surfaces as well
as inline components. Blue and Green each support light/dark appearance.

The separate preview in `prototypes/devmentor-journey/` uses shared DevMentor
components and local mocks. Open it at
`http://127.0.0.1:6006/prototypes/devmentor-journey/index.html`.
`npm run storybook` builds this preview before starting Storybook.

## What is in the catalogue

- Visual, searchable component gallery.
- Semantic colors, locally bundled Inter/DM Mono, spacing/radius/elevation,
  motion and responsive foundations.
- Primitive controls, navigation, overlays and feedback.
- Shared CrudForm with right-aligned secondary/primary actions, FormField, DataTable,
  feedback and workspace/auth layouts with full-width sign-in actions.
- Product patterns for the project backlog, built from reusable package components.
- Text conversations with own/received messages, delivery states, keyboard-scrollable
  history and written answers after session completion.
- Usage/accessibility, contribution and delivery coverage documentation.

Stories use production components. Local form examples are isolated by MSW under
`/storybook-api/*`; they do not authenticate, create real bookings, or charge money.
The application supplies data and callbacks to these UI components. The examples
do not define backend policy.

## Package use

```tsx
import { Button, Input, MentorProfileCard } from '@devmentor/ui';
import { CrudForm, DataTable, AppShell } from '@devmentor/ui/backend';
import '@devmentor/ui/tokens.css';
```

## Checks

`npm run typecheck`, `npm run typecheck:storybook`, `npm run lint`,
`npm run typecheck:prototype`, `npm run test:unit:coverage`,
`npm run test:prototype`, `npm run build`, `npm run build-storybook`.
New production source must be explicitly included in the 100% per-file coverage
scope. Browser checks use an isolated pinned agent-browser session and local mocks.

`npm run build-storybook` builds the prototype first, then the component catalogue.
The generated Storybook site includes the preview. CI checks Storybook and the
prototype alongside the application.

Publication and all other remote writes require explicit user approval.
