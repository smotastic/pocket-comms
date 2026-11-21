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
    ['recordingFailed', 'The voice message could not be recorded.', 'danger'],
    ['noSpeech', 'No speech was heard.', 'info'],
  ] as const)('words %s', (kind, text, tone) => {
    expect(voiceNotice(kind)).toEqual({ text, tone });
  });
});

describe('voiceLabels', () => {
  it('words a failed voice message with its reason, or a reason of its own', () => {
    expect(voiceLabels.failed('0:03', 'Down.')).toBe('Voice message 0:03 not transcribed: Down.');
    expect(voiceLabels.failed('0:03', undefined)).toBe(
      'Voice message 0:03 not transcribed: The voice message was not transcribed.',
    );
  });

  it('words the wait for the text with its length', () => {
    expect(voiceLabels.transcribing('0:12')).toBe('Transcribing 0:12…');
  });

  it('words the limit of a voice message', () => {
    expect(voiceLabels.limit?.('2:00')).toBe('of 2:00');
  });

  it('words Cancel and whether the microphone hears sound', () => {
    expect([voiceLabels.cancel, voiceLabels.hearing, voiceLabels.silence]).toEqual([
      'Cancel',
      'Hearing you',
      'No sound',
    ]);
  });
});
