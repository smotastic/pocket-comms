import type { MouseEvent } from 'react';

/** A click with a modifier or another button opens a tab or a menu; the browser keeps it. */
export const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
