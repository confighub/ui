// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { Box, Button } from '@mui/material';
import { styled } from '@mui/material/styles';

import { COMPARE_STAGED_TOKENS } from '../compare/rowTypeTokens';
import { componentTheme } from '../componentTheme';

/** The manual-edit yellow of the value treeview: a staged, not yet saved, value. */
export const EDIT_YELLOW = COMPARE_STAGED_TOKENS.edit.fill;

/** Code is shown as typed: JetBrains Mono would draw `!=` as one glyph. */
const NO_LIGATURES = {
  fontVariantLigatures: 'none',
  fontFeatureSettings: '"calt" 0, "liga" 0',
} as const;

export const Pill = styled('span')({
  fontFamily: componentTheme.fontMono,
  fontSize: 10.5,
  fontWeight: 500,
  color: componentTheme.fgMuted,
  background: componentTheme.bgInset,
  borderRadius: componentTheme.radiusSm,
  padding: '1px 6px',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  ...NO_LIGATURES,
});

export const Code = styled('code')({
  fontFamily: componentTheme.fontMono,
  fontSize: 11,
  background: componentTheme.bgInset,
  borderRadius: 4,
  padding: '0 4px',
  color: componentTheme.fgDefault,
  ...NO_LIGATURES,
});

export const CurrentInline = styled('code')({
  fontFamily: componentTheme.fontMono,
  fontSize: 11,
  color: componentTheme.danger,
  background: componentTheme.dangerTint,
  borderRadius: 4,
  padding: '0 4px',
  overflowWrap: 'anywhere',
  ...NO_LIGATURES,
});

export const ValueBox = styled(Box, { shouldForwardProp: (p) => p !== '$tone' })<{
  $tone: 'current' | 'good';
}>(({ $tone }) => ({
  fontFamily: componentTheme.fontMono,
  fontSize: 11.5,
  padding: '6px 8px',
  borderRadius: componentTheme.radiusSm,
  background: $tone === 'current' ? componentTheme.dangerTint : componentTheme.successMuted,
  boxShadow: `inset 0 0 0 1px ${$tone === 'current' ? componentTheme.dangerEdge : componentTheme.successEdge}`,
  color: $tone === 'current' ? componentTheme.danger : componentTheme.success,
  overflowWrap: 'anywhere',
  minHeight: 34,
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  whiteSpace: 'pre-wrap',
  minWidth: 0,
  ...NO_LIGATURES,
}));

export const ValueLabel = styled('span')({
  fontFamily: componentTheme.fontSans,
  fontSize: 10.5,
  fontWeight: 600,
  color: componentTheme.fgMuted,
});

export const Vals = styled(Box, { shouldForwardProp: (p) => p !== '$one' })<{
  $one?: boolean;
}>(({ $one }) => ({
  display: 'grid',
  gridTemplateColumns: $one ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 16px minmax(0, 1fr)',
  gap: 8,
  alignItems: 'center',
}));

export const Arrow = styled('span')({ color: componentTheme.fgSubtle, textAlign: 'center' });

export const Acts = styled(Box)({
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
});

export const Hint = styled('span')({ fontSize: 11.5, color: componentTheme.fgSubtle });

/** Small buttons of a row, 26px. */
const smallButton = {
  height: 26,
  minWidth: 0,
  fontSize: 11.5,
  fontWeight: 600,
  padding: '0 10px',
  borderRadius: componentTheme.radiusSm,
  textTransform: 'none',
  letterSpacing: '-0.01em',
  // The pane's text uses the normal line height; MUI's 1.75 sets the label 1px off its line.
  lineHeight: 'normal',
  whiteSpace: 'nowrap',
  fontFamily: componentTheme.fontSans,
  boxShadow: 'none',
} as const;

/** The primary small button's look, also for one drawn as a link. */
export const primarySmallButtonSx = {
  ...smallButton,
  background: componentTheme.accent,
  color: componentTheme.fgOnEmphasis,
  '&:hover': { background: componentTheme.accentEmphasis, boxShadow: 'none' },
} as const;

