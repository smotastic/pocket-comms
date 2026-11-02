import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { CommsClient } from './comms-client.js';

// The images the owner attaches to a message or a task (spec 014): each is shrunk on the phone,
// uploaded at once, and named by the id the server gives it when the message is sent.

export const MAX_IMAGES = 5;
/** The longer side of a sent image, in pixels (requirement 3). */
export const MAX_SIDE = 2000;
/** A PNG this small, and no larger than `MAX_SIDE`, is sent as it is. */
export const MAX_KEPT_PNG_BYTES = 1024 * 1024;
const JPEG_QUALITY = 0.85;

/** The size of an image whose longer side is at most `max`, keeping its proportions. */
export const fitWithin = (width: number, height: number, max = MAX_SIDE) => {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

/** A small PNG, such as a screenshot, keeps its exact pixels. */
export const keepsAsIs = (type: string, bytes: number, width: number, height: number) =>
  type === 'image/png' && bytes <= MAX_KEPT_PNG_BYTES && Math.max(width, height) <= MAX_SIDE;

/** Thrown for a file the browser cannot read as an image. */
export class UnreadableImageError extends Error {}

/**
 * The image as it is sent: a small PNG as it is, anything else as a JPEG of at most `MAX_SIDE`
 * pixels. The browser decodes it, so HEIC photos work wherever Safari reads them.
 */
export const shrinkImage = async (file: File): Promise<Blob> => {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new UnreadableImageError(`${file.name} cannot be read as an image.`);
  });
  try {
    if (keepsAsIs(file.type, file.size, bitmap.width, bitmap.height)) return file;
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob === null
            ? reject(new UnreadableImageError(`${file.name} cannot be converted.`))
            : resolve(blob),
        'image/jpeg',
        JPEG_QUALITY,
      ),
    );
  } finally {
    bitmap.close();
  }
};

/** What the browser does with a picked image; tests give their own, since jsdom has no canvas. */
export interface ImageHandling {
  /** The image as it is uploaded. */
  readonly prepare: (file: File) => Promise<Blob>;
  /** A local URL for the image's thumbnail, and how to let it go. */
  readonly preview: (blob: Blob) => string;
  readonly release: (url: string) => void;
}

export const ImageHandlingContext = createContext<ImageHandling>({
  prepare: shrinkImage,
  preview: (blob) => URL.createObjectURL(blob),
  release: (url) => URL.revokeObjectURL(url),
});

export interface Attachment {
  readonly key: number;
  /** A local URL of the shrunk image, for its thumbnail. */
  readonly preview: string;
  readonly state: 'uploading' | 'ready' | 'failed';
  readonly id?: string;
  readonly reason?: string;
}

interface Entry extends Attachment {
  readonly blob: Blob;
}

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : 'The image was not uploaded.';

const plural = (count: number) => (count === 1 ? 'image' : 'images');

/**
 * The attached images of one draft. `notice` says what was not attached, `ids` names the uploaded
 * ones in order, and `pending` holds a send back while an image uploads or has failed.
 */
export const useAttachments = (client: Pick<CommsClient, 'uploadImage'>) => {
  const { prepare, preview, release } = useContext(ImageHandlingContext);
  const [entries, setEntries] = useState<ReadonlyArray<Entry>>([]);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const nextKey = useRef(0);
  const current = useRef(entries);
  current.current = entries;

  // The thumbnails' local URLs live as long as the screen.
  useEffect(
    () => () => {
      for (const entry of current.current) release(entry.preview);
    },
    [release],
  );

  const update = (key: number, change: Partial<Entry>) =>
    setEntries((all) => all.map((entry) => (entry.key === key ? { ...entry, ...change } : entry)));

  const upload = (key: number, blob: Blob) => {
    update(key, { state: 'uploading', reason: undefined });
    client.uploadImage(blob).then(
      (id) => update(key, { state: 'ready', id }),
      (error: unknown) => update(key, { state: 'failed', reason: reasonOf(error) }),
    );
  };

  const add = async (files: ReadonlyArray<File>) => {
    const room = MAX_IMAGES - current.current.length;
    const taken = files.slice(0, Math.max(0, room));
    const leftOut = files.length - taken.length;
    const unreadable: Array<string> = [];
    for (const file of taken) {
      const blob = await prepare(file).catch((error: unknown) => {
        unreadable.push(reasonOf(error));
        return undefined;
      });
      if (blob === undefined) continue;
      const key = nextKey.current++;
      setEntries((all) => [...all, { key, blob, preview: preview(blob), state: 'uploading' }]);
      upload(key, blob);
    }
    const notes = [
      leftOut > 0
        ? `${leftOut} ${plural(leftOut)} left out: a message holds at most ${MAX_IMAGES}.`
        : undefined,
      ...unreadable,
    ].filter((note) => note !== undefined);
    setNotice(notes.length === 0 ? undefined : notes.join(' '));
  };

  const remove = (key: number) => {
    const entry = current.current.find((candidate) => candidate.key === key);
    if (entry !== undefined) release(entry.preview);
    setEntries((all) => all.filter((candidate) => candidate.key !== key));
    setNotice(undefined);
  };

  const retry = (key: number) => {
    const entry = current.current.find((candidate) => candidate.key === key);
    if (entry !== undefined) upload(key, entry.blob);
  };

  const clear = () => {
    for (const entry of current.current) release(entry.preview);
    setEntries([]);
    setNotice(undefined);
  };

  const ids = entries.flatMap((entry) => (entry.id === undefined ? [] : [entry.id]));

  return {
    attachments: entries as ReadonlyArray<Attachment>,
    ids,
    notice,
    full: entries.length >= MAX_IMAGES,
    pending: entries.some((entry) => entry.state !== 'ready'),
    add,
    remove,
    retry,
    clear,
  };
};
