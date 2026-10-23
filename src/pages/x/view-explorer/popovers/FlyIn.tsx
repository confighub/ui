// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';

import { useRegisterSlot } from '../state/context';
import type { FlyInRequest } from '../state/slots';

/**
 * The fly-in: a small chip with the new filter's text travels from the cell
 * that made it to the lens row that now holds it (or to its dot on the
 * collapsed rail), and the lens then pulses once, so the eye follows the
 * change. With reduced motion there is no flight, only the pulse.
 */

const FLIGHT_MS = 550;
const PULSE_MS = 700;
/**
 * How long to wait for the new lens row to render before giving up on the
 * flight. Time, not frames: on a slow machine frames are few and far apart.
 */
const MAX_WAIT_MS = 1500;

interface Flight extends FlyInRequest {
  key: number;
}

const visible = (el: Element) =>
  el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

/** Where a lens is on screen now: its row in the open column, else its dot on the rail. */
function lensTarget(lensId: string): { el: HTMLElement; onRail: boolean } | null {
  const all = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-lens-id="${CSS.escape(lensId)}"]`),
  ).filter(visible);
  const row = all.find((el) => el.dataset.testid === 'vx-lens');
  if (row) return { el: row, onRail: false };
  const dot = all.find((el) => el.dataset.testid === 'vx-rail-dot');
  return dot ? { el: dot, onRail: true } : null;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function FlightChip({ flight, onDone }: { flight: Flight; onDone: (key: number) => void }) {
  const theme = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  // The flight is an animation of real DOM positions (the cell, the lens row
  // that appears after the change), which only exist after commit.
  useEffect(() => {
    const started = performance.now();
    let raf = 0;
    let cancelled = false;
    let animation: Animation | null = null;

    const pulse = (target: { el: HTMLElement; onRail: boolean }) => {
      if (target.onRail) {
        target.el.animate([{ transform: 'scale(1.7)' }, { transform: 'scale(1)' }], {
          duration: PULSE_MS,
          easing: 'ease-out',
        });
      } else {
        target.el.animate(
          [
            { backgroundColor: alpha(theme.palette.primary.main, 0.18) },
            { backgroundColor: 'transparent' },
          ],
          { duration: PULSE_MS, easing: 'ease-out' },
        );
      }
    };

    const launch = () => {
      if (cancelled) return;
      const target = lensTarget(flight.lensId);
      if (!target) {
        if (performance.now() - started < MAX_WAIT_MS) raf = requestAnimationFrame(launch);
        else onDone(flight.key);
        return;
      }
      target.el.scrollIntoView({ block: 'nearest' });
      const chip = ref.current;
      if (!chip || reducedMotion()) {
        pulse(target);
        onDone(flight.key);
        return;
      }
      const to = target.el.getBoundingClientRect();
      const dx = to.left + (target.onRail ? 0 : 30) - flight.from.left;
      const dy = to.top + (target.onRail ? 2 : 6) - flight.from.top;
      const scale = target.onRail ? 0.4 : 0.85;
      chip.style.visibility = 'visible';
      chip.dataset.flying = 'true';
      animation = chip.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          // Opaque all the way: the chip lands, then the lens pulse takes over.
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 1 },
        ],
        { duration: FLIGHT_MS, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' },
      );
      animation.onfinish = () => {
        const landed = lensTarget(flight.lensId);
        if (landed) pulse(landed);
        onDone(flight.key);
      };
    };
    raf = requestAnimationFrame(launch);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      animation?.cancel();
    };
  }, [flight, onDone, theme]);

  return (
    <Box
      ref={ref}
      aria-hidden
      data-testid='vx-fly-in'
      data-lens-id={flight.lensId}
      sx={{
        position: 'fixed',
        left: flight.from.left,
        top: flight.from.top,
        visibility: 'hidden',
        zIndex: theme.zIndex.tooltip + 1,
        pointerEvents: 'none',
        transformOrigin: 'top left',
        fontSize: 12,
        fontWeight: 700,
        color: 'primary.main',
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'primary.main',
        borderRadius: 1,
        px: 1,
        py: 0.25,
        boxShadow: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {flight.label}
    </Box>
  );
}

/** Registers the `flyIn` slot and draws the chips in flight. */
export function FlyInLayer() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const next = useRef(0);

  const flyIn = useCallback((request: FlyInRequest) => {
    next.current += 1;
    const key = next.current;
    setFlights((f) => [...f, { ...request, key }]);
  }, []);
  useRegisterSlot('flyIn', flyIn);

  const done = useCallback(
    (key: number) => setFlights((f) => f.filter((x) => x.key !== key)),
    [],
  );

  if (flights.length === 0) return null;
  return createPortal(
    flights.map((f) => <FlightChip key={f.key} flight={f} onDone={done} />),
    document.body,
  );
}
