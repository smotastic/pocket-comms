import {
  AgentHeader,
  AgentMessage,
  AgentSheet,
  AgentThread,
  Alert,
  Button,
  Composer,
  IconButton,
  Inline,
  Stack,
  Text,
  ToolActivity,
  TurnError,
  UserMessage,
  appendText,
  useVoiceClip,
  VoiceClipRow,
  withoutSent,
} from '@smotastic/pocket-design';
import type { ChatItem, ToolState } from '@smotastic/pocket-agent/chat';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { AttachedImages } from './AttachedImages.js';
import { useAttachments } from './attachments.js';
import type {
  BrainstormEntryView,
  BrainstormStateView,
  CommsClient,
  ProposalDecision,
} from './comms-client.js';
import { brainstormQuery, projectsQuery } from './comms-queries.js';
import { IssueEditCard } from './IssueEditCard.js';
import { useBrainstormLive, type BrainstormView } from './live.js';
import { ProposalCard } from './ProposalCard.js';
import { PictureThumb, type ChatPicture } from './ProposalPictures.js';
import { voiceLabels, voiceNotice } from './voice.js';

// The brainstorm chat: one ongoing chat with Pi, opened from the top bars. Pi proposes new issues
// and edits of existing ones, and the owner decides on each. The owner's messages may attach
// pictures, which go to Gitea with the proposals the owner chooses them for (spec 023). Pi's reply
// streams in, and each tool it runs shows as a row (spec 026).

type Ready = Extract<BrainstormStateView, { readonly _tag: 'Ready' }>;
type ProposalView = Extract<BrainstormEntryView, { readonly kind: 'proposal' }>['proposal'];

/** What the chat says when Pi only learns that pictures were attached. */
const BLIND = "This model can't see pictures";

const PI = 'Pi';

/** What a row says Pi does with each tool, while it runs and after. */
const TOOL_VERBS: Readonly<Record<string, readonly [running: string, done: string]>> = {
  list_projects: ['Listing projects', 'Listed projects'],
  list_open_issues: ['Listing open issues', 'Listed open issues'],
  read_issue: ['Reading issue', 'Read issue'],
  read_project_doc: ['Reading', 'Read'],
  propose_issue: ['Proposing an issue', 'Proposed an issue'],
  propose_issue_edit: ['Proposing an edit', 'Proposed an edit'],
};

/** A tool's state as the kit shows it: a tool its turn left behind is a failed one, "stopped". */
const TOOL_STATES = {
  running: { state: 'running', label: 'running' },
  done: { state: 'done', label: 'done' },
  failed: { state: 'failed', label: 'failed' },
  stopped: { state: 'failed', label: 'stopped' },
} as const satisfies Record<ToolState, { state: 'running' | 'done' | 'failed'; label: string }>;

/** One thing the thread shows: an item of the stream, or a proposal as its latest record. */
type Shown =
  | Exclude<ChatItem<BrainstormEntryView>, { readonly kind: 'app' }>
  | {
      readonly kind: 'said';
      readonly sequence: number;
      readonly entry: Extract<BrainstormEntryView, { readonly kind: 'said' }>;
    }
  | { readonly kind: 'proposal'; readonly sequence: number; readonly proposal: ProposalView };

/**
 * The view's items as the thread shows them. A proposal is recorded again when it changes; it
 * shows once, in the place of its first record, as its latest.
 */
export const shownItems = (view: BrainstormView): ReadonlyArray<Shown> => {
  const latest = new Map<string, ProposalView>();
  for (const item of view.items) {
    if (item.kind === 'app' && item.entry.kind === 'proposal') {
      latest.set(item.entry.proposal.id, item.entry.proposal);
    }
  }
  const placed = new Set<string>();
  return view.items.flatMap((item): ReadonlyArray<Shown> => {
    if (item.kind !== 'app') return [item];
    const { entry } = item;
    if (entry.kind === 'said') return [{ kind: 'said', sequence: item.sequence, entry }];
    if (entry.kind !== 'proposal' || placed.has(entry.proposal.id)) return [];
    placed.add(entry.proposal.id);
    return [
      {
        kind: 'proposal',
        sequence: item.sequence,
        proposal: latest.get(entry.proposal.id) ?? entry.proposal,
      },
    ];
  });
};

