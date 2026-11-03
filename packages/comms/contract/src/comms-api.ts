import { Problems, ValidationMiddleware } from '@pocket-comms/contracts-problem-details';
import * as Schema from 'effect/Schema';
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  OpenApi,
} from 'effect/http-api';

// Wire schemas of the comms API v1. Every field carries a description and an example, because
// the published documents are linted for both.

export const AgentParam = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9:._-]{1,100}$/u),
).annotate({
  description: "The agent's Herdr name, or its pane id when it has none.",
  examples: ['kirk-ingestor-mvp'],
});

// An optional member: the annotations sit on the member itself, where the document lint looks.
const optional = <S extends Schema.Top>(
  schema: S,
  annotations: { readonly description: string; readonly examples: ReadonlyArray<S['Type']> },
) => Schema.optionalKey(Schema.UndefinedOr(schema).annotate(annotations));

const Millis = Schema.Int.annotate({
  description: 'A moment in epoch milliseconds.',
  examples: [1793391381245],
});

export const AgentStatus = Schema.Literals([
  'working',
  'blocked',
  'done',
  'idle',
  'unknown',
]).annotate({
  description: 'What the agent is doing, as Herdr reports it. `blocked` waits for an answer.',
  examples: ['working'],
});

export const Agent = Schema.Struct({
  ref: AgentParam,
  paneId: Schema.String.annotate({ description: "The agent's Herdr pane.", examples: ['wJ:p1'] }),
  name: optional(Schema.String, { description: "The agent's Herdr name.", examples: ['kirk'] }),
  kind: optional(Schema.String, {
    description: 'The agent program Herdr detected.',
    examples: ['claude'],
  }),
  format: optional(Schema.Literals(['claude', 'pi']), {
    description: 'The session format the app shows as a chat; missing for a screen-only agent.',
    examples: ['claude'],
  }),
  status: AgentStatus,
  title: Schema.String.annotate({
    description: 'The terminal title, without the status glyph.',
    examples: ['Pocket-home ingestor MVP discussion'],
  }),
  cwd: optional(Schema.String, {
    description: "The agent's working directory.",
    examples: ['/Users/me/.herdr/worktrees/pocket-home/feat-ingestor-mvp'],
  }),
  workspace: Schema.String.annotate({
    description: "The label of the agent's Herdr workspace.",
    examples: ['ingestor-mvp'],
  }),
  project: optional(Schema.String, {
    description: "The repository of the agent's workspace; missing puts the agent under Other.",
    examples: ['pocket-home'],
  }),
  worktree: optional(Schema.String, {
    description: 'The workspace label of a linked worktree; missing for a main checkout.',
    examples: ['ingestor-mvp'],
  }),
  changedAt: Millis.annotate({
    description: 'When the agent last changed, in epoch milliseconds.',
  }),
  needsYou: Schema.Boolean.annotate({
    description: 'Blocked, or done with a completion the owner has not seen yet.',
    examples: [false],
  }),
}).annotate({ identifier: 'Agent', description: 'A live agent.' });

const Agents = Schema.Array(Agent).annotate({
  description: 'Agents in Herdr order.',
  examples: [[]],
});

export const Overview = Schema.Struct({
  needsYou: Agents.annotate({ description: 'Blocked agents, then unseen done agents.' }),
  groups: Schema.Array(
    Schema.Struct({
      key: Schema.String.annotate({
        description: "The repository's key, or `other` for every workspace without a project.",
        examples: ['/Users/me/projects/pocket-home/.git'],
      }),
      name: Schema.String.annotate({
        description: 'The repository or workspace name.',
        examples: ['pocket-home'],
      }),
      agents: Agents,
    }).annotate({ identifier: 'OverviewGroup', description: 'The agents of one repository.' }),
  ).annotate({
    description: 'Every other agent by repository, in workspace order.',
    examples: [[]],
  }),
}).annotate({ identifier: 'Overview', description: 'Every live agent, sorted for the owner.' });

export const OverviewState = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag('Available').annotate({
      description: 'Herdr answers.',
      examples: ['Available'],
    }),
    overview: Overview,
  }),
  Schema.Struct({
    _tag: Schema.tag('Unavailable').annotate({
      description: 'Herdr cannot be reached.',
      examples: ['Unavailable'],
    }),
    reason: Schema.String.annotate({
      description: 'Why Herdr cannot be reached.',
      examples: ['connect ENOENT /Users/me/.config/herdr/herdr.sock'],
    }),
  }),
]).annotate({
  identifier: 'OverviewState',
  description: 'The overview, or why Herdr cannot be reached.',
});

export const ImageId = Schema.String.check(Schema.isPattern(/^[a-z2-7]{26}$/u)).annotate({
  description: 'The id the server gave an uploaded image.',
  examples: ['k5w3x7q2m4n6p3r2s4t6v5x2z4'],
});

