import { useId } from 'react';
import { Icon } from '../icon-button/Icon.js';
import styles from './ImageThumb.module.css';

export type ImageThumbProps = {
  /** Names the image, such as "Image 1"; a screen reader reads it instead of the picture. */
  readonly label: string;
  /** The picture; none shows the state alone. */
  readonly src?: string;
  /**
   * `ready` shows the picture, `uploading` dims it while it is sent, `failed` names `reason`, and
   * `missing` says that the image is no longer there. Default `ready`.
   */
  readonly state?: 'ready' | 'uploading' | 'failed' | 'missing';
  /** Why the image failed. */
  readonly reason?: string;
  /** Opens the picture at full size, such as in a new tab. */
  readonly href?: string;
  /** Shows a remove button. */
  readonly onRemove?: () => void;
  /** Shows a retry button while the image has failed. */
  readonly onRetry?: () => void;
};

const STATE_TEXT = { uploading: 'Uploading…', failed: 'Failed', missing: 'Removed' } as const;

/** A small square image, such as one attached to a message, with what happens to it. */
export const ImageThumb = ({
  label,
  src,
  state = 'ready',
  reason,
  href,
  onRemove,
  onRetry,
}: ImageThumbProps) => {
  const id = useId();
  const stateId = `${id}-state`;
  const shown = state !== 'missing' && src !== undefined;
  const picture = shown ? <img className={styles.picture} src={src} alt={label} /> : null;
  return (
    <figure className={`${styles.thumb} ${styles[state]}`} aria-describedby={stateId}>
      {href === undefined || !shown ? (
        picture
      ) : (
        <a className={styles.open} href={href} target="_blank" rel="noreferrer">
          {picture}
        </a>
      )}
      <figcaption id={stateId} className={styles.state}>
        {state === 'ready' ? (
          shown ? null : (
            <span>{label}</span>
          )
        ) : (
          <span role={state === 'failed' ? 'alert' : undefined}>
            {state === 'failed' && reason !== undefined
              ? `${STATE_TEXT.failed}: ${reason}`
              : STATE_TEXT[state]}
          </span>
        )}
      </figcaption>
      {state === 'failed' && onRetry !== undefined ? (
        <button
          type="button"
          className={`${styles.action} ${styles.retry}`}
          aria-label={`Retry ${label}`}
          onClick={onRetry}
        >
          <Icon name="retry" />
        </button>
      ) : null}
      {onRemove === undefined ? null : (
        <button
          type="button"
          className={`${styles.action} ${styles.remove}`}
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <Icon name="close" />
        </button>
      )}
    </figure>
  );
};
