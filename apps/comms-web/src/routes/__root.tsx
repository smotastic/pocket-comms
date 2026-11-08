import { NavigationProvider, Page, Text } from '@smotastic/pocket-design';
import { createRootRouteWithContext, Outlet, useRouter } from '@tanstack/react-router';
import { Brainstorm } from '../Brainstorm.js';
import type { RouterContext } from '../router-context.js';

const ABSOLUTE = /^[a-z][a-z\d+.-]*:/iu;

/**
 * Every screen, each able to open the brainstorm chat over it (specs 013 and 016). The kit's links
 * navigate through the router.
 */
const Root = () => {
  const { client } = Route.useRouteContext();
  const router = useRouter();
  return (
    <NavigationProvider
      navigate={(href) => void router.navigate({ href })}
      // A link to another site keeps its address; the router would read it as a path of the app.
      useHref={(href) => (ABSOLUTE.test(href) ? href : router.buildLocation({ to: href }).href)}
    >
      <Brainstorm client={client}>
        <Outlet />
      </Brainstorm>
    </NavigationProvider>
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