const imageIds = optional(Schema.Array(ImageId).check(Schema.isMaxLength(5)), {
  description: 'Up to five uploaded images; their paths follow the text, one per line.',
  examples: [['k5w3x7q2m4n6p3r2s4t6v5x2z4']],
});

const id = Schema.String.annotate({ description: 'The id of the entry.', examples: ['u-1'] });
const at = Millis.annotate({ description: 'When the entry was written, in epoch milliseconds.' });

export const TranscriptEntry = Schema.Union([
  Schema.Struct({
    type: Schema.tag('user').annotate({ description: "The owner's prompt.", examples: ['user'] }),
    id,
    at,
    text: Schema.String.annotate({
      description: "The owner's prompt, without the paths of its attached images.",
      examples: ['Run the tests'],
    }),
    images: optional(Schema.Array(ImageId), {
      description: 'The images the prompt attached, by id, in order.',
      examples: [['k5w3x7q2m4n6p3r2s4t6v5x2z4']],
    }),
  }),
  Schema.Struct({
    type: Schema.tag('assistant').annotate({
      description: 'A reply of the agent.',
      examples: ['assistant'],
    }),
    id,
    at,
    text: Schema.String.annotate({ description: 'The reply as Markdown.', examples: ['Done.'] }),
  }),
  Schema.Struct({
    type: Schema.tag('tool').annotate({ description: 'One tool call.', examples: ['tool'] }),
    id,
    at,
    verb: Schema.Literals([
      'Ran',
      'Edited',
      'Wrote',
      'Read',
      'Searched',
      'Fetched',
      'Delegated',
      'Used',
    ]).annotate({ description: 'What the tool call did.', examples: ['Ran'] }),
    target: optional(Schema.String, {
      description: 'The file, command or name it worked on.',
      examples: ['pnpm test'],
    }),
    added: optional(Schema.Int, { description: 'Lines an edit added.', examples: [12] }),
    removed: optional(Schema.Int, { description: 'Lines an edit removed.', examples: [3] }),
    questions: optional(
      Schema.Array(
        Schema.Struct({
          header: optional(Schema.String, {
            description: 'A short label of the question.',
            examples: ['Stack'],
          }),
          text: Schema.String.annotate({
            description: 'The question.',
            examples: ['Keep Effect as the backend stack?'],
          }),
          answer: optional(Schema.String, {
            description: 'The chosen option, several joined with ", ", or what the owner typed.',
            examples: ['Keep Effect'],
          }),
        }).annotate({ identifier: 'Question', description: 'One question and its answer.' }),
      ),
      {
        description:
          'The questions the call asked the owner, in order: `pending` while they wait, `ok` once answered, `error` when never answered.',
        examples: [[{ header: 'Stack', text: 'Keep Effect?', answer: 'Keep Effect' }]],
      },
    ),
    outcome: Schema.Literals(['ok', 'error', 'pending']).annotate({
      description: 'How the call ended; `pending` while it runs.',
      examples: ['ok'],
    }),
  }),
]).annotate({ identifier: 'TranscriptEntry', description: 'One entry of the chat.' });

const Entries = Schema.Array(TranscriptEntry).annotate({
  description: 'Entries, oldest first.',
  examples: [[]],
});
const Activity = Schema.String.annotate({
  description: 'What a working agent does now.',
  examples: ['Running pnpm test…'],
});

export const Transcript = Schema.Struct({ entries: Entries, activity: Activity }).annotate({
  identifier: 'Transcript',
  description: 'The latest entries of the agent’s session.',
});

export const AgentEvent = Schema.Union([
  Schema.Struct({
    type: Schema.tag('agent').annotate({ description: 'The agent changed.', examples: ['agent'] }),
    agent: Agent,
  }),
  Schema.Struct({
    type: Schema.tag('entries').annotate({
      description: 'Entries arrived or changed.',
      examples: ['entries'],
    }),
    reset: Schema.Boolean.annotate({
      description: 'The entries replace the ones the reader holds: the first event of a session.',
      examples: [true],
    }),
    entries: Entries,
    activity: Activity,
  }),
]).annotate({ identifier: 'AgentEvent', description: 'One update of an open conversation.' });

export const Screen = Schema.Struct({
  text: Schema.String.annotate({
    description: "The pane's visible screen with its ANSI escape sequences.",
    examples: ['\u001b[1mAllow command?\u001b[0m'],
  }),
}).annotate({ identifier: 'Screen', description: "The agent's terminal screen." });

/** The keys the app sends; the service accepts no other. */
export const KEYS = ['1', '2', '3', 'up', 'down', 'enter', 'esc', 'ctrl+c'] as const;

