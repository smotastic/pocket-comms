# ADR 0014 — Adopt the shared design package

- **Status:** Accepted
- **Date:** 2026-11-04
- **Related:** constitution principles 9 and 10; ADRs 0009, 0013; pocket-factory ADR 0013,
  pocket-factory#20

## TL;DR

The web app takes its look and its reusable components from the published package
`@smotastic/pocket-design` (Polaris) instead of this repository's own `packages/design`. This
adopts pocket-factory's ADR 0013 ("One published design package for every repository"). A design
change is a bump of the catalog entry.

## Context

Every pocket repository had a copy of the template's design system that had drifted from the
others: comms had its own components (`TopBar`, `StatusPill`, `FilterChips`, `Segmented`, …), a
project hue palette and JetBrains Mono, so a fix in one repository did not reach the others.
pocket-factory merged the reusable components of every repository into one kit with one API and
the Polaris look, and publishes it to the Gitea npm registry like `@smotastic/pocket-ci`.

## Decision

We will:

- pin `@smotastic/pocket-design` in the catalog of `pnpm-workspace.yaml` and depend on it from the
  web app with `catalog:`; the web app inlines it in its Vitest configuration, because the
  package's entry imports its CSS;
- adopt the kit's API at the call sites, with no wrappers under the old names, and the Polaris
  look: comms' project hues and JetBrains Mono are gone, and the page follows the system theme
  unless the owner picks Dark or Light (the kit's theme choice, stored on the device);
- keep the components that only comms needs (`AgentRow`, `KeyPad`, `TerminalScreen`, `ToolLine`,
  `UserMessage`, `IssueCard`, `ProposalCard`, `QuestionCard`, `BackgroundStrip`) in `apps/comms-web`,
  composed from kit components. A web app still has no stylesheet and no inline style
  (`no-css-in-web`, ADR 0009); what the kit cannot express yet is a kit change, never an app one;
- delete `packages/design`, its Nx tags and module-boundary rules, Stylelint and the token scripts.
  `no-design-in-server-code` in `.dependency-cruiser.cjs` now keeps the package out of server code.

## Consequences

- **Positive:** one look and one API in every pocket app; design fixes arrive as a version bump;
  this repository no longer builds or checks tokens.
- **Negative / trade-offs:** the app's own components can only compose the kit, so some lose detail
  until the kit grows: the terminal screen shows no ANSI colours, the hold key shows a spinner
  instead of a fill, agent rows link by the name only, and the kit's `Composer` cannot send images
  without text (a deviation from spec 014, noted there). Sheets rise from the bottom only.
- **Follow-ups:** kit gaps for pocket-factory — a terminal view with ANSI colours, a linked list
  row, a `Composer` that sends attachments alone, a side sheet, a hold-to-confirm button and a
  menu icon.
