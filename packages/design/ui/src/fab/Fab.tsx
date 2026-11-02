import { useId, type ComponentPropsWithRef } from 'react';
import { Icon, type IconName } from '../icon-button/Icon.js';
import hidden from '../visually-hidden.module.css';
import styles from './Fab.module.css';

export type FabProps = Omit<
  ComponentPropsWithRef<'button'>,
  'className' | 'style' | 'children' | 'aria-label' | 'aria-describedby'
> & {
  readonly icon: IconName;
  /** The button's name, such as "Brainstorm". */
  readonly label: string;
  /** Shows a badge, and this text tells a screen reader what it means. */
  readonly badge?: string;
};

/**
 * The round button that floats at the bottom right of every screen. On a `DockedPage` it floats
 * above the footer, so it never covers the composer.
 */
export const Fab = ({ icon, label, badge, type = 'button', ...props }: FabProps) => {
  const badgeId = useId();
  return (
    <div className={styles.floating}>
      <button
        {...props}
        type={type}
        aria-label={label}
        aria-describedby={badge === undefined ? undefined : badgeId}
        className={styles.button}
      >
        <Icon name={icon} />
        {badge === undefined ? null : (
          <>
            <span className={styles.badge} aria-hidden="true" />
            <span id={badgeId} className={hidden.visuallyHidden}>
              {badge}
            </span>
          </>
        )}
      </button>
    </div>
  );
};