export const PromptRequest = Schema.Struct({
  text: Schema.String.check(Schema.isMaxLength(20_000)).annotate({
    description: 'The prompt; it is sent trimmed and must not be blank unless images are attached.',
    examples: ['Run the tests and fix what fails.'],
  }),
  imageIds,
}).annotate({ identifier: 'PromptRequest', description: 'A prompt for the agent.' });

export const KeysRequest = Schema.Struct({
  keys: Schema.Array(
    Schema.Literals(KEYS).annotate({ description: 'One key.', examples: ['enter'] }),
  )
    .check(Schema.isMinLength(1), Schema.isMaxLength(8))
    .annotate({ description: 'One to eight keys, pressed in order.', examples: [['1']] }),
}).annotate({ identifier: 'KeysRequest', description: 'Key presses for the agent.' });

export const CloseRequest = Schema.Struct({
  force: optional(Schema.Boolean, {
    description:
      'Removes the worktree also when it has uncommitted or untracked changes, which are lost.',
    examples: [false],
  }),
}).annotate({ identifier: 'CloseRequest', description: 'How to close the agent.' });

export const Project = Schema.Struct({
  name: Schema.String.annotate({
    description: "The project's folder name below the projects root.",
    examples: ['pocket-comms'],
  }),
  open: Schema.Boolean.annotate({
    description: 'Herdr has a workspace for the project.',
    examples: [true],
  }),
}).annotate({ identifier: 'Project', description: 'A git repository a task can start in.' });

export const Projects = Schema.Struct({
  projects: Schema.Array(Project).annotate({
    description: 'The projects open in Herdr first, in workspace order, then the others by name.',
    examples: [[{ name: 'pocket-comms', open: true }]],
  }),
}).annotate({ identifier: 'Projects', description: 'The projects a task can start in.' });

/** The agents the app can start in a new worktree. */
export const AGENTS_TO_START = ['claude', 'pi'] as const;

export const CreateTaskRequest = Schema.Struct({
  project: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)).annotate({
    description: 'The name of a project of `GET /projects`.',
    examples: ['pocket-comms'],
  }),
  task: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(20_000)).annotate({
    description:
      "The task; it is sent trimmed. Its first line is the workspace label, the whole text the agent's first prompt.",
    examples: ['Add a dark mode toggle to the settings'],
  }),
  branch: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)).annotate({
    description: 'The new branch, `<type>/<kebab-description>`; it must not exist yet.',
    examples: ['feat/dark-mode-toggle'],
  }),
  agent: optional(
    Schema.Struct({
      kind: Schema.Literals(AGENTS_TO_START).annotate({
        description: 'The agent to start.',
        examples: ['claude'],
      }),
    }).annotate({ identifier: 'AgentToStart', description: 'The agent to start.' }),
    {
      description: 'The agent to start in the new worktree; none starts no agent.',
      examples: [{ kind: 'claude' }],
    },
  ),
  imageIds: optional(Schema.Array(ImageId).check(Schema.isMaxLength(5)), {
    description: "Up to five uploaded images for the agent's first prompt; they need an agent.",
    examples: [['k5w3x7q2m4n6p3r2s4t6v5x2z4']],
  }),
}).annotate({
  identifier: 'CreateTaskRequest',
  description: 'A new task: a worktree on a new branch, optionally with an agent in it.',
});

export const TaskAgent = Schema.Struct({
  ref: AgentParam,
  started: Schema.Boolean.annotate({
    description: 'The agent started.',
    examples: [true],
  }),
  prompted: Schema.Boolean.annotate({
    description: 'The agent got the task as its first prompt.',
    examples: [true],
  }),
  note: optional(Schema.String, {
    description: 'What did not happen, and why.',
    examples: ['The agent waits for an answer, so the task was not sent.'],
  }),
}).annotate({ identifier: 'TaskAgent', description: 'The agent started for a task.' });

export const TaskCreated = Schema.Struct({
  workspace: Schema.String.annotate({
    description: "The new worktree's Herdr workspace.",
    examples: ['wK'],
  }),
  branch: Schema.String.annotate({
    description: 'The branch of the new worktree.',
    examples: ['feat/dark-mode-toggle'],
  }),
  path: Schema.String.annotate({
    description: "The new worktree's folder.",
    examples: ['/Users/me/.herdr/worktrees/pocket-comms/feat-dark-mode-toggle'],
  }),
  agent: optional(TaskAgent, {
    description: 'The agent, when one was asked for.',
    examples: [{ ref: 'feat-dark-mode-toggle', started: true, prompted: true }],
  }),
}).annotate({ identifier: 'TaskCreated', description: 'The new worktree, and its agent.' });

export const ProjectParam = Schema.String.check(Schema.isPattern(/^[^/]{1,200}$/u)).annotate({
  description: "The project's folder name below the projects root.",
  examples: ['pocket-comms'],
});

