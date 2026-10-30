import type { Story } from '@ladle/react';
import { Heading } from './Heading.js';
import { Link } from './Link.js';
import { Text } from './Text.js';

export const Typography: Story = () => (
  <>
    <Heading level={1}>Bookmarks</Heading>
    <Text tone="muted">Save links, tag them, archive what you are done with.</Text>
    <Heading level={2}>Level two</Heading>
    <Heading level={3}>Level three</Heading>
    <Text>
      Body text with an <Link href="#top">inline link</Link> and an{' '}
      <Link href="https://effect.website" external>
        external one
      </Link>
      .
    </Text>
    <Link href="#top" emphasis="strong">
      A strong link, as the title of an item
    </Link>
    <Text tone="muted" size="sm" truncate>
      a-very-long-host-name-that-does-not-fit.example.com/and/a/long/path/that/gets/cut/off/with/an/ellipsis
    </Text>
  </>
);
