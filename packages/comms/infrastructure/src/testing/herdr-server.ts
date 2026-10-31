import * as Effect from 'effect/Effect';
import { mkdtempSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface HerdrRequest {
  readonly id: string;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

/** What the fake answers: a `result`, an `error`, or nothing (the socket stays silent). */
export type HerdrReply =
  | { readonly result: unknown }
  | { readonly error: { readonly code: string; readonly message: string } }
  | 'silent';

/**
 * A Herdr socket for adapter tests. It records every request, answers through `reply`, and keeps
 * `events.subscribe` connections open so a test can `emit` events to them.
 */
export const fakeHerdrServer = (reply: (request: HerdrRequest) => HerdrReply) =>
  Effect.acquireRelease(
    Effect.callback<{
      readonly path: string;
      readonly requests: Array<HerdrRequest>;
      readonly subscribers: () => ReadonlyArray<HerdrRequest>;
      readonly emit: (event: unknown) => void;
      readonly closeSubscribers: () => void;
      readonly close: () => void;
    }>((resume) => {
      const path = join(mkdtempSync(join(tmpdir(), 'herdr-')), 'herdr.sock');
      const requests: Array<HerdrRequest> = [];
      const subscribers = new Map<Socket, HerdrRequest>();
      const server = createServer((socket) => {
        let buffer = '';
        socket.setEncoding('utf8');
        socket.on('error', () => undefined);
        socket.on('close', () => subscribers.delete(socket));
        socket.on('data', (chunk: string) => {
          buffer += chunk;
          const end = buffer.indexOf('\n');
          if (end < 0) return;
          const parsed: unknown = JSON.parse(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
          if (typeof parsed !== 'object' || parsed === null) return;
          const request: HerdrRequest = {
            id: String(Reflect.get(parsed, 'id')),
            method: String(Reflect.get(parsed, 'method')),
            params: Object(Reflect.get(parsed, 'params')),
          };
          requests.push(request);
          if (request.method === 'events.subscribe') {
            subscribers.set(socket, request);
            socket.write(
              `${JSON.stringify({ id: request.id, result: { type: 'subscription_started' } })}\n`,
            );
            return;
          }
          const answer = reply(request);
          if (answer === 'silent') return;
          socket.end(`${JSON.stringify({ id: request.id, ...answer })}\n`);
        });
      });
      server.listen(path, () =>
        resume(
          Effect.succeed({
            path,
            requests,
            subscribers: () => [...subscribers.values()],
            emit: (event: unknown) => {
              for (const socket of subscribers.keys()) socket.write(`${JSON.stringify(event)}\n`);
            },
            closeSubscribers: () => {
              for (const socket of subscribers.keys()) socket.destroy();
            },
            close: () => {
              for (const socket of subscribers.keys()) socket.destroy();
              server.close();
            },
          }),
        ),
      );
    }),
    (server) => Effect.sync(server.close),
  );

/** `agent.list` and `workspace.list` answers in Herdr's shape, trimmed to what the app reads. */
export const herdrLists =
  (panes: ReadonlyArray<string>) =>
  (request: HerdrRequest): HerdrReply => {
    if (request.method === 'agent.list') {
      return {
        result: {
          type: 'agent_list',
          agents: panes.map((pane) => ({
            pane_id: pane,
            workspace_id: pane.split(':')[0],
            agent: 'claude',
            agent_status: 'idle',
            terminal_title: '✳ A task',
            terminal_title_stripped: 'A task',
          })),
        },
      };
    }
    if (request.method === 'workspace.list') {
      return { result: { type: 'workspace_list', workspaces: [] } };
    }
    return { result: { type: 'ok' } };
  };