export const IssueNumberParam = Schema.String.check(
  Schema.isPattern(/^[1-9][0-9]{0,8}$/u),
).annotate({ description: "The issue's number in its repository.", examples: ['8'] });

export const IssueWork = Schema.Struct({
  branch: Schema.String.annotate({
    description: "The worktree's branch, `<type>/<number>-<description>`.",
    examples: ['feat/8-per-project-gitea-issue-list'],
  }),
  agents: Schema.Array(
    Schema.Struct({ ref: AgentParam, status: AgentStatus }).annotate({
      identifier: 'IssueAgent',
      description: 'A live agent in the worktree.',
    }),
  ).annotate({
    description: 'The live agents in the worktree; none is running when empty.',
    examples: [[]],
  }),
}).annotate({ identifier: 'IssueWork', description: "A worktree on the issue's branch." });

export const Issue = Schema.Struct({
  number: Schema.Int.annotate({ description: "The issue's number.", examples: [8] }),
  title: Schema.String.annotate({
    description: "The issue's title.",
    examples: ['feat: per-project Gitea issue list'],
  }),
  labels: Schema.Array(Schema.String).annotate({
    description: 'The label names.',
    examples: [['enhancement']],
  }),
  updatedAt: Millis.annotate({
    description: 'When the issue last changed, in epoch milliseconds.',
  }),
  url: Schema.String.annotate({
    description: "The issue's page in Gitea.",
    examples: ['http://localhost:3000/smotastic/pocket-comms/issues/8'],
  }),
  branch: Schema.String.annotate({
    description: 'The branch the issue suggests for a new worktree.',
    examples: ['feat/8-per-project-gitea-issue-list'],
  }),
  work: Schema.Array(IssueWork).annotate({
    description: "The project's worktrees on a branch of this issue.",
    examples: [[]],
  }),
  inProgress: Schema.Boolean.annotate({
    description:
      'The issue has the `status/in-progress` label or a worktree on one of its branches.',
    examples: [false],
  }),
}).annotate({ identifier: 'Issue', description: 'An open issue of the project.' });

export const IssueList = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag('Listed').annotate({
      description: 'The project is on Gitea and the app can read it.',
      examples: ['Listed'],
    }),
    repository: Schema.Struct({
      owner: Schema.String.annotate({
        description: "The repository's owner.",
        examples: ['smotastic'],
      }),
      name: Schema.String.annotate({
        description: "The repository's name.",
        examples: ['pocket-comms'],
      }),
      url: Schema.String.annotate({
        description: "The repository's page in Gitea.",
        examples: ['http://localhost:3000/smotastic/pocket-comms'],
      }),
    }).annotate({
      identifier: 'IssueRepository',
      description: "The project's Gitea repository.",
      examples: [
        {
          owner: 'smotastic',
          name: 'pocket-comms',
          url: 'http://localhost:3000/smotastic/pocket-comms',
        },
      ],
    }),
    issues: Schema.Array(Issue).annotate({
      description: 'The open issues, the most recently updated first, up to 500.',
      examples: [[]],
    }),
  }),
  Schema.Struct({
    _tag: Schema.tag('NoGiteaRemote').annotate({
      description: "The project's `origin` is not on the app's Gitea.",
      examples: ['NoGiteaRemote'],
    }),
  }),
  Schema.Struct({
    _tag: Schema.tag('NotConfigured').annotate({
      description: 'The server has no Gitea token (`COMMS_GITEA_TOKEN`).',
      examples: ['NotConfigured'],
    }),
  }),
]).annotate({
  identifier: 'IssueList',
  description: "The project's open issues, or why it has none to show.",
});

export const ImplementIssueRequest = Schema.Struct({
  branch: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)).annotate({
    description: 'The new branch, `<type>/<kebab-description>`; it must not exist yet.',
    examples: ['feat/8-per-project-gitea-issue-list'],
  }),
}).annotate({
  identifier: 'ImplementIssueRequest',
  description: 'Implement the issue with Claude in a new worktree on this branch.',
});

export const IssueTaskCreated = Schema.Struct({
  ...TaskCreated.fields,
  markNote: optional(Schema.String, {
    description: 'Why the issue was not marked in progress, when it was not.',
    examples: ['#8 was not marked in progress: Gitea refused the token (403).'],
  }),
}).annotate({
  identifier: 'IssueTaskCreated',
  description: 'The new worktree and its agent, and whether the issue was marked in progress.',
});

// ── The brainstorm chat (spec 013) ─────────────────────────────────────────────────────────

export const ProposalParam = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9-]{1,64}$/u),
).annotate({
  description: "A proposal's id.",
  examples: ['2f1c9a7e-4b7d-4c3a-9a51-6f0e8d2b1c44'],
});

