import type { Story } from '@ladle/react';
import { useState } from 'react';
import { Button } from '../button/Button.js';
import { Form } from './Form.js';
import { Input } from './Input.js';
import { Select } from './Select.js';
import { Switch } from './Switch.js';
import { TextArea } from './TextArea.js';

export const NewTask: Story = () => {
  const [agent, setAgent] = useState(true);
  return (
    <Form
      aria-label="New task"
      onSubmit={(event) => event.preventDefault()}
      actions={<Button type="submit">Create</Button>}
    >
      <Select
        label="Project"
        options={[
          { value: 'pocket-comms', label: 'pocket-comms · open in Herdr' },
          { value: 'pocket-home', label: 'pocket-home' },
        ]}
      />
      <TextArea label="Task" placeholder="What should be done?" />
      <Input label="Branch" defaultValue="feat/dark-mode" />
      <Switch
        label="Start an agent"
        description="It gets the task as its first prompt."
        checked={agent}
        onChange={(event) => setAgent(event.target.checked)}
      />
    </Form>
  );
};

export const WithErrors: Story = () => (
  <Form aria-label="New task">
    <TextArea label="Task" error="Describe the task first." />
    <Select label="Project" options={[]} error="No projects found." />
  </Form>
);
