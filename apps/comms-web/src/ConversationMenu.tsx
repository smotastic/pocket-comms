import {
  Alert,
  Badge,
  type BadgeTone,
  Button,
  IconButton,
  ItemRow,
  List,
  ListItem,
  SectionHeader,
  Separator,
  Sheet,
  SheetHeader,
  Stack,
  Text,
  Tile,
} from '@smotastic/pocket-design';
import { useState } from 'react';
import { useOpenBrainstorm } from './Brainstorm.js';
import type { AttachedPullRequestView } from './comms-client.js';
import { moreLabel, pullRequestId, pullRequestName, STATE_LABELS } from './pull-requests.js';

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

const STATE_TONES: Record<NonNullable<AttachedPullRequestView['state']>, BadgeTone> = {
  open: 'neutral',
  merged: 'success',
  closed: 'muted',
};

/** One attached pull request as a card that opens its changes, and its Remove button beside it. */
const PullRequestItem = ({
  pullRequest,
  onOpen,
  onRemove,
}: {
  readonly pullRequest: AttachedPullRequestView;
  readonly onOpen: () => void;
  readonly onRemove: () => void;
}) => (
  <ListItem
    actions={
      <IconButton
        icon="delete"
        label={`Remove ${pullRequestName(pullRequest)}`}
        onClick={onRemove}
      />
    }
  >
    <Tile
      label={pullRequestName(pullRequest)}
      title={pullRequest.unavailable ?? pullRequest.title ?? ''}
      action="See changes"
      onClick={onOpen}
    >
      {pullRequest.unavailable !== undefined || pullRequest.state === undefined ? null : (
        <Badge tone={STATE_TONES[pullRequest.state]} indicator="dot">
          {STATE_LABELS[pullRequest.state]}
        </Badge>
      )}
    </Tile>
  </ListItem>
);

/**
 * The conversation's More action (spec 016): the top bar has no room for more icons next to the
 * agent's name, so the agent's attached pull requests (spec 031), the brainstorm and Close wait in
 * a sheet. Each pull request is a card that opens its changes; Close stands apart at the end, as
 * the one action that cannot be undone. The button counts the pull requests.
 */
export const ConversationMenu = ({
  close,
  pullRequests,
}: {
  /** Asks to close the agent's worktree; only an agent in a linked worktree can be closed. */
  readonly close?: { readonly onClose: () => void };
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
        <Stack gap="md">
          {pullRequests === undefined || list.length === 0 ? null : (
            <Stack gap="xs">
              <SectionHeader title="Pull requests" count={list.length} />
              <List divided={false}>
                {list.map((pullRequest) => (
                  <PullRequestItem
                    key={pullRequestId(pullRequest)}
                    pullRequest={pullRequest}
                    onOpen={choose(() => pullRequests.onOpen(pullRequest))}
                    onRemove={choose(() => setRemoving(pullRequest))}
                  />
                ))}
              </List>
            </Stack>
          )}
          <List divided={false}>
            <ItemRow icon="sparkle" onClick={choose(openBrainstorm)}>
              Brainstorm with Pi
            </ItemRow>
          </List>
          {close === undefined ? null : (
            <>
              <Separator />
              <Stack gap="xs">
                <Text size="sm" tone="muted">
                  Removes the worktree and its checkout. The branch stays.
                </Text>
                <Button variant="danger" onClick={choose(close.onClose)}>
                  Close worktree
                </Button>
              </Stack>
            </>
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
