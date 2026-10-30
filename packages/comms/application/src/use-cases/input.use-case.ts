import { parseKeys, parsePrompt } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import { HerdrOutbound } from '../ports/herdr.outbound.port.js';
import { makeLoadAgents } from './agents.js';

// Commands go to the agent's pane id: the name may move to another agent between the lookup and
// the command, the pane id does not.

export const makeInput = Effect.gen(function* () {
  const herdrOutbound = yield* HerdrOutbound;
  const { find } = yield* makeLoadAgents;

  const screen = Effect.fn('Input.screen')(function* (ref: string) {
    const { agent } = yield* find(ref);
    return yield* herdrOutbound.readScreen(agent.paneId);
  });

  const prompt = Effect.fn('Input.prompt')(function* (ref: string, text: string) {
    const parsed = yield* Effect.fromResult(parsePrompt(text));
    const { agent } = yield* find(ref);
    yield* herdrOutbound.prompt(agent.paneId, parsed);
  });

  const sendKeys = Effect.fn('Input.sendKeys')(function* (
    ref: string,
    keys: ReadonlyArray<string>,
  ) {
    const parsed = yield* Effect.fromResult(parseKeys(keys));
    const { agent } = yield* find(ref);
    yield* herdrOutbound.sendKeys(agent.paneId, parsed);
  });

  return { screen, prompt, sendKeys };
});
