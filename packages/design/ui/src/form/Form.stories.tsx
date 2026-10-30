import type { Story } from '@ladle/react';
import { Button } from '../button/Button.js';
import { Field } from './Field.js';
import { Form } from './Form.js';
import { Input } from './Input.js';

export const TwoColumns: Story = () => (
  <Form
    aria-label="New bookmark"
    columns={2}
    onSubmit={(event) => event.preventDefault()}
    actions={<Button type="submit">Add</Button>}
  >
    <Input label="URL" placeholder="https://…" span="full" />
    <Input label="Title" />
    <Input label="Tags" placeholder="Tags, comma-separated" />
  </Form>
);

export const HiddenLabels: Story = () => (
  <Form aria-label="Search" actions={<Button type="submit">Search</Button>}>
    <Input label="Search" hideLabel placeholder="Search…" />
  </Form>
);

export const WithError: Story = () => (
  <Form aria-label="New bookmark">
    <Input label="URL" defaultValue="example" error="Enter an absolute http or https URL." />
  </Form>
);

export const CustomControl: Story = () => (
  <Form aria-label="Filter">
    <Field label="Status">
      {(control) => (
        <select {...control}>
          <option>active</option>
          <option>archived</option>
        </select>
      )}
    </Field>
  </Form>
);
