import { createContext } from 'react';

/** One device's push subscription, as the server keeps it. */
export interface PushSubscriptionView {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}

/**
 * What this browser offers: no Web Push at all (iOS Safari outside the home screen), a denied
 * permission that only the system settings can lift, or a device that can be on or off.
 */
export type DevicePushState =
  | { readonly _tag: 'Unsupported' }
  | { readonly _tag: 'Denied' }
  | { readonly _tag: 'Ready'; readonly subscribed: boolean };

/** This device's side of push notifications. Tests pass a fake; the app the browser's. */
export interface DevicePush {
  readonly state: () => Promise<DevicePushState>;
  /**
   * Asks for permission, then subscribes with the key `serverKey` reads. Answers the new
   * subscription, or nothing when the owner did not allow notifications.
   */
  readonly subscribe: (
    serverKey: () => Promise<string>,
  ) => Promise<PushSubscriptionView | undefined>;
  /** Ends this device's subscription and answers its endpoint, or nothing if it had none. */
  readonly unsubscribe: () => Promise<string | undefined>;
}

const supported = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  'Notification' in window;

/** Starts the service worker that shows the pushes; only a page that has one can subscribe. */
export const registerServiceWorker = () => {
  if (!supported()) return;
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
};

/** The server key's bytes, which `subscribe` wants; the key arrives as base64url. */
export const keyBytes = (base64url: string) => {
  const base64 = base64url.replace(/-/gu, '+').replace(/_/gu, '/');
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const viewOf = (subscription: PushSubscription): PushSubscriptionView => {
  const { keys } = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: keys?.['p256dh'] ?? '', auth: keys?.['auth'] ?? '' },
  };
};

/**
 * The active service worker. `navigator.serviceWorker.ready` never settles when the worker
 * failed to install, so the wait is cut short and reported.
 */
const activeWorker = (): Promise<ServiceWorkerRegistration> =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('The notification service did not start.')), 10_000),
    ),
  ]);

export const browserDevicePush: DevicePush = {
  state: async () => {
    if (!supported()) return { _tag: 'Unsupported' };
    if (Notification.permission === 'denied') return { _tag: 'Denied' };
    // Without a registered worker this browser cannot get pushes from this page.
    if ((await navigator.serviceWorker.getRegistration()) === undefined) {
      return { _tag: 'Unsupported' };
    }
    const registration = await activeWorker();
    const subscription = await registration.pushManager.getSubscription();
    return {
      _tag: 'Ready',
      subscribed: subscription !== null && Notification.permission === 'granted',
    };
  },
  subscribe: async (serverKey) => {
    // First, while the tap still counts: iOS asks only from a user gesture.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return undefined;
    const registration = await activeWorker();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(await serverKey()),
    });
    return viewOf(subscription);
  },
  unsubscribe: async () => {
    const registration = await activeWorker();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription === null) return undefined;
    await subscription.unsubscribe();
    return subscription.endpoint;
  },
};

export const DevicePushContext = createContext<DevicePush>(browserDevicePush);
