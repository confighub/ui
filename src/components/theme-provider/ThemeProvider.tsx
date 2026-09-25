// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { Shadows } from '@mui/material/styles';
import GlobalStyles from '@mui/material/GlobalStyles';

import { TOP_NAV_HEIGHT } from '@/utility/constants';

// ── Design tokens ────────────────────────────────────────────────────────────
// These values define the ConfigHub design system. Any change here propagates
// to all MUI components and to the CSS custom properties injected globally.

const tokens = {
  // Surfaces
  surface: '#ffffff',
  bg: '#f6f7f9',
  bgHover: '#f3f4f6',

  // Borders (structural → subtle → hairline)
  bd0: '#e6e8ec',
  bd1: '#eeeff3',
  bd2: '#f3f4f6',

  // Text (primary → secondary → muted → ghost)
  t1: '#111214',
  t2: '#505969',
  t3: '#8e9aaa',
  t4: '#bcc6d0',

  // Brand — action signal only, never for status
  rust: '#ba3d03',
  rustDark: '#8c2c00',
  rustBg: 'rgba(186,61,3,0.055)',
  rustRing: 'rgba(186,61,3,0.18)',

  // Semantic — success/ready
  green: '#15803d',
  greenBg: '#f0fdf4',
  greenBd: 'rgba(21,128,61,0.18)',

  // Semantic — info/apply/in-progress
  blue: '#1a50c1',
  blueBg: '#eff4ff',
  blueBd: 'rgba(26,80,193,0.18)',

  // Semantic — upgrade/secondary
  purple: '#6824c4',
  purpleBg: '#f4f0ff',
  purpleBd: 'rgba(104,36,196,0.18)',

  // Semantic — warning/gated
  amber: '#b45309',
  amberBg: '#fffbeb',
  amberBd: 'rgba(180,83,9,0.20)',

  // Semantic — error/degraded
  red: '#b91c1c',
  redBg: '#fef2f2',
  redBd: 'rgba(185,28,28,0.18)',

  // Shadows
  shXs: '0 1px 2px rgba(0,0,0,0.04)',
  shSm: '0 1px 3px rgba(0,0,0,0.06),0 0 0 1px rgba(0,0,0,0.04)',
  shMd: '0 4px 12px rgba(0,0,0,0.07),0 1px 3px rgba(0,0,0,0.04)',
  shLg: '0 8px 24px rgba(0,0,0,0.08),0 2px 6px rgba(0,0,0,0.04)',
  shSel: '0 0 0 2px #ba3d03,0 8px 24px rgba(186,61,3,0.09)',

  // Radius
  rSm: 5,
  rMd: 9,
  rPill: 999,

  // Typography
  fontSans: '"Manrope", system-ui, -apple-system, sans-serif',
  fontMono: '"JetBrains Mono", "Courier New", monospace',
} as const;

// ── MUI shadow array (25 slots required) ─────────────────────────────────────
const buildShadows = (): Shadows => {
  const none = 'none';
  const xs = tokens.shXs;
  const sm = tokens.shSm;
  const md = tokens.shMd;
  const lg = tokens.shLg;
  return [
    none, xs, sm,
    '0 2px 6px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)',
    md,
    '0 6px 16px rgba(0,0,0,0.07),0 2px 4px rgba(0,0,0,0.04)',
    '0 7px 18px rgba(0,0,0,0.07),0 2px 5px rgba(0,0,0,0.04)',
    '0 8px 20px rgba(0,0,0,0.07),0 2px 6px rgba(0,0,0,0.04)',
    lg,
    '0 9px 26px rgba(0,0,0,0.08),0 2px 7px rgba(0,0,0,0.04)',
    '0 10px 28px rgba(0,0,0,0.08),0 3px 8px rgba(0,0,0,0.04)',
    '0 12px 30px rgba(0,0,0,0.08),0 3px 8px rgba(0,0,0,0.04)',
    '0 14px 32px rgba(0,0,0,0.08),0 4px 10px rgba(0,0,0,0.04)',
    '0 16px 36px rgba(0,0,0,0.09),0 4px 10px rgba(0,0,0,0.04)',
    '0 18px 40px rgba(0,0,0,0.09),0 4px 12px rgba(0,0,0,0.04)',
    '0 20px 44px rgba(0,0,0,0.09),0 5px 12px rgba(0,0,0,0.04)',
    '0 22px 48px rgba(0,0,0,0.09),0 5px 14px rgba(0,0,0,0.04)',
    '0 24px 52px rgba(0,0,0,0.10),0 6px 16px rgba(0,0,0,0.04)',
    '0 26px 56px rgba(0,0,0,0.10),0 6px 16px rgba(0,0,0,0.04)',
    '0 28px 60px rgba(0,0,0,0.10),0 7px 18px rgba(0,0,0,0.04)',
    '0 30px 64px rgba(0,0,0,0.10),0 7px 18px rgba(0,0,0,0.04)',
    '0 32px 68px rgba(0,0,0,0.11),0 8px 20px rgba(0,0,0,0.04)',
    '0 34px 72px rgba(0,0,0,0.11),0 8px 20px rgba(0,0,0,0.04)',
    '0 36px 76px rgba(0,0,0,0.11),0 9px 22px rgba(0,0,0,0.04)',
    '0 40px 80px rgba(0,0,0,0.12),0 10px 24px rgba(0,0,0,0.04)',
  ] as Shadows;
};

