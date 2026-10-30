# Plan 002 — Design system

- **Spec:** [spec.md](./spec.md)
- **Status:** `Done` — approved by the human owner on 2026-10-19
- **ADR:** [0009 — Design system with DTCG tokens and a CSS Modules UI kit](../../docs/architecture/adr/0009-design-system-with-dtcg-tokens-and-a-css-modules-ui-kit.md)
  (accepted with this plan)

## 1. Affected projects

| Path                                                                | Change                                                                                                                                          | Nx tags                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `packages/design/tokens`                                            | New. DTCG sources (`src/*.tokens.json`), Style Dictionary v5 config, committed output in `generated/` (`tokens.css`, `tokens.ts`)               | `scope:design`, `type:tokens`             |
| `packages/design/ui`                                                | New. Components (`src/<component>/<Component>.tsx`, `.module.css`, `.spec.tsx`, `.stories.tsx`), base CSS, Vite library build, Ladle, Stylelint | `scope:design`, `type:ui`                 |
| `blueprints/bookmarks/apps/web`                                     | Uses `@pocket-comms/design-ui`; `styles.css` deleted                                                                                            | unchanged (`scope:bookmarks`, `type:web`) |
| `tools/design-tokens/`                                              | New. `check.mjs` (DTCG shape, aliases, cycles, light/dark parity, stale output) and `check.test.mjs`                                            | —                                         |
| `tools/boundaries/`                                                 | New cases for every new rule                                                                                                                    | —                                         |
| `.dependency-cruiser.cjs`                                           | New rules (§4); `packages/design/` added to the shared allow-lists                                                                              | —                                         |
| `eslint.config.mjs`                                                 | New `depConstraints`; `style` prop forbidden in web apps                                                                                        | —                                         |
| `stylelint.config.mjs`                                              | New. `stylelint-declaration-strict-value` for the UI kit                                                                                        | —                                         |
| `package.json`, `tools/verify-local.sh`, `.github/workflows/ci.yml` | `tokens:check`, `test:tokens` scripts; added to local and CI gates; Ladle build in CI                                                           | —                                         |
| `docs/architecture/adr/`                                            | ADR 0009 (accepted); ADR 0008 is `Accepted (amended by ADR 0009)`                                                                               | —                                         |
| `blueprints/bookmarks/AGENTS.md`, `README.md`, `TEMPLATE.md`        | Document the design packages and the "no CSS in web apps" rule                                                                                  | —                                         |

New dev dependencies (via the pnpm catalog): `style-dictionary` (v5), `stylelint`,
`stylelint-declaration-strict-value`, `@ladle/react`, `@testing-library/user-event`,
`vitest-axe` (with `axe-core`).

### Tokens package

- `src/primitives.tokens.json` (color scales, spacing, radii, font, shadow, motion),
  `src/semantic.light.tokens.json` and `src/semantic.dark.tokens.json` (same keys, aliases into
  the primitives).
- The `build` target runs Style Dictionary twice (light, dark) with DTCG parsing and writes:
  - `generated/tokens.css`: primitives and light semantics on `:root`; dark semantics under
    `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { … } }` and under
    `:root[data-theme='dark']`. Variable names are kebab-case paths (`--color-text-muted`).
  - `generated/tokens.ts`: a nested `as const` object of `var(--…)` strings for the semantic tier.
- `generated/` is committed and excluded from Prettier. `exports` offers `.` (the TS constants,
  following the `@pocket-comms/source` / `dist` convention) and `./tokens.css`.

### UI kit package

- `src/index.ts` imports `@pocket-comms/design-tokens/tokens.css` and `src/base.css`, and re-exports the
  components and the token constants (`tokens`).
- Components are thin wrappers over semantic elements (`button`, `input`, `label`, `ul`/`li`,
  `a`, `h1`–`h6`, `section`, `div role="alert"`), forward refs and native props, and take a
  `className` only for composition inside the kit; variants are props mapped to module classes.
- `build`: Vite library mode (`dist/index.js`, `dist/style.css`, `.d.ts` via
  `vite-plugin-dts` or `tsc --emitDeclarationOnly`). Apps keep consuming `src` through the
  `@pocket-comms/source` condition.
