import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

export interface LinkSkillsReport {
  readonly linked: ReadonlyArray<string>;
  readonly kept: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
  readonly conflicts: ReadonlyArray<string>;
}

const skillNames = (from: string): ReadonlyArray<string> =>
  readdirSync(from, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(from, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();

const linkTarget = (path: string): string | undefined => {
  try {
    return lstatSync(path).isSymbolicLink() ? readlinkSync(path) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Links each skill under `from` into every agent's skills folder, so every agent the owner starts
 * gets the comms skills (ADR 0016). `from` should be a stable path, such as the deployed release's
 * `current` link, so a deploy changes the skills without relinking. A same-named entry that is not
 * our link is left alone and reported; links into `from` whose skill is gone are removed.
 */
export const linkSkills = (options: {
  readonly from: string;
  readonly targets: ReadonlyArray<string>;
}): LinkSkillsReport => {
  const names = skillNames(options.from);
  const linked: Array<string> = [];
  const kept: Array<string> = [];
  const removed: Array<string> = [];
  const conflicts: Array<string> = [];
  for (const target of options.targets) {
    mkdirSync(target, { recursive: true });
    for (const name of names) {
      const path = join(target, name);
      const source = join(options.from, name);
      if (linkTarget(path) === source) kept.push(path);
      else if (existsSync(path) || linkTarget(path) !== undefined) conflicts.push(path);
      else {
        symlinkSync(source, path);
        linked.push(path);
      }
    }
    for (const entry of readdirSync(target)) {
      const path = join(target, entry);
      const source = linkTarget(path);
      if (source?.startsWith(`${options.from}/`) && !names.includes(entry)) {
        unlinkSync(path);
        removed.push(path);
      }
    }
  }
  return { linked, kept, removed, conflicts };
};