export const PrimarySmallButton = styled(Button)(primarySmallButtonSx);

export const OutlinedSmallButton = styled(Button)({
  ...smallButton,
  background: componentTheme.bgDefault,
  color: componentTheme.fgMuted,
  boxShadow: `inset 0 0 0 1px ${componentTheme.borderDefault}`,
  '&:hover': {
    background: componentTheme.bgSubtle,
    boxShadow: `inset 0 0 0 1px ${componentTheme.borderEdge}`,
  },
});

export const TextSmallButton = styled(Button, { shouldForwardProp: (p) => p !== '$on' })<{
  $on?: boolean;
}>(({ $on }) => ({
  ...smallButton,
  padding: '0 8px',
  color: $on ? componentTheme.fgDefault : componentTheme.fgMuted,
  background: 'none',
  borderRadius: $on ? 0 : componentTheme.radiusSm,
  boxShadow: $on ? `inset 0 -2px 0 ${EDIT_YELLOW}` : 'none',
  '&:hover': { background: componentTheme.bgSubtle },
}));

export const LinkButton = styled('button')({
  border: 0,
  background: 'none',
  padding: 0,
  cursor: 'pointer',
  fontFamily: componentTheme.fontSans,
  color: componentTheme.accent,
  fontWeight: 700,
  fontSize: 11.5,
  // An inline box on the 1.5 line of the sentence it ends, so it does not raise that line.
  display: 'inline-flex',
  alignItems: 'center',
  lineHeight: 1.5,
  whiteSpace: 'nowrap',
  '&:hover': { textDecoration: 'underline' },
});

/** Footer buttons, 32px. */
const footerButton = {
  height: 32,
  padding: '0 14px',
  borderRadius: componentTheme.radiusSm,
  fontSize: 12.5,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  // The pane's text uses the normal line height; MUI's 1.75 sets the label 1px off its line.
  lineHeight: 'normal',
  textTransform: 'none',
  whiteSpace: 'nowrap',
  boxShadow: 'none',
  fontFamily: componentTheme.fontSans,
  gap: 6,
} as const;

export const PrimaryButton = styled(Button)({
  ...footerButton,
  background: componentTheme.accent,
  color: componentTheme.fgOnEmphasis,
  '&:hover': { background: componentTheme.accentEmphasis, boxShadow: 'none' },
  '&.Mui-disabled': { background: componentTheme.bgInset, color: componentTheme.fgSubtle },
});

export const OutlinedButton = styled(Button)({
  ...footerButton,
  background: componentTheme.bgDefault,
  color: componentTheme.fgMuted,
  boxShadow: `inset 0 0 0 1px ${componentTheme.borderDefault}`,
  '&:hover': { background: componentTheme.bgSubtle },
});

export const TextButton = styled(Button)({
  ...footerButton,
  padding: '0 8px',
  minWidth: 0,
  color: componentTheme.fgMuted,
  background: 'none',
  '&:hover': { background: componentTheme.bgSubtle },
});

export const MonoBox = styled(Box)({
  margin: '0 12px 10px',
  padding: '9px 10px',
  borderRadius: componentTheme.radiusSm,
  background: componentTheme.bgSubtle,
  border: `1px solid ${componentTheme.borderMuted}`,
  lineHeight: 1.5,
  color: componentTheme.fgMuted,
  overflowWrap: 'anywhere',
  fontFamily: componentTheme.fontMono,
  fontSize: 11.5,
  ...NO_LIGATURES,
});

export const MutedLine = styled(Box)({
  color: componentTheme.fgSubtle,
  fontSize: 11.5,
  padding: '0 12px 10px',
  overflowWrap: 'anywhere',
});

/** The blocked summary border: amber at 20%. */
export const SUMMARY_BORDER = tokens.amberBd;
/** The input placeholder text. */
export const PLACEHOLDER_TEXT = tokens.t4;
