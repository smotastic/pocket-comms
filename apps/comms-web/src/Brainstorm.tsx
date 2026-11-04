import {
  Activity,
  Alert,
  Button,
  Composer,
  IconButton,
  Inline,
  Markdown,
  Sheet,
  SheetHeader,
  Stack,
  Text,
} from '@smotastic/pocket-design';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type {
  BrainstormEntryView,
  BrainstormStateView,
  CommsClient,
  ProposalDecision,
} from './comms-client.js';
import { brainstormQuery, projectsQuery } from './comms-queries.js';
import { useBrainstormLive } from './live.js';
import { ProposalCard } from './ProposalCard.js';
import { UserMessage } from './UserMessage.js';

// The brainstorm chat (spec 013): one ongoing chat with Pi, opened from the top bars (spec 016).

type Ready = Extract<BrainstormStateView, { readonly _tag: 'Ready' }>;

interface ChatProps {
  readonly client: CommsClient;
  readonly state: Ready;
  readonly confirmingReset: boolean;
  readonly onResetDone: () => void;
}

const Entry = ({
  entry,
  projects,
  busy,
  decide,
}: {
  readonly entry: BrainstormEntryView;
  readonly projects: ReadonlyArray<string>;
  readonly busy: boolean;
  readonly decide: ReturnType<typeof useDecide>;
}) => {
  switch (entry.type) {
    case 'user':
      return <UserMessage text={entry.text} />;
    case 'assistant':
      return <Markdown text={entry.text} />;
    case 'failed':
      return <Text tone="muted">Pi did not answer: {entry.reason}</Text>;
    case 'proposal': {
      const failed = decide.variables?.id === entry.id ? decide.error : null;
      return (
        <ProposalCard
          project={entry.project}
          title={entry.title}
          body={entry.body}
          state={entry.state}
          projects={projects}
          busy={busy || decide.isPending}
          {...(failed === null ? {} : { error: failed.message })}
          onCreate={(draft) => decide.mutate({ id: entry.id, decision: { _tag: 'Create', draft } })}
          onDiscard={() => decide.mutate({ id: entry.id, decision: { _tag: 'Discard' } })}
        />
      );
    }
  }
};

const useDecide = (client: CommsClient) =>
  useMutation({
    mutationFn: ({ id, decision }: { readonly id: string; readonly decision: ProposalDecision }) =>
      client.decideProposal(id, decision),
  });

/** The conversation with Pi, the New chat confirmation and the composer's errors. */
const Chat = ({ client, state, confirmingReset, onResetDone }: ChatProps) => {
  const projects = useQuery(projectsQuery(client));
  const decide = useDecide(client);
  const reset = useMutation({ mutationFn: client.resetBrainstorm, onSuccess: onResetDone });
  const names = (projects.data ?? []).map((project) => project.name);

  return (
    <Stack gap="md">
      {confirmingReset ? (
        <Stack gap="sm">
          <Text>
            Start a new chat? This conversation is gone for good; issues created from it stay.
          </Text>
          {reset.error === null ? null : <Alert>{reset.error.message}</Alert>}
          <Inline gap="sm">
            <Button variant="danger" disabled={reset.isPending} onClick={() => reset.mutate()}>
              Start a new chat
            </Button>
            <Button variant="secondary" onClick={onResetDone}>
              Keep this chat
            </Button>
          </Inline>
        </Stack>
      ) : null}
      {state.entries.length === 0 && !state.answering ? (
        <Text tone="muted">
          Note an idea in a few words, or dictate it. Pi helps you think it through and proposes it
          as an issue when it is ready.
        </Text>
      ) : null}
      {state.entries.map((entry) => (
        <Entry
          key={entry.id}
          entry={entry}
          projects={names}
          busy={state.answering}
          decide={decide}
        />
      ))}
      {state.answering && state.live !== '' ? <Markdown text={state.live} /> : null}
      {state.answering && state.live === '' ? <Activity label="Pi is thinking…" /> : null}
    </Stack>
  );
};

/** The composer: it takes no message while Pi answers or while the chat is not set up. */
const Footer = ({
  client,
  state,
}: {
  readonly client: CommsClient;
  readonly state: BrainstormStateView | undefined;
}) => {
  const [draft, setDraft] = useState('');
  const send = useMutation({
    mutationFn: client.sendBrainstorm,
    onSuccess: () => setDraft(''),
  });
  const ready = state?._tag === 'Ready';
  return (
    <Stack gap="sm">
      {send.error === null ? null : <Alert>{send.error.message}</Alert>}
      <Composer
        label="Message"
        value={draft}
        onChange={setDraft}
        onSend={(text) => send.mutate(text)}
        placeholder="An idea…"
        locked={send.isPending}
        disabled={!ready || state.answering}
        {...(ready && state.answering ? { hint: 'Pi is answering.' } : {})}
      />
    </Stack>
  );
};

const OpenBrainstorm = createContext<() => void>(() => undefined);

/** Opens the brainstorm chat over the current screen. */
export const useOpenBrainstorm = () => useContext(OpenBrainstorm);

/** The Brainstorm action for a screen's top bar. */
export const BrainstormAction = () => (
  <IconButton icon="sparkle" label="Brainstorm" onClick={useOpenBrainstorm()} />
);

/**
 * Holds the one chat sheet for every screen below it. Closing the sheet unmounts nothing there,
 * so the screen stays as it was.
 */
export const Brainstorm = ({
  client,
  children,
}: {
  readonly client: CommsClient;
  readonly children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const chat = useQuery({ ...brainstormQuery(client), enabled: open });
  useBrainstormLive(client, open);
  const state = chat.data;
  const close = () => {
    setOpen(false);
    setConfirmingReset(false);
  };

  return (
    <OpenBrainstorm.Provider value={() => setOpen(true)}>
      {children}
      <Sheet
        open={open}
        size="full"
        follow
        label="Brainstorm"
        bodyLabel="Brainstorm conversation"
        onClose={close}
        header={
          <SheetHeader title="Brainstorm" subtitle="Ideas with Pi">
            {state?._tag === 'Ready' ? (
              <IconButton icon="plus" label="New chat" onClick={() => setConfirmingReset(true)} />
            ) : null}
            <IconButton icon="close" label="Close" onClick={close} />
          </SheetHeader>
        }
        footer={<Footer client={client} state={state} />}
      >
        {chat.error === null ? null : <Alert>{chat.error.message}</Alert>}
        {state?._tag === 'NotSetUp' ? (
          <Stack gap="sm">
            <Text>The brainstorm chat is not set up.</Text>
            <Text tone="muted">{state.reason}</Text>
          </Stack>
        ) : null}
        {state?._tag === 'Ready' ? (
          <Chat
            client={client}
            state={state}
            confirmingReset={confirmingReset}
            onResetDone={() => setConfirmingReset(false)}
          />
        ) : null}
      </Sheet>
    </OpenBrainstorm.Provider>
  );
};
