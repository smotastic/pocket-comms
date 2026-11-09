import { Alert, Button, Inline, LiveIndicator, Text } from '@smotastic/pocket-design';
import { formatLength, type VoiceClip } from './voice.js';

/**
 * The voice clip above the composer: the recording with its time and Stop, the wait
 * for the text, or a failed clip with Retry and Discard. Nothing while there is no clip.
 */
export const VoiceClipRow = ({
  clip,
  onStop,
  onRetry,
  onDiscard,
}: {
  readonly clip: VoiceClip;
  readonly onStop: () => void;
  readonly onRetry: () => void;
  readonly onDiscard: () => void;
}) => {
  switch (clip._tag) {
    case 'Idle':
      return null;
    case 'Starting':
      return (
        <Text tone="muted" size="sm">
          Starting the microphone…
        </Text>
      );
    case 'Recording':
      return (
        <Inline gap="sm" justify="between">
          <Inline gap="sm">
            <LiveIndicator live label="Recording" />
            <Text size="sm">{formatLength(clip.elapsed)}</Text>
          </Inline>
          {/* Focus moves here, so a screen reader hears that recording started. */}
          <Button size="sm" variant="secondary" onClick={onStop} autoFocus>
            Stop
          </Button>
        </Inline>
      );
    case 'Transcribing':
      return (
        <Text tone="muted" size="sm">
          {`Transcribing ${formatLength(clip.length)}…`}
        </Text>
      );
    case 'Failed':
      return (
        <Alert
          action={
            <Inline gap="sm">
              <Button size="sm" variant="secondary" icon="retry" onClick={onRetry}>
                Retry
              </Button>
              <Button size="sm" variant="ghost" onClick={onDiscard}>
                Discard
              </Button>
            </Inline>
          }
        >
          {`Voice clip ${formatLength(clip.length)} not transcribed: ${clip.reason}`}
        </Alert>
      );
  }
};
