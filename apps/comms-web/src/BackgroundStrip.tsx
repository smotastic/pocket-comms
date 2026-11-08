import { Disclosure, Link, List, ListItem, Text } from '@smotastic/pocket-design';

export type BackgroundStripProps = {
  /** The running items, in the order to show them. */
  readonly items: ReadonlyArray<{
    readonly id: string;
    /** What kind of work it is, such as "Command" or "Subagent". */
    readonly kind: string;
    readonly description: string;
    /** How long it has been running, such as "12m". */
    readonly since: string;
    /** The address of the item's page, when it has one. */
    readonly href?: string;
  }>;
  readonly expanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
};

/**
 * The work an agent left running, as one line that opens to list each piece. A screen shows it only
 * while something runs.
 */
export const BackgroundStrip = ({ items, expanded, onExpandedChange }: BackgroundStripProps) => (
  <Disclosure
    title={`${items.length} running in the background`}
    expanded={expanded}
    onExpandedChange={onExpandedChange}
  >
    <List>
      {items.map((item) => (
        <ListItem
          key={item.id}
          actions={
            <Text as="span" tone="muted" size="sm">
              {item.since}
            </Text>
          }
        >
          <Text as="span" tone="muted" size="sm">
            {item.kind}
          </Text>{' '}
          {item.href === undefined ? (
            <Text as="span">{item.description}</Text>
          ) : (
            <Link href={item.href}>{item.description}</Link>
          )}
        </ListItem>
      ))}
    </List>
  </Disclosure>
);
