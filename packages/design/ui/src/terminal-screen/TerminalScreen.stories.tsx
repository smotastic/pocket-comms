import type { Story } from '@ladle/react';
import { TerminalScreen } from './TerminalScreen.js';

const ESC = '\u001b';

const sample = [
  `${ESC}[38;2;153;153;153m~/…/feat-web-tanstack${ESC}[0m`,
  `${ESC}[32m●${ESC}[0m Adopt TanStack Router and Query`,
  `  ${ESC}[2m⎿  4 turns · Pi${ESC}[0m`,
  '',
  `${ESC}[38;5;209m╭─ Allow command? ─────────────────────────╮${ESC}[0m`,
  `${ESC}[38;5;209m│${ESC}[0m git push -u origin feat/web-tanstack     ${ESC}[38;5;209m│${ESC}[0m`,
  `${ESC}[38;5;209m│${ESC}[0m ${ESC}[1;94m❯ 1. Yes${ESC}[0m                                 ${ESC}[38;5;209m│${ESC}[0m`,
  `${ESC}[38;5;209m│${ESC}[0m   2. Yes, don't ask again               ${ESC}[38;5;209m│${ESC}[0m`,
  `${ESC}[38;5;209m│${ESC}[0m   3. No                                 ${ESC}[38;5;209m│${ESC}[0m`,
  `${ESC}[38;5;209m╰──────────────────────────────────────────╯${ESC}[0m`,
  `${ESC}[7m NORMAL ${ESC}[0m ${ESC}[3;4mitalic underline${ESC}[0m ${ESC}[41;97m error ${ESC}[0m`,
].join('\r\n');

export const AgentScreen: Story = () => <TerminalScreen label="Screen of picard" text={sample} />;
