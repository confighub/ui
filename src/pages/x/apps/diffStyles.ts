// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { componentTheme } from './componentTheme';

const DRAG_HANDLE_WIDTH = 6;

type PanePosition = 'right' | 'bottom';

export const PaneContainer = styled(Box, {
  shouldForwardProp: (p) => p !== '$width' && p !== '$isResizing' && p !== '$position',
})<{ $width: number; $isResizing?: boolean; $position?: PanePosition }>(({ $width, $isResizing, $position = 'right' }) => ({
  position: 'relative',
  ...$position === 'right'
    ? { width: $width, borderLeft: `1px solid ${componentTheme.borderDefault}` }
    : { height: $width, width: '100%', borderTop: `1px solid ${componentTheme.borderDefault}` },
  flexShrink: 0,
  background: componentTheme.bgDefault,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  transition: $isResizing ? 'none' : ($position === 'right' ? 'width 0.2s ease-out' : 'height 0.2s ease-out'),
}));

export const ResizeHandle = styled(Box, {
  shouldForwardProp: (p) => p !== '$position',
})<{ $position?: PanePosition }>(({ $position = 'right' }) => ({
  position: 'absolute',
  ...($position === 'right'
    ? { left: 0, top: 0, width: DRAG_HANDLE_WIDTH, height: '100%', cursor: 'ew-resize' }
    : { left: 0, top: 0, width: '100%', height: DRAG_HANDLE_WIDTH, cursor: 'ns-resize' }),
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '&::after': {
    content: '""',
    ...($position === 'right'
      ? { width: 2, height: 32 }
      : { height: 2, width: 32 }),
    borderRadius: 1,
    background: componentTheme.borderMuted,
    transition: 'background 0.15s, width 0.15s, height 0.15s',
  },
  '&:hover::after': {
    background: componentTheme.fgMuted,
    ...($position === 'right'
      ? { height: 48 }
      : { width: 48 }),
  },
}));

export const PaneHeader = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  borderBottom: `1px solid ${componentTheme.borderDefault}`,
  background: componentTheme.bgDefault,
  flexShrink: 0,
  gap: 10,
});

