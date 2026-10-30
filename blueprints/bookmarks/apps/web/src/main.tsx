import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { makeBookmarksClient } from './bookmarks-client.js';
import { createAppRouter } from './router.js';

const queryClient = new QueryClient();
const router = createAppRouter({ client: makeBookmarksClient(window.location.origin) });

const root = document.getElementById('root');
if (root === null) throw new Error('The page has no #root element.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