- `ladle` (continuous, local) and `ladle-build` (CI) targets; `.ladle/components.tsx` adds a
  light/dark switch that sets `data-theme`.
- `lint` also runs Stylelint on `src/**/*.css` with strict values for `color`, `background*`,
  `border*`, `outline*`, `fill`, `stroke`, `font*`, `line-height`, `letter-spacing`, `margin*`,
  `padding*`, `gap`, `width`/`height` limits, `border-radius`, `box-shadow`, `transition*`,
  `animation*`; allowed keywords: `0`, `none`, `inherit`, `initial`, `unset`, `currentColor`,
  `transparent`, `100%`, `auto`.

### Bookmarks web app

- `App.tsx` uses `Page`, `Stack`, `Inline`, `Heading`, `Text`, `Card`, `Form`, `Input`
  (`hideLabel`), `Button`, `Alert`, `List`/`ListItem`, `Link`, `Tag`; `main.tsx` drops the CSS
  import. `App.spec.tsx` keeps its queries by role and label and stays green.

## 2. Contract changes

None.

## 3. Migrations

None.

## 4. Test strategy

- **Tokens:** `tools/design-tokens/check.test.mjs` (node:test) proves each check fires on a
  fixture: unknown `$type`, malformed `$value` per used type, unresolved alias, alias cycle,
  missing dark (or light) semantic value, stale output. `pnpm tokens:check` runs the check on the
  real sources by building into a temporary folder and comparing with `generated/`.
- **UI kit:** one `*.spec.tsx` per component (Vitest, jsdom, Testing Library, `user-event`,
  `vitest-axe`): role and accessible name, keyboard use for `Button` (Tab, Enter, Space),
  `Input` and `Link`, variants map to classes, `Alert` has `role="alert"`, `Input` with
  `hideLabel` is still named by its label, axe reports no violations. A type-level test
  (`test-typecheck`) proves `Input` without `label` does not compile.
- **Token propagation:** a UI kit test asserts every `var(--…)` used in the component CSS is
  defined in `generated/tokens.css`, so a component cannot reference a missing token.
- **Bookmarks web:** the existing `App.spec.tsx` behaviour tests.
- **Boundaries** (`tools/boundaries/boundary-rules.test.mjs`, one case each):
  - `no-design-in-server-code` — `packages/**` outside `packages/design/`, and `apps/*` that are
    not web apps, must not import `packages/design/`.
  - `no-tokens-in-web` — a web app must not import `packages/design/tokens/`.
  - `ui-only-on-tokens` — `packages/design/ui/` may import only `packages/design/tokens/` within
    the workspace; `packages/design/tokens/` imports nothing in the workspace.
  - `no-css-in-web` — a web app must not import a `.css` file.
  - The blueprint rule and `no-cross-service` allow `packages/design/` (positive case).
  - Nx mirror in `eslint.config.mjs`: `type:ui` → `type:tokens`; `type:tokens` → none;
    `type:web` → `scope:contracts`, `type:ui`; `scope:<service>`, `scope:shared`,
    `scope:contracts` never `scope:design`. An ESLint `no-restricted-syntax` rule forbids the
    JSX `style` attribute in web apps; a lint test case proves it fires.
- **Gates:** `tokens:check` and `test:tokens` in `verify:local` and CI; Stylelint via the `lint`
  target; `ladle-build` in CI.

## 5. Risks

- **Style Dictionary DTCG coverage:** v5 reads DTCG but validates loosely, hence the own check;
  composite types (shadow, typography) may need custom transforms.
- **Theme selector duplication:** the dark block appears twice in `tokens.css` (media query and
  attribute); generated, so no hand-maintenance, but the format must produce both.
- **jsdom limits:** jsdom does not evaluate media queries or resolve custom properties, so light
  and dark rendering is proven by token parity and the catalog, not by component tests.
- **Ladle and Vite versions:** Ladle pins its own Vite range; if it conflicts with the catalog's
  Vite, escalate before adding an override.
