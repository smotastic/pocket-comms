import { createContext } from 'react';

/**
 * True inside a docked page's header, which already clears the notch and draws the spacing and the
 * border; a top bar there leaves them to it.
 */
export const DockedHeader = createContext(false);
