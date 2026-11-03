import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { Page, Text } from '@pocket-comms/design-ui';
import { Brainstorm } from '../Brainstorm.js';
import type { RouterContext } from '../router-context.js';

/** Every screen, with the brainstorm bubble over it (spec 013). */
const Root = () => {
  const { client } = Route.useRouteContext();
  return (
    <>
      <Outlet />
      <Brainstorm client={client} />
    </>
  );
};

/** The root of every address: the screens render below it. */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
  notFoundComponent: () => (
    <Page>
      <Text>This page was not found.</Text>
    </Page>
  ),
});
