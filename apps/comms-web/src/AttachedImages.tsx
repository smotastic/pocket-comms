import { ImageThumb } from '@smotastic/pocket-design';
import type { Attachment } from './attachments.js';

/** What a thumbnail shows when its picture is gone. */
export const MISSING = 'Removed';

/** What happens to an attached image, in words; none once it is ready. */
const statusOf = (attachment: Attachment) => {
  switch (attachment.state) {
    case 'uploading':
      return 'Uploading…';
    case 'failed':
      return attachment.reason === undefined ? 'Failed' : `Failed: ${attachment.reason}`;
    default:
      return undefined;
  }
};

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
    {attachments.map((attachment, index) => {
      const label = `Image ${index + 1}`;
      const status = statusOf(attachment);
      return (
        <ImageThumb
          key={attachment.key}
          label={label}
          src={attachment.preview}
          state={attachment.state}
          {...(status === undefined ? {} : { status })}
          missingText={MISSING}
          remove={{ label: `Remove ${label}`, onClick: () => onRemove(attachment.key) }}
          retry={{ label: `Retry ${label}`, onClick: () => onRetry(attachment.key) }}
        />
      );
    })}
  </>
);