export const PaneContent = styled(Box)({
  flex: 1,
  overflowY: 'auto',
  padding: '8px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

// Wraps a single unit's header + values. When the pane is in upgrade-preview
// mode (the user is hovering the Upgrade button), units that won't be affected
// by the upgrade are dimmed so the user can preview what will change.
export const UnitRow = styled(Box)({
  transition: 'opacity 0.15s ease',
  '.pane-upgrade-preview &.unit-unchanged': {
    opacity: 0.4,
  },
});

// Wraps a single field row that should fade when the pane is in upgrade-preview
// mode (the user is hovering the Upgrade button) and the row is not actually
// changing under the upgrade — e.g. a "name" field with no real upgrade. Reuses
// the same opacity/transition treatment as unchanged units.
export const UpgradePreviewDimRow = styled(Box)({
  transition: 'opacity 0.15s ease',
  '.pane-upgrade-preview &.field-unchanged': {
    opacity: 0.4,
  },
});

export const BottomBar = styled(Box)({
  height: 48,
  borderTop: `1px solid ${componentTheme.borderDefault}`,
  background: componentTheme.bgDefault,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: '0 12px',
  gap: 8,
  flexShrink: 0,
});

/**
 * The BottomBar's ONE primary-action-button treatment ("Replace the upgrade
 * footer with the save button. as a footer. style them the same." —
 * task #34). Shared, literally, by the Upgrade button and the Space settings
 * sheet's Save button in `ComponentSidePane` (both spread this same object, so
 * they cannot visually drift apart the way two hand-copied sx literals
 * could), and moved here (a pure move, no behaviour change) so the rollout
 * footer's buttons can share the exact same treatment per the user's
 * "same style footer buttons" feedback — `ComponentSidePane.tsx` stays shut
 * for everything else.
 */
export const bottomBarPrimaryButtonSx = {
  textTransform: 'none' as const,
  fontWeight: 600,
  fontSize: 14,
  borderRadius: `${componentTheme.radiusSm}px`,
  backgroundColor: componentTheme.done,
  color: componentTheme.fgOnEmphasis,
  boxShadow: componentTheme.shadowSm,
  px: 1.5,
  py: 0.5,
  gap: 1,
  '&:hover': { backgroundColor: componentTheme.doneEmphasis },
  // A DISABLED BUTTON STILL LOOKS LIKE A BUTTON (user request: "the buttons
  // turn into text when disabled, I don't want that, just grey them out").
  //
  // The previous grey was `bgSubtle` (#f6f7f9) with no border, against a
  // `bgDefault` (#ffffff) bar: two steps of luminance and no edge, so the
  // control dissolved into the footer and read as a bare label. A bare label
  // says "there is nothing here"; a greyed button says "there is something
  // here and it is not available right now".
  //
  // Lives on the SHARED object, so the rollout footer and auto mode's own
  // Save/Upgrade buttons cannot drift apart — the two were byte-identical in
  // every other state (measured: same purple, radius, weight and height), and
  // a rollout-only override made the disabled state the one place they
  // disagreed.
  '&.Mui-disabled': {
    backgroundColor: componentTheme.bgInset,
    color: componentTheme.fgSubtle,
    border: `1px solid ${componentTheme.borderDefault}`,
    boxShadow: 'none',
  },
};

/**
 * The BottomBar's ONE muted-text-button treatment, shared by the treeview's
 * "Discard" (staged upgrades) and the settings sheet's "Discard"/"Close" in
 * `ComponentSidePane` — same reasoning and same move as
 * `bottomBarPrimaryButtonSx` above.
 */
export const bottomBarTextButtonSx = {
  textTransform: 'none' as const,
  fontWeight: 600,
  fontSize: 13,
  // `radiusSm`, matching the primary button beside it AND the app-wide button
  // default (`ThemeProvider`'s `MuiButton` uses `rSm`). This was `radiusMd`
  // (9px vs 5px) — invisible while a text button had no fill or edge of its
  // own, and plainly wrong once the disabled state gave it both: two buttons
  // in one footer with visibly different corners.
  borderRadius: `${componentTheme.radiusSm}px`,
  color: componentTheme.fgMuted,
  px: 1,
  '&:hover': { backgroundColor: componentTheme.bgInset },
  // Same treatment and same reasoning as the primary above: greyed, still a
  // button. This one had no disabled rule at all, so it fell through to MUI's
  // default — grey text on nothing, which is exactly the "turns into text"
  // complaint.
  '&.Mui-disabled': {
    backgroundColor: componentTheme.bgInset,
    color: componentTheme.fgSubtle,
    border: `1px solid ${componentTheme.borderDefault}`,
    boxShadow: 'none',
  },
};

export const TagBadge = styled(Box)({
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 12,
  fontWeight: 500,
  fontFamily: componentTheme.fontSans,
  padding: '1px 7px',
  borderRadius: componentTheme.radiusMd,
  flexShrink: 0,
  whiteSpace: 'nowrap',
  color: componentTheme.fgMuted,
  background: componentTheme.bgInset,
  border: `1px solid ${componentTheme.borderSubtle}`,
});

/**
 * `TagBadge`, clickable. A separate styled primitive rather than
 * `<TagBadge component="a">` — `styled(Box)` does not carry `Box`'s own
 * polymorphic `component` prop through its generated props type, so that cast
 * does not typecheck. `styled('a')` sidesteps it by basing the component on
 * the anchor tag directly, the same way `UnitSlug` above does.
 */
export const TagBadgeLink = styled('a')({
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 12,
  fontWeight: 500,
  fontFamily: componentTheme.fontSans,
  padding: '1px 7px',
  borderRadius: componentTheme.radiusMd,
  flexShrink: 0,
  whiteSpace: 'nowrap',
  color: componentTheme.fgMuted,
  background: componentTheme.bgInset,
  border: `1px solid ${componentTheme.borderSubtle}`,
  textDecoration: 'underline',
  textDecorationColor: componentTheme.borderMuted,
});

export const ReviewRow = styled(Box, {
  shouldForwardProp: (p) => p !== '$striped' && p !== '$plain',
})<{ $striped?: boolean; $plain?: boolean }>(({ $striped, $plain }) => ({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'nowrap',
  // Density matches the redesign mockup (--row-h 32px / 3px vertical padding,
  // 12–12.5px mono text). 28px min-height keeps rows dense while still vertically
  // centring the 20px upgrade pill + 12.5px text cleanly.
  padding: '3px 0',
  fontSize: 12,
  minHeight: 28,
  borderBottom: `1px solid ${componentTheme.borderSubtle}`,
  position: 'relative' as const,
  ...($plain && { background: componentTheme.bgDefault, zIndex: 11 }),
  ...(!$plain && { padding: '3px 0', minHeight: 28 }),
  ...($striped && !$plain && { background: 'transparent' }),
  '&:hover .dim-path': {
    opacity: '1 !important',
  },
  ...(!$plain && {
    '&::before, &::after': {
      content: '""',
      position: 'absolute',
      top: 0,
      bottom: 0,
      pointerEvents: 'none',
    },
    '&::before': {
      left: 'var(--col1-width, 40%)',
      width: 'var(--col2-width, 28%)',
      background: componentTheme.dangerFaint,
    },
    '&::after': {
      left: 'calc(var(--col1-width, 40%) + var(--col2-width, 28%))',
      right: 0,
      background: componentTheme.successFaint,
    },
  }),
}));


export const UnitHeaderRow = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 16px',
  cursor: 'pointer',
  transition: 'background .12s',
  borderTop: `1px solid ${componentTheme.borderSubtle}`,
  background: componentTheme.bgSubtle,
  '&:hover': { background: componentTheme.bgInset },
});


