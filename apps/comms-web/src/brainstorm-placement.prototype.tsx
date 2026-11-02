import { Button, Fab, IconButton, Segmented, Stack, Text } from '@pocket-comms/design-ui';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Brainstorm, BrainstormSheet } from './Brainstorm.js';
import type { CommsClient } from './comms-client.js';

// PROTOTYPE (issue #28), throwaway: four placements of the brainstorm entry, picked with
// `?variant=current|header|menu|bubble` or the switcher on the overview, and remembered in this
// browser. `current` is today's bubble. See docs/prototypes/brainstorm-placement.md.

export const VARIANTS = [
  { value: 'current', label: 'Now' },
  { value: 'header', label: 'Header' },
  { value: 'menu', label: 'Menu' },
  { value: 'bubble', label: 'Bubble' },
] as const;

export type Variant = (typeof VARIANTS)[number]['value'];

const KEY = 'prototype.brainstorm-placement';

const isVariant = (value: unknown): value is Variant =>
  VARIANTS.some((variant) => variant.value === value);

const initialVariant = (): Variant => {
  try {
    const asked = new URLSearchParams(window.location.search).get('variant');
    if (isVariant(asked)) {
      localStorage.setItem(KEY, asked);
      return asked;
    }
    const held = localStorage.getItem(KEY);
    return isVariant(held) ? held : 'current';
  } catch {
    return 'current';
  }
};

interface Placement {
  readonly variant: Variant;
  readonly choose: (variant: Variant) => void;
  readonly openSheet: () => void;
}

const PlacementContext = createContext<Placement>({
  variant: 'current',
  choose: () => undefined,
  openSheet: () => undefined,
});

const usePlacement = () => useContext(PlacementContext);

/** Whether the window scrolled down last; the bubble hides then and comes back on the way up. */
const useScrollingDown = () => {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setDown(y > last && y > 40);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return down;
};

/** The bubble variant: only on the overview and project pages, hidden while scrolling down. */
const Bubble = ({ onOpen }: { readonly onOpen: () => void }) => {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const down = useScrollingDown();
  const listing = path === '/' || path.startsWith('/projects/');
  return listing && !down ? <Fab icon="brainstorm" label="Brainstorm" onClick={onOpen} /> : null;
};

/** Wraps every screen with the chosen variant's entry and chat surface. */
export const BrainstormPlacement = ({
  client,
  children,
}: {
  readonly client: CommsClient;
  readonly children: ReactNode;
}) => {
  const [variant, setVariant] = useState(initialVariant);
  const [open, setOpen] = useState(false);
  const choose = (next: Variant) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // A private window keeps the choice for this visit only.
    }
    setOpen(false);
    setVariant(next);
  };
  const openSheet = () => setOpen(true);

  return (
    <PlacementContext.Provider value={{ variant, choose, openSheet }}>
      {children}
      {variant === 'current' ? <Brainstorm client={client} /> : null}
      {variant === 'header' ? (
        <BrainstormSheet client={client} open={open} onClose={() => setOpen(false)} />
      ) : null}
      {variant === 'bubble' ? (
        <>
          {open ? null : <Bubble onOpen={openSheet} />}
          <BrainstormSheet client={client} open={open} size="tall" onClose={() => setOpen(false)} />
        </>
      ) : null}
    </PlacementContext.Provider>
  );
};

/** The header variant's entry, for a screen's top bar. */
export const BrainstormHeaderAction = () => {
  const { variant, openSheet } = usePlacement();
  return variant === 'header' ? (
    <IconButton icon="brainstorm" label="Brainstorm" onClick={openSheet} />
  ) : null;
};

/** The menu variant's entry, at the top of the projects sheet. */
export const BrainstormMenuEntry = () => {
  const { variant } = usePlacement();
  const navigate = useNavigate();
  return variant === 'menu' ? (
    <Button variant="secondary" onClick={() => void navigate({ to: '/brainstorm-prototype' })}>
      Brainstorm with Pi
    </Button>
  ) : null;
};

/** The prototype's switcher, at the top of the overview so the screen's bottom stays clear. */
export const PlacementSwitcher = () => {
  const { variant, choose } = usePlacement();
  return (
    <Stack gap="2xs">
      <Text tone="muted" size="sm">
        Prototype #28 · brainstorm placement
      </Text>
      <Segmented
        label="Brainstorm placement"
        options={VARIANTS}
        value={variant}
        onChange={(value) => {
          if (isVariant(value)) choose(value);
        }}
      />
    </Stack>
  );
};
