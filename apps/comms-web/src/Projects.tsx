import {
  Alert,
  IconButton,
  Link,
  List,
  ListItem,
  Page,
  Stack,
  Text,
  TopBar,
} from '@pocket-comms/design-ui';
import { useQuery } from '@tanstack/react-query';
import type { CommsClient } from './comms-client.js';
import { projectsQuery } from './comms-queries.js';
import { navigateOnPlainClick } from './links.js';

export interface ProjectsProps {
  readonly client: CommsClient;
  readonly onBack: () => void;
  readonly onOpen: (project: string) => void;
}

/** `/projects`: the projects a task can start in, each leading to its Gitea issues (spec 006). */
export const Projects = ({ client, onBack, onOpen }: ProjectsProps) => {
  const projects = useQuery(projectsQuery(client));

  return (
    <>
      <TopBar
        start={<IconButton icon="back" label="Back to all agents" onClick={onBack} />}
        title="Projects"
        subtitle="Their open Gitea issues"
      />
      <Page>
        <Stack gap="md">
          {projects.error === null ? null : <Alert>{projects.error.message}</Alert>}
          {projects.isPending ? <Text tone="muted">Loading the projects…</Text> : null}
          {projects.data === undefined ? null : (
            <List
              aria-label="Projects"
              empty={
                <Text tone="muted">No git repositories were found in the projects folder.</Text>
              }
            >
              {projects.data.map(({ name, open }) => (
                <ListItem key={name}>
                  <Stack gap="3xs">
                    <Link
                      emphasis="strong"
                      href={`/projects/${encodeURIComponent(name)}`}
                      onClick={navigateOnPlainClick(() => onOpen(name))}
                    >
                      {name}
                    </Link>
                    {open ? (
                      <Text tone="muted" size="sm">
                        Open in Herdr
                      </Text>
                    ) : null}
                  </Stack>
                </ListItem>
              ))}
            </List>
          )}
        </Stack>
      </Page>
    </>
  );
};
