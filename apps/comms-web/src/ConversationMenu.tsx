import {
  Alert,
  Button,
  IconButton,
  List,
  ListItem,
  SectionHeader,
  Sheet,
  SheetHeader,
  Stack,
  Text,
} from '@smotastic/pocket-design';
import { useState } from 'react';
import { useOpenBrainstorm } from './Brainstorm.js';
import type { AttachedPullRequestView } from './comms-client.js';
import { moreLabel, pullRequestDetail, pullRequestId, pullRequestName } from './pull-requests.js';

export interface MenuPullRequests {
  readonly list: ReadonlyArray<AttachedPullRequestView>;
  /** Opens the pull request's changes. */
  readonly onOpen: (pullRequest: AttachedPullRequestView) => void;
  /** Removes it from the agent's list; Gitea does not change. */
  readonly onRemove: (pullRequest: AttachedPullRequestView) => Promise<void>;
}

const RemoveConfirmation = ({
  pullRequest,
  onCancel,
  onRemove,
}: {
  readonly pullRequest: AttachedPullRequestView | undefined;
  readonly onCancel: () => void;
  readonly onRemove: (pullRequest: AttachedPullRequestView) => Promise<void>;
}) => {
  const [failure, setFailure] = useState<string>();
  const [removing, setRemoving] = useState(false);
  const title = pullRequest === undefined ? 'Remove' : `Remove ${pullRequestName(pullRequest)}?`;
  return (
    <Sheet
      open={pullRequest !== undefined}
      role="alertdialog"
      label={title}
      bodyLabel="Remove the pull request"
      onClose={onCancel}
      header={<SheetHeader title={title} />}
    >
      <Stack gap="sm">
        <Text tone="muted">
          It leaves this conversation in pocket-comms. The pull request stays as it is in Gitea.
        </Text>
        {failure === undefined ? null : <Alert>{failure}</Alert>}
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={removing}
          onClick={() => {
            if (pullRequest === undefined) return;
            setRemoving(true);
            setFailure(undefined);
            onRemove(pullRequest)
              .then(onCancel)
              .catch((error: unknown) =>
                setFailure(error instanceof Error ? error.message : 'Removing failed.'),
              )
              .finally(() => setRemoving(false));
          }}
        >
          Remove
        </Button>
      </Stack>
    </Sheet>
  );
};

/**
 * The conversation's More action (spec 016): the top bar has no room for more icons next to the
 * agent's name, so the agent's attached pull requests (spec 031), the brainstorm and Close wait in
 * a sheet. The button counts the pull requests.
 */
export const ConversationMenu = ({
  close,
  pullRequests,
}: {
  /** Asks to close the agent; only an agent in a linked worktree can be closed. */
  readonly close?: { readonly label: string; readonly onClose: () => void };
  readonly pullRequests?: MenuPullRequests;
}) => {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<AttachedPullRequestView>();
  const openBrainstorm = useOpenBrainstorm();
  // More closes first, so only one sheet is ever open.
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const list = pullRequests?.list ?? [];

  return (
    <>
      <IconButton
        icon="settings"
        label={moreLabel(list.length)}
        count={list.length}
        onClick={() => setOpen(true)}
      />
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
          {pullRequests === undefined || list.length === 0 ? null : (
            <>
              <SectionHeader title="Pull requests" />
              <List divided>
                {list.map((pullRequest) => (
                  <ListItem
                    key={pullRequestId(pullRequest)}
                    actions={
                      <IconButton
                        icon="delete"
                        label={`Remove ${pullRequestName(pullRequest)}`}
                        onClick={choose(() => setRemoving(pullRequest))}
                      />
                    }
                  >
                    <Stack gap="2xs">
                      <Button
                        variant="secondary"
                        onClick={choose(() => pullRequests.onOpen(pullRequest))}
                      >
                        {pullRequestName(pullRequest)}
                      </Button>
                      <Text size="sm" tone="muted" truncate>
                        {pullRequestDetail(pullRequest)}
                      </Text>
                    </Stack>
                  </ListItem>
                ))}
              </List>
            </>
          )}
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
      {pullRequests === undefined ? null : (
        <RemoveConfirmation
          pullRequest={removing}
          onCancel={() => setRemoving(undefined)}
          onRemove={pullRequests.onRemove}
        />
      )}
    </>
  );
};
