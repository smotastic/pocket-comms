import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { CommsClient } from './comms-client.js';

// A voice message of the brainstorm chat (spec 027): the phone records one clip, the server
// transcribes it, and the text is added to the draft. The clip lives only on this page.

/** A recording stops by itself after two minutes (requirement 3). */
export const MAX_RECORDING_MS = 120_000;

/** Thrown when the browser cannot record or the owner refuses the microphone. */
export class MicrophoneError extends Error {}

/** A recording in progress; `stop` ends it, lets the microphone go and answers the clip. */
export interface Recording {
  readonly stop: () => Promise<Blob>;
}

/**
 * The browser's microphone; tests give their own, since jsdom cannot record. `onEnded` hears of a
 * recording that ends by itself, such as when a call takes the microphone.
 */
export interface Microphone {
  readonly start: (onEnded: () => void) => Promise<Recording>;
}

const refusal = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'The microphone is not allowed. Allow it in the browser to record.'
    : 'No microphone can record here.';

/**
 * Records with `MediaRecorder` in the browser's own format (MP4 in Safari, WebM in Chrome). A
 * recorder that already stopped, or failed, answers what it has, and the microphone is let go in
 * every case.
 */
export const browserMicrophone: Microphone = {
  start: async (onEnded) => {
    if (typeof MediaRecorder === 'undefined' || navigator.mediaDevices === undefined) {
      throw new MicrophoneError('This browser cannot record.');
    }
    const stream = await navigator.mediaDevices
      .getUserMedia({ audio: true })
      .catch((error: unknown) => {
        throw new MicrophoneError(refusal(error));
      });
    const release = () => {
      for (const track of stream.getTracks()) track.stop();
    };
    const chunks: Array<Blob> = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorder.start();
    } catch {
      release();
      throw new MicrophoneError('No microphone can record here.');
    }
    let asked = false;
    const ended = new Promise<Blob>((resolve) => {
      const finish = () => {
        release();
        resolve(new Blob(chunks, { type: recorder.mimeType }));
        if (!asked) onEnded();
      };
      recorder.addEventListener('stop', finish, { once: true });
      recorder.addEventListener('error', finish, { once: true });
    });
    return {
      stop: () => {
        asked = true;
        if (recorder.state !== 'inactive') recorder.stop();
        return ended;
      },
    };
  },
};

export const MicrophoneContext = createContext<Microphone>(browserMicrophone);

/** The draft with the transcript at its end, one space apart (requirement 7). */
export const appendText = (draft: string, text: string) => {
  const kept = draft.trimEnd();
  return kept === '' ? text : `${kept} ${text}`;
};

/** A clip's length as `m:ss`. */
export const formatLength = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** Why nothing was recorded or added: a failure, or a plain notice such as silence. */
export interface VoiceNotice {
  readonly text: string;
  readonly tone: 'danger' | 'info';
}

export type VoiceClip =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Starting' }
  | { readonly _tag: 'Recording'; readonly elapsed: number }
  | { readonly _tag: 'Transcribing'; readonly length: number }
  | { readonly _tag: 'Failed'; readonly length: number; readonly reason: string };

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : 'The clip was not transcribed.';

const SILENCE: VoiceNotice = { text: 'No speech was heard.', tone: 'info' };

/**
 * The one voice clip of a draft (requirement 5). `onText` gets each transcript with words;
 * `notice` says why nothing was recorded or added.
 */
export const useVoiceClip = (
  client: Pick<CommsClient, 'transcribe'>,
  onText: (text: string) => void,
) => {
  const microphone = useContext(MicrophoneContext);
  const [clip, setClip] = useState<VoiceClip>({ _tag: 'Idle' });
  const [notice, setNotice] = useState<VoiceNotice | undefined>(undefined);
  const recording = useRef<{ readonly recording: Recording; readonly startedAt: number }>(
    undefined,
  );
  const failed = useRef<{ readonly blob: Blob; readonly length: number }>(undefined);
  const mounted = useRef(true);
  const handOver = useRef(onText);
  handOver.current = onText;

  const transcribe = (blob: Blob, length: number) => {
    setClip({ _tag: 'Transcribing', length });
    client.transcribe(blob).then(
      (text) => {
        if (!mounted.current) return;
        failed.current = undefined;
        setClip({ _tag: 'Idle' });
        if (text === '') setNotice(SILENCE);
        else handOver.current(text);
      },
      (error: unknown) => {
        if (!mounted.current) return;
        failed.current = { blob, length };
        setClip({ _tag: 'Failed', length, reason: reasonOf(error) });
      },
    );
  };

  const stop = async () => {
    const current = recording.current;
    if (current === undefined) return;
    recording.current = undefined;
    const length = Date.now() - current.startedAt;
    setClip({ _tag: 'Transcribing', length });
    const blob = await current.recording.stop().catch(() => undefined);
    if (!mounted.current) return;
    if (blob === undefined) {
      setClip({ _tag: 'Idle' });
      setNotice({ text: 'The recording failed.', tone: 'danger' });
    } else if (blob.size === 0) {
      // A tap too short for any sound: the server would refuse it, so it is not sent.
      setClip({ _tag: 'Idle' });
      setNotice(SILENCE);
    } else {
      transcribe(blob, length);
    }
  };

  const start = async () => {
    setNotice(undefined);
    setClip({ _tag: 'Starting' });
    const started = await microphone
      .start(() => void stop())
      .catch((error: unknown) => {
        setNotice({ text: reasonOf(error), tone: 'danger' });
        setClip({ _tag: 'Idle' });
        return undefined;
      });
    if (started === undefined) return;
    if (!mounted.current) {
      await started.stop();
      return;
    }
    recording.current = { recording: started, startedAt: Date.now() };
    setClip({ _tag: 'Recording', elapsed: 0 });
  };

  const retry = () => {
    if (failed.current !== undefined) transcribe(failed.current.blob, failed.current.length);
  };

  const discard = () => {
    failed.current = undefined;
    setClip({ _tag: 'Idle' });
  };

  // The running time, and the stop at two minutes.
  const isRecording = clip._tag === 'Recording';
  useEffect(() => {
    if (!isRecording) return;
    const startedAt = recording.current?.startedAt ?? Date.now();
    // A tick that comes after the stop leaves the clip as the stop made it.
    const tick = setInterval(
      () =>
        setClip((current) =>
          current._tag === 'Recording'
            ? { _tag: 'Recording', elapsed: Date.now() - startedAt }
            : current,
        ),
      1000,
    );
    const limit = setTimeout(() => void stop(), MAX_RECORDING_MS);
    // `stop` reads only refs, so the one of this render serves the whole recording.
    return () => {
      clearInterval(tick);
      clearTimeout(limit);
    };
  }, [isRecording]);

  // Leaving the page loses a clip that waits for a retry, so the browser asks first.
  const isFailed = clip._tag === 'Failed';
  useEffect(() => {
    if (!isFailed) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older Chromium asks only when this is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isFailed]);

  // A recording does not outlive the screen: the microphone goes with it.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void recording.current?.recording.stop();
      recording.current = undefined;
    };
  }, []);

  const dismiss = () => setNotice(undefined);

  return { clip, notice, start, stop, retry, discard, dismiss };
};
