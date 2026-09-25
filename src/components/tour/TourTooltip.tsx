// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode, Ref, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Modal from '@mui/material/Modal';
import Paper from '@mui/material/Paper';
import Popper, { PopperPlacementType, PopperProps } from '@mui/material/Popper';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import { TOUR_MODAL_CLASS, TOUR_Z_INDEX } from './constants';
import { TourSpotlight } from './TourSpotlight';
import { AnchorRect } from './types';
import { useForeignModalCount } from './useForeignModalCount';

/**
 * MUI does not re-export popper's own `Instance` type, and `@popperjs/core` is
 * only a transitive dependency of this package, so it is recovered from the
 * public prop type rather than imported directly.
 */
type PopperInstance = NonNullable<PopperProps['popperRef']> extends Ref<infer I> ? I : never;

/**
 * Screen-reader-only text: announced via `aria-live`, invisible on screen.
 * Same clip-rect technique used for `LiveRegion` in `ReleaseLane.tsx`.
 */
const TourLiveRegion = styled('span')({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
});

export interface TourTooltipProps {
  open: boolean;
  /** Live viewport rect of the anchor. Null centres the tooltip. */
  rect: AnchorRect | null;
  title: string;
  body: ReactNode;
  /** 1-based, for the "3 of 12" counter. */
  stepNumber: number;
  stepCount: number;
  /** Show the Next button (only steps that advance on 'next' need it). */
  showNext: boolean;
  /** Anchor could not be found — offer to skip instead of leaving the user stuck. */
  anchorMissing: boolean;
  allowClickThrough: boolean;
  reducedMotion: boolean;
  /** Opt-in spotlight dimming — off by default. See TourStep.dimBackground. */
  dimBackground?: boolean;
  /** Overrides the default bottom/top side. See TourStep.placement. */
  placement?: PopperPlacementType;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
}

/**
 * The tour tooltip, rendered as a nested MUI `Modal`.
 *
 * This is the load-bearing decision of the whole engine. `ModalManager` sets
 * `aria-hidden="true"` on every `document.body` child except the top modal, and
 * `FocusTrap` pulls focus back into the top modal's root. A tooltip merely
 * portalled to `document.body` would therefore be aria-hidden and unfocusable
 * for as long as any Dialog is open — and the tour runs inside Dialogs.
 *
 * Registering as a modal instead makes `ModalManager` stack this above the open
 * Dialog, exempt it from the aria-hidden sweep, and disable the Dialog's focus
 * trap (its `isEnabled` is `isTopModal`). On close, `ModalManager.remove`
 * restores the Dialog underneath as `nextTop`. No existing Dialog needs
 * `disableEnforceFocus`.
 *
 * `ModalManager` stacks by registration order, not by z-index, and the tour is
 * already registered when the user opens a Dialog — so without help the tour
 * would sink to the bottom of the stack and lose every one of those benefits.
 * The `key` re-registers this modal whenever an app modal opens or closes,
 * which is what actually keeps it on top.
 *
 * Four details follow from that choice:
 *  - `disableEnforceFocus` is set HERE (and only here) so clicking the real UI
 *    underneath does not yank focus straight back into the tooltip.
 *  - `pointer-events` is `none` on the modal root and inherited by the overlay,
 *    with `auto` restored on the tooltip surface, so clicks reach the real
 *    element in the spotlight. A step with `allowClickThrough: false` flips the
 *    root to `auto`, turning the same element into an invisible shield.
 *  - the Popper uses `disablePortal`: portalling would put the tooltip content
 *    back outside the modal root and re-lose the aria-hidden exemption.
 *  - `disableAutoFocus` stops each re-registration from pulling focus out of
 *    the app. A Dialog autofocuses its first field on open, and the tour
 *    remounts a moment later; without this the user's caret would be taken out
 *    of the field the tour just told them to type in. Escape is handled on the
 *    document instead of relying on focus being inside the modal.
 *
 * `disableAutoFocus` leaves a real gap on its own, though: a keyboard user
 * lands on a fresh page with `document.activeElement === document.body`, and
 * with nothing ever pulling focus toward the tooltip they would have to Tab
 * through the entire rest of the page — every nav item, every table row —
 * before ever reaching Exit/Back/Next. `handlePaperRef` below closes that gap
 * without reopening the one `disableAutoFocus` exists to prevent: it moves
 * focus onto the dialog card only when `document.activeElement` is `<body>`,
 * which is true exactly when nothing legitimately holds focus (first paint)
 * or when the element that did was just removed from the DOM (browsers reset
 * focus to `<body>` in that case too). Any real focus target — an input mid
 * keystroke, a button the user just tabbed to — is left alone.
 *
 * That check runs from the `ref` callback, not a `useEffect` keyed on the
 * step: `Modal` itself portals via the same deferred-`mountNode` pattern as
 * `Popper` (see `Portal.js`), so on the very first render this card does not
 * exist in the DOM yet — a step-keyed effect fires a commit too early and
 * finds `paperRef.current` still null. Checking at the moment the ref itself
 * attaches sidesteps that ordering question entirely, and it also has to
 * survive the `key={foreignModalCount}` churn below: while the page is still
 * settling, this card can mount and unmount several times before the step
 * ever changes, and each teardown resets focus to `<body>` again. Re-running
 * the same safety check on every attach — rather than once per step — is
 * what makes focus converge on whichever card is actually left standing.
 */
