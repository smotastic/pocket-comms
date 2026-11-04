import { Badge, Inline, Link, List, ListItem, Stack, Text } from '@smotastic/pocket-design';
import type { ReactNode } from 'react';
import { navigateOnPlainClick } from './links.js';
import { StatusBadge, type StatusTone } from './StatusBadge.js';

/** Where a row leads; a row without it is plain, such as an event of an agent that is gone. */
type RowLink =
  | {
      /** The address of the agent's page; the browser uses it to open a new tab or copy the link. */
      readonly href: string;
      /** Opens the agent's page in the app, on a plain click or Enter. */
      readonly onNavigate: () => void;
    }
  | { readonly href?: undefined; readonly onNavigate?: undefined };

export type AgentRowProps = RowLink & {
  /** The badge after the name; without a label it shows only the dot. */
  readonly status: { readonly tone: StatusTone; readonly label: string };
  readonly name: string;
  /** After the name, such as the agent's worktree. */
  readonly worktree?: string;
  /** How long ago the agent last changed, such as "4m". */
  readonly since: string;
  /** The project's name, before the title. */
  readonly project?: string;
  /** The second line, such as the agent's current task. */
  readonly title: string;
  /** Work the agent left running, in words, such as "2 running in the background". */
  readonly background?: { readonly count: number; readonly label: string };
};

/**
 * One agent in an `AgentList`: its name, which links to its page, its status and project, what it
 * is doing and when it last changed. A row without `href` names the agent in plain text.
 */
export const AgentRow = ({
  href,
  onNavigate,
  status,
  name,
  worktree,
  since,
  project,
  title,
  background,
}: AgentRowProps) => (
  <ListItem
    actions={
      <Text as="span" tone="muted" size="sm">
        {since}
      </Text>
    }
  >
    <Stack gap="2xs">
      <Inline gap="xs">
        {href === undefined ? (
          <Text as="span">{name}</Text>
        ) : (
          <Link emphasis="strong" href={href} onClick={navigateOnPlainClick(onNavigate)}>
            {name}
          </Link>
        )}
        {worktree === undefined ? null : (
          <Text as="span" tone="muted" size="sm">
            · {worktree}
          </Text>
        )}
        <StatusBadge tone={status.tone} label={status.label} />
        {background === undefined ? null : <Badge tone="neutral">{background.label}</Badge>}
      </Inline>
      <Text tone="muted" size="sm" truncate>
        {project === undefined ? null : (
          <>
            <Text as="span" size="sm">
              {project}
            </Text>
            {' · '}
          </>
        )}
        <span>{title}</span>
      </Text>
    </Stack>
  </ListItem>
);

/** Agent rows in one list, divided by lines. */
export const AgentList = ({
  label,
  children,
}: {
  /** Names the list for a screen reader, such as "Needs you". */
  readonly label: string;
  /** The `AgentRow`s. */
  readonly children: ReactNode;
}) => <List aria-label={label}>{children}</List>;
