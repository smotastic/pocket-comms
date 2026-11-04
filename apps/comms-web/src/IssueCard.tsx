import { Card, Inline, Stack, Text } from '@smotastic/pocket-design';
import { useId, type ReactNode } from 'react';

/** One issue as a compact card: its number and title, then its labels and actions. */
export const IssueCard = ({
  number,
  title,
  meta,
  actions,
  question,
}: {
  readonly number: number;
  readonly title: string;
  /** The line under the title, such as the labels. */
  readonly meta?: ReactNode;
  /** At the end of the meta line, such as small buttons. */
  readonly actions?: ReactNode;
  /** A question in place of the meta line and the actions, such as a confirmation. */
  readonly question?: { readonly text: ReactNode; readonly actions: ReactNode };
}) => {
  const heading = useId();
  return (
    <article aria-labelledby={heading}>
      <Card>
        <Stack gap="xs">
          <div id={heading}>
            <Text>{`#${number} ${title}`}</Text>
          </div>
          {question === undefined ? (
            <Inline gap="xs" justify="between">
              <Text as="span" tone="muted" size="sm">
                {meta}
              </Text>
              {actions === undefined ? null : <Inline gap="xs">{actions}</Inline>}
            </Inline>
          ) : (
            <Stack gap="xs">
              {question.text}
              <Inline gap="xs">{question.actions}</Inline>
            </Stack>
          )}
        </Stack>
      </Card>
    </article>
  );
};
