import { createFileRoute, useRouter } from '@tanstack/react-router';
import { BrainstormPage } from '../Brainstorm.js';

/** PROTOTYPE (issue #28): `/brainstorm-prototype`, the menu variant's chat as a page of its own. */
export const Route = createFileRoute('/brainstorm-prototype')({
  component: function BrainstormPrototype() {
    const { client } = Route.useRouteContext();
    const router = useRouter();
    const navigate = Route.useNavigate();
    return (
      <BrainstormPage
        client={client}
        // Back returns to the screen it came from; opened directly, it goes to the overview.
        onBack={() =>
          router.history.canGoBack() ? router.history.back() : void navigate({ to: '/' })
        }
      />
    );
  },
});
