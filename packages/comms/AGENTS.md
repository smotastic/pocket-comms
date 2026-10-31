# comms service

The backend of pocket-comms: it reads Herdr's agents and the agents' session files and serves
them over `CommsApi`. Its behaviour is [spec 004](../../specs/004-pocket-comms-v1/spec.md). It has
no database; its only state (seen completions, last status changes) lives in server memory.

## Where each file type goes

| What                                                                 | Where                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `CommsApi`, wire schemas (shared by server and web)                  | `contract`                                                  |
| Agents, the overview rules, input rules, transcript entries, access  | `domain`                                                    |
| `AgentsInbound`, outbound ports, use cases, DTOs, errors, test fakes | `application` (`src/ports`, `src/use-cases`, `src/testing`) |
| Herdr socket, Claude and Pi session files, memory stores             | `infrastructure`                                            |
| HTTP handlers, problems, identity guard, health, web app route       | `api`                                                       |
| Composition root, config, OpenAPI document                           | `apps/comms-server`                                         |
| Web app                                                              | `apps/comms-web`                                            |

## Rules of this service

- `HerdrOutbound` has no focus method on purpose: the app never moves the owner's Herdr focus
  (requirement 18). Do not add one.
- Every route goes through the Tailscale identity guard (`api/src/identity.ts`), and the server
  listens on `127.0.0.1` only. Do not add a route outside `commsServerLayer`.
- Session file formats are undocumented. Parsers skip what they do not know; tests use the
  anonymised fixtures in `infrastructure/src/testing/fixtures`. Never commit a real transcript.
- After a contract change run `pnpm nx run comms-server:openapi` and commit the document.

## Run and test

`pnpm dev` and `pnpm start` from the repository root; see the [README](../../README.md).
`pnpm nx run-many -t test -p 'comms-*'` runs the service's tests. Herdr adapter tests start a fake
Unix socket server; no test needs a running Herdr.
