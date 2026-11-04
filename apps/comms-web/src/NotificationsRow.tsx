import { Alert, Stack, Switch, Text } from '@smotastic/pocket-design';
import { useCallback, useContext, useEffect, useState } from 'react';
import type { CommsClient } from './comms-client.js';
import { DevicePushContext, type DevicePushState } from './notifications.js';

const LABEL = 'Notifications';
const DESCRIPTION = 'On this device, when an agent needs you or is done.';

/**
 * Turns push notifications on or off for this device. It reads the browser's state again each
 * time comms comes to the front, so a permission given in the system settings shows at once.
 */
export const NotificationsRow = ({ client }: { readonly client: CommsClient }) => {
  const devicePush = useContext(DevicePushContext);
  const [state, setState] = useState<DevicePushState | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  const read = useCallback(() => {
    void devicePush.state().then(setState, () => setState({ _tag: 'Unsupported' }));
  }, [devicePush]);

  useEffect(() => {
    read();
    const onVisible = () => {
      if (document.visibilityState === 'visible') read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [read]);

  const change = async (on: boolean) => {
    setBusy(true);
    setFailure(undefined);
    try {
      if (on) {
        const subscription = await devicePush.subscribe(() => client.pushKey());
        if (subscription !== undefined) {
          // A device the server does not know would show as on and never get a push.
          await client.subscribePush(subscription).catch(async (error: unknown) => {
            await devicePush.unsubscribe().catch(() => undefined);
            throw error;
          });
        }
      } else {
        const endpoint = await devicePush.unsubscribe();
        if (endpoint !== undefined) await client.unsubscribePush(endpoint);
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Notifications could not be changed.');
    } finally {
      setBusy(false);
      read();
    }
  };

  if (state === undefined) return null;
  return (
    <Stack gap="sm">
      {state._tag === 'Ready' ? (
        <Switch
          label={LABEL}
          description={DESCRIPTION}
          isSelected={state.subscribed}
          isDisabled={busy}
          onChange={(on) => void change(on)}
        />
      ) : (
        <Stack gap="xs">
          <Text>{LABEL}</Text>
          <Text tone="muted">
            {state._tag === 'Denied'
              ? 'Blocked: turn on in Settings › Notifications › Comms.'
              : 'Add comms to your home screen to get notifications.'}
          </Text>
        </Stack>
      )}
      {failure === undefined ? null : <Alert>{failure}</Alert>}
    </Stack>
  );
};
