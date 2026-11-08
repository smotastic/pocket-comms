import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from './comms-client.js';
import { fakeMicrophone } from './testing.js';
import {
  appendText,
  browserMicrophone,
  MicrophoneError,
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
      await vi.advanceTimersByTimeAsync(MAX_RECORDING_MS - 1);
    });
    const clip = result.current.clip;
    expect(clip._tag === 'Recording' ? formatLength(clip.elapsed) : clip._tag).toBe('1:59');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(result.current.clip._tag).toBe('Idle');
    expect(texts).toEqual(['a long idea']);
  });

  it('transcribes a recording that ends by itself, such as for a call', async () => {
    const { device, microphone } = fakeMicrophone();
    const { result, texts } = setUp(async () => 'cut short', microphone);

    await act(() => result.current.start());
    act(() => device.end());

    await waitFor(() => expect(texts).toEqual(['cut short']));
    expect(result.current.clip._tag).toBe('Idle');
  });

  it('sends no clip without sound and says no speech was heard', async () => {
    const { device, microphone } = fakeMicrophone();
    device.silent = true;
    const clips: Array<Blob> = [];
    const { result } = setUp(async (clip) => {
      clips.push(clip);
      return 'never';
    }, microphone);

    await act(() => result.current.start());
    await act(() => result.current.stop());

    expect(clips).toEqual([]);
    expect(result.current.notice).toEqual({ text: 'No speech was heard.', tone: 'info' });
  });

  it('says so when the microphone is refused and records nothing (requirement 4)', async () => {
    const { device, microphone } = fakeMicrophone();
    device.answer = 'denied';
    const { result } = setUp(async () => 'never', microphone);

    await act(() => result.current.start());

    expect(result.current.clip._tag).toBe('Idle');
    expect(result.current.notice).toMatchObject({
      tone: 'danger',
      text: expect.stringMatching(/microphone/iu),
    });
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
    await waitFor(() =>
      expect(result.current.notice).toEqual({ text: 'No speech was heard.', tone: 'info' }),
    );

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

describe('browserMicrophone', () => {
  /** A `MediaRecorder` as browsers have it, enough for `browserMicrophone`. */
  class FakeRecorder extends EventTarget {
    static failing = false;
    static last: FakeRecorder | undefined;
    state: 'inactive' | 'recording' = 'inactive';
    readonly mimeType = 'audio/mp4';
    constructor() {
      super();
      if (FakeRecorder.failing) throw new DOMException('Not supported', 'NotSupportedError');
      FakeRecorder.last = this;
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      this.emit('voice');
      this.dispatchEvent(new Event('stop'));
    }
    emit(data: string) {
      this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: new Blob([data]) }));
    }
  }

  const stopped: Array<string> = [];
  const allow = (getUserMedia: () => Promise<MediaStream>) => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  };
  const stream = () =>
    Promise.resolve({
      getTracks: () => [{ stop: () => stopped.push('track') }],
    } as unknown as MediaStream);

  afterEach(() => {
    vi.unstubAllGlobals();
    FakeRecorder.failing = false;
    FakeRecorder.last = undefined;
    stopped.length = 0;
  });

  it('records in the browser’s format and lets the microphone go on stop', async () => {
    allow(stream);
    const recording = await browserMicrophone.start(() => undefined);

    const clip = await recording.stop();

    expect(clip.type).toBe('audio/mp4');
    expect(await clip.text()).toBe('voice');
    expect(stopped).toEqual(['track']);
  });

  it('says the microphone is not allowed when the owner refuses it', async () => {
    allow(() => Promise.reject(new DOMException('Denied', 'NotAllowedError')));

    await expect(browserMicrophone.start(() => undefined)).rejects.toThrow(/not allowed/u);
  });

  it('says the browser cannot record without MediaRecorder', async () => {
    vi.stubGlobal('MediaRecorder', undefined);

    await expect(browserMicrophone.start(() => undefined)).rejects.toThrow(MicrophoneError);
  });

  it('lets the microphone go when the recorder cannot start', async () => {
    allow(stream);
    FakeRecorder.failing = true;

    await expect(browserMicrophone.start(() => undefined)).rejects.toThrow(MicrophoneError);
    expect(stopped).toEqual(['track']);
  });

  it('hears of a recording that ended by itself, and stopping it then answers at once', async () => {
    allow(stream);
    const ended: Array<string> = [];
    const recording = await browserMicrophone.start(() => ended.push('ended'));

    FakeRecorder.last?.stop();
    expect(ended).toEqual(['ended']);

    expect(await (await recording.stop()).text()).toBe('voice');
  });
});
