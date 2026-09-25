// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useRef, useState } from 'react';

import { type ExtendedUnitRead } from '@confighub/rtk-query';

import AppsIcon from '@mui/icons-material/Apps';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FolderCopyIcon from '@mui/icons-material/FolderCopy';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LanIcon from '@mui/icons-material/Lan';
import StorageIcon from '@mui/icons-material/Storage';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Available grouping options for the unit hierarchy tree.
 * - none: Flat list with no grouping
 * - app: Groups units by the "app" label
 * - environment: Groups units by the "environment" label
 * - app>environment: Groups by app then environment
 * - environment>app: Groups by environment then app
 */
export type GroupByOption =
  | 'none'
  | 'app'
  | 'cluster'
  | 'environment'
  | 'space'
  | 'target'
  | 'app>environment'
  | 'environment>app';

export interface GroupByConfig {
  value: GroupByOption;
  label: string;
  icon: React.ReactNode;
  /** For label-based grouping, the reserved label key to group by */
  labelKey?: string;
}

export interface GroupBySelectorProps {
  /** Currently selected grouping option */
  groupBy: GroupByOption;
  /** Callback when grouping option changes */
  onGroupByChange: (groupBy: GroupByOption) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Checkbox options shown in the dropdown */
type CheckboxOption = 'app' | 'environment' | 'space' | 'target';

const CHECKBOX_OPTIONS: { value: CheckboxOption; label: string; icon: React.ReactNode }[] = [
  { value: 'space', label: 'Space', icon: <FolderCopyIcon /> },
  { value: 'target', label: 'Target', icon: <StorageIcon /> },
  { value: 'app', label: 'App', icon: <AppsIcon /> },
  { value: 'environment', label: 'Environment', icon: <LanIcon /> },
];

/**
 * Configuration for each grouping option
 */
export const GROUP_BY_CONFIGS: Record<GroupByOption, GroupByConfig> = {
  none: {
    value: 'none',
    label: 'None',
    icon: <AppsIcon />,
  },
  cluster: {
    value: 'cluster',
    label: 'Cluster',
    icon: <AppsIcon />,
    labelKey: 'cluster',
  },
  space: {
    value: 'space',
    label: 'Space',
    icon: <FolderCopyIcon />,
  },
  target: {
    value: 'target',
    label: 'Target',
    icon: <StorageIcon />,
  },
  app: {
    value: 'app',
    label: 'App',
    icon: <AppsIcon />,
    labelKey: 'app',
  },
  environment: {
    value: 'environment',
    label: 'Environment',
    icon: <LanIcon />,
    labelKey: 'environment',
  },
  'app>environment': {
    value: 'app>environment',
    label: 'App > Environment',
    icon: <AppsIcon />,
  },
  'environment>app': {
    value: 'environment>app',
    label: 'Environment > App',
    icon: <LanIcon />,
  },
};

/**
 * Returns the grouping key for a unit under a given GroupByOption.
 * Used by both the flow graph and the context-add dropdown.
 */
export const getGroupValue = (unit: ExtendedUnitRead, groupBy: GroupByOption): string | undefined => {
  if (groupBy === 'space') return unit.Space?.Slug ?? unit.Space?.SpaceID;
  if (groupBy === 'target') return unit.Target?.Slug ?? unit.Target?.TargetID;
  const labelKey = GROUP_BY_CONFIGS[groupBy]?.labelKey;
  if (labelKey) return unit.Unit?.Labels?.[labelKey];
  return undefined;
};

/**
 * Derives which checkboxes are checked from the current GroupByOption.
 */
const getCheckedFromGroupBy = (groupBy: GroupByOption): Set<CheckboxOption> => {
  switch (groupBy) {
    case 'app':
      return new Set(['app']);
    case 'environment':
      return new Set(['environment']);
    case 'space':
      return new Set(['space']);
    case 'target':
      return new Set(['target']);
    default:
      return new Set();
  }
};

/**
 * Gets the display label for the current grouping shown on the button.
 */
const getDisplayLabel = (groupBy: GroupByOption): string => {
  switch (groupBy) {
    case 'space':
      return 'Space';
    case 'target':
      return 'Target';
    case 'app':
      return 'App';
    case 'environment':
      return 'Environment';
    case 'app>environment':
      return 'App > Environment';
    case 'environment>app':
      return 'Environment > App';
    default:
      return 'None';
  }
};

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const TextButton = styled('button')<{ $disabled?: boolean; $open?: boolean }>(
  ({ theme, $disabled, $open }) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: theme.spacing(0.5, 0.75),
    margin: theme.spacing(-0.5, -0.75),
    backgroundColor: $open ? alpha(theme.palette.action.active, 0.08) : 'transparent',
    border: 'none',
    borderRadius: 4,
    color: theme.palette.text.secondary,
    fontSize: '0.8125rem',
    fontWeight: 500,
    fontFamily: 'var(--font-sans)',
    cursor: $disabled ? 'not-allowed' : 'pointer',
    opacity: $disabled ? 0.5 : 1,
    transition: 'all 0.15s ease-in-out',
    '&:hover': {
      backgroundColor: $disabled ? 'transparent' : alpha(theme.palette.action.active, 0.08),
    },
  }),
);

