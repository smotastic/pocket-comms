import { createRouter, type RouterHistory } from '@tanstack/react-router';
import type { RouterContext } from './router-context.js';
import { routeTree } from './routeTree.gen.js';

/** The app's router; `main.tsx` uses the browser's history, tests pass a memory history. */
export const createAppRouter = ({
  client,
  history,
}: RouterContext & { readonly history?: RouterHistory }) =>
  createRouter({
    routeTree,
    context: { client },
    ...(history === undefined ? {} : { history }),
  });

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
