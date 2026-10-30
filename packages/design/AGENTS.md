# Design system

The design tokens (`tokens/`, `@pocket-comms/design-tokens`) and the UI kit (`ui/`, `@pocket-comms/design-ui`) that
every web app takes its look from (ADR 0009). Web apps import `@pocket-comms/design-ui` only.

## Tokens

- Edit the DTCG sources in `tokens/src/*.tokens.json`: raw values in `primitives`, meaning in
  `base` (theme-independent) and `theme.{light,dark}` (same keys in both). Components use the
  semantic tokens only; primitives are never emitted.
- After a change, run `pnpm nx run design-tokens:generate` and commit `tokens/src/generated/`.
  `pnpm tokens:check` fails on invalid DTCG, a theme mismatch or stale output.

## UI kit

- One folder per component in `ui/src/`: the component, a CSS Module, a spec and a story.
- Styles use token variables only; the kit's lint runs Stylelint and rejects raw values. A
  component's props omit `className` and `style`, so apps cannot restyle it.
- Every spec checks roles and accessible names, keyboard use where the component is interactive,
  and `axeViolations` from `ui/src/testing/a11y.ts`.
- `pnpm nx run design-ui:ladle` serves the catalog with a light/dark switch.
- Apps consume the source, which imports the CSS itself. A consumer of `dist/` must also import
  `@pocket-comms/design-ui/style.css`.
