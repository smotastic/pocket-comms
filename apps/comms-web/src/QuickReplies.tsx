import { ChipGroup } from '@smotastic/pocket-design';

/** The owner's own replies above the text field; `onPick` sends or types the reply. */
export const QuickReplies = ({
  replies,
  disabled,
  onPick,
}: {
  readonly replies: ReadonlyArray<string>;
  readonly disabled: boolean;
  readonly onPick: (reply: string) => void;
}) =>
  replies.length === 0 ? null : (
    <ChipGroup
      label="Quick replies"
      layout="row"
      items={replies.map((reply) => ({ id: reply, label: reply }))}
      isDisabled={disabled}
      onAction={onPick}
    />
  );

/**
 * The replies the latest agent message calls for, marked with a sparkle so they read
 * apart from the owner's own; `onPick` sends the reply as a prompt.
 */
export const SuggestedReplies = ({
  replies,
  disabled,
  onPick,
}: {
  readonly replies: ReadonlyArray<string>;
  readonly disabled: boolean;
  readonly onPick: (reply: string) => void;
}) =>
  replies.length === 0 ? null : (
    <ChipGroup
      label="Suggested replies"
      layout="row"
      items={replies.map((reply) => ({ id: reply, label: reply, icon: 'sparkle' }))}
      isDisabled={disabled}
      onAction={onPick}
    />
  );
