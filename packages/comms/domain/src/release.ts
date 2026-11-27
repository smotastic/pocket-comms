// A planet's releases and how a merge becomes the next release versions (spec 036). The planet
// names its releases in a `json mission-control` block of its AGENTS.md; the next version of each
// follows the conventional commits since its last tag.

/** One release of a planet: the tags it is cut as, and what ships and deploys it. */
export interface Release {
  /** The tag prefix, such as `pocket-galaxy-v`; a tag is the prefix and `major.minor.patch`. */
  readonly tag: string;
  /** The path patterns whose changes ship in it; none means every change does. */
  readonly paths: ReadonlyArray<string>;
  /** The release workflow its tag starts, such as `release.yml`; none waits for nothing. */
  readonly workflow?: string | undefined;
  /** The app pocket-cloud's deploy script deploys; none means the release is published only. */
  readonly app?: string | undefined;
}

/** A planet's Mission Control settings from its AGENTS.md. */
export interface ReleaseSettings {
  readonly releases: ReadonlyArray<Release>;
  /** The path patterns of the planet's database migrations. */
  readonly migrations: ReadonlyArray<string>;
}

export type ReleaseSettingsResult =
  | { readonly _tag: 'Settings'; readonly settings: ReleaseSettings }
  | { readonly _tag: 'Invalid'; readonly reason: string };

const BLOCK = /^```json[ \t]+mission-control[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/mu;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): ReadonlyArray<string> | undefined =>
  value === undefined
    ? []
    : Array.isArray(value) && value.every((each) => typeof each === 'string' && each.length > 0)
      ? (value as ReadonlyArray<string>)
      : undefined;

const optionalName = (value: unknown): string | undefined | false =>
  value === undefined ? undefined : typeof value === 'string' && value.length > 0 ? value : false;

const TAG_PREFIX = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

/** The Mission Control block of an AGENTS.md, or why there is no usable one. */
export const releaseSettingsOf = (agentsMd: string | undefined): ReleaseSettingsResult => {
  const invalid = (reason: string): ReleaseSettingsResult => ({ _tag: 'Invalid', reason });
  if (agentsMd === undefined) return invalid('The planet has no AGENTS.md.');
  const block = BLOCK.exec(agentsMd);
  if (block === null) return invalid('AGENTS.md has no `json mission-control` block.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(block[1] ?? '');
  } catch {
    return invalid('The `json mission-control` block of AGENTS.md is not valid JSON.');
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['releases'])) {
    return invalid('The `json mission-control` block names no `releases`.');
  }
  const migrations = strings(parsed['migrations']);
  if (migrations === undefined) {
    return invalid('The `migrations` of the `json mission-control` block are not path patterns.');
  }
  const releases: Array<Release> = [];
  for (const entry of parsed['releases'] as ReadonlyArray<unknown>) {
    if (!isRecord(entry) || typeof entry['tag'] !== 'string' || !TAG_PREFIX.test(entry['tag'])) {
      return invalid('A release of the `json mission-control` block has no valid `tag`.');
    }
    const paths = strings(entry['paths']);
    const workflow = optionalName(entry['workflow']);
    const app = optionalName(entry['app']);
    if (paths === undefined || workflow === false || app === false) {
      return invalid(
        `The release ${entry['tag']} of the \`json mission-control\` block is invalid.`,
      );
    }
    releases.push({ tag: entry['tag'], paths, workflow, app });
  }
  if (releases.length === 0) return invalid('The `json mission-control` block names no release.');
  if (new Set(releases.map((release) => release.tag)).size !== releases.length) {
    return invalid('Two releases of the `json mission-control` block share a tag.');
  }
  return { _tag: 'Settings', settings: { releases, migrations } };
};

const escape = (text: string): string => text.replace(/[.+?^${}()|[\]\\]/gu, '\\$&');

/**
 * Whether `file` lies at or below the path pattern: `*` matches one path segment, `**` any number
 * of them, and a pattern without either is a prefix.
 */
export const pathMatches = (pattern: string, file: string): boolean => {
  const trimmed = pattern.replace(/^\.?\//u, '').replace(/\/+$/u, '');
  if (trimmed === '' || trimmed === '**') return true;
  const source = trimmed
    .split('/')
    .map((segment) =>
      segment === '**' ? '(?:[^/]+/)*?' : `${segment.split('*').map(escape).join('[^/]*')}/`,
    )
    .join('');
  return new RegExp(`^${source}`, 'u').test(`${file}/`);
};

const touches = (patterns: ReadonlyArray<string>, files: ReadonlyArray<string>): boolean =>
  patterns.length === 0 || files.some((file) => patterns.some((each) => pathMatches(each, file)));

/** A commit on the default branch, as the release plan reads it. */
export interface ReleaseCommit {
  readonly subject: string;
  readonly body: string;
  readonly files: ReadonlyArray<string>;
}

export type Bump = 'none' | 'patch' | 'minor' | 'breaking';

const SUBJECT = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<bang>!)?: /u;

