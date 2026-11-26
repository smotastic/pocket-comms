import { createFileRoute, redirect } from '@tanstack/react-router';

/** `/planets` was the list of planets; the overview lists them now (spec 008). */
export const Route = createFileRoute('/planets/')({
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true });
  },
});
