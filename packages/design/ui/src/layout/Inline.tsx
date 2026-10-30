import type { ReactNode } from 'react';
import { gapClass, type Gap } from './gap.js';
import styles from './Layout.module.css';

export type InlineProps = {
  readonly gap: Gap;
  /** Wraps onto more lines when the row is too narrow. Default `true`. */
  readonly wrap?: boolean;
  /** `between` pushes the first and last child apart. Default `start`. */
  readonly justify?: 'start' | 'between' | 'end';
  readonly children: ReactNode;
};

/** Children side by side, vertically centered, with a token gap between them. */
export const Inline = ({ gap, wrap = true, justify = 'start', children }: InlineProps) => (
  <div
    className={[
      styles.inline,
      gapClass(gap),
      wrap ? undefined : styles.nowrap,
      justify === 'start' ? undefined : styles[justify],
    ]
      .filter((name) => name !== undefined)
      .join(' ')}
  >
    {children}
  </div>
);
