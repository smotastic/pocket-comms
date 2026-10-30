import { describe, expect, it } from '@effect/vitest';
import { openApiDocument } from './index.js';

const keysSorted = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.every(keysSorted);
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    return keys.join() === [...keys].sort().join() && Object.values(value).every(keysSorted);
  }
  return true;
};

describe('openApiDocument', () => {
  const text = openApiDocument();

  it('writes an OpenAPI 3.1 document with sorted keys at every level', () => {
    const document = JSON.parse(text);
    expect(document.openapi).toBe('3.1.0');
    expect(keysSorted(document)).toBe(true);
  });

  it('writes the same text every time and ends with a newline', () => {
    expect(openApiDocument()).toBe(text);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('leaves the health routes and /docs out of the published document', () => {
    const paths = Object.keys(JSON.parse(text).paths);
    expect(paths.every((path) => path.startsWith('/api/v1/'))).toBe(true);
  });
});
