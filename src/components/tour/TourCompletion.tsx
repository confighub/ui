// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Ref, useCallback, useEffect, useId, useMemo, useRef } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import Modal from '@mui/material/Modal';
import Paper from '@mui/material/Paper';
import Popper, { PopperProps } from '@mui/material/Popper';
import Typography from '@mui/material/Typography';

import { TOUR_MODAL_CLASS, TOUR_Z_INDEX } from './constants';
import { AnchorRect } from './types';
import { useForeignModalCount } from './useForeignModalCount';

export interface TourCompletionProps {
  open: boolean;
  /** Live viewport rect of the "Get started" nav button. Null centres the card. */
  rect: AnchorRect | null;
  /** Title of the tour that just finished. */
  tourTitle: string;
  /** How many steps it took — the recap line reads "You finished all N steps." */
  stepCount: number;
  /** Title of the next tour in the sequence. Undefined after the last one. */
  nextTourTitle?: string;
  onContinue: () => void;
  onDismiss: () => void;
}

/**
 * The pause between tours: a small card that floats near the "Get started"
 * nav button (Layout.tsx) — the same place its own panel opens from — rather
 * than a full-screen centred card. It used to be exactly that: dead centre,
 * with everything behind it functionally hidden by a 360px card. Direct
 * product feedback: the whole point of finishing a tour is to look at what
 * you just made, and a full-screen "you're done!" card was the one thing
 * standing in the way of doing that. This still confirms completion and
 * still offers "Continue", it just does it from the corner instead of
 * blocking the thing it's congratulating you on.
 *
 * Same nested-Modal stacking as `TourTooltip` (see its header comment for the
 * full rationale) and for the same reason: chapter 1's own last step fires
 * its `click` advance the instant the click lands, not once the resulting
 * mutation settles, so this screen can genuinely mount while the wizard
 * Dialog it was just clicked inside of is still open a moment longer. The
 * Popper-anchored positioning below mirrors `TourTooltip`'s own — same
 * virtual-anchor-by-ref technique, same modifiers — minus the arrow/caret:
 * this card doesn't point at something the user needs to click, so there is
 * nothing for a caret to indicate.
 *
 * `disableAutoFocus` carries the same gap here as it does in `TourTooltip`
 * (see that header comment): a keyboard user with nothing already focused
 * would otherwise have no way to reach Continue/Done short of tabbing from
 * the top of the page. `handlePaperRef` below moves focus onto the card, but
 * only when `document.activeElement` is `<body>` — nothing legitimately
 * focused, or the previously-focused element was just removed — so it never
 * steals focus from a real target. It runs from the ref callback rather than
 * a `useEffect`, and for the same reason `TourTooltip` does the same: `Modal`
 * portals via a deferred-`mountNode` render pass, so this card does not exist
 * in the DOM yet on the commit a mount-keyed effect would fire from.
 */
/**
 * MUI does not re-export popper's own `Instance` type, and `@popperjs/core` is
 * only a transitive dependency of this package (see TourTooltip.tsx's
 * identical note), so it is recovered from the public prop type instead.
 */
type PopperInstance = NonNullable<PopperProps['popperRef']> extends Ref<infer I> ? I : never;

export const TourCompletion = ({
  open,
  rect,
  tourTitle,
  stepCount,
  nextTourTitle,
  onContinue,
  onDismiss,
}: TourCompletionProps) => {
  const titleId = useId();
  const foreignModalCount = useForeignModalCount();
  const popperRef = useRef<PopperInstance>(null);

  const handlePaperRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !open) return;
      const active = document.activeElement;
      if (active === document.body || active === null) {
        el.focus({ preventScroll: true });
      }
    },
    [open],
  );

  // Same technique as TourTooltip: the rect is fed through a ref so the
  // virtual element's identity stays stable — a new identity every frame
  // would make Popper re-create its instance sixty times a second.
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

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismissRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <Modal
      key={foreignModalCount}
      className={TOUR_MODAL_CLASS}
      open={open}
      onClose={onDismiss}
      hideBackdrop
      disableScrollLock
      disableAutoFocus
      disableEnforceFocus
      aria-labelledby={titleId}
      sx={{ zIndex: TOUR_Z_INDEX, pointerEvents: 'none' }}
    >
      <Box tabIndex={-1} sx={{ position: 'absolute', inset: 0, outline: 'none' }}>
        <Popper
          open={open}
          anchorEl={virtualAnchor}
          popperRef={popperRef}
          disablePortal
          placement="bottom-end"
          modifiers={[
            { name: 'offset', options: { offset: [0, 8] } },
            { name: 'flip', options: { padding: 12, fallbackPlacements: ['bottom-start', 'top-end'] } },
            { name: 'preventOverflow', options: { padding: 12, altAxis: true, tether: false } },
          ]}
          sx={{ pointerEvents: 'auto', zIndex: 'inherit' }}
        >
          <Paper
            ref={handlePaperRef}
            elevation={8}
            role="dialog"
            data-testid="tour-completion"
            aria-labelledby={titleId}
            aria-modal="false"
            tabIndex={-1}
            sx={{
              width: 300,
              maxWidth: 'calc(100vw - 24px)',
              maxHeight: 'calc(100vh - 24px)',
              overflowY: 'auto',
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  mt: 0.25,
                  flexShrink: 0,
                  borderRadius: '50%',
                  backgroundColor: 'success.light',
                  color: 'success.dark',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircleRoundedIcon sx={{ fontSize: 15 }} />
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography id={titleId} variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {tourTitle} — done
                </Typography>
                {/* `body2`, not `caption`: the theme styles `caption` as an
                    all-caps, letter-spaced LABEL (ThemeProvider.tsx) — correct for
                    the field labels it is used for elsewhere, but it shouted this
                    full sentence at the user. Sized down to sit under the title
                    rather than overriding the theme's own casing. */}
                <Typography
                  variant="body2"
                  sx={{ display: 'block', color: 'text.secondary', mt: 0.25, fontSize: 11.5 }}
                >
                  All {stepCount} steps finished. Take a look around before moving on.
                </Typography>
              </Box>

              <IconButton
                size="small"
                onClick={onDismiss}
                aria-label="Dismiss"
                data-testid="tour-completion-dismiss-icon"
                sx={{ mt: -0.5, mr: -0.5 }}
              >
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
              {nextTourTitle && (
                <Button
                  variant="contained"
                  size="small"
                  onClick={onContinue}
                  data-testid="tour-completion-continue"
                  sx={{ flex: 1, minWidth: 0, py: 0.5 }}
                >
                  Continue
                </Button>
              )}
              <Button
                variant="text"
                color="inherit"
                size="small"
                onClick={onDismiss}
                data-testid="tour-completion-dismiss"
              >
                {nextTourTitle ? 'Maybe later' : 'Done'}
              </Button>
            </Box>
          </Paper>
        </Popper>
      </Box>
    </Modal>
  );
};
