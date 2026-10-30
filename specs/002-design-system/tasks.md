# Tasks 002 — Design system

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Token check: `tools/design-tokens/check.mjs` validates DTCG shapes for the used
      types, resolves aliases, detects cycles and checks light/dark parity of the semantic tier;
      `pnpm test:tokens` proves each failure on a fixture
  - Gate: `pnpm test:tokens`

- [x] **T02** — Tokens package `packages/design/tokens` (`scope:design`, `type:tokens`):
      primitives from the bookmarks palette, light and dark semantic files, Style Dictionary v5
      build writing the committed `generated/tokens.css` (`:root`, media query and
      `data-theme` blocks) and `generated/tokens.ts`
  - Gate: `pnpm nx build design-tokens`, `pnpm tokens:check`

- [x] **T03** — Stale-output check: `tokens:check` builds into a temporary folder and fails when
      `generated/` differs; `tokens:check` and `test:tokens` added to `verify:local` and CI
  - Gate: `pnpm test:tokens` (stale case), `pnpm verify:local`

- [x] **T04** — Boundaries for the tokens package: `packages/design/` allowed in the shared
      allow-lists; `no-design-in-server-code` and the tokens-imports-nothing rule in
      dependency-cruiser and the Nx `depConstraints`, each with a case in `tools/boundaries/`
  - Gate: `pnpm dep-cruise`, `pnpm test:boundaries`, `pnpm nx affected --target=lint`

- [x] **T05** — UI kit skeleton `packages/design/ui` (`scope:design`, `type:ui`): index importing
      the token CSS and `base.css` (with `color-scheme` per theme, also under the forced
      `data-theme` selectors), re-exported `tokens`, Vite library build, Vitest with
      jsdom; the "every `var(--…)` is defined" test
  - Gate: `pnpm nx build design-ui`, `pnpm nx test design-ui`

- [x] **T06** — Stylelint with strict values on the UI kit CSS as part of its `lint` target, with
      a fixture proving a hex color and a pixel size fail
  - Gate: `pnpm nx lint design-ui`

- [x] **T07** — Boundaries for the UI kit and web apps: `ui-only-on-tokens` and
      `no-tokens-in-web` in dependency-cruiser; Nx `type:web` → `scope:contracts`, `type:ui`; ESLint
      ban on the JSX `style` attribute in web apps; one proving case each
  - Gate: `pnpm dep-cruise`, `pnpm test:boundaries`, `pnpm nx affected --target=lint`

- [x] **T08** — Ladle in the UI kit: `ladle` and `ladle-build` targets, light/dark switch in
      `.ladle/components.tsx`; `ladle-build` in CI
  - Gate: `pnpm nx run design-ui:ladle-build`
  - Verified: a headless browser showed the color story switching between the light and dark
    palettes, with the body on the dark canvas token. `pnpm peers check` reports two unmet peers
    inside Ladle's own tree (react-inspector wants React 18, tsconfck wants TypeScript 5); the
    catalog builds, and nothing of Ladle ships.

- [x] **T09** — `Button` (primary, secondary, ghost, danger) with test and story, plus the
      shared test helpers: `user-event` and an axe check on `axe-core` (`vitest-axe` is unmaintained)
  - Gate: `pnpm nx test design-ui`, `pnpm nx lint design-ui`

- [x] **T10** — `Form`, `Field` and `Input` (required label, `hideLabel`), with tests, the
      type-level test for a missing label, and stories
  - Gate: `pnpm nx test design-ui`, `pnpm nx test-typecheck design-ui`

- [x] **T11** — `Card`, `Alert`, `Tag`, `List` and `ListItem` with tests and stories
  - Gate: `pnpm nx test design-ui`, `pnpm nx lint design-ui`

- [x] **T12** — `Heading`, `Text` (muted), `Link` with tests and stories
  - Gate: `pnpm nx test design-ui`, `pnpm nx lint design-ui`

- [x] **T13** — `Page`, `Stack` and `Inline` with token-based gaps, tests and stories
  - Gate: `pnpm nx test design-ui`, `pnpm nx run design-ui:ladle-build`

- [x] **T14** — Bookmarks web app on `@pocket-comms/design-ui`: `App.tsx` rebuilt from kit components,
      `styles.css` and its import removed, `App.spec.tsx` green; the `no-css-in-web`
      dependency-cruiser rule with its proving case (it can only pass once the app has no CSS)
  - Gate: `pnpm nx test bookmarks-web`, `pnpm nx build bookmarks-web`, `pnpm dep-cruise`
  - Verified: the built app, with a mocked list response, rendered the header, form, list, tags
    and actions in the light and the dark system color scheme (body on the canvas token).

- [x] **T15** — Docs: blueprint `AGENTS.md`, `README.md` and `TEMPLATE.md` describe the design
      packages and the "no CSS in web apps" rule; spec and plan status set to `Done`
  - Gate: `pnpm format:check`, `pnpm verify:local`
