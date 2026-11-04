import { Badge, type BadgeTone } from '@smotastic/pocket-design';

/** An agent's state, as comms tells them apart. */
export type StatusTone = 'working' | 'blocked' | 'done' | 'idle' | 'unknown';

const LOOKS: Record<StatusTone, { readonly tone: BadgeTone; readonly indicator: 'dot' | 'pulse' }> =
  {
    working: { tone: 'neutral', indicator: 'pulse' },
    blocked: { tone: 'danger', indicator: 'dot' },
    done: { tone: 'success', indicator: 'dot' },
    idle: { tone: 'muted', indicator: 'dot' },
    unknown: { tone: 'muted', indicator: 'dot' },
  };

/** A state as a badge: its colour and dot, and the words that carry it. */
export const StatusBadge = ({
  tone,
  label,
}: {
  readonly tone: StatusTone;
  /** The state in words, such as "Needs you"; the colour alone never carries it. */
  readonly label: string;
}) => (
  <Badge tone={LOOKS[tone].tone} indicator={LOOKS[tone].indicator}>
    {label}
  </Badge>
);
