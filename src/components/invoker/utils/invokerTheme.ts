// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Scoped MUI theme for the invoker result area.
 *
 * Inherits from the global app theme but overrides only the components
 * that appear inside the invoker result tables — flattening the pill-shaped
 * inputs and the orange toggle button back to the neutral component-theme palette style.
 *
 * This theme is applied via a scoped <ThemeProvider> wrapping the results
 * panel in FunctionDetailScreen.tsx so global defaults are untouched.
 */
import { createTheme } from '@mui/material/styles';
import { theme as appTheme } from '@/components/theme-provider/ThemeProvider';
import { componentTheme } from '@/pages/x/apps/componentTheme';

export const invokerTheme = createTheme(appTheme, {
  components: {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          height: 28,
          borderRadius: componentTheme.radiusSm,
          fontSize: 12,
          fontFamily: componentTheme.fontSans,
          '& fieldset': {
            borderColor: componentTheme.borderDefault,
            borderRadius: componentTheme.radiusSm,
          },
          '&:hover fieldset': { borderColor: componentTheme.fgSubtle },
          '&.Mui-focused fieldset': {
            borderColor: componentTheme.accent,
            borderWidth: 2,
          },
        },
        input: { padding: '0 8px' },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          border: `1px solid ${componentTheme.borderDefault}`,
          borderRadius: componentTheme.radiusSm,
          overflow: 'hidden',
          height: 28,
          background: componentTheme.bgDefault,
        },
        grouped: {
          border: 0,
          '&:not(:last-of-type)': {
            borderRight: `1px solid ${componentTheme.borderDefault}`,
          },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          height: 28,
          padding: '0 10px',
          fontSize: 12,
          fontWeight: 500,
          fontFamily: componentTheme.fontSans,
          color: componentTheme.fgMuted,
          textTransform: 'none',
          borderRadius: 0,
          '&.Mui-selected': {
            background: componentTheme.bgInset,
            color: componentTheme.fgDefault,
            fontWeight: 600,
            '&:hover': { background: componentTheme.bgInset },
          },
          '&:hover': {
            background: componentTheme.bgSubtle,
            color: componentTheme.fgDefault,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          height: 18,
          borderRadius: componentTheme.radiusSm,
          fontSize: 11,
          fontWeight: 500,
          fontFamily: componentTheme.fontSans,
          background: componentTheme.bgInset,
          border: `1px solid ${componentTheme.borderSubtle}`,
          color: componentTheme.fgMuted,
        },
        label: { padding: '0 7px' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          height: 28,
          padding: '0 10px',
          borderRadius: componentTheme.radiusSm,
          fontSize: 12,
          fontWeight: 500,
          textTransform: 'none',
          minWidth: 'unset',
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontSize: 12,
          fontFamily: componentTheme.fontSans,
          color: componentTheme.fgDefault,
          borderRadius: componentTheme.radiusSm,
        },
        input: {
          padding: '0 8px',
          height: 28,
          boxSizing: 'border-box' as const,
          '&::placeholder': { color: componentTheme.fgSubtle, opacity: 1 },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputBase-root': {
            height: 28,
            borderRadius: componentTheme.radiusSm,
            fontSize: 12,
            fontFamily: componentTheme.fontSans,
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: componentTheme.borderDefault,
            borderRadius: componentTheme.radiusSm,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: componentTheme.fgSubtle,
          },
          '& .Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: componentTheme.accent,
          },
        },
      },
    },
  },
});
