// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';

export interface IncludeHiddenToggleProps {
  includeHidden: boolean;
  onChange: (include: boolean) => void;
  /** The plural of what the list shows, for the tooltip, such as `units`. */
  entities: string;
}

/**
 * The toolbar toggle that adds hidden entities to a list. It matches the data grid's
 * Columns button, so it sits in a grid toolbar or a console filter bar alike.
 */
export const IncludeHiddenToggle = ({
  includeHidden,
  onChange,
  entities,
}: IncludeHiddenToggleProps) => (
  <Tooltip
    arrow
    placement='top'
    title={
      includeHidden
        ? `Hidden ${entities} are listed`
        : `Also list hidden ${entities}, such as those that hold the configuration of other entities`
    }
  >
    <Button
      size='small'
      variant='text'
      aria-pressed={includeHidden}
      data-testid='include-hidden-toggle'
      onClick={() => onChange(!includeHidden)}
      startIcon={includeHidden ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
      sx={(theme) => ({
        fontSize: '0.75rem',
        fontWeight: 500,
        textTransform: 'none',
        height: 32,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        color: includeHidden ? theme.palette.primary.main : theme.palette.text.secondary,
        backgroundColor: includeHidden ? theme.palette.primary.light : 'transparent',
        border: `1px solid ${includeHidden ? theme.palette.primary.main : theme.palette.divider}`,
        padding: theme.spacing(0.5, 1.5),
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          color: includeHidden ? theme.palette.primary.dark : theme.palette.text.primary,
          backgroundColor: includeHidden
            ? theme.palette.primary.light
            : theme.palette.grey[200],
          borderColor: includeHidden ? theme.palette.primary.dark : theme.palette.grey[400],
        },
        '& .MuiButton-startIcon': { marginRight: '4px' },
        '& svg': { fontSize: '18px !important' },
      })}
    >
      Hidden
    </Button>
  </Tooltip>
);
