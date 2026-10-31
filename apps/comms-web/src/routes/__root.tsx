import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { Page, Text } from '@pocket-comms/design-ui';
import type { RouterContext } from '../router-context.js';

/** The root of every address: the screens render below it. */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: () => (
    <Page>
      <Text>This page was not found.</Text>
    </Page>
  ),
});
