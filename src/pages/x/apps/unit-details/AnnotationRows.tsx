// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { componentTheme } from '../componentTheme';

export interface AnnotationRowsProps {
  annotations: Record<string, string>;
  onAnnotationDeleted: (item: { key: string; value: string }) => void;
  onAnnotationAddClicked: (anchorEl: HTMLElement) => void;
  onAnnotationEditClicked?: (anchorEl: HTMLElement, key: string, value: string) => void;
  disabled?: boolean;
}

export const AnnotationRows = ({
  annotations,
  onAnnotationDeleted,
  onAnnotationAddClicked,
  onAnnotationEditClicked,
  disabled = false,
}: AnnotationRowsProps) => {
  const entries = useMemo(() => Object.entries(annotations ?? {}), [annotations]);

  if (entries.length === 0 && disabled) {
    return (
      <Typography sx={{ fontSize: 12, fontStyle: 'italic', color: componentTheme.fgSubtle, fontFamily: componentTheme.fontSans }}>
        No annotations
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {entries.length > 0 && (
        <Box
          sx={{
            borderRadius: `${componentTheme.radiusMd}px`,
            border: `1px solid ${componentTheme.borderMuted}`,
            overflow: 'hidden',
          }}
        >
          {entries.map(([key, value], i) => (
            <Box
              key={key}
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'start',
                gap: 0,
                px: '10px',
                py: '7px',
                borderTop: i > 0 ? `1px solid ${componentTheme.borderSubtle}` : 'none',
                background: componentTheme.bgDefault,
                '&:hover': { background: componentTheme.bgSubtle },
                '& .ann-actions': { opacity: 0 },
                '&:hover .ann-actions': { opacity: 1 },
                cursor: !disabled && onAnnotationEditClicked ? 'pointer' : 'default',
              }}
              onClick={!disabled && onAnnotationEditClicked ? (e) => onAnnotationEditClicked(e.currentTarget, key, String(value)) : undefined}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontFamily: componentTheme.fontMono,
                    fontSize: 10,
                    fontWeight: 500,
                    color: componentTheme.fgSubtle,
                    letterSpacing: '0.01em',
                    lineHeight: 1.4,
                    wordBreak: 'break-all',
                  }}
                >
                  {key}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: componentTheme.fontMono,
                    fontSize: 12,
                    color: componentTheme.fgDefault,
                    lineHeight: 1.5,
                    wordBreak: 'break-all',
                    mt: '1px',
                  }}
                >
                  {String(value)}
                </Typography>
              </Box>

              {!disabled && (
                <Box className='ann-actions' sx={{ display: 'flex', alignItems: 'center', mt: '2px', transition: 'opacity 0.12s' }}>
                  {onAnnotationEditClicked && (
                    <Tooltip title='Edit' placement='top'>
                      <IconButton
                        size='small'
                        aria-label={`Edit annotation ${key}`}
                        onClick={(e) => { e.stopPropagation(); onAnnotationEditClicked(e.currentTarget, key, String(value)); }}
                        sx={{ p: '3px', color: componentTheme.fgSubtle, '&:hover': { color: componentTheme.accent, background: componentTheme.accentMuted } }}
                      >
                        <EditOutlinedIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title='Remove' placement='top'>
                    <IconButton
                      size='small'
                      aria-label={`Remove annotation ${key}`}
                      onClick={(e) => { e.stopPropagation(); onAnnotationDeleted({ key, value: String(value) }); }}
                      sx={{ p: '3px', color: componentTheme.fgSubtle, '&:hover': { color: componentTheme.danger, background: componentTheme.dangerMuted } }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {!disabled && (
        <Button
          variant='text'
          size='small'
          startIcon={<AddIcon sx={{ fontSize: 14 }} />}
          onClick={(e) => onAnnotationAddClicked(e.currentTarget)}
          sx={{
            alignSelf: 'flex-start',
            textTransform: 'none',
            fontWeight: 600,
            fontSize: 11,
            color: componentTheme.fgMuted,
            pl: 0,
            pr: 1,
            '&:hover': { backgroundColor: 'transparent', color: componentTheme.fgDefault },
          }}
        >
          Add annotation
        </Button>
      )}

      {entries.length === 0 && (
        <Typography sx={{ fontSize: 12, fontStyle: 'italic', color: componentTheme.fgSubtle, fontFamily: componentTheme.fontSans }}>
          No annotations
        </Typography>
      )}
    </Box>
  );
};
