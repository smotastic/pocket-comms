import {
  AgentList,
  Alert,
  Button,
  Card,
  IconButton,
  Inline,
  Link,
  List,
  ListItem,
  Page,
  SectionHeader,
  Stack,
  StatusPill,
  Tag,
  Text,
  TopBar,
  type Hue,
} from '@pocket-comms/design-ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AgentItem } from './AgentItem.js';
import { projectHue } from './rows.js';
import type {
  AgentView,
  CommsClient,
  IssueListView,
  IssueView,
  OverviewView,
  TaskCreatedView,
} from './comms-client.js';
import { issuesKey, issuesQuery, overviewQuery, projectsQuery } from './comms-queries.js';
import { CloseIssue } from './CloseIssue.js';
import { ImplementIssue } from './ImplementIssue.js';
import { STATUS_LABELS } from './labels.js';
import { navigateOnPlainClick } from './links.js';
import { useNow, useOverviewLive } from './live.js';
import { NewTask } from './NewTask.js';
import { filterOverview } from './project-agents.js';
import { since } from './since.js';

export interface ProjectPageProps {
  readonly client: CommsClient;
  readonly project: string;
  readonly onBack: () => void;
  readonly onOpenAgent: (ref: string) => void;
  /** Opens the conversation of an agent New task or Implement with Claude started, with a note. */
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
  onClose,
}: {
  readonly issue: IssueView;
  readonly now: number;
  readonly onOpenAgent: (ref: string) => void;
  readonly onImplement: () => void;
  readonly onClose: () => void;
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
      <Inline gap="xs">
        <Button size="sm" variant="secondary" onClick={onImplement}>
          Implement with Claude
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </Inline>
    </Stack>
  </ListItem>
);

const Issues = ({
  list,
  now,
  onOpenAgent,
  onImplement,
  onClose,
}: {
  readonly list: IssueListView;
  readonly now: number;
  readonly onOpenAgent: (ref: string) => void;
  readonly onImplement: (issue: IssueView) => void;
  readonly onClose: (issue: IssueView) => void;
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
          onClose={() => onClose(issue)}
        />
      ))}
    </List>
  );
};

/** The project's agents from the overview: those in Needs you first, then the others. */
const agentsOf = (overview: OverviewView, project: string) => {
  const mine = filterOverview(overview, project);
  return [...mine.needsYou, ...mine.groups.flatMap((group) => group.agents)];
};

const Agents = ({
  agents,
  hue,
  now,
  onOpen,
}: {
  readonly agents: ReadonlyArray<AgentView>;
  readonly hue: Hue;
  readonly now: number;
  readonly onOpen: (ref: string) => void;
}) => (
  <Card>
    <section aria-label="Agents">
      <Stack gap="xs">
        <SectionHeader title="Agents" count={agents.length} />
        {agents.length === 0 ? <Text tone="muted">No agents are running.</Text> : null}
        {agents.length === 0 ? null : (
          <AgentList label="Agents of the project">
            {agents.map((agent) => (
              <AgentItem
                key={agent.paneId}
                agent={agent}
                hue={hue}
                withProject={false}
                now={now}
                onOpen={onOpen}
              />
            ))}
          </AgentList>
        )}
      </Stack>
    </section>
  </Card>
);

/**
 * `/projects/$project`: the project's agents, its open Gitea issues with Implement with Claude
 * (spec 006) and Close (spec 010), and a new task in it (spec 008). The agents update live.
 */
export const ProjectPage = ({
  client,
  project,
  onBack,
  onOpenAgent,
  onStarted,
}: ProjectPageProps) => {
  useOverviewLive(client);
  const overview = useQuery(overviewQuery(client));
  const projects = useQuery(projectsQuery(client));
  const issues = useQuery(issuesQuery(client, project));
  const queryClient = useQueryClient();
  const [implementing, setImplementing] = useState<IssueView | undefined>(undefined);
  const [closing, setClosing] = useState<IssueView | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const now = useNow();
  const repository = issues.data?._tag === 'Listed' ? issues.data.repository : undefined;
  const unknown =
    projects.data !== undefined && !projects.data.some(({ name }) => name === project);
  const back = <IconButton icon="back" label="Back to all agents" onClick={onBack} />;
  // A start without a running agent says so here; a running one opens its conversation.
  const started = (created: TaskCreatedView) => {
    if (created.agent?.started === true) onStarted(created.agent.ref, created.agent.note);
    else setNotice(startedNotice(created));
  };

  if (unknown) {
    return (
      <>
        <TopBar start={back} title={project} />
        <Page>
          <Text>{project} is not a project.</Text>
        </Page>
      </>
    );
  }

  return (
    <>
      <TopBar
        start={back}
        title={project}
        {...(repository === undefined
          ? {}
          : { subtitle: `${repository.owner}/${repository.name} on Gitea` })}
        end={
          <IconButton
            icon="plus"
            label="New task"
            onClick={() => {
              setNotice(undefined);
              setCreating(true);
            }}
          />
        }
      />
      <NewTask
        client={client}
        project={project}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          started(created);
        }}
      />
      <ImplementIssue
        client={client}
        project={project}
        issue={implementing}
        onClose={() => setImplementing(undefined)}
        onStarted={(created) => {
          setImplementing(undefined);
          void queryClient.invalidateQueries({ queryKey: issuesKey(project) });
          started(created);
        }}
      />
      <CloseIssue
        client={client}
        project={project}
        issue={closing}
        onClose={() => setClosing(undefined)}
        onClosed={(number) => {
          setClosing(undefined);
          setNotice(`#${number} closed.`);
          void queryClient.invalidateQueries({ queryKey: issuesKey(project) });
        }}
      />
      <Page>
        <Stack gap="md">
          {notice === undefined ? null : (
            <div role="status">
              <Text>{notice}</Text>
            </div>
          )}
          {overview.error === null ? null : <Alert>{overview.error.message}</Alert>}
          {overview.data === undefined ? (
            overview.isPending ? (
              <Text tone="muted">Loading the agents…</Text>
            ) : null
          ) : (
            <Agents
              agents={agentsOf(overview.data, project)}
              hue={projectHue(
                project,
                (projects.data ?? []).map(({ name }) => name),
              )}
              now={now}
              onOpen={onOpenAgent}
            />
          )}
          <section aria-label="Issues">
            <Stack gap="xs">
              <SectionHeader title="Issues" />
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
                  onClose={(issue) => {
                    setNotice(undefined);
                    setClosing(issue);
                  }}
                />
              )}
            </Stack>
          </section>
        </Stack>
      </Page>
    </>
  );
};
