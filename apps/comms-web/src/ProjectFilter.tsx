import {
  Button,
  IconButton,
  List,
  ListItem,
  Sheet,
  SheetHeader,
  StatusPill,
  Text,
} from '@pocket-comms/design-ui';
import { useState } from 'react';
import type { ProjectChoice } from './project-filter.js';

export interface ProjectFilterProps {
  readonly choices: ReadonlyArray<ProjectChoice>;
  /** The chosen project, or `undefined` for all projects. */
  readonly value: string | undefined;
  readonly onChange: (value: string | undefined) => void;
}

const NAME = 'Filter by project';

/**
 * The top bar's menu button and its sheet of projects (spec 007, requirements 8–11). The page
 * itself shows no filter; the button carries a mark while a project is chosen.
 */
export const ProjectFilter = ({ choices, value, onChange }: ProjectFilterProps) => {
  const [open, setOpen] = useState(false);
  const all: ProjectChoice = {
    value: 'all',
    label: 'All projects',
    count: choices.reduce((sum, choice) => sum + choice.count, 0),
    waiting: choices.some((choice) => choice.waiting),
  };
  const choose = (next: string | undefined) => {
    onChange(next);
    setOpen(false);
  };
  const item = (choice: ProjectChoice, chosen: boolean, next: string | undefined) => (
    <ListItem
      key={next === undefined ? 'all' : `project:${next}`}
      actions={
        <>
          <Text tone="muted">{choice.count}</Text>
          {choice.waiting ? <StatusPill tone="blocked" label="Needs you" /> : null}
        </>
      }
    >
      <Button
        variant={chosen ? 'secondary' : 'ghost'}
        aria-pressed={chosen}
        onClick={() => choose(next)}
      >
        {choice.label}
      </Button>
    </ListItem>
  );
  return (
    <>
      <IconButton
        icon="menu"
        label={NAME}
        marked={value !== undefined}
        onClick={() => setOpen(true)}
      />
      <Sheet
        open={open}
        label={NAME}
        bodyLabel="Projects"
        onClose={() => setOpen(false)}
        header={
          <SheetHeader title="Show" subtitle="The agents of one project">
            <IconButton icon="close" label="Close" onClick={() => setOpen(false)} />
          </SheetHeader>
        }
      >
        <List>
          {item(all, value === undefined, undefined)}
          {choices.map((choice) => item(choice, choice.value === value, choice.value))}
        </List>
      </Sheet>
    </>
  );
};
