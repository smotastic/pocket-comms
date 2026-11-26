import {
  Alert,
  Button,
  Disclosure,
  IconButton,
  Inline,
  Link,
  SectionHeader,
  Sheet,
  SheetHeader,
  Stack,
  Text,
} from '@smotastic/pocket-design';
import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  CommsClient,
  IssueListView,
  IssueView,
  OverviewView,
  TaskCreatedView,
} from './comms-client.js';
import { issuesKey, issuesQuery } from './comms-queries.js';
import { stillWorking, useCloseIssue } from './CloseIssue.js';
import { ImplementIssue } from './ImplementIssue.js';
import { IssueCard } from './IssueCard.js';
import { groupIssues, shownLabels } from './issue-groups.js';
import { NewTask } from './NewTask.js';
import { NotificationsRow } from './NotificationsRow.js';

export interface PlanetsSheetProps {
  readonly client: CommsClient;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly overview: OverviewView | undefined;
  /** Every planet's name, in their order; none while they load. */
  readonly planets: ReadonlyArray<string> | undefined;
  /** Why the planets could not be read. */
  readonly planetsError: string | undefined;
  /** Called once Implement or New task started work in a planet. */
  readonly onStarted: (planet: string, created: TaskCreatedView) => void;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The line under a planet's name: its agents, those in Needs you, and its open issues. */
const detailOf = (
  planet: string,
  overview: OverviewView | undefined,
  issues: IssueListView | undefined,
) => {
  const agents = [
    ...(overview?.needsYou ?? []),
    ...(overview?.groups ?? []).flatMap((group) => group.agents),
  ].filter((agent) => agent.planet === planet);
  const waiting = (overview?.needsYou ?? []).filter((agent) => agent.planet === planet).length;
  return [
    agents.length === 0 ? 'No agents' : plural(agents.length, 'agent', 'agents'),
    ...(waiting === 0 ? [] : [`${waiting} ${waiting === 1 ? 'needs' : 'need'} you`]),
    ...(issues?._tag === 'Listed' ? [plural(issues.issues.length, 'issue', 'issues')] : []),
  ].join(' · ');
};

/** The live agents on an issue's branches, by name. */
const agentsOn = (issue: IssueView) =>
  issue.work.flatMap((work) => work.agents.map((agent) => agent.ref));

/** One issue as a card whose Close asks in place before it closes the issue. */
const IssueItem = ({
  client,
  planet,
  issue,
  asking,
  onAsk,
  onImplement,
  onClosed,
}: {
  readonly client: CommsClient;
  readonly planet: string;
  readonly issue: IssueView;
  /** Whether the card asks to close the issue. */
  readonly asking: boolean;
  /** Starts or cancels the question. */
  readonly onAsk: (asking: boolean) => void;
  readonly onImplement: () => void;
  readonly onClosed: (number: number) => void;
}) => {
  const close = useCloseIssue(client, planet, issue.number, onClosed);
  const busy = agentsOn(issue);
  const working = stillWorking(issue);
  return (
    <IssueCard
      number={issue.number}
      title={issue.title}
      meta={
        busy.length === 0
          ? shownLabels(issue).join(' · ')
          : `● ${busy.join(', ')} ${busy.length === 1 ? 'is' : 'are'} on it`
      }
      actions={
        <>
          {busy.length === 0 ? (
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Implement #${issue.number}`}
              onClick={onImplement}
            >
              Implement
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Close #${issue.number}`}
            onClick={() => {
              close.reset();
              onAsk(true);
            }}
          >
            Close
          </Button>
        </>
      }
      {...(asking
        ? {
            question: {
              text: (
                <Stack gap="xs">
                  <Text as="span" size="sm">
                    {`Close #${issue.number} in Gitea?`}
                    {working.length === 0
                      ? ''
                      : ` ${working.join(', ')} ${working.length === 1 ? 'keeps' : 'keep'} running.`}
                  </Text>
                  {close.error === null ? null : <Alert>{close.error.message}</Alert>}
                </Stack>
              ),
              actions: (
                <>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={close.isPending}
                    onClick={() => close.mutate()}
                  >
                    {close.isPending ? 'Closing…' : 'Close issue'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      close.reset();
                      onAsk(false);
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ),
            },
          }
        : {})}
    />
  );
};

const IssueList = ({
  client,
  planet,
  issues,
  onImplement,
  onClosed,
}: {
  readonly client: CommsClient;
  readonly planet: string;
  readonly issues: UseQueryResult<IssueListView>;
  readonly onImplement: (issue: IssueView) => void;
  readonly onClosed: (number: number) => void;
}) => {
  const [asking, setAsking] = useState<number | undefined>(undefined);
  if (issues.error !== null) return <Alert>{issues.error.message}</Alert>;
  if (issues.data === undefined) return <Text tone="muted">Loading the issues…</Text>;
  const list = issues.data;
  if (list._tag === 'NotConfigured') {
    return (
      <Alert>Gitea is not configured. Set COMMS_GITEA_TOKEN on the server to see the issues.</Alert>
    );
  }
  if (list._tag === 'NoGiteaRemote') {
    return <Text tone="muted">This planet has no Gitea remote, so it has no issues to show.</Text>;
  }
  if (list.issues.length === 0) return <Text tone="muted">No open issues.</Text>;
  const { inProgress, open } = groupIssues(list.issues);
  const group = (title: string, issues: ReadonlyArray<IssueView>) =>
    issues.length === 0 ? null : (
      <section aria-label={title}>
        <Stack gap="sm">
          <SectionHeader title={title} count={issues.length} level={3} />
          {issues.map((issue) => (
            <IssueItem
              key={issue.number}
              client={client}
              planet={planet}
              issue={issue}
              asking={asking === issue.number}
              onAsk={(ask) => setAsking(ask ? issue.number : undefined)}
              onImplement={() => onImplement(issue)}
              onClosed={(number) => {
                setAsking(undefined);
                onClosed(number);
              }}
            />
          ))}
        </Stack>
      </section>
    );
  // The issues being worked on first (spec 015), then the others.
  return (
    <Stack gap="md">
      {group('In progress', inProgress)}
      {group('Open', open)}
    </Stack>
  );
};

/** The sheet's content; it mounts with the sheet, so every opening starts collapsed. */
const PlanetList = ({
  client,
  overview,
  planets,
  onStarted,
}: Omit<PlanetsSheetProps, 'open' | 'onClose' | 'planets' | 'planetsError'> & {
  readonly planets: ReadonlyArray<string>;
}) => {
  const queryClient = useQueryClient();
  const issues = useQueries({ queries: planets.map((planet) => issuesQuery(client, planet)) });
  const [expanded, setExpanded] = useState<string | undefined>(undefined);
  const [implementing, setImplementing] = useState<
    { readonly planet: string; readonly issue: IssueView } | undefined
  >(undefined);
  const [creating, setCreating] = useState<string | undefined>(undefined);
  // Tied to its planet, so a close that finishes after the owner moved on says so only there.
  const [notice, setNotice] = useState<
    { readonly planet: string; readonly text: string } | undefined
  >(undefined);

  return (
    <>
      {planets.map((planet, index) => {
        const list = issues[index];
        return (
          <Disclosure
            key={planet}
            title={planet}
            detail={detailOf(planet, overview, list?.data)}
            expanded={expanded === planet}
            onExpandedChange={(open) => {
              setExpanded(open ? planet : undefined);
              setNotice(undefined);
            }}
          >
            {/* Mounted only while open, so a collapsed planet forgets an open question. */}
            {expanded !== planet ? null : (
              <Stack gap="md">
                {notice?.planet !== planet ? null : (
                  <div role="status">
                    <Text size="sm">{notice.text}</Text>
                  </div>
                )}
                {list === undefined ? null : (
                  <IssueList
                    client={client}
                    planet={planet}
                    issues={list}
                    onImplement={(issue) => setImplementing({ planet, issue })}
                    onClosed={(number) => {
                      setNotice({ planet, text: `#${number} closed.` });
                      void queryClient.invalidateQueries({ queryKey: issuesKey(planet) });
                    }}
                  />
                )}
                <Inline gap="md">
                  <Button size="sm" variant="secondary" onClick={() => setCreating(planet)}>
                    New task
                  </Button>
                  <Link href={`/planets/${encodeURIComponent(planet)}`}>Planet page</Link>
                </Inline>
              </Stack>
            )}
          </Disclosure>
        );
      })}
      <ImplementIssue
        client={client}
        planet={implementing?.planet ?? ''}
        issue={implementing?.issue}
        onClose={() => setImplementing(undefined)}
        onStarted={(created) => {
          const planet = implementing?.planet;
          setImplementing(undefined);
          if (planet === undefined) return;
          void queryClient.invalidateQueries({ queryKey: issuesKey(planet) });
          onStarted(planet, created);
        }}
      />
      <NewTask
        client={client}
        planet={creating ?? ''}
        open={creating !== undefined}
        onClose={() => setCreating(undefined)}
        onCreated={(created) => {
          const planet = creating;
          setCreating(undefined);
          if (planet !== undefined) onStarted(planet, created);
        }}
      />
    </>
  );
};

/**
 * Every planet, sliding in from the side, after a link to the activity timeline. A planet opens in place to its open
 * issues, with Implement, New task and a link to its page. This device's notifications sit at the
 * bottom.
 */
export const PlanetsSheet = ({
  open,
  onClose,
  planets,
  planetsError,
  ...props
}: PlanetsSheetProps) => (
  <Sheet
    open={open}
    side="end"
    label="Planets"
    bodyLabel="Planet list"
    onClose={onClose}
    header={
      <SheetHeader title="Planets">
        <IconButton icon="close" label="Close" onClick={onClose} />
      </SheetHeader>
    }
  >
    <Stack gap="md">
      <Link href="/activity">Activity</Link>
      <div>
        {planetsError !== undefined ? (
          <Alert>{planetsError}</Alert>
        ) : planets === undefined ? (
          <Text tone="muted">Loading the planets…</Text>
        ) : (
          <PlanetList planets={planets} {...props} />
        )}
      </div>
      <NotificationsRow client={props.client} />
    </Stack>
  </Sheet>
);
