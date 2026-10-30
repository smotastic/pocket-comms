import type { Story } from '@ladle/react';
import { tokens } from './index.js';

/** Every semantic color token as a swatch, so a theme change is visible at a glance. */
export const Colors: Story = () => (
  <ul>
    {Object.entries(tokens.color).flatMap(([group, values]) =>
      Object.entries(values).map(([name, value]) => (
        <li key={`${group}.${name}`}>
          <span
            style={{
              display: 'inline-block',
              width: tokens.space.xl,
              height: tokens.space.xl,
              marginRight: tokens.space.sm,
              verticalAlign: 'middle',
              background: value,
              border: `${tokens.border.width.default} solid ${tokens.color.border.default}`,
            }}
          />
          color.{group}.{name}
        </li>
      )),
    )}
  </ul>
);
