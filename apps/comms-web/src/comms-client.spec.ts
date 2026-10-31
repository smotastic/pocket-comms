import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCommsClient, RequestError } from './comms-client.js';
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

describe('the tasks requests', () => {
  const answer = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
      },
    });

  // The HTTP client may keep the first `fetch` it finds, so every test answers through one mock.
  const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    vi.useRealTimers();
    fetch.mockReset();
    vi.stubGlobal('fetch', fetch);
  });

  it('lists the projects', async () => {
    fetch.mockImplementation(async () =>
      answer(200, { projects: [{ name: 'pocket-comms', open: true }] }),
    );

    expect(await makeCommsClient('http://app').projects()).toEqual([
      { name: 'pocket-comms', open: true },
    ]);
  });

  it('posts a new task and returns the created worktree', async () => {
    fetch.mockImplementation(async () =>
      answer(201, { workspace: 'wK', branch: 'feat/x', path: '/w/feat-x' }),
    );

    const created = await makeCommsClient('http://app').createTask({
      project: 'pocket-comms',
      task: 'X',
      branch: 'feat/x',
      agent: { kind: 'claude' },
    });

    expect(created).toEqual({ workspace: 'wK', branch: 'feat/x', path: '/w/feat-x' });
    const [input, init] = fetch.mock.calls[0] ?? [];
    expect(String(input instanceof Request ? input.url : input)).toBe('http://app/api/v1/tasks');
    const body = input instanceof Request ? await input.text() : init?.body;
    expect(JSON.parse(String(body))).toEqual({
      project: 'pocket-comms',
      task: 'X',
      branch: 'feat/x',
      agent: { kind: 'claude' },
    });
  });

  it('reports the fields a validation problem names', async () => {
    fetch.mockImplementation(async () =>
      answer(422, {
        type: 'urn:pocket-comms:problem:invalid-request',
        title: 'The request is invalid',
        status: 422,
        errors: [{ field: 'branch', message: 'Name the branch <type>/<kebab-description>.' }],
      }),
    );

    const error = await makeCommsClient('http://app')
      .createTask({ project: 'p', task: 'X', branch: 'Feature/X' })
      .catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(RequestError);
    expect(error).toMatchObject({
      status: 422,
      issues: [{ field: 'branch', message: 'Name the branch <type>/<kebab-description>.' }],
    });
  });

  it("reads a project's issues", async () => {
    fetch.mockImplementation(async () => answer(200, { _tag: 'NotConfigured' }));

    expect(await makeCommsClient('http://app').issues('pocket comms')).toEqual({
      _tag: 'NotConfigured',
    });
    const [input] = fetch.mock.calls[0] ?? [];
    expect(String(input instanceof Request ? input.url : input)).toBe(
      'http://app/api/v1/projects/pocket%20comms/issues',
    );
  });

  it('implements an issue on a branch', async () => {
    fetch.mockImplementation(async () =>
      answer(201, { workspace: 'wK', branch: 'feat/8-x', path: '/w/feat-8-x' }),
    );

    const created = await makeCommsClient('http://app').implementIssue(
      'pocket-comms',
      8,
      'feat/8-x',
    );

    expect(created).toEqual({ workspace: 'wK', branch: 'feat/8-x', path: '/w/feat-8-x' });
    const [input, init] = fetch.mock.calls[0] ?? [];
    expect(String(input instanceof Request ? input.url : input)).toBe(
      'http://app/api/v1/projects/pocket-comms/issues/8/implement',
    );
    const body = input instanceof Request ? await input.text() : init?.body;
    expect(JSON.parse(String(body))).toEqual({ branch: 'feat/8-x' });
  });
});
