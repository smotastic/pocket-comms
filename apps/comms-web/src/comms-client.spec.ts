import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCommsClient } from './comms-client.js';
import { screenQuery } from './comms-queries.js';

/** A stand-in for the browser's EventSource that a test opens, fails and feeds by hand. */
class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static opened: Array<FakeEventSource> = [];
  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  readonly listeners = new Map<string, (event: { data: string }) => void>();
  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }
  addEventListener(name: string, listener: (event: { data: string }) => void) {
    this.listeners.set(name, listener);
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
  /** The server answered a reconnect with an error status: the browser gives up on it. */
  fail(closed: boolean) {
    this.readyState = closed ? FakeEventSource.CLOSED : FakeEventSource.CONNECTING;
    this.onerror?.();
  }
}

beforeEach(() => {
  FakeEventSource.opened = [];
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const unavailable = JSON.stringify({ _tag: 'Unavailable', reason: 'Herdr is away' });

describe('followOverview', () => {
  it('passes on each decoded event and whether the stream is open', () => {
    const states: Array<unknown> = [];
    const live: Array<boolean> = [];
    makeCommsClient('http://app').followOverview(
      (state) => states.push(state),
      (on) => live.push(on),
    );
    const [source] = FakeEventSource.opened;

    source?.onopen?.();
    source?.listeners.get('overview')?.({ data: unavailable });
    source?.listeners.get('overview')?.({ data: '{"not":"a state"}' });

    expect(source?.url).toBe('http://app/api/v1/events');
    expect(states).toEqual([{ _tag: 'Unavailable', reason: 'Herdr is away' }]);
    expect(live).toEqual([true]);
  });

  it('opens the stream again when the browser gave it up', () => {
    const live: Array<boolean> = [];
    makeCommsClient('http://app').followOverview(
      () => undefined,
      (on) => live.push(on),
    );

    FakeEventSource.opened[0]?.fail(true);
    vi.advanceTimersByTime(5_000);

    expect(live).toEqual([false]);
    expect(FakeEventSource.opened).toHaveLength(2);
  });

  it('leaves a reconnect the browser makes itself to the browser', () => {
    makeCommsClient('http://app').followOverview(
      () => undefined,
      () => undefined,
    );

    FakeEventSource.opened[0]?.fail(false);
    vi.advanceTimersByTime(5_000);

    expect(FakeEventSource.opened).toHaveLength(1);
  });

  it('stops for good when unsubscribed', () => {
    const stop = makeCommsClient('http://app').followOverview(
      () => undefined,
      () => undefined,
    );

    FakeEventSource.opened[0]?.fail(true);
    stop();
    vi.advanceTimersByTime(5_000);

    expect(FakeEventSource.opened).toHaveLength(1);
  });
});

describe('screenQuery', () => {
  it('reads the screen again every second', () => {
    expect(screenQuery(makeCommsClient('http://app'), 'kirk').refetchInterval).toBe(1000);
  });
});
