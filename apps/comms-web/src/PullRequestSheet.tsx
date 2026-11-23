import {
  Alert,
  Button,
  CodeDiff,
  IconButton,
  LinkButton,
  Sheet,
  SheetHeader,
  Stack,
  Text,
} from '@smotastic/pocket-design';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttachedPullRequestView, CommsClient } from './comms-client.js';
import { pullRequestChangesQuery, pullRequestsKey } from './comms-queries.js';
import {
  CODE_DIFF_LABELS,
  pullRequestDetail,
  pullRequestName,
  toCodeDiffFile,
} from './pull-requests.js';

export interface PullRequestSheetProps {
  readonly client: CommsClient;
  readonly agentRef: string;
  /** The pull request to show; none closes the sheet. */
  readonly pullRequest: AttachedPullRequestView | undefined;
  readonly onClose: () => void;
}

const Changes = ({
  client,
  agentRef,
  pullRequest,
}: Omit<PullRequestSheetProps, 'pullRequest' | 'onClose'> & {
  readonly pullRequest: AttachedPullRequestView;
}) => {
  // The files stay while a Refresh reads them again (requirement 20).
  const changes = useQuery({
    ...pullRequestChangesQuery(client, agentRef, pullRequest),
    placeholderData: keepPreviousData,
  });
  if (changes.data === undefined) {
    return changes.error === null ? (
      <Text tone="muted">Reading the changes…</Text>
    ) : (
      <Stack gap="sm">
        <Alert>{changes.error.message}</Alert>
        <Button variant="secondary" onClick={() => void changes.refetch()}>
          Try again
        </Button>
      </Stack>
    );
  }
  const { pullRequest: current, files, tooLarge } = changes.data;
  return (
    <Stack gap="md">
      {changes.error === null ? null : (
        <Stack gap="sm">
          <Alert>{changes.error.message}</Alert>
          <Button variant="secondary" onClick={() => void changes.refetch()}>
            Try again
          </Button>
        </Stack>
      )}
      {tooLarge ? <Alert tone="info">This pull request is too large to show here.</Alert> : null}
      <CodeDiff
        label={`Changes of ${pullRequestName(current)}`}
        files={files.map((file) => toCodeDiffFile(file, current.url))}
        labels={CODE_DIFF_LABELS}
      />
    </Stack>
  );
};

/**
 * A pull request's changed files and diff (spec 031), read from Gitea: a sheet from the bottom over
 * the conversation, which stays where it was. Refresh reads the changes and the pull request again.
 */
export const PullRequestSheet = ({
  client,
  agentRef,
  pullRequest,
  onClose,
}: PullRequestSheetProps) => {
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: async (shown: AttachedPullRequestView) => {
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: pullRequestChangesQuery(client, agentRef, shown).queryKey,
        }),
        queryClient.invalidateQueries({ queryKey: pullRequestsKey(agentRef) }),
      ]);
    },
  });
  const title = pullRequest === undefined ? 'Pull request' : pullRequestName(pullRequest);
  return (
    <Sheet
      open={pullRequest !== undefined}
      label={title}
      bodyLabel="Changed files"
      size="full"
      onClose={onClose}
      bodyKey={title}
      header={
        <SheetHeader
          title={title}
          {...(pullRequest === undefined ? {} : { subtitle: pullRequestDetail(pullRequest) })}
        >
          {pullRequest === undefined ? null : (
            <IconButton
              icon="retry"
              label="Refresh"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate(pullRequest)}
            />
          )}
          <IconButton icon="close" label="Close" onClick={onClose} />
        </SheetHeader>
      }
      notices={
        pullRequest === undefined ? null : (
          <LinkButton href={pullRequest.url} external variant="secondary" size="sm">
            Open in Gitea
          </LinkButton>
        )
      }
    >
      {pullRequest === undefined ? null : (
        <Changes client={client} agentRef={agentRef} pullRequest={pullRequest} />
      )}
    </Sheet>
  );
};
