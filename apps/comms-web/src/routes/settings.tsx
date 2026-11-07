import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '../SettingsPage.js';

/** `/settings` keeps this device's theme and the owner's quick replies. */
export const Route = createFileRoute('/settings')({
  component: function Settings() {
    const { client } = Route.useRouteContext();
    const navigate = Route.useNavigate();
    return <SettingsPage client={client} onBack={() => void navigate({ to: '/' })} />;
  },
});
