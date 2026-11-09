import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Outbox, OutboxError } from './outbox.js';

// The outbox as a folder of WAV files. A clip is written under a temporary name, flushed to the
// disk and renamed when it is complete, so a crash or a power loss never leaves half a clip
// behind; what a crash left half written is thrown away on the next start. File names sort by the time they
// were put, so the oldest comes first.

const CLIP = /^\d{15}-\d{6}\.wav$/u;

/** A file operation on the outbox, failing as an `OutboxError` that says what went wrong. */
const io = <A>(what: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (error) =>
      new OutboxError({
        reason: `The outbox could not ${what}: ${error instanceof Error ? error.message : String(error)}`,
      }),
  });

export const layer = (folder: string) =>
  Layer.effect(
    Outbox,
    Effect.gen(function* () {
      yield* io('be created', async () => {
        await mkdir(folder, { recursive: true });
        for (const name of await readdir(folder)) {
          if (name.endsWith('.part')) await rm(join(folder, name), { force: true });
        }
      }).pipe(Effect.orDie);
      let counter = 0;
      const clips = io('be read', () => readdir(folder)).pipe(
        Effect.map((names) => names.filter((name) => CLIP.test(name)).sort()),
      );

      return {
        put: (bytes) =>
          io('keep the clip', async () => {
            const id = `${String(Date.now()).padStart(15, '0')}-${String(counter++ % 1_000_000).padStart(6, '0')}.wav`;
            const path = join(folder, id);
            const file = await open(`${path}.part`, 'w');
            try {
              await file.writeFile(bytes);
              await file.sync();
            } finally {
              await file.close();
            }
            await rename(`${path}.part`, path);
            // The rename itself reaches the disk only with the folder.
            const directory = await open(folder, 'r');
            try {
              await directory.sync();
            } finally {
              await directory.close();
            }
            return { id, bytes };
          }),
        oldest: clips.pipe(
          Effect.flatMap((names) => {
            const id = names[0];
            return id === undefined
              ? Effect.succeedNone
              : io('read a clip', () => readFile(join(folder, id))).pipe(
                  Effect.map((bytes) => Option.some({ id, bytes: new Uint8Array(bytes) })),
                );
          }),
        ),
        remove: (id) => io('remove a clip', () => rm(join(folder, id), { force: true })),
        size: clips.pipe(Effect.map((names) => names.length)),
      };
    }),
  );
