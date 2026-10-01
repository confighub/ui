// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';

import { DropdownMenu, MenuSection } from '@/components/query-builder/shared-styles';
import type { FieldIconKey } from '@/components/query-builder/field-icons';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import InputBase from '@mui/material/InputBase';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Popper from '@mui/material/Popper';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import { getChipIcon, getSubmenuIcon } from './field-icon';
import type { FieldOption, GroupableCategory } from './groupable-fields';

interface FieldPickerDropdownProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  categories: GroupableCategory[];
  /** Fields used at OTHER levels — shown disabled. */
  usedFields: string[];
  /** Current field of this chip — shows ✓. */
  currentField?: string;
  onSelect: (field: string) => void;
  /** Icon overrides for the field rows. Defaults to the Unit catalog's icons. */
  iconMap?: Partial<Record<string, FieldIconKey>>;
}

/**
 * Categorised field picker rendered as a Popper below the chip that triggered
 * it.
 *
 * Static categories expand inline. Submenu categories (`isSubmenu: true`)
 * render as hover-triggered trigger rows under a "Dynamic" section header.
 * Hovering or clicking a trigger opens a right-anchored sub-Popper containing
 * a search input and the category's field list.
 */
export function FieldPickerDropdown({
  anchorEl,
  open,
  onClose,
  categories,
  usedFields,
  currentField,
  onSelect,
  iconMap,
}: FieldPickerDropdownProps) {
  const theme = useTheme();
  const [searchStrings, setSearchStrings] = useState<Record<string, string>>({});
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [submenuAnchor, setSubmenuAnchor] = useState<HTMLElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending close timer on unmount to avoid state updates after the
  // component is gone (e.g. when the parent chip is removed mid-hover).
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    };
  }, []);

  if (!open) return null;

  const staticCategories = categories.filter((c) => !c.isSubmenu);
  const submenuCategories = categories.filter((c) => c.isSubmenu);

  const handleSelect = (field: string) => {
    onSelect(field);
    onClose();
  };

  const scheduleCloseSubmenu = () => {
    closeTimerRef.current = setTimeout(() => setOpenSubmenu(null), 150);
  };

  const cancelCloseSubmenu = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  /** Renders a single field row — shared between inline and submenu panels. */
  const renderFieldItem = (fieldOption: FieldOption, key: string) => {
    const isDisabled = usedFields.includes(fieldOption.field);
    const isCurrent = fieldOption.field === currentField;
    return (
      <MenuItem
        key={key}
        aria-disabled={isDisabled ? true : undefined}
        onClick={() => !isDisabled && handleSelect(fieldOption.field)}
        sx={{
          minHeight: 36,
          py: 0.75,
          ...(isDisabled && {
            cursor: 'default',
            '&:hover': { backgroundColor: 'transparent' },
          }),
        }}
      >
        <ListItemIcon sx={{ minWidth: 24, '& svg': { fontSize: 15 } }}>
          {getChipIcon(fieldOption.field, iconMap)}
        </ListItemIcon>
        <ListItemText
          primary={fieldOption.label}
          slotProps={{
            primary: {
              sx: {
                fontSize: '0.875rem',
                ...(isDisabled && { color: 'text.disabled' }),
                ...(isCurrent && { color: 'primary.main', fontWeight: 500 }),
              },
            },
          }}
        />
        {/* Trailing area: count, "in use" badge, or ✓ */}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {fieldOption.count !== undefined && !isDisabled && (
            <Box
              component="span"
              sx={{ fontSize: '0.6875rem', color: 'text.disabled' }}
            >
              {fieldOption.count}
            </Box>
          )}
          {isDisabled && (
            <Box
              component="span"
              sx={{
                fontSize: '0.625rem',
                fontWeight: 600,
                padding: '1px 4px',
                borderRadius: '3px',
                backgroundColor: alpha(theme.palette.text.disabled, 0.12),
                color: 'text.disabled',
                textTransform: 'uppercase',
              }}
            >
              in use
            </Box>
          )}
          {isCurrent && <CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
        </Box>
      </MenuItem>
    );
  };

  /** Renders the open submenu panel as a sibling Popper (not nested in the main panel's scroll container). */
  const renderSubmenuPanel = () => {
    if (openSubmenu === null || submenuAnchor === null) return null;
    const cat = submenuCategories.find((c) => c.header === openSubmenu);
    if (!cat) return null;

    const searchValue = searchStrings[cat.header] ?? '';
    const filteredFields = cat.fields.filter((f) => {
      if (!searchValue) return true;
      return f.label.toLowerCase().includes(searchValue.toLowerCase());
    });

    return (
      <Popper
        open
        anchorEl={submenuAnchor}
        placement="right-start"
        sx={{ zIndex: 1401 }}
        modifiers={[{ name: 'offset', options: { offset: [0, -4] } }]}
      >
        <DropdownMenu
          elevation={0}
          onMouseEnter={cancelCloseSubmenu}
          onMouseLeave={scheduleCloseSubmenu}
        >
          {cat.comingSoon ? (
            <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                Coming soon
              </Typography>
            </Box>
          ) : (
            <>
              <Box sx={{ px: 1, pt: 0.75, pb: 0.25 }}>
                <InputBase
                  autoFocus
                  fullWidth
                  placeholder={cat.searchPlaceholder ?? 'Search…'}
                  value={searchValue}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setSearchStrings((prev) => ({
                      ...prev,
                      [cat.header]: e.target.value,
                    }));
                  }}
                  startAdornment={
                    <InputAdornment position="start" sx={{ mr: 0.75 }}>
                      <SearchIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                    </InputAdornment>
                  }
                  sx={{
                    fontSize: '0.8125rem',
                    px: 1,
                    py: 0.625,
                    borderRadius: '6px',
                    border: `1px solid ${theme.palette.divider}`,
                    '&.Mui-focused': {
                      borderColor: theme.palette.primary.main,
                    },
                    '& input': {
                      padding: 0,
                      '&::placeholder': {
                        color: theme.palette.text.disabled,
                        opacity: 1,
                      },
                    },
                  }}
                />
              </Box>
              <Divider sx={{ mt: 0.5 }} />
              {filteredFields.length === 0 ? (
                <Box sx={{ px: 1.5, py: 0.75 }}>
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                    {searchValue ? 'No matches' : 'No keys discovered'}
                  </Typography>
                </Box>
              ) : (
                filteredFields.map((fieldOption) =>
                  renderFieldItem(fieldOption, `sub-${fieldOption.field}`),
                )
              )}
            </>
          )}
        </DropdownMenu>
      </Popper>
    );
  };

  return (
    <>
      <Popper
        open={open}
        anchorEl={anchorEl}
        placement="bottom-start"
        sx={{ zIndex: 1400 }}
        modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
      >
        <ClickAwayListener onClickAway={onClose}>
          <DropdownMenu elevation={0}>
            {/* Static categories — expand inline */}
            {staticCategories.map((category) => (
              <Box key={category.header}>
                <MenuSection>{category.header}</MenuSection>

                {category.comingSoon ? (
                  <Box
                    sx={{
                      px: 1.5,
                      py: 0.75,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.disabled', fontStyle: 'italic' }}
                    >
                      Coming soon
                    </Typography>
                  </Box>
                ) : (
                  category.fields.map((fieldOption) =>
                    renderFieldItem(fieldOption, fieldOption.field),
                  )
                )}
              </Box>
            ))}

            {/* Submenu categories — hover-triggered right-opening sub-panels */}
            {submenuCategories.length > 0 && (
              <>
                <MenuSection>Dynamic</MenuSection>
                {submenuCategories.map((category) => {
                  const isActive = openSubmenu === category.header;
                  return (
                    <MenuItem
                      key={category.header}
                      sx={{
                        minHeight: 36,
                        py: 0.75,
                        ...(isActive && {
                          backgroundColor: alpha(theme.palette.primary.main, 0.08),
                          '&:hover': {
                            backgroundColor: alpha(theme.palette.primary.main, 0.08),
                          },
                        }),
                      }}
                      onMouseEnter={(e) => {
                        cancelCloseSubmenu();
                        setOpenSubmenu(category.header);
                        setSubmenuAnchor(e.currentTarget);
                      }}
                      onMouseLeave={scheduleCloseSubmenu}
                    >
                      <ListItemIcon
                        sx={{
                          minWidth: 24,
                          '& svg': {
                            fontSize: 15,
                            color: isActive ? 'primary.main' : undefined,
                          },
                        }}
                      >
                        {getSubmenuIcon(category.header)}
                      </ListItemIcon>
                      <ListItemText
                        primary={category.header}
                        slotProps={{
                          primary: {
                            sx: {
                              fontSize: '0.875rem',
                              ...(isActive && { color: 'primary.main', fontWeight: 500 }),
                            },
                          },
                        }}
                      />
                      {/* "Coming soon" caption — count badges intentionally omitted */}
                      {category.comingSoon && (
                        <Box
                          component="span"
                          sx={{
                            fontSize: '0.6875rem',
                            color: 'text.disabled',
                            ml: 'auto',
                            flexShrink: 0,
                          }}
                        >
                          Coming soon
                        </Box>
                      )}
                      <ChevronRightIcon
                        sx={{
                          fontSize: 14,
                          ml: 0.5,
                          color: isActive ? 'primary.main' : 'text.secondary',
                        }}
                      />
                    </MenuItem>
                  );
                })}
              </>
            )}
          </DropdownMenu>
        </ClickAwayListener>
      </Popper>

      {/* Sub-panel rendered as a sibling Popper so it isn't clipped by the main panel's overflow */}
      {renderSubmenuPanel()}
    </>
  );
}