const Proposal = ({
  proposal,
  projects,
  pictures,
  busy,
  decide,
}: {
  readonly proposal: ProposalView;
  readonly projects: ReadonlyArray<string>;
  readonly pictures: ReadonlyArray<ChatPicture>;
  readonly busy: boolean;
  readonly decide: ReturnType<typeof useDecide>;
}) => {
  const failed = decide.variables?.id === proposal.id ? decide.error : null;
  if (proposal.kind === 'edit') {
    return (
      <IssueEditCard
        project={proposal.project}
        number={proposal.number}
        url={proposal.url}
        title={proposal.title}
        body={proposal.body}
        base={proposal.base}
        state={proposal.state}
        pictures={pictures}
        chosen={proposal.pictures}
        attached={proposal.attached}
        busy={busy || decide.isPending}
        {...(failed === null ? {} : { error: failed.message })}
        onApply={(edit, chosen) =>
          decide.mutate({
            id: proposal.id,
            decision: { _tag: 'Apply', ...edit, pictures: chosen },
          })
        }
        onDiscard={() => decide.mutate({ id: proposal.id, decision: { _tag: 'Discard' } })}
      />
    );
  }
  return (
    <ProposalCard
      project={proposal.project}
      title={proposal.title}
      body={proposal.body}
      state={proposal.state}
      projects={projects}
      pictures={pictures}
      chosen={proposal.pictures}
      attached={proposal.attached}
      busy={busy || decide.isPending}
      {...(failed === null ? {} : { error: failed.message })}
      onCreate={(draft, chosen) =>
        decide.mutate({ id: proposal.id, decision: { _tag: 'Create', draft, pictures: chosen } })
      }
      onDiscard={() => decide.mutate({ id: proposal.id, decision: { _tag: 'Discard' } })}
      onFinishWithout={() =>
        decide.mutate({ id: proposal.id, decision: { _tag: 'FinishWithout' } })
      }
    />
  );
};

const useDecide = (client: CommsClient) =>
  useMutation({
    mutationFn: ({ id, decision }: { readonly id: string; readonly decision: ProposalDecision }) =>
      client.decideProposal(id, decision),
  });

/** Whether Pi is answering: the server says so, or the stream shows Pi at work. */
const busyOf = (state: Ready, view: BrainstormView) => state.answering || view.working;

/** The conversation with Pi: the owner's messages, Pi's replies and tools, and the proposals. */
const Thread = ({
  client,
  state,
  view,
}: {
  readonly client: CommsClient;
  readonly state: Ready;
  readonly view: BrainstormView;
}) => {
  const projects = useQuery(projectsQuery(client));
  const decide = useDecide(client);
  const names = (projects.data ?? []).map((project) => project.name);
  const pictures = state.pictures.map((picture) => ({
    ...picture,
    src: client.imageUrl(picture.id),
  }));
  const busy = busyOf(state, view);
  const shown = shownItems(view);
  const toolRuns = shown.some((item) => item.kind === 'tool' && item.state === 'running');

  return (
    <AgentThread
      label="Brainstorm conversation"
      {...(view.draft === '' ? {} : { draft: view.draft })}
      {...(busy && view.draft === '' && !toolRuns ? { activity: 'Pi is thinking…' } : {})}
      empty={
        <Text tone="muted">
          Note an idea in a few words, or dictate it. Pi helps you think it through and proposes it
          as an issue when it is ready.
        </Text>
      }
    >
      {shown.map((item) => {
        switch (item.kind) {
          case 'said': {
            const attached = pictures.filter((picture) => item.entry.images.includes(picture.id));
            return (
              <UserMessage
                key={item.sequence}
                author="You"
                text={item.entry.text}
                {...(attached.length === 0
                  ? {}
                  : {
                      attachments: (
                        <Stack gap="xs">
                          <Inline gap="xs">
                            {attached.map((picture) => (
                              <PictureThumb key={picture.id} picture={picture} />
                            ))}
                          </Inline>
                          {state.seesPictures ? null : (
                            <Text tone="muted" size="sm">
                              {BLIND}
                            </Text>
                          )}
                        </Stack>
                      ),
                    })}
              />
            );
          }
          case 'agentMessage':
            return <AgentMessage key={item.sequence} author={PI} text={item.text} />;
          case 'tool': {
            const [running, done] = TOOL_VERBS[item.tool] ?? [item.tool, item.tool];
            const { state: shownState, label } = TOOL_STATES[item.state];
            return (
              <ToolActivity
                key={item.sequence}
                verb={item.state === 'running' ? running : done}
                state={shownState}
                stateLabel={label}
                {...(item.target === undefined ? {} : { target: item.target })}
                {...(item.detail === undefined ? {} : { detail: item.detail })}
              />
            );
          }
          case 'turnFailed':
            return <TurnError key={item.sequence} message={`Pi did not answer: ${item.reason}`} />;
          case 'proposal':
            return (
              <Proposal
                key={item.sequence}
                proposal={item.proposal}
                projects={names}
                pictures={pictures}
                busy={busy}
                decide={decide}
              />
            );
        }
      })}
    </AgentThread>
  );
};

/** Asks before a New chat, below the header, since the conversation is gone for good. */
const ConfirmReset = ({
  client,
  onDone,
}: {
  readonly client: CommsClient;
  readonly onDone: () => void;
}) => {
  const reset = useMutation({ mutationFn: client.resetBrainstorm, onSuccess: onDone });
  return (
    <Stack gap="sm">
      <Text>
        Start a new chat? This conversation is gone for good; issues created from it stay.
      </Text>
      {reset.error === null ? null : <Alert>{reset.error.message}</Alert>}
      <Inline gap="sm">
        <Button variant="danger" disabled={reset.isPending} onClick={() => reset.mutate()}>
          Start a new chat
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Keep this chat
        </Button>
      </Inline>
    </Stack>
  );
};

