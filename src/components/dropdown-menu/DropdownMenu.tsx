// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { fadeIn } from '@/components/styled';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import type { SelectChangeEvent } from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import type { SxProps, Theme } from '@mui/material/styles';

export interface DropdownMenuItem {
  label: string;
  value: string;
  disabled?: boolean;
  tooltip?: string;
  /** Optional group label to visually cluster related items with a subheader */
  group?: string;
  /** Optional icon rendered before the label */
  icon?: React.ReactNode;
}

export interface DropdownMenuProps {
  label: string;
  items: DropdownMenuItem[];
  onChange: (event: SelectChangeEvent<string>) => void;
  emptyOption?: boolean;
  emptyOptionLabel?: string;
  ariaLabel?: string;
  size?: 'small' | 'medium';
  minWidth?: string;
  width?: string;
  sx?: SxProps<Theme>;
  className?: string;
  disabled?: boolean;
  disabledTooltip?: string;
}

/**
 * DropdownMenu - A Material-UI Menu-based dropdown component that replaces Select components
 * for action-triggering scenarios. Provides a button that opens a menu with selectable items.
 *
 * @param label - The text displayed on the button
 * @param items - Array of menu items with label, value, and optional disabled/tooltip properties
 * @param onChange - Callback function called when an item is selected
 * @param emptyOption - Whether to include an empty option at the top
 * @param emptyOptionLabel - Label for the empty option
 * @param ariaLabel - Accessibility label for the button
 * @param size - Button size, defaults to 'small'
 * @param minWidth - Minimum width for both button and menu
 * @param width - Fixed width for the menu (button uses minWidth)
 * @param sx - Additional styling props
 * @param className - CSS class name for styled-components integration
 */
export const DropdownMenu = ({
  label,
  onChange,
  items,
  size = 'small',
  minWidth = '100px',
  width,
  sx,
  emptyOption = false,
  emptyOptionLabel = '',
  ariaLabel,
  className,
  disabled = false,
  disabledTooltip = '',
}: DropdownMenuProps) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isOpen = Boolean(anchorEl);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    if (!disabled) {
      setAnchorEl(event.currentTarget);
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleItemClick = (itemValue: string) => {
    const syntheticEvent = {
      target: { value: itemValue },
    } as SelectChangeEvent<string>;

    onChange(syntheticEvent);
    handleClose();
  };

  const button = (
    <Button
      size={size}
      disabled={disabled}
      endIcon={
        <KeyboardArrowDownIcon
          sx={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            marginBottom: '2px',
          }}
        />
      }
      onClick={handleOpen}
      aria-controls={isOpen ? `${label.toLowerCase()}-menu` : undefined}
      aria-haspopup='true'
      aria-expanded={isOpen ? 'true' : undefined}
      aria-label={ariaLabel || label}
      sx={{
        animation: `${fadeIn} 0.3s ease-in`,
        minWidth,
        height: '34px',
        textTransform: 'uppercase',
        color: disabled ? 'text.disabled' : 'primary.main',
        fontSize: (theme) => theme.typography.button.fontSize,
        alignItems: 'center',
        justifyContent: 'flex-start',
        textAlign: 'left',
        paddingLeft: '12px',
        paddingRight: '8px',
        '&:hover': {
          backgroundColor: disabled ? 'transparent' : 'action.hover',
        },
        ...sx,
      }}
      className={className}
    >
      {label}
    </Button>
  );

  // Build ordered list of unique group names (preserving insertion order)
  const orderedGroups = items.reduce<string[]>((acc, item) => {
    const group = item.group ?? '';
    if (!acc.includes(group)) acc.push(group);
    return acc;
  }, []);

  const hasGroups = orderedGroups.some((g) => g !== '');

  const renderItem = (item: DropdownMenuItem) => {
    const content = (
      <>
        {item.icon && (
          <ListItemIcon sx={{ minWidth: '32px', color: 'inherit' }}>{item.icon}</ListItemIcon>
        )}
        {item.label}
      </>
    );

    if (item.tooltip && item.disabled) {
      return (
        <Tooltip key={item.value} title={item.tooltip} placement='left'>
          <span>
            <MenuItem
              value={item.value}
              disabled={item.disabled}
              onClick={() => handleItemClick(item.value)}
              sx={{ height: '34px' }}
            >
              {content}
            </MenuItem>
          </span>
        </Tooltip>
      );
    }
    return (
      <MenuItem
        key={item.value}
        value={item.value}
        disabled={item.disabled}
        onClick={() => handleItemClick(item.value)}
        sx={{ height: '34px' }}
      >
        {content}
      </MenuItem>
    );
  };

  return (
    <>
      {disabled && disabledTooltip ? (
        <Tooltip title={disabledTooltip} arrow placement='bottom'>
          <span>{button}</span>
        </Tooltip>
      ) : (
        button
      )}
      <Menu
        id={`${label.toLowerCase()}-menu`}
        anchorEl={anchorEl}
        open={isOpen}
        onClose={handleClose}
        sx={{
          '& .MuiPaper-root': {
            borderRadius: '8px',
            minWidth: width || '180px',
            maxWidth: width,
            width: 'auto',
          },
          '& .MuiMenuItem-root': {
            justifyContent: 'flex-start',
            textAlign: 'left',
          },
          '& .MuiListSubheader-root': {
            textAlign: 'left',
          },
        }}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        {emptyOption && (
          <MenuItem value='' onClick={() => handleItemClick('')}>
            {emptyOptionLabel}
          </MenuItem>
        )}
        {hasGroups
          ? orderedGroups.map((group, groupIndex) => {
              const groupItems = items.filter((item) => (item.group ?? '') === group);
              return [
                groupIndex > 0 && <Divider key={`divider-${group}`} />,
                group && (
                  <ListSubheader
                    key={`subheader-${group}`}
                    sx={{ lineHeight: '32px', fontSize: '0.7rem', fontWeight: 600, textAlign: 'left' }}
                  >
                    {group}
                  </ListSubheader>
                ),
                ...groupItems.map(renderItem),
              ];
            })
          : items.map(renderItem)}
      </Menu>
    </>
  );
};
