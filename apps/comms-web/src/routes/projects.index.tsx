import { createFileRoute, redirect } from '@tanstack/react-router';

/** `/projects` was the list of projects; the overview lists them now (spec 008). */
export const Route = createFileRoute('/projects/')({
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true });
  },
});
