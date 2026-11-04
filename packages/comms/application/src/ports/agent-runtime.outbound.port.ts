import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type * as Schema from 'effect/Schema';
import type * as Stream from 'effect/Stream';
import type { AgentRuntimeError } from '../errors.js';
import type { StoredImage } from './images.outbound.port.js';

/** What an agent runtime keeps between turns. The service stores it without reading it. */
export interface RuntimeState {
  readonly adapter: string;
  readonly state: Schema.Json;
}

/** What a tool returns to the model. `pause` ends the turn to wait for the owner. */
export interface ToolOutcome {
  readonly output: Schema.Json;
  readonly isError: boolean;
  readonly pause: boolean;
}

/**
 * A tool the model may call. `parameters` is the JSON Schema of its input; `run` decodes the input
 * itself and never fails: a refusal is an outcome with `isError`, which the model reads.
 */
export interface RuntimeTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Schema.JsonObject;
  readonly run: (input: unknown) => Effect.Effect<ToolOutcome>;
}

/**
 * One turn: the history lives in `state`; `input` is what the owner just said or did, and
 * `images` the pictures that came with it. Only a runtime that `seesImages` gets any.
 */
export interface TurnInput {
  readonly sessionId: string;
  readonly instructions: string;
  readonly state: Option.Option<RuntimeState>;
  readonly input: string;
  readonly images: ReadonlyArray<StoredImage>;
  readonly tools: ReadonlyArray<RuntimeTool>;
}

export type RuntimeEvent =
  | { readonly _tag: 'textDelta'; readonly text: string }
  | { readonly _tag: 'message'; readonly text: string }
  | {
      readonly _tag: 'toolCall';
      readonly callId: string;
      readonly tool: string;
      readonly input: Schema.Json;
    }
  | {
      readonly _tag: 'toolResult';
      readonly callId: string;
      readonly tool: string;
      readonly output: Schema.Json;
      readonly isError: boolean;
    }
  /** The last event of a turn, with the state the next turn continues from. */
  | { readonly _tag: 'ended'; readonly state: RuntimeState };

/**
 * Runs an agent's turns (ADR 0012). The service defines the tools and stores what happens; the
 * runtime drives the model and offers it only the given tools. `notSetUp` names the missing
 * setting when the server has no model; `runTurn` then fails. `seesImages` says whether the model
 * takes pictures.
 */
export class AgentRuntimeOutbound extends Context.Service<
  AgentRuntimeOutbound,
  {
    readonly notSetUp: Option.Option<string>;
    readonly seesImages: boolean;
    readonly runTurn: (turn: TurnInput) => Stream.Stream<RuntimeEvent, AgentRuntimeError>;
  }
>()('comms/application/AgentRuntimeOutbound') {}
