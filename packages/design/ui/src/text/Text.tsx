import type { ReactNode } from 'react';
import styles from './Text.module.css';

export type TextProps = {
  /** `span` inside a line of other content, `div` for a block that is not a paragraph. */
  readonly as?: 'p' | 'span' | 'div';
  /** `muted` for secondary information. Default `default`. */
  readonly tone?: 'default' | 'muted';
  /** Default `md`. */
  readonly size?: 'md' | 'sm';
  /** Cuts the text to one line with an ellipsis; it then renders as a block, even as a `span`. */
  readonly truncate?: boolean;
  readonly children: ReactNode;
};

/** Body text. */
export const Text = ({
  as: Tag = 'p',
  tone = 'default',
  size = 'md',
  truncate = false,
  children,
}: TextProps) => (
  <Tag
    className={[
      styles.text,
      tone === 'muted' ? styles.muted : undefined,
      size === 'sm' ? styles.sm : undefined,
      truncate ? styles.truncate : undefined,
    ]
      .filter((name) => name !== undefined)
      .join(' ')}
  >
    {children}
  </Tag>
);