const entryId = Schema.String.annotate({
  description: 'The id of the entry.',
  examples: ['2f1c9a7e-4b7d-4c3a-9a51-6f0e8d2b1c44'],
});
const entryAt = Millis.annotate({
  description: 'When the entry was added, in epoch milliseconds.',
});

const DraftFields = {
  project: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)).annotate({
    description: 'The project the issue is for, by name.',
    examples: ['pocket-home'],
  }),
  title: Schema.String.check(Schema.isMaxLength(255)).annotate({
    description: "The issue's title; it must not be blank.",
    examples: ['Dark mode toggle'],
  }),
  body: Schema.String.check(Schema.isMaxLength(20_000)).annotate({
    description: "The issue's body in Markdown.",
    examples: ['A toggle in the settings that switches the app to dark colours.'],
  }),
};

export const IssueDraft = Schema.Struct(DraftFields).annotate({
  identifier: 'IssueDraft',
  description: 'An issue as the owner edited it: exactly what is created.',
  examples: [{ project: 'pocket-home', title: 'Dark mode toggle', body: 'A toggle in settings.' }],
});

export const ProposalState = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag('open').annotate({
      description: 'The owner has not decided yet.',
      examples: ['open'],
    }),
  }),
  Schema.Struct({
    _tag: Schema.tag('created').annotate({
      description: 'The owner created the issue.',
      examples: ['created'],
    }),
    number: Schema.Int.annotate({ description: "The new issue's number.", examples: [12] }),
    url: Schema.String.annotate({
      description: "The new issue's page in Gitea.",
      examples: ['http://localhost:3000/smotastic/pocket-home/issues/12'],
    }),
  }),
  Schema.Struct({
    _tag: Schema.tag('discarded').annotate({
      description: 'The owner discarded the proposal.',
      examples: ['discarded'],
    }),
  }),
]).annotate({
  identifier: 'ProposalState',
  description: 'Whether the proposal was decided.',
  examples: [{ _tag: 'open' }],
});

export const BrainstormEntry = Schema.Union([
  Schema.Struct({
    type: Schema.tag('user').annotate({ description: "The owner's message.", examples: ['user'] }),
    id: entryId,
    at: entryAt,
    text: Schema.String.annotate({
      description: "The owner's message.",
      examples: ['Idea: dark mode for pocket-home'],
    }),
  }),
  Schema.Struct({
    type: Schema.tag('assistant').annotate({
      description: "Pi's answer.",
      examples: ['assistant'],
    }),
    id: entryId,
    at: entryAt,
    text: Schema.String.annotate({
      description: "Pi's answer in Markdown.",
      examples: ['Nice. **Which screens** need it first?'],
    }),
  }),
  Schema.Struct({
    type: Schema.tag('proposal').annotate({
      description: 'An issue Pi proposes.',
      examples: ['proposal'],
    }),
    id: entryId,
    at: entryAt,
    ...DraftFields,
    state: ProposalState,
  }),
  Schema.Struct({
    type: Schema.tag('failed').annotate({
      description: 'A turn of Pi that failed.',
      examples: ['failed'],
    }),
    id: entryId,
    at: entryAt,
    reason: Schema.String.annotate({
      description: 'Why the turn failed.',
      examples: ['The model cannot be reached.'],
    }),
  }),
]).annotate({ identifier: 'BrainstormEntry', description: 'One entry of the brainstorm chat.' });

export const BrainstormState = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag('Ready').annotate({
      description: 'The chat works.',
      examples: ['Ready'],
    }),
    entries: Schema.Array(BrainstormEntry).annotate({
      description: 'The entries, oldest first.',
      examples: [[]],
    }),
    answering: Schema.Boolean.annotate({
      description: 'Pi is answering; the chat takes no message or decision until it is done.',
      examples: [false],
    }),
    live: Schema.String.annotate({
      description: "The text of Pi's message so far, while it writes one.",
      examples: ['Nice. Which'],
    }),
  }),
  Schema.Struct({
    _tag: Schema.tag('NotSetUp').annotate({
      description: 'The server has no model for the chat.',
      examples: ['NotSetUp'],
    }),
    reason: Schema.String.annotate({
      description: 'Which setting is missing.',
      examples: [
        'Set COMMS_BRAINSTORM_PROVIDER and COMMS_BRAINSTORM_MODEL to use the brainstorm chat.',
      ],
    }),
  }),
]).annotate({
  identifier: 'BrainstormState',
  description: 'The brainstorm chat, or why it is not set up.',
});

export const BrainstormEvent = Schema.Union([
  Schema.Struct({
    type: Schema.tag('state').annotate({
      description: 'The chat changed; the state replaces the one the reader holds.',
      examples: ['state'],
    }),
    state: BrainstormState,
  }),
  Schema.Struct({
    type: Schema.tag('delta').annotate({
      description: 'Pi wrote more of its message; append it to `live`.',
      examples: ['delta'],
    }),
    text: Schema.String.annotate({ description: 'The new text.', examples: [' screens'] }),
  }),
]).annotate({ identifier: 'BrainstormEvent', description: 'One update of the brainstorm chat.' });

