import { Select, Stack, Text } from '@smotastic/pocket-design';

/** The lane the owner chooses for a proposal: none to only file it, or a mission's lane. */
export type ProposalLane = 'none' | 'hop' | 'full-flight';

/** Pi's suggestion of a proposal's lane, with its one-line reason (spec 035). */
export interface LaneSuggestionView {
  readonly lane: ProposalLane;
  readonly reason: string;
}

const NAMES: Readonly<Record<ProposalLane, string>> = {
  none: 'None: only the issue',
  hop: 'Hop: send it on a mission',
  'full-flight': 'Full flight: send it on a mission',
};

const laneOf = (value: string): ProposalLane =>
  value === 'hop' || value === 'full-flight' ? value : 'none';

/** The mission lane of a choice, or none when the issue is only filed. */
export const missionLane = (lane: ProposalLane): 'hop' | 'full-flight' | undefined =>
  lane === 'none' ? undefined : lane;

/** The lane picker of a proposal, preselected with Pi's suggestion and its reason. */
export const LanePicker = ({
  value,
  suggestion,
  onChange,
}: {
  readonly value: ProposalLane;
  readonly suggestion: LaneSuggestionView | undefined;
  readonly onChange: (lane: ProposalLane) => void;
}) => (
  <Stack gap="xs">
    <Select label="Lane" value={value} onChange={(chosen) => onChange(laneOf(chosen))}>
      {(['none', 'hop', 'full-flight'] as const).map((lane) => (
        <option key={lane} value={lane}>
          {NAMES[lane]}
        </option>
      ))}
    </Select>
    {suggestion === undefined || suggestion.reason === '' ? null : (
      <Text size="sm" tone="muted">
        {`Pi suggests ${suggestion.lane === 'full-flight' ? 'full flight' : suggestion.lane}: ${suggestion.reason}`}
      </Text>
    )}
  </Stack>
);