export const UnitSlug = styled('a')({
  fontSize: 14,
  fontWeight: 600,
  fontFamily: componentTheme.fontMono,
  color: componentTheme.fgDefault,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textDecoration: 'underline',
  textDecorationColor: componentTheme.borderMuted,
  textUnderlineOffset: 2,
  '&:hover': {
    color: componentTheme.accentEmphasis,
    textDecorationColor: componentTheme.accentEmphasis,
  },
});

export const PropertyCell = styled(Box)({
  width: 'var(--col1-width, 40%)',
  flexShrink: 0,
  overflow: 'visible',
  minWidth: 0,
  paddingLeft: 16,
  paddingRight: 12,
  boxSizing: 'border-box',
  textAlign: 'right',
  position: 'relative',
  zIndex: 1,
});

export const BeforeCell = styled(Box)({
  width: 'var(--col2-width, 28%)',
  flexShrink: 0,
  overflow: 'visible',
  minWidth: 0,
  paddingLeft: 10,
  paddingRight: 12,
  boxSizing: 'border-box',
  position: 'relative',
  zIndex: 1,
});

export const AfterCell = styled(Box)({
  flex: 1,
  overflow: 'visible',
  minWidth: 0,
  paddingLeft: 10,
  paddingRight: 16,
  boxSizing: 'border-box',
  position: 'relative',
  zIndex: 1,
});

export const DiffColumnDivider = styled(Box, {
  shouldForwardProp: (p) => p !== '$dragging' && p !== '$position',
})<{ $dragging?: boolean; $position: 'first' | 'second' }>(({ $dragging, $position }) => ({
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: $position === 'first'
    ? 'var(--col1-width, 40%)'
    : 'calc(var(--col1-width, 40%) + var(--col2-width, 28%))',
  width: 5,
  cursor: 'col-resize',
  zIndex: 10,
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 2,
    width: 1,
    background: $dragging ? componentTheme.upgrade : 'transparent',
    transition: 'background .15s',
  },
  '&:hover::before': {
    width: 2,
    background: $dragging ? componentTheme.upgrade : componentTheme.fgSubtle,
  },
}));

const valueWrapStyle = {
  display: 'inline' as const,
  overflowWrap: 'break-word' as const,
  minWidth: 0,
  borderRadius: 4,
  padding: '3px 6px',
  lineHeight: 1.55,
  boxDecorationBreak: 'clone' as const,
  WebkitBoxDecorationBreak: 'clone' as const,
};

export const PathValue = styled('span')({
  ...valueWrapStyle,
  padding: 0,
  color: 'inherit',
  backgroundColor: 'transparent',
});

export const OldValue = styled('span')({
  ...valueWrapStyle,
  color: componentTheme.danger,
});

export const NewValue = styled('span')({
  ...valueWrapStyle,
  color: componentTheme.success,
});

export const ChevronIcon = styled('span', {
  shouldForwardProp: (p) => p !== '$expanded',
})<{ $expanded: boolean }>(({ $expanded }) => ({
  display: 'inline-flex',
  transition: 'transform .15s',
  transform: $expanded ? 'rotate(90deg)' : 'none',
  color: componentTheme.fgSubtle,
  '& svg': { width: 10, height: 10 },
}));

export const ErrorCard = styled(Box)({
  margin: '8px 12px',
  padding: '12px 14px',
  background: componentTheme.dangerMuted,
  borderRadius: componentTheme.radiusMd,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  flexShrink: 0,
});

export const ErrorHeader = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
});

export const ErrorDetail = styled(Box)({
  fontSize: 14,
  fontFamily: componentTheme.fontMono,
  color: componentTheme.dangerEmphasis,
  lineHeight: 1.5,
  padding: '8px 10px',
  borderRadius: 6,
  border: `1px solid ${componentTheme.dangerEdge}`,
  background: componentTheme.dangerMuted,
  wordBreak: 'break-word',
});

export const SectionLabel = styled(Typography)({
  fontSize: 11,
  fontWeight: 600,
  fontFamily: componentTheme.fontSans,
  letterSpacing: '.02em',
  textTransform: 'capitalize',
  color: componentTheme.fgSubtle,
  padding: '3px 8px',
  margin: '4px 16px 2px',
  borderRadius: componentTheme.radiusSm,
  width: 'fit-content',
});

/**
 * Screen-reader-only text.
 *
 * Additive: nothing in this module renders it, and nothing renders it inside
 * `TreeDiffSection` either unless a caller opts in via
 * `domHooks.srValuePrefix`. Deliberately a local twin of
 * `releasePaneStyles.VisuallyHidden` — `diffStyles` is a shared style module and
 * must not import from a feature module (wrong dependency direction).
 */
export const SrOnly = styled('span')({
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

export const GateBadge = styled(Chip)({
  height: 20,
  fontSize: 11,
  fontWeight: 500,
  fontFamily: componentTheme.fontSans,
  borderRadius: componentTheme.radiusMd,
  '& .MuiChip-label': { padding: '0 8px' },
});
