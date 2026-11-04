import { Button, IconButton, Sheet, SheetHeader, Stack } from '@smotastic/pocket-design';
import { useState } from 'react';
import { useOpenBrainstorm } from './Brainstorm.js';

/**
 * The conversation's More action (spec 016): the top bar has no room for more icons next to the
 * agent's name, so the brainstorm chat and Close wait in a sheet.
 */
export const ConversationMenu = ({
  close,
}: {
  /** Asks to close the agent; only an agent in a linked worktree can be closed. */
  readonly close?: { readonly label: string; readonly onClose: () => void };
}) => {
  const [open, setOpen] = useState(false);
  const openBrainstorm = useOpenBrainstorm();
  // More closes first, so only one sheet is ever open.
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <>
      <IconButton icon="settings" label="More" onClick={() => setOpen(true)} />
      <Sheet
        open={open}
        label="More"
        bodyLabel="More actions"
        onClose={() => setOpen(false)}
        header={
          <SheetHeader title="More">
            <IconButton icon="close" label="Close" onClick={() => setOpen(false)} />
          </SheetHeader>
        }
      >
        <Stack gap="sm">
          <Button variant="secondary" onClick={choose(openBrainstorm)}>
            Brainstorm with Pi
          </Button>
          {close === undefined ? null : (
            <Button variant="danger" onClick={choose(close.onClose)}>
              {close.label}
            </Button>
          )}
        </Stack>
      </Sheet>
    </>
  );
};