export const BrainstormMessageRequest = Schema.Struct({
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(20_000)).annotate({
    description: 'The message; it is sent trimmed and must not be blank.',
    examples: ['Idea: dark mode for pocket-home'],
  }),
}).annotate({ identifier: 'BrainstormMessageRequest', description: 'A message for Pi.' });

export const ProposalDecisionRequest = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag('Create').annotate({
      description: 'Create the issue as shown.',
      examples: ['Create'],
    }),
    draft: IssueDraft,
  }),
  Schema.Struct({
    _tag: Schema.tag('Discard').annotate({
      description: 'Create nothing.',
      examples: ['Discard'],
    }),
  }),
]).annotate({
  identifier: 'ProposalDecisionRequest',
  description: "The owner's decision on a proposal.",
});

/**
 * The Tailscale identity check: `tailscale serve` adds `Tailscale-User-Login`, and only the
 * allowed login may use the service. The server checks every route, also outside this API.
 */
export class TailscaleIdentity extends HttpApiMiddleware.Service<TailscaleIdentity>()(
  'comms/contract/TailscaleIdentity',
  { error: Problems.Forbidden },
) {}

/**
 * A server-sent event stream whose events are all named `name` and carry `data` as JSON. The
 * stream items are `{ event, data }`.
 */
const eventStream = <S extends Schema.Top>(name: string, data: S, example: string) =>
  HttpApiSchema.StreamSse({
    events: Schema.Struct({
      event: Schema.Literal(name).annotate({ description: 'The event name.', examples: [name] }),
      data: Schema.fromJsonString(data).pipe(
        Schema.annotateEncoded({ description: 'The event as JSON.', examples: [example] }),
      ),
    }),
  });

const agent = { agent: AgentParam };
const problems = [Problems.NotFound, Problems.ServiceUnavailable];

const group = HttpApiGroup.make('agents')
  .add(
    HttpApiEndpoint.get('overview', '/agents', {
      success: Overview,
      error: Problems.ServiceUnavailable,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'List the agents',
        description: 'Every live agent: Needs you first, then the rest by repository.',
      }),
    ),
    HttpApiEndpoint.get('overviewEvents', '/events', {
      success: eventStream(
        'overview',
        OverviewState,
        '{"_tag":"Unavailable","reason":"Herdr is not running."}',
      ),
      error: Problems.ServiceUnavailable,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Follow the overview',
        description:
          'Server-sent events: the overview at once and after every change, or why Herdr cannot be reached.',
      }),
    ),
    HttpApiEndpoint.get('agent', '/agents/:agent', {
      params: agent,
      success: Agent,
      error: problems,
    }).annotateMerge(
      OpenApi.annotations({ summary: 'Get an agent', description: 'Returns one live agent.' }),
    ),
    HttpApiEndpoint.get('transcript', '/agents/:agent/transcript', {
      params: agent,
      success: Transcript,
      error: problems,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Read the conversation',
        description:
          "The latest entries of a Claude or Pi agent's session. Other agents have none (404).",
      }),
    ),
    HttpApiEndpoint.get('agentEvents', '/agents/:agent/events', {
      params: agent,
      success: eventStream(
        'agent',
        AgentEvent,
        '{"type":"entries","reset":true,"entries":[],"activity":"Thinking…"}',
      ),
      error: problems,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Follow a conversation',
        description:
          'Server-sent events: the agent after each change, and its session entries, starting with a reset.',
      }),
    ),
    HttpApiEndpoint.get('screen', '/agents/:agent/screen', {
      params: agent,
      success: Screen,
      error: [...problems, Problems.Conflict],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Read the screen',
        description: "The agent pane's visible screen, with colours. It never moves the focus.",
      }),
    ),
    HttpApiEndpoint.post('prompt', '/agents/:agent/prompt', {
      params: agent,
      payload: PromptRequest,
      success: HttpApiSchema.NoContent,
      error: [...problems, Problems.Conflict, Problems.Validation],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Send a prompt',
        description: 'Types the prompt into the agent and submits it, without waiting for a reply.',
      }),
    ),
    HttpApiEndpoint.post('keys', '/agents/:agent/keys', {
      params: agent,
      payload: KeysRequest,
      success: HttpApiSchema.NoContent,
      error: [...problems, Problems.Conflict, Problems.Validation],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Press keys',
        description: 'Presses the keys in the agent, such as an approval choice.',
      }),
    ),
    HttpApiEndpoint.post('seen', '/agents/:agent/seen', {
      params: agent,
      success: HttpApiSchema.NoContent,
      error: problems,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Mark as seen',
        description: 'Remembers that the owner saw the current completion of a done agent.',
      }),
    ),
    HttpApiEndpoint.post('close', '/agents/:agent/close', {
      params: agent,
      payload: CloseRequest,
      success: HttpApiSchema.NoContent,
      error: [...problems, Problems.Conflict, Problems.Validation],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Close an agent',
        description:
          "Removes the agent's linked worktree and closes its Herdr workspace with every agent in it. The branch stays. Without force, a worktree with changes is not removed (409).",
      }),
    ),
  )
  .middleware(TailscaleIdentity)
  .middleware(ValidationMiddleware)
  .prefix('/api/v1')
  .annotateMerge(
    OpenApi.annotations({
      title: 'Agents',
      description: 'Read and drive the Herdr agents.',
    }),
  );

