import { describe, expect, it } from 'vitest';
import { voiceLabels, voiceNotice } from './voice.js';

describe('voiceNotice', () => {
  it.each([
    [
      'microphoneRefused',
      'The microphone is not allowed. Allow it in the browser to record.',
      'danger',
    ],
    ['cannotRecord', 'No microphone can record here.', 'danger'],
    ['recordingFailed', 'The recording failed.', 'danger'],
    ['noSpeech', 'No speech was heard.', 'info'],
  ] as const)('words %s', (kind, text, tone) => {
    expect(voiceNotice(kind)).toEqual({ text, tone });
  });
});

describe('voiceLabels', () => {
  it('words a failed clip with its reason, or a reason of its own', () => {
    expect(voiceLabels.failed('0:03', 'Down.')).toBe('Voice clip 0:03 not transcribed: Down.');
    expect(voiceLabels.failed('0:03', undefined)).toBe(
      'Voice clip 0:03 not transcribed: The clip was not transcribed.',
    );
  });

  it('words the wait for the text with its length', () => {
    expect(voiceLabels.transcribing('0:12')).toBe('Transcribing 0:12…');
  });
});
