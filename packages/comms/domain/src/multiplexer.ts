import * as Schema from 'effect/Schema';
import { AgentStatus } from './agent.js';

/** The program that runs the agents in terminals, picked by the configuration (ADR 0015). */
export const Multiplexer = Schema.Literals(['herdr', 'hc']);
export type Multiplexer = typeof Multiplexer.Type;

const NAMES: Record<Multiplexer, string> = { herdr: 'Herdr', hc: 'hc' };

/** The multiplexer's name as the owner knows it. */
export const multiplexerName = (multiplexer: Multiplexer): string => NAMES[multiplexer];

const isAgentStatus = Schema.is(AgentStatus);

/**
 * An agent's status from the state of its OSC 7501 report: an error needs the owner as a question
 * does, so it reads as blocked; no report, `clear` or a state the protocol may add later is
 * unknown. The status never comes from the screen.
 */
export const statusOf = (state: string | undefined): AgentStatus => {
  if (state === 'error') return 'blocked';
  return isAgentStatus(state) ? state : 'unknown';
};
