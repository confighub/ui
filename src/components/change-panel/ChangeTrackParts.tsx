// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Small parts the change panel is drawn with: its notices (the theme's Alert tint with a
 * 1px border in the tone and no left-hand border, D20), its text links, and the label of a
 * Space group.
 */
import type { ReactNode } from 'react';
import Alert, { type AlertProps } from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { changeOrderInk, changeOrderType } from '@/pages/change-orders/changeOrdersTokens';
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { cutSx, monoSx } from './panelStyles';

const NOTICE_BORDER: Record<string, string> = {
  info: tokens.blueBd,
  warning: tokens.amberBd,
  error: tokens.redBd,
  success: tokens.greenBd,
};

/** A panel notice: the theme's Alert tint, a 1px border in its tone, no left-hand border. */
export function PanelNotice({ sx, severity = 'info', ...props }: AlertProps) {
  return <Alert severity={severity} {...props} sx={{ border: `1px solid ${NOTICE_BORDER[severity] ?? tokens.bd0}`, ...sx }} />;
}

/** A text button in rust (or muted), as the panel's links read; with `href`, a real link. */
export function PanelLink({
  children,
  muted = false,
  small = false,
  href,
  onClick,
  testId,
  expanded,
  title,
  wrap = false,
}: {
  /** A name inside running text: it wraps anywhere instead of running past its box. */
  wrap?: boolean;
  children: ReactNode;
  muted?: boolean;
  small?: boolean;
  href?: string;
  onClick?: () => void;
  testId?: string;
  expanded?: boolean;
  title?: string;
}) {
  const sx = {
    color: muted ? tokens.t2 : tokens.rust,
    fontWeight: muted ? changeOrderType.weight.medium : changeOrderType.weight.semibold,
    fontSize: small ? changeOrderType.size.small : changeOrderType.size.body,
    background: 'none',
    border: 0,
    padding: 0,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    '&:hover': { textDecoration: 'underline' },
    ...(wrap ? { display: 'inline', whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word', textAlign: 'left' } : {}),
  } as const;
  if (href !== undefined) {
    return (
      <Box component="a" href={href} data-testid={testId} title={title} sx={sx} onClick={onClick}>
        {children}
      </Box>
    );
  }
  return (
    <Box component="button" type="button" data-testid={testId} title={title} aria-expanded={expanded} onClick={onClick} sx={sx}>
      {children}
    </Box>
  );
}

/** A Space group's label: the folder mark, the Space, and what else the caller puts beside it. */
export function VariantGroupLabel({ slug, icon, children }: { slug: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, padding: '10px 16px 4px', fontSize: 12, color: tokens.t2, flexWrap: 'wrap', minWidth: 0 }}>
      {icon}
      <Box component="span" sx={{ ...monoSx, color: changeOrderInk.default, fontWeight: changeOrderType.weight.semibold, ...cutSx }}>
        {slug}
      </Box>
      {children}
    </Box>
  );
}
