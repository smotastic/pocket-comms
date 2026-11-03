# Using this template

Create a new repository from this template, then work through this checklist.

## 1. Set the identifiers

```bash
pnpm install
pnpm template:init --repo <owner>/<name> --scope @<scope>
pnpm format
```

The script replaces the placeholders and can be run again:

| Identifier          | Placeholder                 | Where it lives                                           |
| ------------------- | --------------------------- | -------------------------------------------------------- |
| GitHub repository   | `smotastic/pocket-comms`    | `package.json`, docs                                     |
| Package scope       | `@pocket-comms`             | package manifests, imports, `@pocket-comms/source`, docs |
| Package name        | `pocket-comms`              | `package.json`, `README.md`                              |
| Code owner          | `@smotastic` (repo owner)   | `.github/CODEOWNERS`                                     |
| Problem type prefix | `urn:pocket-comms:problem:` | Problem Details `type` URNs                              |

## 2. Review the constitution

Read [`.specify/memory/constitution.md`](.specify/memory/constitution.md). Keep it, or change it
with the `speckit-constitution` skill and an ADR. Do not edit it in passing.

## 3. Keep or delete the blueprint

Done in pocket-comms: the blueprint was deleted with every follow-up below once the comms service
existed (spec 004, T23). Its shapes live on in `packages/comms/` and `apps/comms-*`.

`blueprints/bookmarks/` was the Golden Path. Keep it as a
reference, or delete it once your first service exists. When you delete it, also remove its spec
`specs/001-bookmarks-blueprint/` and its `scope:bookmarks` constraint in `eslint.config.mjs`;
then run `pnpm nx sync`. The OpenAPI gates need at least one server app with a committed document. The root
`pnpm dev` scripts name no app and stay: they run the `dev` targets of your own apps (see the
blueprint's "Run it locally").

## 4. Add the first application

Write its spec (`specs/003-…`), then copy the blueprint's shapes into `apps/` and
`packages/<service>/`. Every project carries the Nx tags `scope:<service>` and one of
`layer:domain|application|infrastructure`, `type:app` or `type:web` (ADR 0007). Add the
`scope:<service>` constraint to `eslint.config.mjs`, with `type:ui` in it if the service has a web
app: web apps take their look from `@pocket-comms/design-ui` (ADR 0009).

## 5. Keep the decisions

ADRs 0001 to 0009 record the ruleset and the stack. Keep them, or supersede one with a new ADR.

## 6. Configure the forge (optional)

The workflow runs on GitHub Actions and on Gitea Actions unchanged. In the repository settings:
protect `master`, allow squash merges only with the pull request title as the commit subject, and
require the `CI / verify` status check. If the repository is not on Gitea, replace the `tea`
commands in `docs/engineering/git-and-pr-conventions.md` and the skills with your forge's CLI.

To release the bookmarks images (`.github/workflows/release.yml`), add the Actions variable
`REGISTRY_HOST` (the container registry's host) and the Actions secret `REGISTRY_TOKEN` (a token
that can write packages). Delete the workflow when you delete the blueprint.

The gates come from the published CI package `@smotastic/pocket-ci` (ADR 0013), pinned in the
catalog of `pnpm-workspace.yaml`. Installing it needs a token with `read:package` for the Gitea
npm registry in `.npmrc`: add it as the Actions secret `REGISTRY_TOKEN`, and once on your machine
with `pnpm config set //mac-mini-von-nils.local:3000/api/packages/smotastic/npm/:_authToken <token>`.
A CI change is a bump of that catalog entry.