const tasks = HttpApiGroup.make('tasks')
  .add(
    HttpApiEndpoint.get('projects', '/projects', {
      success: Projects,
      error: Problems.ServiceUnavailable,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'List the projects',
        description: 'The git repositories below the projects root that a task can start in.',
      }),
    ),
    HttpApiEndpoint.post('create', '/tasks', {
      payload: CreateTaskRequest,
      success: TaskCreated.pipe(HttpApiSchema.status(201)),
      error: [Problems.Conflict, Problems.Validation, Problems.ServiceUnavailable],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Start a task',
        description:
          "Creates a Herdr worktree on a new branch from the project's default remote branch, without moving the focus, and optionally starts an agent in it with the task as its first prompt.",
      }),
    ),
  )
  .middleware(TailscaleIdentity)
  .middleware(ValidationMiddleware)
  .prefix('/api/v1')
  .annotateMerge(
    OpenApi.annotations({
      title: 'Tasks',
      description: 'Start new work in a Herdr worktree.',
    }),
  );

const project = { project: ProjectParam };

const issues = HttpApiGroup.make('issues')
  .add(
    HttpApiEndpoint.get('list', '/projects/:project/issues', {
      params: project,
      success: IssueList,
      error: [Problems.NotFound, Problems.ServiceUnavailable],
    }).annotateMerge(
      OpenApi.annotations({
        summary: "List a project's issues",
        description:
          "The open Gitea issues of the project's `origin` repository, each with its suggested branch, the worktrees and agents that work on it, and whether it is in progress.",
      }),
    ),
    HttpApiEndpoint.post('implement', '/projects/:project/issues/:number/implement', {
      params: { ...project, number: IssueNumberParam },
      payload: ImplementIssueRequest,
      success: IssueTaskCreated.pipe(HttpApiSchema.status(201)),
      error: [
        Problems.NotFound,
        Problems.Conflict,
        Problems.Validation,
        Problems.ServiceUnavailable,
      ],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Implement an issue with Claude',
        description:
          'Reads the open issue from Gitea and starts a task as `POST /tasks` does, with a Claude agent and the issue as its first prompt. Then it adds the `status/in-progress` label to the issue, creating the label when the repository has none; a failed label write leaves the task started and is reported in `markNote`.',
      }),
    ),
    HttpApiEndpoint.post('close', '/projects/:project/issues/:number/close', {
      params: { ...project, number: IssueNumberParam },
      success: HttpApiSchema.NoContent,
      error: [Problems.NotFound, Problems.Conflict, Problems.ServiceUnavailable],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Close an issue',
        description:
          "Reads the issue from Gitea again and sets its state to closed; nothing else of the issue changes. An issue that is closed already answers 204 without a write. The project's worktrees and agents stay as they are.",
      }),
    ),
  )
  .middleware(TailscaleIdentity)
  .middleware(ValidationMiddleware)
  .prefix('/api/v1')
  .annotateMerge(
    OpenApi.annotations({
      title: 'Issues',
      description: "Read a project's Gitea issues, implement one or close one.",
    }),
  );

