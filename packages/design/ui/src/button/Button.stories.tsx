import type { Story } from '@ladle/react';
import { Button, type ButtonProps } from './Button.js';

export const Variants: Story = () => (
  <>
    <Button>Primary</Button> <Button variant="secondary">Secondary</Button>{' '}
    <Button variant="ghost">Ghost</Button> <Button variant="danger">Danger</Button>
  </>
);

export const Small: Story = () => (
  <>
    <Button size="sm" variant="ghost">
      Archive
    </Button>{' '}
    <Button size="sm" variant="danger">
      Delete
    </Button>
  </>
);

export const Disabled: Story = () => <Button disabled>Save</Button>;

export const Playground: Story<ButtonProps> = (props) => <Button {...props}>Button</Button>;
Playground.args = { variant: 'primary', size: 'md', disabled: false };
Playground.argTypes = {
  variant: { options: ['primary', 'secondary', 'ghost', 'danger'], control: { type: 'radio' } },
  size: { options: ['md', 'sm'], control: { type: 'radio' } },
};
