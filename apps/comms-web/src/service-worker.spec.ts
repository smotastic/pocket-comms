import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// `public/sw.js` runs in the browser as it is; here it runs against a stand-in for `self`.

type Listener = (event: {
  readonly data?: unknown;
  readonly notification?: unknown;
  waitUntil: (work: Promise<unknown>) => void;
}) => void;

const load = (
  windows: ReadonlyArray<{
    url: string;
    focus: () => Promise<unknown>;
    navigate: (url: string) => Promise<unknown>;
  }> = [],
) => {
  const listeners = new Map<string, Listener>();
  const self = {
    location: { origin: 'https://comms.test' },
    registration: {
      showNotification: vi.fn(async (_title: string, _options: unknown) => undefined),
    },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => undefined),
    },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  runInNewContext(readFileSync(join(__dirname, '..', 'public', 'sw.js'), 'utf-8'), { self, URL });
  const dispatch = async (type: string, event: { data?: unknown; notification?: unknown }) => {
    const work: Array<Promise<unknown>> = [];
    listeners.get(type)?.({ ...event, waitUntil: (promise) => work.push(promise) });
    await Promise.all(work);
  };
  return { self, dispatch };
};

const data = (value: unknown) => ({ json: () => value });

describe('the service worker', () => {
  it('shows the notification a push carries', async () => {
    const { self, dispatch } = load();

    await dispatch('push', {
      data: data({
        title: 'kirk needs you',
        body: 'app',
        tag: 'w1:p1',
        url: '/agents/kirk?from=push',
      }),
    });

    expect(self.registration.showNotification).toHaveBeenCalledWith('kirk needs you', {
      body: 'app',
      tag: 'w1:p1',
      renotify: true,
      icon: '/icon-192.png',
      data: { url: '/agents/kirk?from=push' },
    });
  });

  it('shows a notification even for a push it cannot read', async () => {
    const { self, dispatch } = load();

    await dispatch('push', { data: null });
    await dispatch('push', { data: { json: () => JSON.parse('{ broken') } });
    await dispatch('push', { data: data({ body: 'no title' }) });

    expect(self.registration.showNotification.mock.calls.map(([title]) => title)).toEqual([
      'An agent needs you',
      'An agent needs you',
      'An agent needs you',
    ]);
  });

  it('takes over the open pages as soon as it is active', async () => {
    const { self, dispatch } = load();

    await dispatch('activate', {});

    expect(self.clients.claim).toHaveBeenCalled();
  });

  const tap = (url: string) => ({ notification: { close: vi.fn(), data: { url } } });

  it('brings an open comms window to the conversation on a tap', async () => {
    const open = {
      url: 'https://comms.test/',
      focus: vi.fn(async () => undefined),
      navigate: vi.fn(async () => undefined),
    };
    const { self, dispatch } = load([open]);

    await dispatch('notificationclick', tap('/agents/kirk?from=push'));

    expect(open.focus).toHaveBeenCalled();
    expect(open.navigate).toHaveBeenCalledWith('https://comms.test/agents/kirk?from=push');
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it('opens comms on the conversation when no window is open, or the open one cannot move', async () => {
    const stuck = {
      url: 'https://comms.test/',
      focus: vi.fn(async () => Promise.reject(new Error('not allowed'))),
      navigate: vi.fn(async () => undefined),
    };
    const none = load();
    const failing = load([stuck]);

    await none.dispatch('notificationclick', tap('/agents/kirk?from=push'));
    await failing.dispatch('notificationclick', tap('/agents/kirk?from=push'));

    expect(none.self.clients.openWindow).toHaveBeenCalledWith(
      'https://comms.test/agents/kirk?from=push',
    );
    expect(failing.self.clients.openWindow).toHaveBeenCalledWith(
      'https://comms.test/agents/kirk?from=push',
    );
  });
});
