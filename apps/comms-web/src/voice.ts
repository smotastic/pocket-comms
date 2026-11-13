import type { AlertTone, VoiceClipLabels, VoiceNotice } from '@smotastic/pocket-design';

// The words of a composer's voice message; the design kit records, the server transcribes.

/** What the clip's row says in each state. */
export const voiceLabels: VoiceClipLabels = {
  starting: 'Starting the microphone…',
  recording: 'Recording',
  stop: 'Stop',
  cancel: 'Cancel',
  hearing: 'Hearing you',
  silence: 'No sound',
  transcribing: (length) => `Transcribing ${length}…`,
  failed: (length, reason) =>
    `Voice clip ${length} not transcribed: ${reason ?? 'The clip was not transcribed.'}`,
  retry: 'Retry',
  discard: 'Discard',
};

const NOTICES: Record<VoiceNotice, { readonly text: string; readonly tone: AlertTone }> = {
  microphoneRefused: {
    text: 'The microphone is not allowed. Allow it in the browser to record.',
    tone: 'danger',
  },
  cannotRecord: { text: 'No microphone can record here.', tone: 'danger' },
  recordingFailed: { text: 'The recording failed.', tone: 'danger' },
  noSpeech: { text: 'No speech was heard.', tone: 'info' },
};

/** Why nothing was recorded or added, in words: a failure, or a plain notice such as silence. */
export const voiceNotice = (kind: VoiceNotice) => NOTICES[kind];
