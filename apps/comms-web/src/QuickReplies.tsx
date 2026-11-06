import { ChipGroup } from '@smotastic/pocket-design';

/** The replies the owner sends often, offered with one tap (spec 024). */
export const QUICK_REPLIES = ['Go ahead', 'Commit and open a PR'] as const;

/** Fixed replies above the text field; `onPick` sends or types the reply. */
export const QuickReplies = ({
  disabled,
  onPick,
}: {
  readonly disabled: boolean;
  readonly onPick: (reply: string) => void;
}) => (
  <ChipGroup
    label="Quick replies"
    layout="row"
    items={QUICK_REPLIES.map((reply) => ({ id: reply, label: reply }))}
    isDisabled={disabled}
    onAction={onPick}
  />
);
