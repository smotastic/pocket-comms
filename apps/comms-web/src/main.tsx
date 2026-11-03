import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { makeCommsClient } from './comms-client.js';
import { registerServiceWorker } from './notifications.js';
import { createAppRouter } from './router.js';

registerServiceWorker();

const queryClient = new QueryClient();
const router = createAppRouter({ client: makeCommsClient(window.location.origin) });

const root = document.getElementById('root');
if (root === null) throw new Error('The page has no #root element.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
