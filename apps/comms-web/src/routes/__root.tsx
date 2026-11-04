import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { Page, Text } from '@smotastic/pocket-design';
import { Brainstorm } from '../Brainstorm.js';
import type { RouterContext } from '../router-context.js';

/** Every screen, each able to open the brainstorm chat over it (specs 013 and 016). */
const Root = () => {
  const { client } = Route.useRouteContext();
  return (
    <Brainstorm client={client}>
      <Outlet />
    </Brainstorm>
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
