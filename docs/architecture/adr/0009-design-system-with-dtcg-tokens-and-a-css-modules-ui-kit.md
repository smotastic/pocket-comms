# ADR 0009 — Design system with DTCG tokens and a CSS Modules UI kit

- **Status:** Accepted (amended by ADR 0014)
- **Date:** 2026-10-19
- **Related:** constitution principles 5, 6 and 9; ADRs 0007, 0008; spec 002

> **As-built note (2026-10-19).** The token build uses Style Dictionary v5 (5.7), not v4: v4
> ended at 4.4.0, and v5 reads the same DTCG 2025.10 files. Approved by the human owner.

## TL;DR

We will keep design tokens in the DTCG format, build them with Style Dictionary v4 into CSS
custom properties, and ship a UI kit of semantic-HTML React components styled with CSS Modules
that may use only those variables. Web apps get their look only from the UI kit.

## Context

Web apps have no shared look; the bookmarks app has its own stylesheet. The template needs one
source of truth for the visual language and reusable, accessible components, enforced by gates
rather than review (principle 5). It must fit Nx, Vite and Vitest (ADR 0008) and stay small.
Figma sync, multiple brands and npm publishing are out of scope.

## Options

**Token build tool**

| Criterion           | Style Dictionary v4       | Terrazzo             |
| ------------------- | ------------------------- | -------------------- |
| DTCG support        | ✅ reads DTCG             | ✅ built around DTCG |
| Validation          | ⚠️ loose, needs own check | ✅ validates itself  |
| Maturity, ecosystem | ✅ widely used            | ⚠️ younger           |

**Styling**

| Criterion           | CSS Modules           | Plain global CSS  | Tailwind v4         |
| ------------------- | --------------------- | ----------------- | ------------------- |
| Extra tooling       | ✅ none (Vite native) | ✅ none           | ⚠️ own toolchain    |
| Scoping             | ✅ per component      | ❌ by naming only | ✅ utilities        |
| Raw values lintable | ✅ Stylelint          | ✅ Stylelint      | ⚠️ arbitrary values |

**Component base**

| Criterion         | Native HTML first        | React Aria Components    | Radix / shadcn                    |
| ----------------- | ------------------------ | ------------------------ | --------------------------------- |
| Dependencies      | ✅ none                  | ⚠️ large                 | ⚠️ large; shadcn ties to Tailwind |
| Simple components | ✅ accessible by default | ✅                       | ✅                                |
| Complex widgets   | ❌ hand-built            | ✅ strong a11y, keyboard | ✅                                |

**Catalog:** none, Ladle, or Storybook. Ladle is Vite-based, light, and uses the story format.

## Decision

- **Tokens.** DTCG JSON in `packages/design/tokens` (`@pocket-comms/design-tokens`), in two tiers:
  primitives and semantic aliases. The dark theme redefines the semantic tier. Style Dictionary
  v4 generates a committed `tokens.css` and typed `var(--…)` constants. Our own check
  (`pnpm tokens:check`) validates DTCG shapes, aliases, light/dark parity and that the output is
  current, because Style Dictionary validates loosely.
- **Themes.** Light by default; dark from `prefers-color-scheme`, overridable with
  `data-theme="light|dark"` on the document root.
- **UI kit.** `packages/design/ui` (`@pocket-comms/design-ui`): React components on semantic HTML, styled
  with CSS Modules. Stylelint with strict values forbids raw colors, sizes, shadows and
  durations, so a token change reaches every component. The kit brings the token CSS with it and
  builds with Vite library mode. When a complex widget (dialog, menu, combobox) is needed, it is
  built on React Aria Components, not by hand.
- **Catalog.** Ladle, with one story per component; CI builds it, nothing is deployed.
- **Boundaries.** Tags `scope:design` plus `type:tokens` or `type:ui`. The UI kit depends only on
  the tokens; web apps depend on the UI kit, never on the tokens directly, and contain no CSS
  file or `style` prop; no server, service, shared or contract code depends on either package.
  This amends ADR 0008: a web app may depend on `type:ui` besides the contract packages.

## Consequences

- **Positive:** one place for visual change; consistent apps; gates prove token validity, token
  use and boundaries; no CSS framework to learn.
- **Negative / trade-offs:** we own a small DTCG validator; web apps cannot style one-off layouts
  themselves and must add a kit component or prop instead; complex widgets wait for React Aria.
- **Follow-ups:** visual
  regression tests, contrast checks and a theme toggle are possible later issues.