const brainstorm = HttpApiGroup.make('brainstorm')
  .add(
    HttpApiEndpoint.get('state', '/brainstorm', {
      success: BrainstormState,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Read the brainstorm chat',
        description: 'The one brainstorm chat with Pi, or why it is not set up.',
      }),
    ),
    HttpApiEndpoint.get('events', '/brainstorm/events', {
      success: eventStream('brainstorm', BrainstormEvent, '{"type":"delta","text":"Nice"}'),
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Follow the brainstorm chat',
        description:
          'Server-sent events: the state at once and after every change, and the text Pi writes in between.',
      }),
    ),
    HttpApiEndpoint.post('send', '/brainstorm/messages', {
      payload: BrainstormMessageRequest,
      success: HttpApiSchema.NoContent,
      error: [Problems.Conflict, Problems.Validation],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Send a message to Pi',
        description:
          "Adds the owner's message and starts Pi's answer without waiting for it. While Pi answers, a message is refused (409).",
      }),
    ),
    HttpApiEndpoint.post('decide', '/brainstorm/proposals/:proposal/decision', {
      params: { proposal: ProposalParam },
      payload: ProposalDecisionRequest,
      success: HttpApiSchema.NoContent,
      error: [
        Problems.NotFound,
        Problems.Conflict,
        Problems.Validation,
        Problems.ServiceUnavailable,
      ],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Decide on a proposal',
        description:
          "Creates the proposed issue as shown, with only its title and body, in the project's Gitea repository, or discards it; then tells Pi. A proposal is decided once.",
      }),
    ),
    HttpApiEndpoint.post('reset', '/brainstorm/reset', {
      success: HttpApiSchema.NoContent,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Start a new chat',
        description: 'Stops a running answer and replaces the chat with an empty one.',
      }),
    ),
  )
  .middleware(TailscaleIdentity)
  .middleware(ValidationMiddleware)
  .prefix('/api/v1')
  .annotateMerge(
    OpenApi.annotations({
      title: 'Brainstorm',
      description: 'Brainstorm with Pi and turn ideas into Gitea issues the owner approves.',
    }),
  );

export const ImageUpload = Schema.Uint8Array.pipe(
  HttpApiSchema.asUint8Array({ contentType: 'application/octet-stream' }),
).annotate({
  identifier: 'ImageUpload',
  description: 'One JPEG or PNG image of at most 10 MB, as the raw bytes.',
  examples: [],
});

export const UploadedImage = Schema.Struct({ id: ImageId }).annotate({
  identifier: 'UploadedImage',
  description: 'The uploaded image, by the id a prompt attaches it with.',
});

const ImageBytes = Schema.Uint8Array.pipe(
  HttpApiSchema.asUint8Array({ contentType: 'image/jpeg' }),
).annotate({ description: 'The image, as `image/jpeg` or `image/png`.', examples: [] });

const images = HttpApiGroup.make('images')
  .add(
    HttpApiEndpoint.post('upload', '/images', {
      payload: ImageUpload,
      success: UploadedImage.pipe(HttpApiSchema.status(201)),
      error: [Problems.Validation, Problems.ServiceUnavailable],
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Upload an image',
        description:
          'Keeps one JPEG or PNG image, checked by its content, under an id the server makes. A prompt or a task attaches it by that id.',
      }),
    ),
    HttpApiEndpoint.get('read', '/images/:image', {
      params: { image: ImageId },
      success: ImageBytes,
      error: Problems.NotFound,
    }).annotateMerge(
      OpenApi.annotations({
        summary: 'Read an image',
        description: 'An uploaded image, with its own content type. Images go after 30 days.',
      }),
    ),
  )
  .middleware(TailscaleIdentity)
  .middleware(ValidationMiddleware)
  .prefix('/api/v1')
  .annotateMerge(
    OpenApi.annotations({
      title: 'Images',
      description: 'Images the owner attaches to a prompt or a task.',
    }),
  );

/** The comms API v1, shared by the server and the web app. */
export const CommsApi = HttpApi.make('comms')
  .add(group)
  .add(tasks)
  .add(issues)
  .add(brainstorm)
  .add(images)
  .annotate(HttpApi.ParseOptions, { errors: 'all' })
  // A body field the contract does not declare fails instead of being dropped. A slot annotation
  // replaces `ParseOptions`, so it repeats `errors`.
  .annotate(HttpApi.PayloadParseOptions, { errors: 'all', onExcessProperty: 'error' })
  .annotateMerge(
    OpenApi.annotations({
      title: 'pocket-comms API',
      version: '1',
      description: "Read and drive the owner's Herdr coding agents from the phone.",
      transform: (spec) => liftParameterDocs(spec),
    }),
  );

export type CommsApi = typeof CommsApi;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Effect writes a parameter's description and examples into its schema only; OpenAPI tools show
 * the ones on the parameter itself, so the document carries them there as well.
 */
export const liftParameterDocs = (spec: Record<string, unknown>): Record<string, unknown> => {
  const paths = isRecord(spec['paths']) ? spec['paths'] : {};
  for (const item of Object.values(paths)) {
    if (!isRecord(item)) continue;
    for (const operation of Object.values(item)) {
      const parameters = isRecord(operation) ? operation['parameters'] : undefined;
      if (!Array.isArray(parameters)) continue;
      for (const parameter of parameters) {
        if (!isRecord(parameter) || !isRecord(parameter['schema'])) continue;
        const { description, examples } = parameter['schema'];
        if (parameter['description'] === undefined && typeof description === 'string') {
          parameter['description'] = description;
        }
        if (parameter['example'] === undefined && Array.isArray(examples)) {
          parameter['example'] = examples[0];
        }
      }
    }
  }
  return spec;
};
