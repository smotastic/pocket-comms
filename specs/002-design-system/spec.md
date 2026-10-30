# Spec 002 — Design system

- **Status:** `Done` — approved by the human owner on 2026-10-19
- **Issue:** [#1](https://github.com/smotastic/pocket-comms/issues/1)

## 1. Problem / intent (WHY)

Web apps built from this template have no shared look and no reusable components. The bookmarks
web app styles itself with one hand-written stylesheet, so every new app starts from scratch and
drifts visually.

The template ships a design system: design tokens as the single source of truth for the visual
language, and a UI kit of accessible React components that use only those tokens. Every app gets
a consistent design, and a visual change happens in one place.

## 2. Scope

- **In scope:**
  - A design-tokens package at `packages/design/tokens` (`@pocket-comms/design-tokens`): tokens in the W3C
    Design Tokens Community Group (DTCG) format, with a light and a dark theme, and generated CSS
    custom properties and TypeScript constants.
  - A UI kit package at `packages/design/ui` (`@pocket-comms/design-ui`): accessible React components
    styled only through the token variables, and a component catalog.
  - Gates that prove the tokens are valid and the generated output is current, that the UI kit
    uses only tokens, and that the package boundaries hold.
  - The bookmarks web app rebuilt on `@pocket-comms/design-ui`, with no stylesheet of its own.
  - An ADR for the design system.
- **Out of scope:** syncing with Figma or other design tools; brands or white-labeling beyond
  light and dark; publishing packages to npm; visual regression tests; automated WCAG contrast
  checks; a theme toggle component; deploying the component catalog.

## 3. Requirements (WHAT)

### Tokens

1. Token sources are DTCG JSON files (`*.tokens.json`) using `$value`, `$type` and aliases
   (`{group.token}`). They cover colors, typography (font families, sizes, weights, line
   heights), spacing, radii, shadows and motion (durations, easings).
2. Tokens have two tiers: **primitives** hold raw values (e.g. a gray and an indigo scale, a
   spacing scale); **semantic** tokens alias primitives and carry meaning (e.g. surface
   background, muted text, accent, danger). Components use semantic tokens only.
3. The dark theme redefines the semantic tier only. Every semantic token has a light and a dark
   value.
4. The primitives start from the current bookmarks palette, so the bookmarks app keeps its look.
5. A build turns the tokens into one committed CSS file of custom properties and committed
   TypeScript constants whose values are the `var(--…)` references of the semantic tokens.
6. The light theme applies by default. The dark theme applies when the system prefers a dark
   color scheme, unless the document root carries `data-theme="light"`; `data-theme="dark"`
   forces the dark theme regardless of the system setting.
7. A check fails when a token file is not valid DTCG for the types used, when an alias does not
   resolve or forms a cycle, when a semantic token lacks a light or a dark value, or when the
   committed generated output differs from a fresh build.

### UI kit

8. `@pocket-comms/design-ui` exports these components, built on semantic HTML elements:
   - **Actions:** `Button` with the variants `primary`, `secondary`, `ghost` and `danger`.
   - **Forms:** `Form`, `Field` (label, control, error text), `Input`.
   - **Content:** `Card`, `Alert`, `Tag`, `List`, `ListItem`, `Heading`, `Text` (with a muted
     variant), `Link`.
   - **Layout:** `Page` (centered, width-limited container), `Stack` (vertical), `Inline`
     (horizontal), each with a token-based gap.
9. `Input` requires a label. The label is a real `<label>` and can be visually hidden while it
   stays the input's accessible name. An input without a label does not type-check.
10. `Alert` announces itself to assistive technology.
11. Component styles reference only token variables for colors, typography, spacing, radii,
    shadows and motion. A raw value (a hex color, a pixel size, a duration) fails the lint.
12. `@pocket-comms/design-ui` brings the token CSS and a minimal base style (box sizing, page background
    and text color, font family) with it, and re-exports the token constants. A web app needs no
    other import to get the design.
13. Each component has a catalog story, and the catalog can switch between light and dark.

### Boundaries

14. `@pocket-comms/design-ui` may depend on `@pocket-comms/design-tokens`. `@pocket-comms/design-tokens` depends on no
    workspace package.
15. A web app may depend on `@pocket-comms/design-ui`, never directly on `@pocket-comms/design-tokens`.
16. No server, service, shared backend or contract package, and no non-web app, may depend on
    either design package.
17. A blueprint may depend on the design packages, as it may on the other shared packages.
18. A web app contains no CSS file and no inline `style` prop; its look comes only from
    `@pocket-comms/design-ui`.
19. Each rule in 14 to 18 is enforced by the Nx module boundaries and dependency-cruiser (or the
    lint, for `style` props), and a test proves each rule fires.

### Bookmarks web app

20. The bookmarks web app renders its page, header, form, error alert, list, tags and actions
    with `@pocket-comms/design-ui` components only, and works in light and dark mode.
21. Its behaviour (spec 001, requirement 15) is unchanged.

## 4. Acceptance criteria

- Given a semantic color token changed in `packages/design/tokens/*.tokens.json`, When the
  tokens are built, Then the generated CSS variable changes, and every component that uses the
  token shows the new value without a change to the component.
- Given a token file with an unknown `$type`, a malformed `$value`, an unresolved alias or a
  semantic token without a dark value, When CI runs, Then the token check fails.
- Given a token change without a rebuild, When CI runs, Then it fails because the committed
  output is stale.
- Given a component stylesheet with a hex color or a pixel size, When lint runs, Then it fails.
- Given the bookmarks web app, When it renders, Then it uses only `@pocket-comms/design-ui` components,
  has no CSS file and no `style` prop, and follows the system light or dark setting.
- Given a server, service, shared or contract package that imports `@pocket-comms/design-ui` or
  `@pocket-comms/design-tokens`, When `pnpm dep-cruise` runs, Then it fails; the same holds for a web app
  that imports `@pocket-comms/design-tokens` directly, and for a CSS import in a web app.
- Given the UI kit, When its tests run, Then each component has a test that checks its role and
  accessible name, its keyboard use where it is interactive, and that axe finds no violations.
- Given the component catalog, When CI builds it, Then every story compiles.

## 5. Notes

- Package names deliberately differ from the issue (`@pocket-comms/ui`, `packages/design-tokens/`): both
  packages live under `packages/design/`, like `packages/contracts/*`.
- Complex widgets (dialog, menu, combobox) are not part of v1; the ADR names the base to use
  when they come.

## 6. Open questions

None. Resolved with the human owner on 2026-10-19.
