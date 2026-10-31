import styles from './IconButton.module.css';

/** The names of the kit's icons. */
export const ICON_NAMES = ['history', 'plus', 'expand', 'close', 'send', 'back', 'issues'] as const;

export type IconName = (typeof ICON_NAMES)[number];

// Line icons on a 24 × 24 grid, drawn with the stroke of the current text color.
const PATHS: Readonly<Record<IconName, string>> = {
  history: 'M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4',
  plus: 'M12 5v14M5 12h14',
  expand: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  close: 'M6 6l12 12M18 6L6 18',
  send: 'M12 19V5M5 12l7-7 7 7',
  back: 'M15 18l-6-6 6-6',
  // An open issue: a ring with a dot, as forges draw it.
  issues: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12h.01',
};

/** An icon that only decorates: its button or link carries the name. */
export const Icon = ({ name }: { readonly name: IconName }) => (
  <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={PATHS[name]} />
  </svg>
);
