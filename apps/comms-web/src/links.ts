import type { MouseEvent } from 'react';

/**
 * Handles a click on an in-app link through the router: a plain click navigates in place, while a
 * click with a modifier key or another button keeps the browser's own behaviour.
 */
export const navigateOnPlainClick =
  (navigate: () => void) =>
  (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate();
  };
