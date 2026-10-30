import { createFileRoute } from '@tanstack/react-router';
import { App } from '../App.js';

/** `/` lists, adds, archives and deletes the bookmarks. */
export const Route = createFileRoute('/')({
  component: function Bookmarks() {
    const { client } = Route.useRouteContext();
    return <App client={client} />;
  },
});
