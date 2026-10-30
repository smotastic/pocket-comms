// Compares a fresh token build with the committed output, file by file.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The files of a flat folder by name; a folder that does not exist has none. */
const contents = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  return new Map(
    await Promise.all(files.map(async (name) => [name, await readFile(join(dir, name), 'utf8')])),
  );
};

/**
 * Names every file of `committedDir` that a fresh build in `freshDir` would change, add or
 * remove; an empty list means the committed output is current.
 *
 * @param {{ freshDir: string, committedDir: string }} dirs
 * @returns {Promise<string[]>}
 */
export const staleFiles = async ({ freshDir, committedDir }) => {
  const [fresh, committed] = await Promise.all([contents(freshDir), contents(committedDir)]);
  return [
    ...[...fresh].flatMap(([name, content]) =>
      !committed.has(name)
        ? [`${name}: missing`]
        : committed.get(name) === content
          ? []
          : [`${name}: differs from a fresh build`],
    ),
    ...[...committed.keys()]
      .filter((name) => !fresh.has(name))
      .map((name) => `${name}: no longer generated`),
  ].sort();
};