const DropdownMenu = styled(Paper)(({ theme }) => ({
  marginTop: 4,
  minWidth: 180,
  borderRadius: 8,
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.12)',
  overflow: 'hidden',
}));

const StyledMenuItem = styled(MenuItem)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0.5, 1.5),
  minHeight: 36,
  fontSize: '0.8125rem',
  color: theme.palette.text.secondary,
  '&:hover': {
    backgroundColor: alpha(theme.palette.action.hover, 0.08),
    color: theme.palette.text.primary,
  },
  '& .MuiListItemIcon-root': {
    minWidth: 28,
    color: 'inherit',
    '& svg': {
      fontSize: 18,
    },
  },
}));

const BreadcrumbDisplay = styled(Box)(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  color: theme.palette.text.primary,
  fontWeight: 500,
}));

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * GroupBySelector component - checkbox-based dropdown for selecting
 * how units should be grouped in the hierarchy tree.
 *
 * Only App and Environment are available as grouping options.
 * Checking one applies a single grouping. Checking both applies a
 * two-level hierarchy based on the order they were selected.
 * A breadcrumb shows the current grouping hierarchy.
 */
export const GroupBySelector = memo(
  ({ groupBy, onGroupByChange, disabled = false }: GroupBySelectorProps) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const open = Boolean(anchorEl);

    const checked = getCheckedFromGroupBy(groupBy);

    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!disabled) {
          setAnchorEl(event.currentTarget);
        }
      },
      [disabled],
    );

    const handleClose = useCallback(() => {
      setAnchorEl(null);
      buttonRef.current?.focus();
    }, []);

    const handleToggle = useCallback(
      (option: CheckboxOption) => {
        const isCurrentlyChecked = checked.has(option);
        onGroupByChange(isCurrentlyChecked ? 'none' : option);
      },
      [checked, onGroupByChange],
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          handleClose();
        }
      },
      [handleClose],
    );

    const handleButtonKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (
          (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') &&
          !disabled
        ) {
          event.preventDefault();
          setAnchorEl(event.currentTarget as HTMLButtonElement);
        }
      },
      [disabled],
    );

    const displayLabel = getDisplayLabel(groupBy);

    return (
      <>
        <TextButton
          ref={buttonRef}
          onClick={handleClick}
          onKeyDown={handleButtonKeyDown}
          $disabled={disabled}
          $open={open}
          disabled={disabled}
          aria-haspopup='listbox'
          aria-expanded={open}
          aria-label={`Grouping: ${displayLabel}`}
        >
          <Typography variant='body2' color='text.secondary'>
            Grouping:
          </Typography>
          {groupBy !== 'none' ? (
            <BreadcrumbDisplay>
              <Typography variant='body2' fontWeight={500}>
                {getDisplayLabel(groupBy)}
              </Typography>
              {groupBy === 'app>environment' && (
                <>
                  <ChevronRightIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                  <Typography variant='body2' fontWeight={500}>
                    Environment
                  </Typography>
                </>
              )}
              {groupBy === 'environment>app' && (
                <>
                  <ChevronRightIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                  <Typography variant='body2' fontWeight={500}>
                    App
                  </Typography>
                </>
              )}
            </BreadcrumbDisplay>
          ) : (
            <Typography variant='body2' fontWeight={500}>
              None
            </Typography>
          )}
          <KeyboardArrowDownIcon
            sx={{
              fontSize: 18,
              color: 'text.disabled',
              transition: 'transform 0.15s ease-in-out',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </TextButton>

        <Popper
          open={open}
          anchorEl={anchorEl}
          placement='bottom-start'
          style={{ zIndex: 1300 }}
        >
          <ClickAwayListener onClickAway={handleClose}>
            <DropdownMenu onKeyDown={handleKeyDown}>
              <MenuList dense>
                <StyledMenuItem
                  selected={groupBy === 'none'}
                  onClick={() => {
                    onGroupByChange('none');
                    handleClose();
                  }}
                >
                  <ListItemText
                    primary='None'
                    slotProps={{ primary: { fontSize: '0.8125rem' } }}
                  />
                </StyledMenuItem>
                <Divider />
                {CHECKBOX_OPTIONS.map(({ value, label, icon }) => {
                  const isChecked = checked.has(value);

                  return (
                    <StyledMenuItem key={value} onClick={() => handleToggle(value)}>
                      <Checkbox
                        size='small'
                        checked={isChecked}
                        tabIndex={-1}
                        disableRipple
                        sx={{ padding: 0, marginRight: 1 }}
                      />
                      <ListItemIcon>{icon}</ListItemIcon>
                      <ListItemText
                        primary={label}
                        slotProps={{ primary: { fontSize: '0.8125rem' } }}
                      />
                    </StyledMenuItem>
                  );
                })}
              </MenuList>
            </DropdownMenu>
          </ClickAwayListener>
        </Popper>
      </>
    );
  },
);

GroupBySelector.displayName = 'GroupBySelector';
