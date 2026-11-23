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
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttachedPullRequestView, CommsClient, PullRequestRef } from './comms-client.js';
import { pullRequestChangesQuery, pullRequestsKey } from './comms-queries.js';
import {
  CODE_DIFF_LABELS,
  pullRequestDetail,
  pullRequestTitle,
  toCodeDiffFile,
} from './pull-requests.js';

export interface PullRequestSheetProps {
  readonly client: CommsClient;
  readonly agentRef: string;
  /** The pull request to show; none closes the sheet. */
  readonly pullRequest: PullRequestRef | undefined;
  /** What the agent's list says of it, until its changes are read. */
  readonly listed: AttachedPullRequestView | undefined;
  readonly onClose: () => void;
}

const Failure = ({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) => (
  <Stack gap="sm">
    <Alert>{message}</Alert>
    <Button variant="secondary" onClick={onRetry}>
      Try again
    </Button>
  </Stack>
);

const OpenSheet = ({
  client,
  agentRef,
  pullRequest,
  listed,
  onClose,
}: Omit<PullRequestSheetProps, 'pullRequest'> & { readonly pullRequest: PullRequestRef }) => {
  const queryClient = useQueryClient();
  // The files stay while Refresh reads them again (requirement 20).
  const changes = useQuery({
    ...pullRequestChangesQuery(client, agentRef, pullRequest),
    placeholderData: keepPreviousData,
  });
  // The changes carry the pull request as Gitea has it now, so the header follows a Refresh.
  const current = changes.data?.pullRequest ?? listed;
  const title = pullRequestTitle(pullRequest);
  const refresh = () => {
    void changes.refetch();
    void queryClient.invalidateQueries({ queryKey: pullRequestsKey(agentRef) });
  };
  return (
    <Sheet
      open
      label={title}
      bodyLabel="Changed files"
      size="full"
      onClose={onClose}
      bodyKey={title}
      header={
        <SheetHeader
          title={title}
          {...(current === undefined ? {} : { subtitle: pullRequestDetail(current) })}
        >
          <IconButton
            icon="retry"
            label="Refresh"
            disabled={changes.isFetching}
            onClick={refresh}
          />
          <IconButton icon="close" label="Close" onClick={onClose} />
        </SheetHeader>
      }
      notices={
        current === undefined ? null : (
          <LinkButton href={current.url} external variant="secondary" size="sm">
            Open in Gitea
          </LinkButton>
        )
      }
    >
      {changes.data === undefined ? (
        changes.error === null ? (
          <Text tone="muted">Reading the changes…</Text>
        ) : (
          <Failure message={changes.error.message} onRetry={() => void changes.refetch()} />
        )
      ) : (
        <Stack gap="md">
          {changes.error === null ? null : (
            <Failure message={changes.error.message} onRetry={() => void changes.refetch()} />
          )}
          {changes.data.tooLarge ? (
            <Alert tone="info">This pull request is too large to show here.</Alert>
          ) : null}
          <CodeDiff
            label={`Changes of ${title}`}
            files={changes.data.files.map((file) =>
              toCodeDiffFile(file, changes.data.pullRequest.url),
            )}
            labels={CODE_DIFF_LABELS}
          />
        </Stack>
      )}
    </Sheet>
  );
};

/**
 * A pull request's changed files and diff (spec 031), read from Gitea: a sheet from the bottom over
 * the conversation, which stays where it was. Refresh reads the changes and the pull request again.
 */
export const PullRequestSheet = ({ pullRequest, ...props }: PullRequestSheetProps) =>
  pullRequest === undefined ? null : <OpenSheet pullRequest={pullRequest} {...props} />;
