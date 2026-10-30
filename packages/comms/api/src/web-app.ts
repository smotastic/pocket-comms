import * as Effect from 'effect/Effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// The file below `root` that a URL path names, or none for a path that leaves `root`.
const fileOf = (root: string, urlPath: string): string | undefined => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return undefined;
  }
  const path = normalize(join(root, decoded));
  return path === root || path.startsWith(`${root}${sep}`) ? path : undefined;
};

const isFile = (path: string) =>
  stat(path).then(
    (info) => info.isFile(),
    () => false,
  );

/**
 * Serves the built web app from `root`: its files, and `index.html` for every other GET, so the
 * app's own routes such as `/agents/kirk` load the app. `/api`, `/docs` and `/health` routes are
 * matched first, because they are more specific.
 */
export const webAppLayer = (root: string) =>
  HttpRouter.add(
    'GET',
    '*',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const urlPath = new URL(request.url, 'http://localhost').pathname;
      const requested = fileOf(normalize(root), urlPath);
      const found = requested !== undefined && (yield* Effect.promise(() => isFile(requested)));
      const path = found ? requested : join(root, 'index.html');
      const body = yield* Effect.promise(() => readFile(path));
      return HttpServerResponse.uint8Array(body, {
        contentType: CONTENT_TYPES[extname(path)] ?? 'application/octet-stream',
        // The hashed assets never change; the page and the manifest are read fresh.
        headers: urlPath.startsWith('/assets/')
          ? { 'cache-control': 'public, max-age=31536000, immutable' }
          : { 'cache-control': 'no-cache' },
      });
    }),
  );
