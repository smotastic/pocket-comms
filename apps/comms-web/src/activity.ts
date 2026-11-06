import type { ActivityEventView, Key } from './comms-client.js';

// How the Activity page shows each event (spec 017).

const KEY_LABELS: Record<Key, string> = {
  '1': '1',
  '2': '2',
  '3': '3',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  enter: 'Enter',
  esc: 'Esc',
  'ctrl+c': 'Ctrl-C',
};

const STATUS_TEXTS = { working: 'Working', blocked: 'Needs you', done: 'Finished' } as const;

const images = (count: number) => `${count} ${count === 1 ? 'image' : 'images'}`;

/** What happened, in words, as the row's second line. */
export const activityText = (event: ActivityEventView): string => {
  switch (event.type) {
    case 'appeared':
      return 'New agent';
    case 'gone':
      return 'Gone';
    case 'status':
      return STATUS_TEXTS[event.status];
    case 'prompt':
      if (event.excerpt === '') return `You sent ${images(event.images)}`;
      return event.images === 0
        ? `You: ${event.excerpt}`
        : `You: ${event.excerpt} (+${images(event.images)})`;
    case 'keys':
      return `You pressed ${event.keys.map((key) => KEY_LABELS[key]).join(', ')}`;
    case 'typed':
      return `You typed: ${event.excerpt}`;
  }
};

/** The row's dot: the status an event moved to; the other events have no colour. */
export const activityTone = (event: ActivityEventView) =>
  event.type === 'status' ? event.status : event.type === 'gone' ? 'unknown' : 'idle';

/** Where an event leads: the live agent's conversation, else its project's page, else nowhere. */
export const activityTarget = (
  event: ActivityEventView,
):
  | { readonly to: 'agent'; readonly ref: string }
  | { readonly to: 'project'; readonly project: string }
  | undefined => {
  if (event.live) return { to: 'agent', ref: event.agent.ref };
  if (event.agent.project !== undefined) return { to: 'project', project: event.agent.project };
  return undefined;
};
