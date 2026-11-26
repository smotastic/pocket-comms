import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { linkSkills } from './skills.js';

const setup = (skills: ReadonlyArray<string>) => {
  const root = mkdtempSync(join(tmpdir(), 'comms-skills-'));
  const from = join(root, 'skills');
  const to = join(root, 'agent', 'skills');
  for (const name of skills) {
    mkdirSync(join(from, name), { recursive: true });
    writeFileSync(join(from, name, 'SKILL.md'), `---\nname: ${name}\n---\n`);
  }
  return { root, from, to };
};

describe('linkSkills', () => {
  it('links every skill folder into each target, creating the target', () => {
    const { from, to } = setup(['flight-rules', 'flight-ship']);

    const report = linkSkills({ from, targets: [to] });

    expect(report.linked).toEqual([join(to, 'flight-rules'), join(to, 'flight-ship')]);
    expect(readlinkSync(join(to, 'flight-rules'))).toBe(join(from, 'flight-rules'));
    expect(report.conflicts).toEqual([]);
  });

  it('skips a folder without a SKILL.md', () => {
    const { from, to } = setup(['flight-rules']);
    mkdirSync(join(from, 'notes'));

    expect(linkSkills({ from, targets: [to] }).linked).toEqual([join(to, 'flight-rules')]);
  });

  it('keeps a link that already points at the skill', () => {
    const { from, to } = setup(['flight-rules']);
    linkSkills({ from, targets: [to] });

    const report = linkSkills({ from, targets: [to] });

    expect(report.linked).toEqual([]);
    expect(report.kept).toEqual([join(to, 'flight-rules')]);
  });

  it('reports and leaves alone a skill of the same name from elsewhere', () => {
    const { root, from, to } = setup(['grill-me']);
    mkdirSync(join(root, 'other', 'grill-me'), { recursive: true });
    mkdirSync(to, { recursive: true });
    symlinkSync(join(root, 'other', 'grill-me'), join(to, 'grill-me'));

    const report = linkSkills({ from, targets: [to] });

    expect(report.conflicts).toEqual([join(to, 'grill-me')]);
    expect(readlinkSync(join(to, 'grill-me'))).toBe(join(root, 'other', 'grill-me'));
  });

  it('removes a link into the skills folder whose skill is gone', () => {
    const { from, to } = setup(['flight-rules']);
    mkdirSync(to, { recursive: true });
    symlinkSync(join(from, 'flight-old'), join(to, 'flight-old'));

    const report = linkSkills({ from, targets: [to] });

    expect(report.removed).toEqual([join(to, 'flight-old')]);
    expect(() => lstatSync(join(to, 'flight-old'))).toThrow();
  });

  it('never removes links that point elsewhere', () => {
    const { root, from, to } = setup(['flight-rules']);
    mkdirSync(to, { recursive: true });
    symlinkSync(join(root, 'gone'), join(to, 'research'));

    linkSkills({ from, targets: [to] });

    expect(readlinkSync(join(to, 'research'))).toBe(join(root, 'gone'));
  });
});
