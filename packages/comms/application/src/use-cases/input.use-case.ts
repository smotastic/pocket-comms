import {
  activitySubject,
  answerExcerpt,
  answerKeys,
  parseKeys,
  parsePrompt,
  parseTyped,
  promptExcerpt,
  promptWithImages,
  showsQuestion,
  conversationFormatOf,
} from '@pocket-comms/comms-domain';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { QuestionNotWaitingError } from '../errors.js';
import { HerdrOutbound } from '../ports/herdr.outbound.port.js';
import { ConversationOutbound } from '../ports/conversation.outbound.port.js';
import { makeRecordActivity } from './activity-log.js';
import { makeLoadAgents, sourceOf } from './agents.js';
import { makeImagePaths } from './image-paths.js';

// Commands go to the agent's pane id: the name may move to another agent between the lookup and
// the command, the pane id does not. What Herdr took goes into the activity timeline.

export const makeInput = Effect.gen(function* () {
  const herdrOutbound = yield* HerdrOutbound;
  const conversationOutbound = yield* ConversationOutbound;
  const { find } = yield* makeLoadAgents;
  const { imagePaths } = yield* makeImagePaths;
  const { record } = yield* makeRecordActivity;

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
    const { agent, workspace } = yield* find(ref);
    yield* herdrOutbound.prompt(agent.paneId, promptWithImages(parsed, paths));
    yield* record([
      {
        type: 'prompt',
        excerpt: promptExcerpt(parsed),
        images: imageIds.length,
        agent: activitySubject(agent, workspace),
      },
    ]);
  });

  const sendKeys = Effect.fn('Input.sendKeys')(function* (
    ref: string,
    keys: ReadonlyArray<string>,
  ) {
    const parsed = yield* Effect.fromResult(parseKeys(keys));
    const { agent, workspace } = yield* find(ref);
    yield* herdrOutbound.sendKeys(agent.paneId, parsed);
    yield* record([{ type: 'keys', keys: parsed, agent: activitySubject(agent, workspace) }]);
  });

  // Typing never presses Enter: the owner submits the dialog with the key.
  const type = Effect.fn('Input.type')(function* (ref: string, text: string) {
    const parsed = yield* Effect.fromResult(parseTyped(text));
    const { agent, workspace } = yield* find(ref);
    yield* herdrOutbound.typeText(agent.paneId, parsed);
    yield* record([
      { type: 'typed', excerpt: promptExcerpt(parsed), agent: activitySubject(agent, workspace) },
    ]);
  });

  // The keys answer a fresh dialog of this very call, so each check reads the session file and the
  // screen again: a question answered at the terminal or moved on is refused, and nothing is
  // pressed. Herdr's status does not count: it shows an agent whose question waits as done.
  const answer = Effect.fn('Input.answer')(function* (
    ref: string,
    call: string,
    answers: ReadonlyArray<ReadonlyArray<number>>,
  ) {
    const { agent, workspace } = yield* find(ref);
    const notWaiting = (reason: string) =>
      Effect.fail(new QuestionNotWaitingError({ ref, reason }));
    const source = sourceOf(agent);
    if (conversationFormatOf(agent) !== 'claude' || Option.isNone(source)) {
      return yield* notWaiting('Only a Claude agent asks questions the app can answer.');
    }
    const { entries } = yield* conversationOutbound
      .read(source.value)
      .pipe(Effect.catchTag('ConversationUnavailableError', (error) => notWaiting(error.reason)));
    const latest = entries.at(-1);
    if (
      latest?.type !== 'tool' ||
      latest.id !== call ||
      latest.questions === undefined ||
      latest.outcome !== 'pending'
    ) {
      return yield* notWaiting('This question was answered or moved on.');
    }
    const keys = yield* Effect.fromResult(answerKeys(latest.questions, answers));
    const screen = yield* herdrOutbound.readScreen(agent.paneId);
    if (!showsQuestion(screen, latest.questions)) {
      return yield* notWaiting("The agent's screen does not show this question.");
    }
    yield* herdrOutbound.sendKeys(agent.paneId, keys);
    yield* record([
      {
        type: 'answered',
        excerpt: answerExcerpt(latest.questions, answers),
        agent: activitySubject(agent, workspace),
      },
    ]);
  });

  return { screen, prompt, type, sendKeys, answer };
});
