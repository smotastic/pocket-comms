import { ChipGroup, IconButton, Sheet, SheetHeader } from '@smotastic/pocket-design';

/**
 * The owner's own replies in a sheet that the composer's Actions menu opens, so they take no room
 * from the text field (issue #70); picking one closes the sheet, and `onPick` sends or types the
 * reply. The draft stays in the field.
 */
export const QuickReplies = ({
  open,
  onClose,
  replies,
  disabled,
  onPick,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly replies: ReadonlyArray<string>;
  readonly disabled: boolean;
  readonly onPick: (reply: string) => void;
}) => (
  <Sheet
    open={open}
    label="Quick replies"
    bodyLabel="Your quick replies"
    onClose={onClose}
    header={
      <SheetHeader title="Quick replies">
        <IconButton icon="close" label="Close" onClick={onClose} />
      </SheetHeader>
    }
  >
    <ChipGroup
      label="Quick replies"
      layout="column"
      items={replies.map((reply) => ({ id: reply, label: reply }))}
      isDisabled={disabled}
      onAction={(reply) => {
        onClose();
        onPick(reply);
      }}
    />
  </Sheet>
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
