import {
  Activity,
  Alert,
  DockedPage,
  IconButton,
  Stack,
  StatusPill,
  Text,
  TopBar,
} from '@pocket-comms/design-ui';
import { useQuery } from '@tanstack/react-query';
import { Chat } from './Chat.js';
import { RequestError, type CommsClient, type SubagentView } from './comms-client.js';
import { agentQuery, subagentQuery } from './comms-queries.js';
import { useSubagentLive } from './live.js';
import { rowName } from './rows.js';

export interface SubagentConversationProps {
  readonly client: CommsClient;
  readonly agentRef: string;
  readonly id: string;
  /** Back to the parent agent's conversation. */
  readonly onBack: () => void;
}

const Header = ({
  parent,
  subagent,
  onBack,
}: {
  /** How the parent agent is named, as its row names it. */
  readonly parent: string;
  readonly subagent: SubagentView | undefined;
  readonly onBack: () => void;
}) => (
  <Stack gap="2xs">
    <TopBar
      start={<IconButton icon="back" label={`Back to ${parent}`} onClick={onBack} />}
      title={subagent?.description ?? 'Subagent'}
      {...(subagent === undefined
        ? {}
        : {
            subtitle: subagent.running ? (
              <StatusPill tone="working" label="Running" />
            ) : (
              <StatusPill tone="done" label="Ended" />
            ),
          })}
    />
    <Text tone="muted" size="sm" truncate>
      {`Subagent of ${parent}`}
      {subagent?.agentType === undefined ? '' : ` · ${subagent.agentType}`}
    </Text>
  </Stack>
);

/**
 * `/agents/$agent/subagents/$subagent`: what a subagent was asked and did, as a chat. The owner
 * cannot write to a subagent, so the page has no composer. It updates live while the subagent runs.
 */
export const SubagentConversation = ({
  client,
  agentRef,
  id,
  onBack,
}: SubagentConversationProps) => {
  const result = useQuery(subagentQuery(client, agentRef, id));
  useSubagentLive(client, agentRef, id, result.error === null);
  const parentAgent = useQuery(agentQuery(client, agentRef)).data;
  const parent = parentAgent === undefined ? agentRef : rowName(parentAgent);
  const subagent = result.data;
  const header = <Header parent={parent} subagent={subagent} onBack={onBack} />;

  if (subagent === undefined) {
    return (
      <DockedPage label="Subagent" header={header} footer={null}>
        {result.error === null ? (
          <Text tone="muted">Loading the subagent…</Text>
        ) : result.error instanceof RequestError && result.error.status === 404 ? (
          <Text tone="muted">This subagent was not found.</Text>
        ) : (
          <Alert>{result.error.message}</Alert>
        )}
      </DockedPage>
    );
  }

  return (
    <DockedPage label={`Subagent of ${parent}`} header={header} footer={null}>
      <Stack gap="md">
        <Chat transcript={subagent} failed={false} imageUrl={client.imageUrl} />
        {subagent.running ? <Activity label={subagent.activity} /> : null}
      </Stack>
    </DockedPage>
  );
};