/** The composer: it takes no message while Pi answers or while the chat is not set up. */
const Footer = ({
  client,
  state,
  view,
}: {
  readonly client: CommsClient;
  readonly state: BrainstormStateView | undefined;
  readonly view: BrainstormView;
}) => {
  const [draft, setDraft] = useState('');
  const images = useAttachments(client);
  const voice = useVoiceClip(
    (clip) => client.transcribe(clip),
    (text) => setDraft((current) => appendText(current, text)),
  );
  // A successful send clears the text and the pictures; a failed one keeps both.
  const send = useMutation({
    mutationFn: ({ text, imageIds }: { text: string; imageIds: ReadonlyArray<string> }) =>
      client.sendBrainstorm(text, imageIds),
    // Only the sent text goes: a transcript that arrived meanwhile stays.
    onSuccess: (_, { text }) => {
      setDraft((current) => withoutSent(current, text));
      images.clear();
      voice.dismiss();
    },
  });
  const ready = state?._tag === 'Ready';
  const busy = ready && busyOf(state, view);
  return (
    <Stack gap="sm">
      {send.error === null ? null : <Alert>{send.error.message}</Alert>}
      {images.notice === undefined ? null : <Alert>{images.notice}</Alert>}
      {voice.notice === undefined ? null : (
        <Alert tone={voiceNotice(voice.notice).tone}>{voiceNotice(voice.notice).text}</Alert>
      )}
      {ready && !state.seesPictures && images.attachments.length > 0 ? (
        <Text tone="muted" size="sm">
          {BLIND}
        </Text>
      ) : null}
      <Composer
        label="Message"
        value={draft}
        onChange={setDraft}
        onSend={(text) => send.mutate({ text, imageIds: images.ids })}
        placeholder="An idea…"
        locked={send.isPending || images.pending}
        disabled={!ready || busy}
        actions={{
          label: 'Actions',
          items: [
            {
              id: 'image',
              label: 'Attach image',
              icon: 'image',
              files: {
                acceptedFileTypes: ['image/*'],
                onSelect: (files) => void images.add(files),
              },
              isDisabled: images.full,
            },
            ...(ready && state.voice
              ? [
                  {
                    id: 'voice',
                    label: 'Record voice',
                    icon: 'mic' as const,
                    onAction: () => void voice.start(),
                    isDisabled: voice.clip._tag !== 'Idle',
                  },
                ]
              : []),
          ],
        }}
        sendable={images.ids.length > 0}
        {...(busy ? { hint: 'Pi is answering.' } : {})}
        {...(images.attachments.length === 0 && voice.clip._tag === 'Idle'
          ? {}
          : {
              attachments: (
                <Stack gap="sm">
                  <VoiceClipRow
                    clip={voice.clip}
                    labels={voiceLabels}
                    level={voice.level}
                    onStop={() => void voice.stop()}
                    onCancel={() => void voice.cancel()}
                    onRetry={voice.retry}
                    onDiscard={voice.discard}
                  />
                  {images.attachments.length === 0 ? null : (
                    <AttachedImages
                      attachments={images.attachments}
                      onRemove={images.remove}
                      onRetry={images.retry}
                    />
                  )}
                </Stack>
              ),
            })}
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
  const { view } = useBrainstormLive(client, open);
  const state = chat.data;
  const close = () => {
    setOpen(false);
    setConfirmingReset(false);
  };

  return (
    <OpenBrainstorm.Provider value={() => setOpen(true)}>
      {children}
      <AgentSheet
        open={open}
        size="full"
        label="Brainstorm"
        conversationLabel="Brainstorm conversation"
        onClose={close}
        header={
          <AgentHeader
            title="Brainstorm"
            subtitle="Ideas with Pi"
            {...(state?._tag === 'Ready'
              ? { newSession: { label: 'New chat', onClick: () => setConfirmingReset(true) } }
              : {})}
            close={{ label: 'Close', onClick: close }}
          />
        }
        notices={
          confirmingReset || chat.error !== null ? (
            <Stack gap="sm">
              {chat.error === null ? null : <Alert>{chat.error.message}</Alert>}
              {confirmingReset ? (
                <ConfirmReset client={client} onDone={() => setConfirmingReset(false)} />
              ) : null}
            </Stack>
          ) : undefined
        }
        composer={<Footer client={client} state={state} view={view} />}
      >
        {state?._tag === 'NotSetUp' ? (
          <Stack gap="sm">
            <Text>The brainstorm chat is not set up.</Text>
            <Text tone="muted">{state.reason}</Text>
          </Stack>
        ) : null}
        {state?._tag === 'Ready' ? <Thread client={client} state={state} view={view} /> : null}
      </AgentSheet>
    </OpenBrainstorm.Provider>
  );
};
