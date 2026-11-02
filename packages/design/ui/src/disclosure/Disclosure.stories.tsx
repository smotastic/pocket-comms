import type { Story } from '@ladle/react';
import { useState } from 'react';
import { Button } from '../button/Button.js';
import { IssueCard } from '../issue-card/IssueCard.js';
import { Disclosure } from './Disclosure.js';

const projects = [
  { name: 'pocket-comms', hue: 1, detail: '3 agents · 1 needs you · 2 issues' },
  { name: 'pocket-home', hue: 2, detail: 'No agents · 1 issue' },
] as const;

export const Projects: Story = () => {
  const [open, setOpen] = useState<string | undefined>('pocket-comms');
  return (
    <div>
      {projects.map((project) => (
        <Disclosure
          key={project.name}
          title={project.name}
          detail={project.detail}
          hue={project.hue}
          expanded={open === project.name}
          onToggle={() => setOpen(open === project.name ? undefined : project.name)}
        >
          <IssueCard
            number={24}
            title="Swipe back closes a sheet"
            meta="ux"
            actions={
              <>
                <Button size="sm" variant="secondary">
                  Implement
                </Button>
                <Button size="sm" variant="ghost">
                  Close
                </Button>
              </>
            }
          />
        </Disclosure>
      ))}
    </div>
  );
};
