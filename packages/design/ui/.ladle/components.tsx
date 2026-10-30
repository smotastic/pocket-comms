import type { GlobalProvider } from '@ladle/react';
import { useEffect } from 'react';
import '../src/index.js';

/** Applies Ladle's theme switch to the tokens: light or dark is forced, auto follows the system. */
export const Provider: GlobalProvider = ({ children, globalState }) => {
  useEffect(() => {
    const root = document.documentElement;
    if (globalState.theme === 'auto') delete root.dataset['theme'];
    else root.dataset['theme'] = globalState.theme;
  }, [globalState.theme]);
  return children;
};