// ── Theme ─────────────────────────────────────────────────────────────────────
export const theme = createTheme({
  palette: {
    primary: {
      main: tokens.rust,
      dark: tokens.rustDark,
      light: tokens.rustBg,
      contrastText: '#ffffff',
    },
    secondary: {
      main: tokens.purple,
      light: tokens.purpleBg,
      dark: '#4e1a96',
      contrastText: '#ffffff',
    },
    success: {
      main: tokens.green,
      light: tokens.greenBg,
      dark: '#0f5f2e',
      contrastText: '#ffffff',
    },
    error: {
      main: tokens.red,
      light: tokens.redBg,
      dark: '#8f1515',
      contrastText: '#ffffff',
    },
    warning: {
      main: tokens.amber,
      light: tokens.amberBg,
      dark: '#8c4007',
      contrastText: '#ffffff',
    },
    info: {
      main: tokens.blue,
      light: tokens.blueBg,
      dark: '#133a91',
      contrastText: '#ffffff',
    },
    text: {
      primary: tokens.t1,
      secondary: tokens.t2,
      disabled: tokens.t3,
    },
    background: {
      default: tokens.bg,
      paper: tokens.surface,
    },
    divider: tokens.bd0,
    grey: {
      50: tokens.bg,
      100: tokens.bgHover,
      200: tokens.bd1,
      300: tokens.bd0,
      400: tokens.t4,
      500: tokens.t3,
      600: tokens.t2,
      700: tokens.t1,
      800: '#0a0b0c',
      900: '#000000',
    },
  },

  typography: {
    fontFamily: tokens.fontSans,
    fontSize: 13,
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: { fontSize: '22px', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.3 },
    h2: { fontSize: '17px', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.4 },
    h3: { fontSize: '14px', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.4 },
    h4: { fontSize: '13.5px', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.4 },
    h5: { fontSize: '12.5px', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.4 },
    h6: { fontSize: '11.5px', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.4 },
    body1: { fontSize: '13.5px', fontWeight: 400, lineHeight: 1.6 },
    body2: { fontSize: '12.5px', fontWeight: 400, lineHeight: 1.5 },
    subtitle1: { fontSize: '13px', fontWeight: 500, letterSpacing: '-0.01em' },
    subtitle2: { fontSize: '12px', fontWeight: 500, letterSpacing: '-0.005em' },
    caption: {
      fontSize: '10.5px',
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.07em',
      color: tokens.t3,
    },
    overline: {
      fontSize: '9.5px',
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.09em',
      color: tokens.t4,
    },
    button: {
      fontSize: '12.5px',
      fontWeight: 600,
      textTransform: 'none' as const,
      letterSpacing: '-0.01em',
    },
  },

  shape: {
    borderRadius: tokens.rSm,
  },

  shadows: buildShadows(),

  breakpoints: {
    values: {
      xs: 0,
      sm: 1280,
      md: 1715,
      lg: 1921,
      xl: 2560,
    },
  },

  components: {
    // ── Link ─────────────────────────────────────────────────────────────────
    MuiLink: {
      styleOverrides: {
        root: {
          fontFamily: tokens.fontSans,
        },
      },
    },
    // ── Button ───────────────────────────────────────────────────────────────
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          height: 32,
          minWidth: 'unset',
          borderRadius: tokens.rSm,
          fontSize: '12.5px',
          fontWeight: 600,
          textTransform: 'none',
          letterSpacing: '-0.01em',
          padding: '0 14px',
          fontFamily: tokens.fontSans,
          transition: 'background 0.12s, border-color 0.12s, color 0.12s',
        },
        sizeSmall: { height: 26, fontSize: '11.5px', padding: '0 10px' },
        sizeLarge: { height: 38, fontSize: '13.5px', padding: '0 18px' },
        containedPrimary: {
          backgroundColor: tokens.rust,
          color: '#ffffff',
          '&:hover': { backgroundColor: tokens.rustDark },
        },
        outlinedPrimary: {
          borderColor: tokens.rust,
          color: tokens.rust,
          '&:hover': { backgroundColor: tokens.rustBg, borderColor: tokens.rust },
        },
        outlined: {
          borderColor: tokens.bd0,
          color: tokens.t2,
          '&:hover': { backgroundColor: tokens.bgHover, borderColor: tokens.t4 },
        },
        text: {
          color: tokens.t2,
          '&:hover': { backgroundColor: tokens.bgHover },
        },
      },
    },

    // ── IconButton ───────────────────────────────────────────────────────────
    MuiIconButton: {
      styleOverrides: {
        root: {
          width: 28,
          height: 28,
          borderRadius: tokens.rSm,
          color: tokens.t3,
          transition: 'color 0.12s, background 0.12s',
          '&:hover': { color: tokens.t2, backgroundColor: tokens.bgHover },
          '&.Mui-disabled': { opacity: 0.4, pointerEvents: 'auto' },
        },
        sizeSmall: { width: 24, height: 24 },
        sizeLarge: { width: 34, height: 34 },
      },
    },

    // ── Input / TextField ────────────────────────────────────────────────────
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          height: 34,
          backgroundColor: tokens.bg,
          borderRadius: tokens.rSm,
          fontSize: '12.5px',
          fontFamily: tokens.fontSans,
          color: tokens.t1,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.bd0,
            borderRadius: tokens.rSm,
          },
          '&:hover:not(.Mui-disabled) .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.t4,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.rust,
            borderWidth: 1,
          },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: tokens.red },
          '&.Mui-disabled': { opacity: 0.45 },
          '& input::placeholder': { color: tokens.t4, opacity: 1 },
        },
        input: { padding: '0 12px', height: '100%', boxSizing: 'border-box' as const },
        multiline: { height: 'auto', padding: '8px 12px' },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: '12.5px',
          color: tokens.t3,
          '&.Mui-focused': { color: tokens.rust },
          '&.Mui-error': { color: tokens.red },
        },
      },
    },

    MuiInput: {
      styleOverrides: {
        underline: {
          '&:hover:not(.Mui-disabled):before': { borderBottomColor: tokens.t4 },
          '&:after': { borderBottomColor: tokens.rust },
        },
      },
    },

    MuiTextField: {
      defaultProps: { size: 'small' },
    },

    MuiFormHelperText: {
      styleOverrides: {
        root: { fontSize: '11px', marginTop: 4, color: tokens.t3 },
      },
    },

    // ── Select ───────────────────────────────────────────────────────────────
    MuiSelect: {
      styleOverrides: {
        icon: { color: tokens.t3, right: 8 },
      },
    },

    // ── Autocomplete ─────────────────────────────────────────────────────────
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          borderRadius: tokens.rSm,
          boxShadow: tokens.shMd,
          border: `1px solid ${tokens.bd0}`,
          fontSize: '12.5px',
        },
        option: {
          fontSize: '12.5px',
          padding: '6px 12px',
          '&.Mui-focused': { backgroundColor: tokens.bgHover },
          '&[aria-selected="true"]': { backgroundColor: tokens.rustBg, color: tokens.rust },
        },
        listbox: { padding: '4px' },
        clearIndicator: { color: tokens.t3 },
        popupIndicator: { color: tokens.t3 },
      },
    },

    // ── Chip ─────────────────────────────────────────────────────────────────
    MuiChip: {
      styleOverrides: {
        root: {
          height: 22,
          borderRadius: tokens.rPill,
          fontSize: '11.5px',
          fontWeight: 500,
          fontFamily: tokens.fontSans,
          backgroundColor: tokens.bgHover,
          border: `1px solid ${tokens.bd0}`,
          color: tokens.t2,
          '&.MuiChip-colorPrimary': {
            backgroundColor: tokens.rustBg,
            borderColor: tokens.rustRing,
            color: tokens.rust,
          },
          '&.MuiChip-colorSuccess': {
            backgroundColor: tokens.greenBg,
            borderColor: tokens.greenBd,
            color: tokens.green,
          },
          '&.MuiChip-colorError': {
            backgroundColor: tokens.redBg,
            borderColor: tokens.redBd,
            color: tokens.red,
          },
          '&.MuiChip-colorWarning': {
            backgroundColor: tokens.amberBg,
            borderColor: tokens.amberBd,
            color: tokens.amber,
          },
          '&.MuiChip-colorInfo': {
            backgroundColor: tokens.blueBg,
            borderColor: tokens.blueBd,
            color: tokens.blue,
          },
          '&.MuiChip-colorSecondary': {
            backgroundColor: tokens.purpleBg,
            borderColor: tokens.purpleBd,
            color: tokens.purple,
          },
        },
        label: { padding: '0 8px', lineHeight: 'normal' },
        sizeSmall: { height: 18, fontSize: '10.5px' },
        deleteIcon: { color: tokens.t3, fontSize: 14, '&:hover': { color: tokens.t2 } },
      },
    },

    // ── Checkbox ─────────────────────────────────────────────────────────────
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: tokens.bd0,
          borderRadius: 4,
          padding: 6,
          '&.Mui-checked': { color: tokens.rust },
          '&.MuiCheckbox-indeterminate': { color: tokens.rust },
        },
      },
    },

    // ── Toggle button ────────────────────────────────────────────────────────
    MuiToggleButton: {
      styleOverrides: {
        root: {
          height: 32,
          padding: '0 12px',
          fontSize: '12.5px',
          fontWeight: 500,
          fontFamily: tokens.fontSans,
          textTransform: 'none',
          color: tokens.t2,
          borderColor: tokens.bd0,
          borderRadius: tokens.rSm,
          '&.Mui-selected': {
            backgroundColor: tokens.rustBg,
            color: tokens.rust,
            borderColor: tokens.rustRing,
            fontWeight: 600,
            '&:hover': { backgroundColor: tokens.rustBg },
          },
          '&:hover': { backgroundColor: tokens.bgHover },
          '&.Mui-disabled': { pointerEvents: 'auto', opacity: 0.45 },
        },
      },
    },

    // ── Accordion ────────────────────────────────────────────────────────────
    MuiAccordion: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          borderRadius: '0 !important',
          '&:before': { display: 'none' },
          '&.Mui-expanded': { margin: 0 },
        },
      },
    },

    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          minHeight: 40,
          padding: '0 16px',
          '&.Mui-expanded': { minHeight: 40 },
        },
        content: {
          margin: '0 !important',
          fontSize: '10.5px',
          fontWeight: 700,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.07em',
          color: tokens.t3,
        },
        expandIconWrapper: { color: tokens.t4 },
      },
    },

    MuiAccordionDetails: {
      styleOverrides: {
        root: { padding: 0 },
      },
    },

    // ── Tooltip ──────────────────────────────────────────────────────────────
    MuiTooltip: {
      defaultProps: { arrow: false, enterDelay: 400 },
      styleOverrides: {
        tooltip: {
          backgroundColor: tokens.t1,
          color: '#ffffff',
          fontSize: '11.5px',
          fontWeight: 500,
          fontFamily: tokens.fontSans,
          borderRadius: tokens.rSm,
          padding: '5px 9px',
          boxShadow: tokens.shMd,
        },
      },
    },

    // ── Alert ─────────────────────────────────────────────────────────────────
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: tokens.rSm,
          fontSize: '12.5px',
          fontFamily: tokens.fontSans,
          padding: '10px 14px',
          '& .MuiAlert-icon': { fontSize: 18, marginRight: 10, padding: 0, alignItems: 'center' },
        },
        standardSuccess: { backgroundColor: tokens.greenBg, color: tokens.green, borderLeft: `3px solid ${tokens.green}` },
        standardError: { backgroundColor: tokens.redBg, color: tokens.red, borderLeft: `3px solid ${tokens.red}` },
        standardWarning: { backgroundColor: tokens.amberBg, color: tokens.amber, borderLeft: `3px solid ${tokens.amber}` },
        standardInfo: { backgroundColor: tokens.blueBg, color: tokens.blue, borderLeft: `3px solid ${tokens.blue}` },
        message: { padding: 0, lineHeight: 1.5 },
        icon: { padding: 0 },
      },
    },

    // ── Dialog ────────────────────────────────────────────────────────────────
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: tokens.rMd,
          boxShadow: tokens.shLg,
          border: `1px solid ${tokens.bd0}`,
        },
        container: {
          backdropFilter: 'blur(2px)',
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '15px',
          fontWeight: 600,
          letterSpacing: '-0.02em',
          padding: '16px 20px',
          borderBottom: `1px solid ${tokens.bd0}`,
          color: tokens.t1,
        },
      },
    },

    MuiDialogContent: {
      styleOverrides: {
        root: { padding: '20px', fontSize: '13px', color: tokens.t2 },
      },
    },

    MuiDialogActions: {
      styleOverrides: {
        root: { padding: '12px 20px', borderTop: `1px solid ${tokens.bd0}`, gap: 8 },
      },
    },

    // ── Drawer ────────────────────────────────────────────────────────────────
    // Right-anchored drawers are offset below the fixed top nav (which sits at
    // theme.zIndex.drawer + 1). Without this the nav covers the top 48px of the
    // drawer, hiding its header and "Back to …" control. Only the right anchor
    // is offset — left/top/bottom anchored and docked-left drawers (e.g. the
    // design-system page's permanent sidebar) keep MUI's default geometry.
    MuiDrawer: {
      styleOverrides: {
        paper: {
          boxShadow: tokens.shLg,
          border: 'none',
          borderLeft: `1px solid ${tokens.bd0}`,
        },
        // MUI's drawer paper is `position: fixed; top: 0; height: 100%`, so the
        // height must shrink by the same amount the paper is pushed down or it
        // overflows past the bottom of the viewport.
        paperAnchorRight: {
          top: TOP_NAV_HEIGHT,
          height: `calc(100% - ${TOP_NAV_HEIGHT}px)`,
        },
        // The modal root and its backdrop are both `position: fixed; inset: 0`,
        // and the backdrop is fixed to the viewport rather than to the root, so
        // both need the offset for the nav to stay clickable while open.
        root: {
          '&.MuiDrawer-modal.MuiDrawer-anchorRight': {
            top: TOP_NAV_HEIGHT,
            '& .MuiBackdrop-root': {
              top: TOP_NAV_HEIGHT,
            },
          },
        },
      },
    },

    // ── Paper / Card ──────────────────────────────────────────────────────────
    MuiPaper: {
      defaultProps: { elevation: 2 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: tokens.rMd,
        },
        elevation1: { boxShadow: tokens.shXs, border: `1px solid ${tokens.bd0}` },
        elevation2: { boxShadow: tokens.shSm, border: `1px solid ${tokens.bd0}` },
        elevation4: { boxShadow: tokens.shMd },
        elevation8: { boxShadow: tokens.shLg },
      },
    },

    // ── Popover ───────────────────────────────────────────────────────────────
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: tokens.rSm,
          boxShadow: tokens.shMd,
          border: `1px solid ${tokens.bd0}`,
        },
      },
    },

    // ── Menu ─────────────────────────────────────────────────────────────────
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: tokens.rSm,
          boxShadow: tokens.shMd,
          border: `1px solid ${tokens.bd0}`,
          minWidth: 160,
        },
        list: { padding: '4px' },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 3,
          fontSize: '12.5px',
          fontWeight: 500,
          color: tokens.t2,
          padding: '6px 10px',
          minHeight: 'unset',
          '&:hover': { backgroundColor: tokens.bgHover, color: tokens.t1 },
          '&.Mui-selected': { backgroundColor: tokens.rustBg, color: tokens.rust },
        },
      },
    },

    // ── List ─────────────────────────────────────────────────────────────────
    MuiListItem: {
      styleOverrides: {
        root: { padding: '5px 12px' },
      },
    },

    MuiListItemText: {
      styleOverrides: {
        primary: { fontSize: '12.5px', fontWeight: 500, color: tokens.t1 },
        secondary: { fontSize: '11.5px', color: tokens.t3 },
      },
    },

    // ── Badge ────────────────────────────────────────────────────────────────
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontSize: '10px',
          fontWeight: 700,
          minWidth: 16,
          height: 16,
          borderRadius: 8,
          padding: '0 4px',
          fontFamily: tokens.fontMono,
        },
      },
    },

    // ── CircularProgress ─────────────────────────────────────────────────────
    MuiCircularProgress: {
      defaultProps: { size: 20 },
      styleOverrides: {
        root: { color: tokens.rust },
      },
    },

    // ── Divider ───────────────────────────────────────────────────────────────
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: tokens.bd0 },
      },
    },

    // ── Tabs ─────────────────────────────────────────────────────────────────
    MuiTab: {
      styleOverrides: {
        root: {
          fontSize: '12.5px',
          fontWeight: 500,
          textTransform: 'none',
          letterSpacing: '-0.01em',
          color: tokens.t3,
          minHeight: 40,
          padding: '0 16px',
          '&.Mui-selected': { color: tokens.rust, fontWeight: 600 },
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: tokens.rust, height: 2 },
        root: { minHeight: 40, borderBottom: `1px solid ${tokens.bd0}` },
      },
    },

    // ── Table ─────────────────────────────────────────────────────────────────
    // Hairline style: horizontal-only dividers at barely-perceptible opacity.
    // No zebra striping, no vertical borders. Selected row uses a 3px rust
    // inset shadow — never rust as a background fill.
    MuiTableCell: {
      styleOverrides: {
        root: {
          // Near-invisible horizontal divider — structure implied by alignment
          borderColor: 'rgba(0,0,0,0.045)',
          fontSize: '12.5px',
          color: tokens.t1,
          fontFamily: tokens.fontSans,
          padding: '8px 16px',
        },
        head: {
          fontSize: '10.5px',
          fontWeight: 700,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.08em',
          color: tokens.t3,
          // Single thin header underline — not the thicker double-line default
          borderBottom: `1px solid ${tokens.bd0}`,
          backgroundColor: 'transparent',
          padding: '6px 16px',
        },
        // stickyHeader must have a solid bg so it doesn't bleed on scroll
        stickyHeader: {
          backgroundColor: tokens.surface,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          // Remove bottom border on last body row so table doesn't double-border
          '&:last-child td, &:last-child th': { border: 0 },
          '&:hover:not(.MuiTableRow-head)': {
            backgroundColor: 'rgba(0,0,0,0.018)',
          },
        },
      },
    },
  },
});

