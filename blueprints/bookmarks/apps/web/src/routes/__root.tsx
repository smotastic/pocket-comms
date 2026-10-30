import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { RouterContext } from '../router-context.js';

/** The root of every address: the screens render below it. */
export const Route = createRootRouteWithContext<RouterContext>()({ component: Outlet });
