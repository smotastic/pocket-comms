import type { Story } from '@ladle/react';
import { Inline } from '../layout/Inline.js';
import { ImageThumb } from './ImageThumb.js';

// A small picture drawn inline, so the catalog needs no image file.
const SRC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#6d8fd8"/><circle cx="3" cy="1" r=".5" fill="#f4d35e"/><path d="M0 3l1.5-1.5L3 3z" fill="#3a5a40"/></svg>',
  );

export const States: Story = () => (
  <Inline gap="sm">
    <ImageThumb label="Image 1" src={SRC} href={SRC} onRemove={() => undefined} />
    <ImageThumb label="Image 2" src={SRC} state="uploading" onRemove={() => undefined} />
    <ImageThumb
      label="Image 3"
      src={SRC}
      state="failed"
      reason="The connection dropped."
      onRetry={() => undefined}
      onRemove={() => undefined}
    />
    <ImageThumb label="Image 4" state="missing" />
  </Inline>
);
