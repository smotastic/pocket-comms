import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RequestError } from './comms-client.js';
import { agentQuery } from './comms-queries.js';
import { keyBytes, type DevicePushState } from './notifications.js';
import { fakeAgent, fakeClient, fakeDevicePush, renderApp } from './testing.js';

afterEach(cleanup);

const openSheet = async (state: DevicePushState) => {
  const fake = fakeClient({ projects: [{ name: 'alpha', open: true }] });
  const device = fakeDevicePush(state);
  renderApp({ client: fake.client, devicePush: device.push });
  await userEvent.click(await screen.findByRole('button', { name: 'Projects' }));
  return { ...fake, ...device, sheet: screen.getByRole('dialog', { name: 'Projects' }) };
};

const comesToTheFront = () =>
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });

describe('the notifications row', () => {
  it('is off until the owner turns it on, then subscribes this device with the server key', async () => {
    const { sheet, calls, device } = await openSheet({ _tag: 'Ready', subscribed: false });
    const toggle = await within(sheet).findByRole('switch', { name: /Notifications/u });
    expect(toggle).toHaveProperty('checked', false);

    await userEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveProperty('checked', true));
    expect(device.keys).toEqual(['BServerKey']);
    expect(calls.subscribed).toEqual([
      { endpoint: 'https://push.example/this-device', keys: { p256dh: 'p256dh', auth: 'auth' } },
    ]);
  });

  it('unsubscribes this device at the server when the owner turns it off', async () => {
    const { sheet, calls } = await openSheet({ _tag: 'Ready', subscribed: true });
    const toggle = await within(sheet).findByRole('switch', { name: /Notifications/u });
    expect(toggle).toHaveProperty('checked', true);

    await userEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveProperty('checked', false));
    expect(calls.unsubscribed).toEqual(['https://push.example/this-device']);
  });

  it('says why when the server cannot keep the device', async () => {
    const { sheet, state } = await openSheet({ _tag: 'Ready', subscribed: false });
    state.subscribeFailure = new RequestError('The push devices cannot be kept', 503);

    await userEvent.click(await within(sheet).findByRole('switch', { name: /Notifications/u }));

    expect(await within(sheet).findByText('The push devices cannot be kept')).toBeTruthy();
    // The browser's subscription is ended again, so the switch does not claim a device the
    // server does not know.
    expect(within(sheet).getByRole('switch', { name: /Notifications/u })).toHaveProperty(
      'checked',
      false,
    );
  });

  it('asks to add comms to the home screen where the browser has no Web Push', async () => {
    const { sheet } = await openSheet({ _tag: 'Unsupported' });

    expect(
      await within(sheet).findByText('Add comms to your home screen to get notifications.'),
    ).toBeTruthy();
    expect(within(sheet).queryByRole('switch')).toBeNull();
  });

  it('points to the settings once the owner denied, and offers the switch when allowed again', async () => {
    const { sheet, device } = await openSheet({ _tag: 'Ready', subscribed: false });
    device.answer = 'denied';
    await userEvent.click(await within(sheet).findByRole('switch', { name: /Notifications/u }));

    expect(
      await within(sheet).findByText('Blocked: turn on in Settings › Notifications › Comms.'),
    ).toBeTruthy();
    expect(within(sheet).queryByRole('switch')).toBeNull();

    device.state = { _tag: 'Ready', subscribed: false };
    comesToTheFront();

    const toggle = await within(sheet).findByRole('switch', { name: /Notifications/u });
    expect(toggle).toHaveProperty('checked', false);
  });
});

describe('a notification that is tapped', () => {
  it('opens the conversation of a live agent', async () => {
    const kirk = fakeAgent({ ref: 'kirk', status: 'blocked', needsYou: true });
    const fake = fakeClient({ agents: new Map([['kirk', kirk]]) });

    const { router } = renderApp({ client: fake.client, path: '/agents/kirk?from=push' });

    expect((await screen.findAllByText('kirk')).length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe('/agents/kirk');
  });

  it('opens the overview when the agent is gone', async () => {
    const fake = fakeClient();

    const { router } = renderApp({ client: fake.client, path: '/agents/gone?from=push' });

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('says that an agent is gone when it ends after the notification opened it', async () => {
    const kirk = fakeAgent({ ref: 'kirk', status: 'blocked', needsYou: true });
    const fake = fakeClient({ agents: new Map([['kirk', kirk]]) });
    const { router, queryClient } = renderApp({
      client: fake.client,
      path: '/agents/kirk?from=push',
    });
    await screen.findAllByText('kirk');

    fake.state.agents.delete('kirk');
    await act(() => queryClient.invalidateQueries());

    expect(await screen.findByText('kirk is not running any more.')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/agents/kirk');
  });

  it('still says that an agent is gone when it was opened another way', async () => {
    const fake = fakeClient();

    renderApp({ client: fake.client, path: '/agents/gone' });

    expect(await screen.findByText('gone is not running any more.')).toBeTruthy();
  });
});

describe('reading an agent', () => {
  const { retry } = agentQuery(fakeClient().client, 'kirk');
  const retries = typeof retry === 'function' ? retry : () => false;

  it('does not ask again for an agent that is gone, so a tap on its notification is quick', () => {
    expect(retries(0, new RequestError('No live agent is named kirk.', 404))).toBe(false);
  });

  it('asks again a few times when the request failed otherwise', () => {
    const failure = new RequestError('Herdr is not running', 503);
    expect([0, 1, 2, 3].map((count) => retries(count, failure))).toEqual([true, true, true, false]);
  });
});

describe('the server key', () => {
  it('turns base64url into the bytes a subscription needs', () => {
    const bytes = Uint8Array.from({ length: 65 }, (_, index) => (index * 37 + 251) % 256);
    const base64url = btoa(String.fromCharCode(...bytes))
      .replace(/\+/gu, '-')
      .replace(/\//gu, '_')
      .replace(/=+$/u, '');

    expect(base64url).toMatch(/[-_]/u);
    expect(Array.from(keyBytes(base64url))).toEqual(Array.from(bytes));
  });
});
