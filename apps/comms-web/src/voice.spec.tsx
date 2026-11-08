import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from './comms-client.js';
import { fakeMicrophone } from './testing.js';
import {
  appendText,
  formatLength,
  MAX_RECORDING_MS,
  MicrophoneContext,
  useVoiceClip,
  type Microphone,
} from './voice.js';

const setUp = (
  transcribe: (clip: Blob) => Promise<string>,
  microphone: Microphone = fakeMicrophone().microphone,
) => {
  const texts: Array<string> = [];
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <MicrophoneContext.Provider value={microphone}>{children}</MicrophoneContext.Provider>
  );
  const hook = renderHook(() => useVoiceClip({ transcribe }, (text) => texts.push(text)), {
    wrapper,
  });
  return { ...hook, texts };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('appendText', () => {
  it('adds the text to an empty draft as it is', () => {
    expect(appendText('', 'dark mode')).toBe('dark mode');
    expect(appendText('  ', 'dark mode')).toBe('dark mode');
  });

  it('separates it from a draft by one space', () => {
    expect(appendText('Idea:', 'dark mode')).toBe('Idea: dark mode');
    expect(appendText('Idea: ', 'dark mode')).toBe('Idea: dark mode');
  });
});

describe('formatLength', () => {
  it('shows minutes and seconds', () => {
    expect(formatLength(0)).toBe('0:00');
    expect(formatLength(12_400)).toBe('0:12');
    expect(formatLength(MAX_RECORDING_MS)).toBe('2:00');
  });
});

describe('useVoiceClip', () => {
  it('records, transcribes on stop and hands the text over (requirements 2, 3 and 7)', async () => {
    const { device, microphone } = fakeMicrophone();
    const clips: Array<Blob> = [];
    const { result, texts } = setUp(async (clip) => {
      clips.push(clip);
      return 'dark mode for pocket-home';
    }, microphone);

    await act(() => result.current.start());
    expect(result.current.clip._tag).toBe('Recording');
    expect(device.recording).toBe(true);

    await act(() => result.current.stop());
    await waitFor(() => expect(result.current.clip._tag).toBe('Idle'));
    expect(device.recording).toBe(false);
    expect(clips).toHaveLength(1);
    expect(texts).toEqual(['dark mode for pocket-home']);
  });

  it('stops by itself after two minutes (requirement 3)', async () => {
    vi.useFakeTimers();
    const { result, texts } = setUp(async () => 'a long idea');

    await act(() => result.current.start());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAX_RECORDING_MS);
    });

    expect(result.current.clip._tag).toBe('Idle');
    expect(texts).toEqual(['a long idea']);
  });

  it('says so when the microphone is refused and records nothing (requirement 4)', async () => {
    const { device, microphone } = fakeMicrophone();
    device.answer = 'denied';
    const { result } = setUp(async () => 'never', microphone);

    await act(() => result.current.start());

    expect(result.current.clip._tag).toBe('Idle');
    expect(result.current.notice).toMatch(/microphone/iu);
  });

  it('keeps a failed clip for a retry, which sends the same clip (requirement 11)', async () => {
    const clips: Array<Blob> = [];
    let failing = true;
    const { result, texts } = setUp(async (clip) => {
      clips.push(clip);
      if (failing) throw new RequestError('The speech service is not reachable.', 503);
      return 'second try';
    });

    await act(() => result.current.start());
    await act(() => result.current.stop());
    await waitFor(() => expect(result.current.clip._tag).toBe('Failed'));
    expect(result.current.clip).toMatchObject({ reason: 'The speech service is not reachable.' });

    failing = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.clip._tag).toBe('Idle'));
    expect(clips[1]).toBe(clips[0]);
    expect(texts).toEqual(['second try']);
  });

  it('drops a failed clip on discard', async () => {
    const { result, texts } = setUp(async () => {
      throw new RequestError('Down.', 503);
    });

    await act(() => result.current.start());
    await act(() => result.current.stop());
    await waitFor(() => expect(result.current.clip._tag).toBe('Failed'));
    act(() => result.current.discard());

    expect(result.current.clip._tag).toBe('Idle');
    expect(texts).toEqual([]);
  });

  it('warns before leaving only while a clip waits for a retry (requirement 12)', async () => {
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const { result } = setUp(async () => {
      throw new RequestError('Down.', 503);
    });
    expect(leave()).toBe(false);

    await act(() => result.current.start());
    await act(() => result.current.stop());
    await waitFor(() => expect(result.current.clip._tag).toBe('Failed'));
    expect(leave()).toBe(true);

    act(() => result.current.discard());
    expect(leave()).toBe(false);
  });

  it('adds nothing for a clip without words and says so (requirement 8)', async () => {
    const { result, texts } = setUp(async () => '');

    await act(() => result.current.start());
    await act(() => result.current.stop());
    await waitFor(() => expect(result.current.notice).toBe('No speech was heard.'));

    expect(texts).toEqual([]);
  });

  it('lets the microphone go when the screen goes', async () => {
    const { device, microphone } = fakeMicrophone();
    const { result, unmount } = setUp(async () => 'never', microphone);

    await act(() => result.current.start());
    unmount();

    expect(device.recording).toBe(false);
  });
});
