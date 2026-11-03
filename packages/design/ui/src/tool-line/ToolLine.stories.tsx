import type { Story } from '@ladle/react';
import { Stack } from '../layout/Stack.js';
import { ToolLine } from './ToolLine.js';

export const Calls: Story = () => (
  <Stack gap="xs">
    <ToolLine verb="Wrote" target="docs/architecture/adr/0007-tanstack-web-stack.md" added={86} />
    <ToolLine
      verb="Edited"
      target="blueprints/bookmarks/apps/web/vite.config.ts"
      added={6}
      removed={1}
      outcome="ok"
    />
    <ToolLine verb="Ran" target="pnpm install" outcome="ok" />
    <ToolLine verb="Ran" target="pnpm test" outcome="error" />
    <ToolLine verb="Ran" target="pnpm verify:local" outcome="pending" />
    <ToolLine
      verb="Delegated"
      target="Review the images branch diff"
      outcome="ok"
      hint="running in the background"
      href="#subagent"
      onNavigate={() => undefined}
    />
  </Stack>
);
