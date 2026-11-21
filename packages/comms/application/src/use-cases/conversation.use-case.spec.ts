import { describe, expect, it } from '@effect/vitest';
import type { ConversationEntry } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as PubSub from 'effect/PubSub';
import * as Queue from 'effect/Queue';
import type { AgentEventDto } from '../dto/agent.dto.js';
import { ConversationUnavailableError } from '../errors.js';
import { AgentsInbound } from '../ports/agents.inbound.port.js';
import { FAKE_IMAGES_FOLDER, fakeAgent, fakeLayer, FakeState } from '../testing/fakes.js';
import { collect, settle } from '../testing/streams.js';

const layer = () => AgentsInbound.layer.pipe(Layer.provideMerge(fakeLayer()));

const at = 1_000;
const prompt: ConversationEntry = { type: 'user', id: 'u1', at, text: 'Run the tests' };
const running: ConversationEntry = {
  type: 'tool',
  id: 't1',
  at,
  verb: 'Ran',
  target: 'pnpm test',
  outcome: 'pending',
};

describe('AgentsInbound.conversation', () => {
  it.effect('reads the entries of the session and what the agent does now', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 's1' })];
      state.conversations.set('s1', { entries: [prompt, running], modifiedAt: at });

      const conversation = yield* AgentsInbound.use((inbound) => inbound.conversation('kirk'));

      expect(conversation).toEqual({
        entries: [prompt, running],
        currentStep: 'Running pnpm test…',
      });
    }).pipe(Effect.provide(layer())),
  );

  it.effect("shows a prompt's attached images by id instead of their paths", () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const id = 'a'.repeat(26);
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 's1' })];
      state.conversations.set('s1', {
        entries: [{ ...prompt, text: `Look\n\n${FAKE_IMAGES_FOLDER}/${id}.jpg` }],
        modifiedAt: at,
      });

      const conversation = yield* AgentsInbound.use((inbound) => inbound.conversation('kirk'));

      expect(conversation.entries).toEqual([{ ...prompt, text: 'Look', images: [id] }]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('suggests the replies an assistant message calls for (spec 025)', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      const asks: ConversationEntry = { type: 'assistant', id: 'a1', at, text: 'Do you approve?' };
      const says: ConversationEntry = { type: 'assistant', id: 'a2', at, text: 'Done.' };
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 's1' })];
      state.conversations.set('s1', { entries: [prompt, asks, says], modifiedAt: at });

      const conversation = yield* AgentsInbound.use((inbound) => inbound.conversation('kirk'));

      expect(conversation.entries).toEqual([
        prompt,
        { ...asks, replies: ['Approved', 'No, revise'] },
        says,
      ]);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('has no conversation for an agent kind without a session format', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', kind: 'codex', session: 's1' })];

      const error = yield* AgentsInbound.use((inbound) => inbound.conversation('w1:p1')).pipe(
        Effect.flip,
      );

      expect(error).toBeInstanceOf(ConversationUnavailableError);
    }).pipe(Effect.provide(layer())),
  );

  it.effect('has no conversation for an agent without a session id', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1' })];

      const error = yield* AgentsInbound.use((inbound) => inbound.conversation('w1:p1')).pipe(
        Effect.flip,
      );

      expect(error).toBeInstanceOf(ConversationUnavailableError);
    }).pipe(Effect.provide(layer())),
  );
});

describe('AgentsInbound.agentEvents', () => {
  // The agent and the session snapshot arrive at once, in either order.
  const firstTwo = (events: Queue.Queue<AgentEventDto>) =>
    Effect.map(Effect.all([Queue.take(events), Queue.take(events)]), (taken) =>
      [...taken].sort((a, b) => a.type.localeCompare(b.type)),
    );

  it.effect('emits the agent and the session at once, then new entries and status changes', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 's1' })];
      state.conversations.set('s1', { entries: [prompt], modifiedAt: at });
      const events = yield* collect(
        yield* AgentsInbound.use((inbound) => inbound.agentEvents('kirk')),
      );

      expect(yield* firstTwo(events)).toEqual([
        { type: 'agent', agent: expect.objectContaining({ ref: 'kirk', status: 'idle' }) },
        { type: 'entries', reset: true, entries: [prompt], currentStep: 'Thinking…' },
      ]);
      yield* settle;
      yield* PubSub.publish(state.conversationAppends, { session: 's1', entries: [running] });
      expect(yield* Queue.take(events)).toEqual({
        type: 'entries',
        reset: false,
        entries: [running],
        currentStep: 'Running pnpm test…',
      });
      state.agents = [
        fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 's1', status: 'working' }),
      ];
      yield* PubSub.publish(state.herdrChanges, undefined);
      expect(yield* Queue.take(events)).toEqual({
        type: 'agent',
        agent: expect.objectContaining({ ref: 'kirk', status: 'working' }),
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('follows the new session when the agent starts one', () =>
    Effect.gen(function* () {
      const state = yield* FakeState;
      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 's1' })];
      state.conversations.set('s1', { entries: [prompt], modifiedAt: at });
      state.conversations.set('s2', { entries: [running], modifiedAt: at });
      const events = yield* collect(
        yield* AgentsInbound.use((inbound) => inbound.agentEvents('kirk')),
      );
      yield* firstTwo(events);
      yield* settle;

      state.agents = [fakeAgent({ paneId: 'w1:p1', name: 'kirk', session: 's2' })];
      yield* PubSub.publish(state.herdrChanges, undefined);

      expect(yield* Queue.take(events)).toEqual({
        type: 'entries',
        reset: true,
        entries: [running],
        currentStep: 'Running pnpm test…',
      });
    }).pipe(Effect.scoped, Effect.provide(layer())),
  );

  it.effect('fails at once for an unknown agent', () =>
    Effect.gen(function* () {
      const error = yield* AgentsInbound.use((inbound) => inbound.agentEvents('nobody')).pipe(
        Effect.flip,
      );

      expect(error._tag).toBe('AgentNotFoundError');
    }).pipe(Effect.provide(layer())),
  );
});
