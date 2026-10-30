/**
 * The single source of the commit, branch and pull request patterns. Exports pattern *strings*, not
 * `RegExp`, so the identical text can also go to a GitHub ruleset. No I/O here.
 * Convention: docs/engineering/git-and-pr-conventions.md
 */

/** The repository's approved Conventional Commit types. */
const TYPE = '(?:feat|fix|docs|chore|refactor|test|ci|build)';
/** A technical scope: bookmarks, web, tools. */
const TECHNICAL_SCOPE = '[a-z0-9_][a-z0-9_-]*';
/** Starts lowercase and does not end in a period. */
const DESCRIPTION = `[a-z][^\\n]*[^.\\n]`;

/** A Conventional Commit subject with an optional technical scope. */
const SUBJECT = `${TYPE}(?:\\(${TECHNICAL_SCOPE}\\))?!?: ${DESCRIPTION}`;
/** Only the shapes git and GitHub write themselves — not any hand-typed "Merge …". */
const MERGE = `Merge pull request #[0-9]+ from [^\\n]+|Merge (?:remote-tracking )?branch '[^'\\n]+'(?: into [^\\n]+)?`;
/** Only the shape the GitHub revert button writes. */
const REVERT = `Revert "[^\\n]*"`;

/** A pull request title, and therefore the squash commit it becomes. */
export const SUBJECT_PATTERN = SUBJECT;

/**
 * The above plus the subjects GitHub and git write themselves: on `master` a non-squash merge or a
 * UI revert would otherwise be rejected for a message nobody typed.
 */
export const COMMIT_SUBJECT_PATTERN = `(?:${MERGE}|${REVERT}|${SUBJECT_PATTERN})`;

/** Approved type followed by a lowercase kebab-case description. */
export const BRANCH_NAME_PATTERN = `${TYPE}/[a-z0-9]+(?:-[a-z0-9]+)*`;
