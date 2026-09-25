// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';

import { Ellipses, TruncatedTooltip } from '@/components/styled';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, styled, useTheme } from '@mui/material/styles';

// ============================================================================
// TYPES
// ============================================================================

export type StatusCardSeverity = 'default' | 'warning' | 'error' | 'success' | 'info';

export interface IStatusCardProps {
  label: string;
  value: number;
  subtitle?: string;
  icon?: React.ReactNode;
  severity?: StatusCardSeverity;
  onClick?: () => void;
  isActive?: boolean;
}

// ============================================================================
// STYLED
// ============================================================================

const CardRoot = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(1),
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
  boxShadow: 'none',
  backgroundColor: theme.palette.background.paper,
  cursor: 'pointer',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
  '&:hover': {
    transform: 'translateY(-1px)',
    boxShadow:
      theme.palette.mode === 'dark'
        ? '0 8px 24px rgba(0, 0, 0, 0.4)'
        : '0 8px 24px rgba(0, 0, 0, 0.10)',
    borderColor: alpha(theme.palette.primary.main, 0.35),
  },
}));

export const CardGrid = styled(Box)<{ $columns: number }>(({ theme, $columns }) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${$columns}, 1fr)`,
  gap: theme.spacing(2),
}));

// ============================================================================
// COMPONENT
// ============================================================================

export const StatusCard = ({
  label,
  value,
  subtitle,
  icon,
  severity = 'default',
  onClick,
  isActive = false,
}: IStatusCardProps) => {
  const theme = useTheme();
  const [isTruncated, setIsTruncated] = useState(false);

  const textRef = useCallback((node: HTMLElement | null) => {
    if (node) {
      setIsTruncated(node.scrollWidth > node.clientWidth);
    }
  }, []);

  const colorMap = useMemo<Record<StatusCardSeverity, string>>(
    () => ({
      default: theme.palette.text.secondary,
      warning: theme.palette.warning.main,
      error: theme.palette.error.main,
      success: theme.palette.success.main,
      info: theme.palette.info.main,
    }),
    [theme],
  );

  const color = colorMap[severity];
  const isColored = severity !== 'default' && value > 0;

  const activeColor = theme.palette.warning.main;

  return (
    <CardRoot
      onClick={onClick}
      sx={
        isActive
          ? {
              outline: `2px solid ${activeColor}`,
              outlineOffset: '-1px',
              backgroundColor: alpha(activeColor, 0.06),
            }
          : undefined
      }
    >
      {/* Top row: label + icon */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <TruncatedTooltip title={label}>
          <Ellipses
            variant='caption'
            color='text.secondary'
            fontWeight={600}
            sx={{ letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.68rem' }}
          >
            {label}
          </Ellipses>
        </TruncatedTooltip>
        {icon && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              borderRadius: '9px',
              backgroundColor: alpha(color, 0.1),
              color,
              flexShrink: 0,
              '& svg': { fontSize: 18 },
            }}
          >
            {icon}
          </Box>
        )}
      </Box>

      {/* Value */}
      <Typography
        variant='h5'
        fontWeight={700}
        color={isColored ? color : 'text.primary'}
        sx={{ lineHeight: 0.5 }}
      >
        {value.toLocaleString()}
      </Typography>

      {/* Subtitle */}
      <Tooltip title={subtitle} placement='top' disableHoverListener={!isTruncated}>
        <Ellipses
          ref={textRef}
          variant='caption'
          color='text.disabled'
          sx={{ lineHeight: 1.4 }}
        >
          {subtitle ?? '\u00A0'}
        </Ellipses>
      </Tooltip>
    </CardRoot>
  );
};
