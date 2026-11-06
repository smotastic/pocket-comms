import { Button, Inline } from '@smotastic/pocket-design';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/** How long, in milliseconds, the hold key must be pressed. */
export const HOLD_MS = 600;

type Key = {
  /** What `onKey` receives, such as "enter". */
  readonly value: string;
  /** What the button shows, such as "↵". */
  readonly label: string;
  /** Names the button when its label is a symbol, such as "Up" for "↑". */
  readonly accessibleLabel?: string;
};

export type KeyPadProps = {
  /** Names the group for a screen reader, such as "Keys". */
  readonly label: string;
  readonly keys: ReadonlyArray<Key>;
  readonly onKey: (value: string) => void;
  /** A key with a cost, such as Ctrl-C: it sends only after a long press, never on a tap. */
  readonly holdKey?: Key & { readonly accessibleLabel: string };
  readonly disabled?: boolean;
};

/** Key buttons that wrap onto more rows, such as the answers to a terminal prompt. */
export const KeyPad = ({ label, keys, onKey, holdKey, disabled = false }: KeyPadProps) => (
  <div role="group" aria-label={label}>
    <Inline gap="xs">
      {keys.map((key) => (
        <Button
          key={key.value}
          variant="secondary"
          size="md"
          aria-label={key.accessibleLabel}
          disabled={disabled}
          onClick={() => onKey(key.value)}
        >
          {key.label}
        </Button>
      ))}
      {holdKey === undefined ? null : (
        <HoldButton holdKey={holdKey} disabled={disabled} onHeld={() => onKey(holdKey.value)} />
      )}
    </Inline>
  </div>
);

const HoldButton = ({
  holdKey,
  disabled,
  onHeld,
}: {
  readonly holdKey: NonNullable<KeyPadProps['holdKey']>;
  readonly disabled: boolean;
  readonly onHeld: () => void;
}) => {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stop = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  };
  const start = () => {
    if (timer.current !== undefined) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      onHeld();
    }, HOLD_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // A disabled button gets no pointerup, so a press under way would still send: drop it.
  useEffect(() => {
    if (!disabled) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  }, [disabled]);

  const isPressKey = (event: KeyboardEvent) => event.key === 'Enter' || event.key === ' ';

  return (
    <Button
      variant="danger"
      size="md"
      // A spinner shows that the press is held; the kit has no fill that tracks the hold.
      pending={holding}
      pendingLabel={holdKey.label}
      aria-label={holdKey.accessibleLabel}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if (!isPressKey(event)) return;
        // A held key repeats its keydown; the press already runs.
        event.preventDefault();
        if (!event.repeat) start();
      }}
      onKeyUp={(event) => {
        if (isPressKey(event)) stop();
      }}
      // A tap is a click too; only the full press sends. The long press must not open a menu.
      onClick={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {holdKey.label}
    </Button>
  );
};