/** What one conventional commit asks of the version. */
export const bumpOf = (commit: Pick<ReleaseCommit, 'subject' | 'body'>): Bump => {
  const match = SUBJECT.exec(commit.subject);
  if (match === null) return 'none';
  if (match.groups?.['bang'] === '!' || /^BREAKING[ -]CHANGE: /mu.test(commit.body)) {
    return 'breaking';
  }
  const type = match.groups?.['type'];
  return type === 'feat' ? 'minor' : type === 'fix' || type === 'perf' ? 'patch' : 'none';
};

const BUMP_ORDER: ReadonlyArray<Bump> = ['none', 'patch', 'minor', 'breaking'];

/** The strongest bump of the commits. */
export const bumpOfAll = (commits: ReadonlyArray<Pick<ReleaseCommit, 'subject' | 'body'>>): Bump =>
  commits
    .map(bumpOf)
    .reduce<Bump>(
      (strongest, bump) =>
        BUMP_ORDER.indexOf(bump) > BUMP_ORDER.indexOf(strongest) ? bump : strongest,
      'none',
    );

export interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export const ZERO_VERSION: Version = { major: 0, minor: 0, patch: 0 };

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/u;

/** The version of a tag of the prefix, or none for another tag. */
export const versionOfTag = (prefix: string, tag: string): Version | undefined => {
  if (!tag.startsWith(prefix)) return undefined;
  const match = VERSION.exec(tag.slice(prefix.length));
  return match === null
    ? undefined
    : { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
};

export const formatVersion = ({ major, minor, patch }: Version): string =>
  `${major}.${minor}.${patch}`;

const compare = (a: Version, b: Version): number =>
  a.major - b.major || a.minor - b.minor || a.patch - b.patch;

/** The newest tag of the prefix with its version; none before the first release. */
export const latestTag = (
  prefix: string,
  tags: ReadonlyArray<string>,
): { readonly tag: string; readonly version: Version } | undefined =>
  tags
    .flatMap((tag) => {
      const version = versionOfTag(prefix, tag);
      return version === undefined ? [] : [{ tag, version }];
    })
    .sort((a, b) => compare(b.version, a.version))[0];

/**
 * The next version after `version` for a bump; a breaking change raises the major number, or the
 * minor number below 1.0 (spec 036, requirement 15).
 */
export const nextVersion = (version: Version, bump: Exclude<Bump, 'none'>): Version => {
  if (bump === 'patch') return { ...version, patch: version.patch + 1 };
  if (bump === 'minor' || version.major === 0) {
    return { major: version.major, minor: version.minor + 1, patch: 0 };
  }
  return { major: version.major + 1, minor: 0, patch: 0 };
};

/** What one release has to ship: its commits since its last tag. */
export interface ReleaseHistory {
  readonly release: Release;
  /** The version of its last tag; none before the first release. */
  readonly last: Version | undefined;
  readonly commits: ReadonlyArray<ReleaseCommit>;
}

/** A release the merge ships, with its tag. */
export interface PlannedRelease {
  readonly tag: string;
  readonly version: string;
  readonly workflow?: string | undefined;
  readonly app?: string | undefined;
}

export type ReleasePlan =
  | { readonly _tag: 'Nothing' }
  | { readonly _tag: 'Ship'; readonly releases: ReadonlyArray<PlannedRelease> }
  | {
      readonly _tag: 'Stop';
      readonly reason: string;
      /** Whether a database migration is among the stops: only then does Deploy back up first. */
      readonly migration: boolean;
      /** What the owner's Deploy ships: a breaking change bumped as requirement 15 says. */
      readonly releases: ReadonlyArray<PlannedRelease>;
    };

/**
 * The releases a merge ships (spec 036, requirements 6 and 7): each release whose commits since
 * its last tag touch its paths and bump its version. A breaking change or a migration among them
 * stops for the owner.
 */
export const releasePlan = (
  migrations: ReadonlyArray<string>,
  histories: ReadonlyArray<ReleaseHistory>,
): ReleasePlan => {
  const releases: Array<PlannedRelease> = [];
  const reasons: Array<string> = [];
  let migration = false;
  for (const { release, last, commits } of histories) {
    const shipped = commits.filter((commit) => touches(release.paths, commit.files));
    const bump = bumpOfAll(shipped);
    if (bump === 'none') continue;
    const version = formatVersion(nextVersion(last ?? ZERO_VERSION, bump));
    releases.push({
      tag: `${release.tag}${version}`,
      version,
      workflow: release.workflow,
      app: release.app,
    });
    if (bump === 'breaking') reasons.push(`${release.tag}${version} holds a breaking change.`);
    if (
      migrations.length > 0 &&
      shipped.some((commit) =>
        commit.files.some((file) => migrations.some((each) => pathMatches(each, file))),
      )
    ) {
      reasons.push(`${release.tag}${version} holds a database migration.`);
      migration = true;
    }
  }
  if (releases.length === 0) return { _tag: 'Nothing' };
  return reasons.length === 0
    ? { _tag: 'Ship', releases }
    : { _tag: 'Stop', reason: reasons.join(' '), migration, releases };
};
