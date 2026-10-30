import type { Story } from '@ladle/react';
import { Button } from '../button/Button.js';
import { Card } from '../card/Card.js';
import { Tag } from '../tag/Tag.js';
import { Heading } from '../text/Heading.js';
import { Text } from '../text/Text.js';
import { DockedPage } from './DockedPage.js';
import { Inline } from './Inline.js';
import { Page } from './Page.js';
import { Stack } from './Stack.js';

export const PageWithHeader: Story = () => (
  <Page>
    <Stack gap="xl">
      <Stack as="header" gap="2xs">
        <Heading level={1}>Bookmarks</Heading>
        <Text tone="muted">Save links, tag them, archive what you are done with.</Text>
      </Stack>
      <Card>
        <Inline gap="sm" justify="between">
          <Inline gap="xs">
            <Tag>docs</Tag>
            <Tag>effect</Tag>
          </Inline>
          <Button size="sm" variant="ghost">
            Archive
          </Button>
        </Inline>
      </Card>
    </Stack>
  </Page>
);

export const Gaps: Story = () => (
  <Stack gap="md">
    {(['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const).map((gap) => (
      <Inline key={gap} gap={gap}>
        <Tag>{gap}</Tag>
        <Tag>{gap}</Tag>
        <Tag>{gap}</Tag>
      </Inline>
    ))}
  </Stack>
);

export const Docked: Story = () => (
  <DockedPage
    label="Conversation"
    header={
      <Inline gap="sm" justify="between">
        <Button variant="ghost">Back</Button>
        <Button variant="secondary">End chat</Button>
      </Inline>
    }
    footer={
      <Inline gap="sm" justify="end">
        <Button>Send</Button>
      </Inline>
    }
  >
    <Stack gap="md">
      {Array.from({ length: 30 }, (_, index) => (
        <Text key={index}>{`Message ${index + 1}: only this part scrolls.`}</Text>
      ))}
    </Stack>
  </DockedPage>
);
