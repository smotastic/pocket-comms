import { parseKeys, parsePrompt, promptWithImages } from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import { HerdrOutbound } from '../ports/herdr.outbound.port.js';
import { makeLoadAgents } from './agents.js';
import { makeImagePaths } from './image-paths.js';

// Commands go to the agent's pane id: the name may move to another agent between the lookup and
// the command, the pane id does not.

export const makeInput = Effect.gen(function* () {
  const herdrOutbound = yield* HerdrOutbound;
  const { find } = yield* makeLoadAgents;
  const { imagePaths } = yield* makeImagePaths;

  const screen = Effect.fn('Input.screen')(function* (ref: string) {
    const { agent } = yield* find(ref);
    return yield* herdrOutbound.readScreen(agent.paneId);
  });

  // The images go to the agent as paths after the text (spec 014, requirement 8).
  const prompt = Effect.fn('Input.prompt')(function* (
    ref: string,
    text: string,
    imageIds: ReadonlyArray<string> = [],
  ) {
    const parsed = yield* Effect.fromResult(parsePrompt(text, imageIds.length));
    const paths = yield* imagePaths(imageIds);
    const { agent } = yield* find(ref);
    yield* herdrOutbound.prompt(agent.paneId, promptWithImages(parsed, paths));
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
