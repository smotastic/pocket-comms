import {
  Alert,
  Button,
  IconButton,
  Inline,
  Link,
  List,
  ListItem,
  Page,
  Stack,
  StatusPill,
  Tag,
  Text,
  TopBar,
} from '@pocket-comms/design-ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CommsClient, IssueListView, IssueView, TaskCreatedView } from './comms-client.js';
import { issuesKey, issuesQuery } from './comms-queries.js';
import { ImplementIssue } from './ImplementIssue.js';
import { STATUS_LABELS } from './labels.js';
import { navigateOnPlainClick } from './links.js';
import { useNow } from './live.js';
import { since } from './since.js';

export interface ProjectIssuesProps {
  readonly client: CommsClient;
  readonly project: string;
  readonly onBack: () => void;
  readonly onOpenAgent: (ref: string) => void;
  /** Opens the conversation of an agent Implement with Claude started, with a note to show. */
  readonly onStarted: (ref: string, note: string | undefined) => void;
}

const updated = (at: number, now: number) => {
  const ago = since(at, now);
  return ago === 'now' ? 'Updated just now' : `Updated ${ago} ago`;
};

/** What the screen says after a start without a running agent. */
const startedNotice = (created: TaskCreatedView) => {
  const ready = `${created.branch} is ready in a new worktree.`;
  return created.agent?.note === undefined ? ready : `${ready} ${created.agent.note}`;
};

const IssueRow = ({
  issue,
  now,
  onOpenAgent,
  onImplement,
}: {
  readonly issue: IssueView;
  readonly now: number;
  readonly onOpenAgent: (ref: string) => void;
  readonly onImplement: () => void;
}) => (
  <ListItem>
    <Stack gap="xs">
      <Link emphasis="strong" external href={issue.url}>
        #{issue.number} {issue.title}
      </Link>
      <Inline gap="xs">
        {issue.labels.map((label) => (
          <Tag key={label}>{label}</Tag>
        ))}
        <Text as="span" tone="muted" size="sm">
          {updated(issue.updatedAt, now)}
        </Text>
      </Inline>
      {issue.work.map((work) =>
        work.agents.length === 0 ? (
          <Text key={work.branch} tone="muted" size="sm">
            {work.branch} · no agent running
          </Text>
        ) : (
          work.agents.map((agent) => (
            <Inline key={agent.ref} gap="xs">
              <Link
                href={`/agents/${encodeURIComponent(agent.ref)}`}
                onClick={navigateOnPlainClick(() => onOpenAgent(agent.ref))}
              >
                {agent.ref}
              </Link>
              <Text as="span" size="sm">
                is working on this
              </Text>
              <StatusPill tone={agent.status} label={STATUS_LABELS[agent.status]} />
            </Inline>
          ))
        ),
      )}
      <div>
        <Button size="sm" variant="secondary" onClick={onImplement}>
          Implement with Claude
        </Button>
      </div>
    </Stack>
  </ListItem>
);

const Issues = ({
  list,
  now,
  onOpenAgent,
  onImplement,
}: {
  readonly list: IssueListView;
  readonly now: number;
  readonly onOpenAgent: (ref: string) => void;
  readonly onImplement: (issue: IssueView) => void;
}) => {
  if (list._tag === 'NotConfigured') {
    return (
      <Alert>Gitea is not configured. Set COMMS_GITEA_TOKEN on the server to see the issues.</Alert>
    );
  }
  if (list._tag === 'NoGiteaRemote') {
    return <Text tone="muted">This project has no Gitea remote, so it has no issues to show.</Text>;
  }
  return (
    <List aria-label="Open issues" empty={<Text tone="muted">No open issues.</Text>}>
      {list.issues.map((issue) => (
        <IssueRow
          key={issue.number}
          issue={issue}
          now={now}
          onOpenAgent={onOpenAgent}
          onImplement={() => onImplement(issue)}
        />
      ))}
    </List>
  );
};

/** `/projects/$project`: the project's open Gitea issues and Implement with Claude (spec 006). */
export const ProjectIssues = ({
  client,
  project,
  onBack,
  onOpenAgent,
  onStarted,
}: ProjectIssuesProps) => {
  const issues = useQuery(issuesQuery(client, project));
  const queryClient = useQueryClient();
  const [implementing, setImplementing] = useState<IssueView | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const now = useNow();
  const repository = issues.data?._tag === 'Listed' ? issues.data.repository : undefined;

  return (
    <>
      <TopBar
        start={<IconButton icon="back" label="Back to the projects" onClick={onBack} />}
        title={project}
        {...(repository === undefined
          ? {}
          : { subtitle: `${repository.owner}/${repository.name} on Gitea` })}
      />
      <ImplementIssue
        client={client}
        project={project}
        issue={implementing}
        onClose={() => setImplementing(undefined)}
        onStarted={(created) => {
          setImplementing(undefined);
          void queryClient.invalidateQueries({ queryKey: issuesKey(project) });
          if (created.agent?.started === true) onStarted(created.agent.ref, created.agent.note);
          else setNotice(startedNotice(created));
        }}
      />
      <Page>
        <Stack gap="md">
          {notice === undefined ? null : (
            <div role="status">
              <Text>{notice}</Text>
            </div>
          )}
          {issues.error === null ? null : <Alert>{issues.error.message}</Alert>}
          {issues.isPending ? <Text tone="muted">Loading the issues…</Text> : null}
          {issues.data === undefined ? null : (
            <Issues
              list={issues.data}
              now={now}
              onOpenAgent={onOpenAgent}
              onImplement={(issue) => {
                setNotice(undefined);
                setImplementing(issue);
              }}
            />
          )}
        </Stack>
      </Page>
    </>
  );
};
