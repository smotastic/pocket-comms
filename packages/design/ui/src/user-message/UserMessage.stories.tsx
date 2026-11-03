import type { Story } from '@ladle/react';
import { ImageThumb } from '../image-thumb/ImageThumb.js';
import { UserMessage } from './UserMessage.js';

export const Prompt: Story = () => (
  <UserMessage>
    Read your brief and carry it out autonomously until its &apos;Done when&apos; list is complete.
  </UserMessage>
);

export const WithImages: Story = () => (
  <UserMessage
    attachments={
      <>
        <ImageThumb label="Image 1" state="missing" />
        <ImageThumb label="Image 2" state="missing" />
      </>
    }
  >
    Why does the header look broken here?
  </UserMessage>
);
