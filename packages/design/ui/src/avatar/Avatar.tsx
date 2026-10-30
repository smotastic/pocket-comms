import styles from './Avatar.module.css';

export type AvatarProps = {
  /** One or two letters, such as "C". */
  readonly initials: string;
  /** Names the mark when nothing beside it does; without it, a screen reader skips it. */
  readonly label?: string;
  /** `fill` takes the size of its container, such as a round button. Default `md`. */
  readonly size?: 'md' | 'fill';
};

/** A round mark with initials on the accent color, such as an assistant's. */
export const Avatar = ({ initials, label, size = 'md' }: AvatarProps) => (
  <span
    className={`${styles.avatar} ${styles[size]}`}
    {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
  >
    {initials}
  </span>
);
