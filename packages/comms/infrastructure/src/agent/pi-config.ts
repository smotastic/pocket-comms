import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { AgentRuntimeError, AgentRuntimeOutbound } from '@pocket-comms/comms-application';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Redacted from 'effect/Redacted';
import * as Stream from 'effect/Stream';
import { makePiAuthFile } from './pi-auth-file.js';
import { ATTRIBUTION, makePiRuntime } from './pi-runtime.js';

export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

/** The brainstorm chat's model settings (spec 013, requirement 19). */
export interface PiOptions {
  readonly provider: Option.Option<string>;
  readonly model: Option.Option<string>;
  /** An API key; none uses the Pi login in `authFile`, then the provider's own variable. */
  readonly apiKey: Option.Option<Redacted.Redacted<string>>;
  /** Pi's credential file, such as `~/.pi/agent/auth.json`. */
  readonly authFile: string;
  readonly thinking: ThinkingLevel;
}

/** A runtime that is not set up: it says why, and every turn fails with that reason. */
const notSetUp = (reason: string) =>
  AgentRuntimeOutbound.of({
    notSetUp: Option.some(reason),
    runTurn: () => Stream.fail(new AgentRuntimeError({ reason })),
  });

/**
 * The Pi runtime with the configured provider and model. A missing setting, a model the provider
 * does not have, or a provider without credentials gives a runtime that is not set up and names
 * the setting; the server starts anyway, and it never falls back to another model.
 */
export const layerPi = (options: PiOptions) =>
  Layer.effect(
    AgentRuntimeOutbound,
    Effect.gen(function* () {
      if (Option.isNone(options.provider) || Option.isNone(options.model)) {
        const missing = [
          ...(Option.isNone(options.provider) ? ['COMMS_BRAINSTORM_PROVIDER'] : []),
          ...(Option.isNone(options.model) ? ['COMMS_BRAINSTORM_MODEL'] : []),
        ];
        return notSetUp(`Set ${missing.join(' and ')} to use the brainstorm chat.`);
      }
      const provider = options.provider.value;
      const credentials = makePiAuthFile(options.authFile);
      const models = builtinModels({ identity: { attribution: ATTRIBUTION }, credentials });
      const model = models.getModel(provider, options.model.value);
      if (model === undefined) {
        return notSetUp(
          `COMMS_BRAINSTORM_MODEL=${options.model.value} is no model of COMMS_BRAINSTORM_PROVIDER=${provider}.`,
        );
      }
      // An empty key is no key, so Pi's login or the provider's own environment variable applies.
      const apiKey = Option.getOrUndefined(
        Option.filter(options.apiKey, (key) => Redacted.value(key) !== ''),
      );
      if (apiKey === undefined) {
        // Checks without refreshing: an expired login is refreshed on the first turn.
        const auth = yield* Effect.promise(() => models.checkAuth(provider).catch(() => undefined));
        if (auth === undefined) {
          return notSetUp(
            `COMMS_BRAINSTORM_PROVIDER=${provider} has no credentials: set COMMS_BRAINSTORM_API_KEY, or sign in with Pi (\`pi\`, then /login) so ${options.authFile} holds a login.`,
          );
        }
      }
      return makePiRuntime({ models, model, apiKey, thinking: options.thinking });
    }),
  );