// ── CSS custom properties (global) ───────────────────────────────────────────
// Injected on :root so CSS files and styled() with raw CSS can reference them.
const globalTokenStyles = {
  ':root': {
    '--surface': tokens.surface,
    '--bg': tokens.bg,
    '--bg-hover': tokens.bgHover,
    '--bd0': tokens.bd0,
    '--bd1': tokens.bd1,
    '--bd2': tokens.bd2,
    '--t1': tokens.t1,
    '--t2': tokens.t2,
    '--t3': tokens.t3,
    '--t4': tokens.t4,
    '--rust': tokens.rust,
    '--rust-dark': tokens.rustDark,
    '--rust-bg': tokens.rustBg,
    '--rust-ring': tokens.rustRing,
    '--green': tokens.green,
    '--green-bg': tokens.greenBg,
    '--green-bd': tokens.greenBd,
    '--blue': tokens.blue,
    '--blue-bg': tokens.blueBg,
    '--blue-bd': tokens.blueBd,
    '--purple': tokens.purple,
    '--purple-bg': tokens.purpleBg,
    '--purple-bd': tokens.purpleBd,
    '--amber': tokens.amber,
    '--amber-bg': tokens.amberBg,
    '--amber-bd': tokens.amberBd,
    '--red': tokens.red,
    '--red-bg': tokens.redBg,
    '--red-bd': tokens.redBd,
    '--sh-xs': tokens.shXs,
    '--sh-sm': tokens.shSm,
    '--sh-md': tokens.shMd,
    '--sh-lg': tokens.shLg,
    '--sh-sel': tokens.shSel,
    '--r-sm': `${tokens.rSm}px`,
    '--r-md': `${tokens.rMd}px`,
    '--r-pill': `${tokens.rPill}px`,
    '--font-sans': tokens.fontSans,
    '--font-mono': tokens.fontMono,
  },
  // Apply the design-system font stack to the document body so all elements
  // inherit Manrope by default — without this, non-MUI elements fall back to
  // the browser default (typically Times New Roman).
  body: {
    fontFamily: tokens.fontSans,
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
  },
  '*::-webkit-scrollbar': { width: '3px', height: '3px' },
  '*::-webkit-scrollbar-track': { background: 'transparent' },
  '*::-webkit-scrollbar-thumb': { background: tokens.bd0, borderRadius: '3px' },
};

export interface IThemeProps {
  children: React.ReactNode;
}

export const Theme = ({ children }: IThemeProps) => {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles styles={globalTokenStyles} />
      {children}
    </ThemeProvider>
  );
};