export const TourTooltip = ({
  open,
  rect,
  title,
  body,
  stepNumber,
  stepCount,
  showNext,
  anchorMissing,
  allowClickThrough,
  reducedMotion,
  dimBackground,
  placement,
  onNext,
  onBack,
  onExit,
}: TourTooltipProps) => {
  const titleId = useId();
  const popperRef = useRef<PopperInstance>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);

  // See the header comment for why this lives in the ref callback rather
  // than a `useEffect`. Memoized on `open` alone (effectively constant) so
  // the 60fps `rect` updates below do not themselves cause a detach/reattach
  // — only a real DOM mount/unmount of this card invokes it.
  const handlePaperRef = useCallback(
    (el: HTMLDivElement | null) => {
      paperRef.current = el;
      if (!el || !open) return;
      const active = document.activeElement;
      if (active === document.body || active === null) {
        el.focus({ preventScroll: true });
      }
    },
    [open],
  );

  // Popper reads the anchor through this object every time it recomputes, so the
  // rect is fed in by ref: the virtual element identity stays stable (a new
  // identity would make Popper re-create its instance sixty times a second).
  const rectRef = useRef(rect);
  rectRef.current = rect;

  const virtualAnchor = useMemo(
    () => ({
      getBoundingClientRect: () => {
        const current = rectRef.current;
        if (current) {
          return new DOMRect(current.left, current.top, current.width, current.height);
        }
        return new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
      },
    }),
    [],
  );

  useEffect(() => {
    popperRef.current?.update();
  }, [rect]);

  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onExitRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const foreignModalCount = useForeignModalCount();

  // Popper writes the caret's position onto this element, so it has to be a real
  // node before the modifier can use it. Held in state, not a ref, because the
  // modifier list must be rebuilt once the node exists.
  const [arrowEl, setArrowEl] = useState<HTMLElement | null>(null);

  // A boolean, not `rect` itself: the rect object is new on every frame while the
  // page scrolls, and depending on it would defeat the memo below.
  const hasAnchor = rect !== null;

  // Rebuilt only when the caret node changes: this component re-renders on every
  // rect update, and a fresh array each time would make Popper reset its options
  // sixty times a second while the page scrolls.
  const modifiers = useMemo(
    () => [
      { name: 'offset', options: { offset: [0, 12] } },
      { name: 'flip', options: { padding: 16, fallbackPlacements: ['top', 'bottom'] } },
      // `tether: false` lets the tooltip detach from the anchor's own edges
      // once it no longer fits — without it, an anchor that spans most of
      // the viewport (e.g. a whole dialog body) pins the tooltip toward
      // that edge no matter how little room is actually left there, and it
      // renders past the bottom of the screen.
      { name: 'preventOverflow', options: { padding: 16, altAxis: true, tether: false } },
      // No anchor means the card is centred in the viewport, and a caret
      // pointing at nothing would be a lie.
      { name: 'arrow', enabled: hasAnchor, options: { element: arrowEl, padding: 14 } },
    ],
    [arrowEl, hasAnchor],
  );

  const progress = stepCount > 0 ? (stepNumber / stepCount) * 100 : 0;

  return (
    <Modal
      key={foreignModalCount}
      className={TOUR_MODAL_CLASS}
      open={open}
      onClose={onExit}
      hideBackdrop
      disableScrollLock
      disableAutoFocus
      disableEnforceFocus
      aria-labelledby={titleId}
      sx={{
        zIndex: TOUR_Z_INDEX,
        pointerEvents: allowClickThrough ? 'none' : 'auto',
      }}
    >
      <Box tabIndex={-1} sx={{ position: 'absolute', inset: 0, outline: 'none' }}>
        <TourSpotlight rect={rect} reducedMotion={reducedMotion} dim={dimBackground} />

        <Popper
          open={open}
          anchorEl={virtualAnchor}
          popperRef={popperRef}
          disablePortal
          placement={placement ?? (rect ? 'bottom' : 'top')}
          modifiers={modifiers}
          sx={{
            pointerEvents: 'auto',
            zIndex: 'inherit',
            // The caret is a square rotated 45deg and tucked half under the card,
            // so its outer two faces continue the card's own outline while its
            // inner half hides the border segment behind it. The rotation lives
            // on the pseudo-element because Popper owns `transform` on the arrow
            // node itself and would overwrite it, leaving a plain square.
            '& .cub-tour-arrow': {
              position: 'absolute',
              width: 14,
              height: 14,
              '&::before': {
                content: '""',
                display: 'block',
                width: 10,
                height: 10,
                margin: '2px',
                backgroundColor: 'var(--surface)',
                transform: 'rotate(45deg)',
              },
            },
            // Only the two outward-facing edges get a border. The other two sit
            // inside the card, where a line would read as a crease.
            '&[data-popper-placement^="bottom"] .cub-tour-arrow': {
              top: -7,
              '&::before': {
                borderTop: '1px solid var(--bd0)',
                borderLeft: '1px solid var(--bd0)',
              },
            },
            '&[data-popper-placement^="top"] .cub-tour-arrow': {
              bottom: -7,
              '&::before': {
                borderBottom: '1px solid var(--bd0)',
                borderRight: '1px solid var(--bd0)',
              },
            },
            // Added alongside `placement` becoming settable per-step (previously
            // only ever 'bottom' or 'top', so only those two had caret rules).
            // Derived by the same 45°-rotated-square logic as the two above,
            // not guessed: before rotation, the square's top/right/bottom/left
            // edges face N/E/S/W; after a 45° turn each faces NE/SE/SW/NW. A
            // caret poking out of the card's LEFT edge (card sits to the right
            // of its anchor) points west, so it needs the two edges adjacent to
            // the W corner — NW (border-left) and SW (border-bottom). A caret
            // poking out of the RIGHT edge points east, needing NE (border-top)
            // and SE (border-right). Verified against the existing bottom/top
            // rules by the same derivation before trusting it here.
            '&[data-popper-placement^="right"] .cub-tour-arrow': {
              left: -7,
              '&::before': {
                borderLeft: '1px solid var(--bd0)',
                borderBottom: '1px solid var(--bd0)',
              },
            },
            '&[data-popper-placement^="left"] .cub-tour-arrow': {
              right: -7,
              '&::before': {
                borderTop: '1px solid var(--bd0)',
                borderRight: '1px solid var(--bd0)',
              },
            },
          }}
        >
          <Box>
            <Paper
              ref={handlePaperRef}
              elevation={0}
              role='dialog'
              // Role alone cannot address this surface: while a Dialog is open the
              // page holds two role="dialog" elements, and aria-hidden hides one of
              // them from role-based queries entirely.
              data-testid='tour-tooltip'
              // Not aria-modal: the point of the tour is that the app underneath
              // stays operable.
              aria-modal='false'
              aria-labelledby={titleId}
              // Focus lands here programmatically (see `handlePaperRef` above)
              // — never a Tab stop of its own, since Exit/Back/Next are the
              // real interactive surface.
              tabIndex={-1}
              sx={{
                position: 'relative',
                width: 340,
                maxWidth: 'calc(100vw - 32px)',
                // Belt-and-braces on top of the flip/preventOverflow modifiers
                // above: no matter what placement math produces, the tooltip can
                // never render taller than the viewport itself. Overflow content
                // scrolls inside the card instead of running off the screen.
                maxHeight: 'calc(100vh - 32px)',
                overflowY: 'auto',
                overflowX: 'hidden',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--bd0)',
                // Deeper than a menu on purpose: this card floats over a dimmed
                // page and, inside a wizard, over an already-elevated Dialog.
                boxShadow: 'var(--sh-lg)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, p: '12px 14px 10px' }}>
                <Typography
                  id={titleId}
                  sx={{
                    flex: 1,
                    fontSize: '13.5px',
                    fontWeight: 700,
                    lineHeight: 1.3,
                    color: 'var(--t1)',
                  }}
                >
                  {title}
                </Typography>

                <Typography
                  aria-label={`Step ${stepNumber} of ${stepCount}`}
                  sx={{
                    flexShrink: 0,
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--t2)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {stepNumber} of {stepCount}
                </Typography>
              </Box>

              {/* Focus landing (see `handlePaperRef` above) announces the
                  dialog's label, but not a body that changes under the same
                  title, or a step-to-step move that never lands focus at all
                  (the user is mid-click on the anchor itself). This says the
                  same thing out loud every time the step actually changes. */}
              <TourLiveRegion role='status' aria-live='polite'>
                {`Step ${stepNumber} of ${stepCount}: ${title}. `}
                {anchorMissing
                  ? 'This part of the app is not on screen right now, so the tour cannot point at it.'
                  : body}
              </TourLiveRegion>

              {/* Progress meter. The tour has a known length, and a step counter
                  alone makes the user do the arithmetic to feel it. It sits under
                  the header rather than on the card's edge, where the caret
                  attaches and would bite a hole in it. */}
              <Box aria-hidden sx={{ height: 2, width: '100%', backgroundColor: 'var(--bd1)' }}>
                <Box
                  sx={{
                    height: '100%',
                    width: `${progress}%`,
                    backgroundColor: 'var(--rust)',
                    transition: reducedMotion ? 'none' : 'width 200ms ease-out',
                  }}
                />
              </Box>

              <Box sx={{ p: '12px 14px 14px' }}>
                {anchorMissing ? (
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 1,
                      p: 1,
                      borderRadius: 'var(--r-sm)',
                      backgroundColor: 'var(--amber-bg)',
                      border: '1px solid var(--amber-bd)',
                    }}
                  >
                    <WarningAmberRoundedIcon
                      sx={{ fontSize: 15, color: 'var(--amber)', flexShrink: 0, mt: '1px' }}
                    />
                    <Typography sx={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--t2)' }}>
                      This part of the app is not on screen right now, so the tour cannot point
                      at it.
                    </Typography>
                  </Box>
                ) : (
                  <Typography
                    component='div'
                    sx={{ fontSize: '12.5px', lineHeight: 1.55, color: 'var(--t2)' }}
                  >
                    {body}
                  </Typography>
                )}

                <Box
                  sx={{
                    mt: 1.75,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  {/* Exit sits apart from the navigation pair: it ends the tour,
                      and it should not be a neighbour of the button the user
                      reaches for on every step. */}
                  <Button
                    size='small'
                    onClick={onExit}
                    sx={{ mr: 'auto', ml: '-6px', color: 'var(--t2)' }}
                  >
                    Exit
                  </Button>

                  {stepNumber > 1 && (
                    <Button size='small' onClick={onBack} sx={{ color: 'var(--t2)' }}>
                      Back
                    </Button>
                  )}

                  {/* No Next button means the step advances when the user acts on
                      the spotlit element. Say so, rather than leaving a gap that
                      reads as a missing button. */}
                  {!showNext && !anchorMissing && (
                    <Typography
                      sx={{ fontSize: '11px', fontWeight: 700, color: 'var(--rust)', mr: '6px' }}
                    >
                      Your turn
                    </Typography>
                  )}

                  {(showNext || anchorMissing) && (
                    <Button size='small' variant='contained' onClick={onNext}>
                      {anchorMissing ? 'Skip this step' : 'Next'}
                    </Button>
                  )}
                </Box>
              </Box>
            </Paper>

            {/* After the card in the DOM so it paints over the card's own border,
                which is what makes the caret read as part of the outline. */}
            {hasAnchor && <Box className='cub-tour-arrow' ref={setArrowEl} />}
          </Box>
        </Popper>
      </Box>
    </Modal>
  );
};
