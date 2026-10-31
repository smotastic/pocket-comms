import { CommsApi } from '@pocket-comms/comms-contract';
import { OpenApi } from 'effect/http-api';

// Sorted keys at every level, so the committed document changes only when the contract does.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
};

/** The OpenAPI 3.1 document as canonical JSON text, as the server app commits it. */
export const openApiDocument = () =>
  `${JSON.stringify(canonical(OpenApi.fromApi(CommsApi)), null, 2)}\n`;
