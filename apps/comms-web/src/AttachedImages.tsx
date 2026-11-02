import { ImageThumb } from '@pocket-comms/design-ui';
import type { Attachment } from './attachments.js';

/** The thumbnails of a draft's attached images, each removable, a failed one retryable. */
export const AttachedImages = ({
  attachments,
  onRemove,
  onRetry,
}: {
  readonly attachments: ReadonlyArray<Attachment>;
  readonly onRemove: (key: number) => void;
  readonly onRetry: (key: number) => void;
}) => (
  <>
    {attachments.map((attachment, index) => (
      <ImageThumb
        key={attachment.key}
        label={`Image ${index + 1}`}
        src={attachment.preview}
        state={attachment.state}
        {...(attachment.reason === undefined ? {} : { reason: attachment.reason })}
        onRemove={() => onRemove(attachment.key)}
        onRetry={() => onRetry(attachment.key)}
      />
    ))}
  </>
);
