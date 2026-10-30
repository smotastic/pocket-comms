import type { ReactNode } from 'react';
import { gapClass, type Gap } from './gap.js';
import styles from './Layout.module.css';

/** A section is a landmark only with a name, so it requires one. */
type StackElement =
  | { readonly as: 'section'; readonly 'aria-label': string }
  | { readonly as?: 'div' | 'header' | 'footer'; readonly 'aria-label'?: string };

export type StackProps = StackElement & {
  readonly gap: Gap;
  readonly children: ReactNode;
};

/** Children one below the other, with a token gap between them. */
export const Stack = ({ gap, as: Tag = 'div', children, ...props }: StackProps) => (
  <Tag {...props} className={`${styles.stack} ${gapClass(gap)}`}>
    {children}
  </Tag>
);
