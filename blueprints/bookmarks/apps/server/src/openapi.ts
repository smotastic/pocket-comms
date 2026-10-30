import { openApiDocument } from '@pocket-comms/bookmarks-api';
import { writeFileSync } from 'node:fs';

// Writes the published contract; `pnpm openapi:check` fails when it is stale.
writeFileSync(new URL('../api/openapi.json', import.meta.url), openApiDocument());
