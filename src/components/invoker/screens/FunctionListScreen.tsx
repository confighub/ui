// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import React, { useState, useMemo } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Autocomplete, Box, Checkbox, CircularProgress, IconButton, InputAdornment, ListSubheader, Popover, Stack, TextField, Typography, useTheme } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import IndeterminateCheckBoxIcon from '@mui/icons-material/IndeterminateCheckBox';
import { getGroupValue, type GroupByOption } from '@/components/group-by-selector/GroupBySelector';
import { useAppSelector } from '@/hooks/useApp';
import { FunctionSignature, Invocation, useListAllUnitsQuery, ExtendedUnitRead } from '@confighub/rtk-query';
import { selectUnitDashboardGroupBy } from '@/state/slices/selectedUnits';
import { componentTheme } from '@/pages/x/apps/componentTheme';
import { InvokerContext, InvocationHistoryItem } from '../types/invoker.types';
import { InvokerContextDisplay } from '../InvokerContextDisplay';
import { formatInvocationTimestamp } from '../utils/date-format.utils';
import { formatArgumentsForChips } from '../utils/argument-format.utils';
import { SearchResult, groupResultsByToolchain } from '../utils/fuzzy-search.utils';

// Collapsible Saved/Recent sections. Small-caps header, hairline borders,
// muted chevron — no MUI action.hover chrome.
interface SectionAccordionProps {
  expanded: boolean;
  onChange: (event: React.SyntheticEvent, expanded: boolean) => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  children: React.ReactNode;
}

const SectionAccordion = ({ expanded, onChange, icon, label, count, children }: SectionAccordionProps) => (
  <Accordion
    expanded={expanded}
    onChange={onChange}
    disableGutters
    elevation={0}
    square
    sx={{
      mb: 1,
      backgroundColor: 'transparent',
      border: `1px solid ${componentTheme.borderDefault}`,
      borderRadius: 0,
      '&:before': { display: 'none' },
      // Override the global MuiAccordion theme override which paints a 1px
      // brand-colored border on hover and applies a 12px corner radius.
      '&:hover': { border: `1px solid ${componentTheme.borderDefault}` },
      '& .MuiAccordionSummary-root, & .MuiAccordionDetails-root': {
        borderRadius: 0,
      },
    }}
  >
    <AccordionSummary
      expandIcon={<ExpandMoreIcon sx={{ fontSize: 16, color: componentTheme.fgMuted }} />}
      sx={{
        minHeight: 36,
        px: 1.5,
        borderRadius: 0,
        // Subtle default background so the header reads as clickable chrome,
        // not just a horizontal rule. When expanded, add a hairline separator
        // between header and body to reinforce the accordion metaphor.
        backgroundColor: componentTheme.bgSubtle,
        '&.Mui-expanded': {
          minHeight: 36,
          height: 36,
          borderBottom: `1px solid ${componentTheme.borderDefault}`,
        },
        '&:hover': { backgroundColor: componentTheme.bgInset },
        '& .MuiAccordionSummary-content': { my: 0.5 },
        '& .MuiAccordionSummary-content.Mui-expanded': { my: 0.5 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {icon}
        <Typography
          sx={{
            fontFamily: componentTheme.fontSans,
            fontWeight: 600,
            fontSize: 10,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: componentTheme.fgMuted,
          }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            fontFamily: componentTheme.fontSans,
            fontSize: 11,
            color: componentTheme.fgSubtle,
          }}
        >
          {count}
        </Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{ p: 0, pb: 0.5 }}>{children}</AccordionDetails>
  </Accordion>
);

// Extracted component for rendering a single result item.
// Flat row with hairline top border, optional left accent bar for saved/recent.
const ResultItem = ({
  result,
  onResultClick,
  onRemoveHistoryItem,
  onDeleteSavedInvocation,
}: {
  result: SearchResult;
  onResultClick: (result: SearchResult) => void;
  onRemoveHistoryItem?: (id: string) => void;
  onDeleteSavedInvocation?: (invocationId: string) => void;
}) => {
  const theme = useTheme();
  const isSaved = result.type === 'saved-invocation';
  const isRecent = result.type === 'recent-invocation';
  const functionName = result.function.FunctionName;
  const savedDisplayName = isSaved && result.invocation?.DisplayName ? result.invocation.DisplayName : null;
  const accentColor = isSaved ? theme.palette.primary.main : isRecent ? componentTheme.fgSubtle : null;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRecent && result.invocation && 'id' in result.invocation) {
      onRemoveHistoryItem?.(result.invocation.id);
    } else if (isSaved && result.invocation && 'InvocationID' in result.invocation) {
      onDeleteSavedInvocation?.(result.invocation.InvocationID || '');
    }
  };

  return (
    <Box
      onClick={() => onResultClick(result)}
      data-testid={isSaved && savedDisplayName ? `function-item-${savedDisplayName}` : `function-item-${result.function.FunctionName}`}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        px: 1.5,
        py: 1,
        cursor: 'pointer',
        borderTop: `1px solid ${componentTheme.borderSubtle}`,
        borderLeft: accentColor ? `2px solid ${accentColor}` : '2px solid transparent',
        transition: 'background-color 120ms ease-in-out',
        '&:hover': { backgroundColor: componentTheme.bgSubtle },
        '&:first-of-type': { borderTop: 'none' },
      }}
    >
      {isSaved && (
        <BookmarkIcon sx={{ fontSize: 14, color: theme.palette.primary.main, mt: 0.35, flexShrink: 0 }} />
      )}
      {isRecent && (
        <HistoryIcon sx={{ fontSize: 14, color: componentTheme.fgMuted, mt: 0.35, flexShrink: 0 }} />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {savedDisplayName && (
          <Typography
            sx={{
              display: 'block',
              fontFamily: componentTheme.fontSans,
              fontSize: 10,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              color: componentTheme.fgMuted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {savedDisplayName}
          </Typography>
        )}
        <Typography
          sx={{
            fontFamily: componentTheme.fontSans,
            fontWeight: 600,
            fontSize: 13,
            color: componentTheme.fgDefault,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {functionName}
        </Typography>
        {result.function.Description && (
          <Typography
            sx={{
              display: 'block',
              mt: 0.25,
              fontFamily: componentTheme.fontSans,
              fontSize: 11,
              color: componentTheme.fgMuted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {result.function.Description}
          </Typography>
        )}
        {(isSaved || isRecent) && result.invocation && 'Arguments' in result.invocation && result.invocation.Arguments && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.5,
              mt: 0.5,
              maxHeight: '2.8rem',
              overflow: 'hidden',
            }}
          >
            {formatArgumentsForChips(result.invocation.Arguments).map((arg, idx) => (
              <Box
                key={idx}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  px: 0.75,
                  py: 0.1,
                  borderRadius: 0.75,
                  backgroundColor: componentTheme.bgInset,
                  fontFamily: componentTheme.fontMono,
                  fontSize: 10,
                  color: componentTheme.fgDefault,
                  lineHeight: 1.5,
                }}
              >
                <Box component="span" sx={{ color: componentTheme.fgMuted, mr: 0.5 }}>
                  {arg.name}:
                </Box>
                {arg.value}
              </Box>
            ))}
          </Box>
        )}
        {(isSaved || isRecent) && result.lastUsed && (
          <Typography
            sx={{
              display: 'block',
              mt: 0.5,
              fontFamily: componentTheme.fontSans,
              fontSize: 10,
              color: componentTheme.fgSubtle,
            }}
          >
            {formatInvocationTimestamp(result.lastUsed)}
          </Typography>
        )}
      </Box>
      {(isSaved || isRecent) && (
        <IconButton
          size="small"
          onClick={handleDelete}
          sx={{
            ml: 0.5,
            p: 0.25,
            color: componentTheme.fgSubtle,
            '&:hover': {
              color: componentTheme.danger,
              backgroundColor: 'transparent',
            },
          }}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </Box>
  );
};

export interface FunctionListScreenProps {
  context: InvokerContext;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchResults: SearchResult[];
  savedResults: SearchResult[];
  recentResults: SearchResult[];
  hasResults: boolean;
  onSelectFunction: (func: FunctionSignature) => void;
  onSelectInvocation?: (invocation: Invocation | InvocationHistoryItem, functionName: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  onRemoveUnit?: (unitId: string) => void;
  onAddUnit?: (unit: { id: string; name: string; toolchainType: string; spaceId: string }) => void;
  onRemoveAllUnits?: () => void;
  onRestoreAllUnits?: () => void;
  toolchainFilter?: string | null;
  availableToolchainTypes?: string[];
  onToolchainFilterChange?: (filter: string | null) => void;
  onRemoveHistoryItem?: (id: string) => void;
  onDeleteSavedInvocation?: (invocationId: string) => void;
  totalVisibleUnits?: number;
}

export const FunctionListScreen = ({
  context,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  savedResults,
  recentResults,
  hasResults,
  onSelectFunction,
  onSelectInvocation,
  searchInputRef,
  onRemoveUnit,
  onAddUnit,
  onRemoveAllUnits,
  onRestoreAllUnits,
  toolchainFilter,
  availableToolchainTypes,
  onToolchainFilterChange,
  onRemoveHistoryItem,
  onDeleteSavedInvocation,
  totalVisibleUnits,
}: FunctionListScreenProps) => {
  const theme = useTheme();
  const brandAccent = theme.palette.primary.main;
  const brandAccentDark = theme.palette.primary.dark;
  const [addUnitAnchorEl, setAddUnitAnchorEl] = useState<HTMLElement | null>(null);
  const [unitSearchInput, setUnitSearchInput] = useState('');

  // Collapse state for saved and recent sections (persist in localStorage)
  const [savedExpanded, setSavedExpanded] = useState(() => {
    const stored = localStorage.getItem('invoker:savedExpanded');
    return stored ? JSON.parse(stored) : true;
  });

  const [recentExpanded, setRecentExpanded] = useState(() => {
    const stored = localStorage.getItem('invoker:recentExpanded');
    return stored ? JSON.parse(stored) : true;
  });

  const isAddUnitOpen = Boolean(addUnitAnchorEl);

  // Mirror the components view's current GroupBy dimension for dropdown grouping
  const unitDashboardGroupBy = useAppSelector(selectUnitDashboardGroupBy);
  const effectiveDropdownGroupBy = useMemo<GroupByOption>(() => {
    if (unitDashboardGroupBy === 'app>environment') return 'app';
    if (unitDashboardGroupBy === 'environment>app') return 'environment';
    return unitDashboardGroupBy;
  }, [unitDashboardGroupBy]);

  // Handle collapse state changes
  const handleSavedExpandChange = (_: React.SyntheticEvent, expanded: boolean) => {
    setSavedExpanded(expanded);
    localStorage.setItem('invoker:savedExpanded', JSON.stringify(expanded));
  };

  const handleRecentExpandChange = (_: React.SyntheticEvent, expanded: boolean) => {
    setRecentExpanded(expanded);
    localStorage.setItem('invoker:recentExpanded', JSON.stringify(expanded));
  };

  // Fetch all units for the dropdown
  const { data: allUnits, isLoading: isLoadingUnits } = useListAllUnitsQuery(
    { contains: unitSearchInput || undefined, include: 'SpaceID,TargetID' },
    { skip: !isAddUnitOpen }
  );

  // Filter out already selected units
  const availableUnits = useMemo(() => {
    if (!allUnits) return [];
    const selectedIds = new Set(context.selectedUnits?.map(u => u.id) || []);
    return allUnits.filter(unit => unit.Unit?.UnitID && !selectedIds.has(unit.Unit.UnitID));
  }, [allUnits, context]);

  const groupSelectState = useMemo(() => {
    const map = new Map<string, { total: number; selected: number; allGroupUnits: ExtendedUnitRead[] }>();
    if (!allUnits || effectiveDropdownGroupBy === 'none') return map;
    const selectedIdSet = new Set(context.selectedUnits?.map(su => su.id) ?? []);
    allUnits.forEach(unit => {
      const key = getGroupValue(unit, effectiveDropdownGroupBy) ?? 'Ungrouped';
      const existing = map.get(key) ?? { total: 0, selected: 0, allGroupUnits: [] };
      existing.total += 1;
      if (unit.Unit?.UnitID && selectedIdSet.has(unit.Unit.UnitID)) {
        existing.selected += 1;
      }
      existing.allGroupUnits.push(unit);
      map.set(key, existing);
    });
    return map;
  }, [allUnits, context.selectedUnits, effectiveDropdownGroupBy]);

  const handleResultClick = (result: (typeof searchResults)[0]) => {
    if (result.invocation) {
      onSelectInvocation?.(result.invocation, result.function.FunctionName || '');
    } else {
      onSelectFunction(result.function);
    }
  };

  const handleAddUnitClick = (event: React.MouseEvent<HTMLElement>) => {
    setAddUnitAnchorEl(event.currentTarget);
  };

  const handleAddUnitClose = () => {
    setAddUnitAnchorEl(null);
    setUnitSearchInput('');
  };

  const handleUnitSelect = (unit: ExtendedUnitRead | null) => {
    if (unit && unit.Unit && onAddUnit) {
      onAddUnit({
        id: unit.Unit.UnitID || '',
        name: unit.Unit.DisplayName || unit.Unit.Slug || unit.Unit.UnitID || '',
        toolchainType: unit.Unit.ToolchainType || '',
        spaceId: unit.Unit.SpaceID || '',
      });
      handleAddUnitClose();
    }
  };

  return (
    <>
      {/* Context Display - always visible */}
      <Box sx={{ mb: 2 }}>
        <InvokerContextDisplay
          context={context}
          defaultExpanded={false}
          onRemoveUnit={onRemoveUnit}
          onRemoveAllUnits={onRemoveAllUnits}
          onRestoreAllUnits={onRestoreAllUnits}
          onAddUnitClick={onAddUnit ? handleAddUnitClick : undefined}
          totalVisibleUnits={totalVisibleUnits}
        />

        {/* Add Unit Popover */}
        <Popover
          open={isAddUnitOpen}
          anchorEl={addUnitAnchorEl}
          onClose={handleAddUnitClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
          disableRestoreFocus
          slotProps={{
            paper: {
              sx: {
                width: 350,
                p: 1.5,
                border: `1px solid ${componentTheme.borderDefault}`,
                borderRadius: 1,
                boxShadow: componentTheme.shadowMd,
              },
            },
          }}
        >
          <Typography
            sx={{
              mb: 1,
              fontFamily: componentTheme.fontSans,
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: componentTheme.fgMuted,
            }}
          >
            Add a unit
          </Typography>
          <Autocomplete
            options={availableUnits}
            loading={isLoadingUnits}
            groupBy={effectiveDropdownGroupBy !== 'none' ? (option) => getGroupValue(option, effectiveDropdownGroupBy) ?? 'Ungrouped' : undefined}
            renderGroup={(params) => {
              const groupData = groupSelectState.get(params.group);
              const total = groupData?.total ?? 0;
              const selected = groupData?.selected ?? 0;
              const allGroupUnits = groupData?.allGroupUnits ?? [];
              const allChecked = selected === total && total > 0;
              const indeterminate = selected > 0 && selected < total;

              const handleToggle = () => {
                if (allChecked || indeterminate) {
                  allGroupUnits.forEach(u => {
                    if (u.Unit?.UnitID && context.selectedUnits?.some(su => su.id === u.Unit?.UnitID)) {
                      onRemoveUnit?.(u.Unit.UnitID);
                    }
                  });
                } else {
                  const selectedIds = new Set(context.selectedUnits?.map(su => su.id) ?? []);
                  allGroupUnits.forEach(u => {
                    if (u.Unit?.UnitID && !selectedIds.has(u.Unit.UnitID) && onAddUnit) {
                      onAddUnit({
                        id: u.Unit.UnitID,
                        name: u.Unit.DisplayName || u.Unit.Slug || u.Unit.UnitID || '',
                        toolchainType: u.Unit.ToolchainType || '',
                        spaceId: u.Unit.SpaceID || '',
                      });
                    }
                  });
                }
              };

              return (
                <li key={params.key}>
                  <ListSubheader
                    component="div"
                    onClick={handleToggle}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: 1,
                      backgroundColor: componentTheme.bgSubtle,
                      fontFamily: componentTheme.fontSans,
                      fontSize: 11,
                      fontWeight: 600,
                      color: componentTheme.fgMuted,
                      cursor: 'pointer',
                      lineHeight: 2,
                      '&:hover': { backgroundColor: componentTheme.bgInset },
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={allChecked}
                      indeterminate={indeterminate}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => handleToggle()}
                      icon={<CheckBoxOutlineBlankIcon sx={{ fontSize: 16 }} />}
                      checkedIcon={<CheckBoxIcon sx={{ fontSize: 16 }} />}
                      indeterminateIcon={<IndeterminateCheckBoxIcon sx={{ fontSize: 16 }} />}
                      sx={{ p: 0.25 }}
                    />
                    {params.group}
                    <Typography
                      component="span"
                      sx={{
                        ml: 0.5,
                        fontFamily: componentTheme.fontSans,
                        fontSize: 11,
                        color: componentTheme.fgSubtle,
                      }}
                    >
                      {selected}/{total}
                    </Typography>
                  </ListSubheader>
                  <ul style={{ padding: 0 }}>{params.children}</ul>
                </li>
              );
            }}
            getOptionLabel={(option) => {
              const name = option.Unit?.DisplayName || option.Unit?.Slug || option.Unit?.UnitID || '';
              const space = option.Space?.DisplayName || option.Space?.Slug || '';
              return space ? `${name} (${space})` : name;
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Search units..."
                size="small"
                autoFocus
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {isLoadingUnits ? <CircularProgress color="inherit" size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            renderOption={(props, option) => {
              const name = option.Unit?.DisplayName || option.Unit?.Slug || option.Unit?.UnitID || '';
              const space = option.Space?.DisplayName || option.Space?.Slug || '';
              return (
                <li {...props} key={option.Unit?.UnitID}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                    <Typography
                      sx={{
                        fontFamily: componentTheme.fontSans,
                        fontWeight: 500,
                        fontSize: 13,
                        color: componentTheme.fgDefault,
                      }}
                    >
                      {name}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {space && (
                        <Typography
                          sx={{
                            fontFamily: componentTheme.fontSans,
                            fontSize: 11,
                            color: componentTheme.fgMuted,
                          }}
                        >
                          {space}
                        </Typography>
                      )}
                      {option.Unit?.ToolchainType && (
                        <Typography
                          sx={{
                            fontFamily: componentTheme.fontSans,
                            fontSize: 10,
                            letterSpacing: 0.4,
                            textTransform: 'uppercase',
                            color: componentTheme.fgSubtle,
                          }}
                        >
                          {option.Unit.ToolchainType}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </li>
              );
            }}
            onChange={(_event, value) => handleUnitSelect(value)}
            onInputChange={(_event, value) => setUnitSearchInput(value)}
            inputValue={unitSearchInput}
            isOptionEqualToValue={(option, value) => option.Unit?.UnitID === value.Unit?.UnitID}
            noOptionsText={isLoadingUnits ? 'Loading...' : 'No units found'}
            fullWidth
            size="small"
          />
        </Popover>
      </Box>

      {/* Search Bar — flat, subtle; active state pulls the component theme accent */}
      <TextField
        fullWidth
        size="small"
        placeholder="Search functions"
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        inputRef={searchInputRef}
        data-testid="invoker-function-search"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 16, color: componentTheme.fgMuted }} />
            </InputAdornment>
          ),
        }}
        sx={{
          mb: 1.5,
          '& .MuiOutlinedInput-root': {
            backgroundColor: componentTheme.bgSubtle,
            borderRadius: 1,
            fontFamily: componentTheme.fontSans,
            fontSize: 13,
            '& fieldset': { borderColor: componentTheme.borderDefault },
            '&:hover fieldset': { borderColor: componentTheme.borderDefault },
            '&.Mui-focused fieldset': {
              borderColor: brandAccent,
              borderWidth: 1,
            },
          },
          '& .MuiOutlinedInput-input': {
            py: 0.75,
            color: componentTheme.fgDefault,
            '&::placeholder': { color: componentTheme.fgSubtle, opacity: 1 },
          },
        }}
      />

      {/* Toolchain Filter — compact text pills. Selection renders in the
          component theme accent family; unselected stays muted with a hairline. */}
      {availableToolchainTypes && availableToolchainTypes.length > 0 && (
        <Stack direction="row" spacing={0.5} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
          {(() => {
            const pill = (label: string, active: boolean, onClick: () => void) => (
              <Box
                key={label}
                onClick={onClick}
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontFamily: componentTheme.fontSans,
                  fontWeight: active ? 600 : 500,
                  fontSize: 11,
                  lineHeight: 1.5,
                  userSelect: 'none',
                  border: `1px solid ${brandAccent}`,
                  backgroundColor: active ? brandAccent : 'transparent',
                  color: active ? componentTheme.fgOnEmphasis : brandAccent,
                  transition: 'background-color 120ms, border-color 120ms, color 120ms',
                  '&:hover': {
                    backgroundColor: active ? brandAccentDark : componentTheme.bgSubtle,
                    borderColor: active ? brandAccentDark : brandAccent,
                    color: active ? componentTheme.fgOnEmphasis : brandAccentDark,
                  },
                }}
              >
                {label}
              </Box>
            );
            return (
              <>
                {pill('All', !toolchainFilter, () => onToolchainFilterChange?.(null))}
                {availableToolchainTypes.map((type) =>
                  pill(type, toolchainFilter === type, () => onToolchainFilterChange?.(type)),
                )}
              </>
            );
          })()}
        </Stack>
      )}

      {/* Saved Invocations Section */}
      {savedResults.length > 0 && (
        <SectionAccordion
          expanded={savedExpanded}
          onChange={handleSavedExpandChange}
          icon={<BookmarkIcon sx={{ fontSize: 14, color: brandAccent }} />}
          label="Saved Functions"
          count={savedResults.length}
        >
          {savedResults.map((result, index) => (
            <ResultItem
              key={`${result.function.FunctionName}-saved-${index}`}
              result={result}
              onResultClick={handleResultClick}
              onRemoveHistoryItem={onRemoveHistoryItem}
              onDeleteSavedInvocation={onDeleteSavedInvocation}
            />
          ))}
        </SectionAccordion>
      )}

      {/* Recent Invocations Section */}
      {recentResults.length > 0 && (
        <SectionAccordion
          expanded={recentExpanded}
          onChange={handleRecentExpandChange}
          icon={<HistoryIcon sx={{ fontSize: 14, color: componentTheme.fgMuted }} />}
          label="Recent Functions"
          count={recentResults.length}
        >
          {recentResults.map((result, index) => (
            <ResultItem
              key={`${result.function.FunctionName}-recent-${index}`}
              result={result}
              onResultClick={handleResultClick}
              onRemoveHistoryItem={onRemoveHistoryItem}
              onDeleteSavedInvocation={onDeleteSavedInvocation}
            />
          ))}
        </SectionAccordion>
      )}

      {/* Search Results */}
      {!hasResults && savedResults.length === 0 && recentResults.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 6,
            px: 2,
            textAlign: 'center',
          }}
        >
          <SearchIcon sx={{ fontSize: 32, mb: 1.5, color: componentTheme.fgSubtle }} />
          <Typography
            sx={{
              fontFamily: componentTheme.fontSans,
              fontSize: 12,
              color: componentTheme.fgMuted,
            }}
          >
            No functions found matching &quot;{searchQuery}&quot;
          </Typography>
        </Box>
      ) : hasResults ? (
        <>
          {/* Determine if we should show grouped results */}
          {!toolchainFilter && availableToolchainTypes && availableToolchainTypes.length > 0 && !searchQuery.trim() ? (
            // Grouped view when "All" is selected
            <>
              {Array.from(groupResultsByToolchain(searchResults, availableToolchainTypes)).map(([groupName, groupResults]) => (
                <Box key={groupName} sx={{ mb: 1.5 }}>
                  <ResultsSectionHeader label={groupName} count={groupResults.length} />
                  <Box sx={{ borderTop: `1px solid ${componentTheme.borderDefault}`, borderBottom: `1px solid ${componentTheme.borderDefault}` }}>
                    {groupResults.map((result, index) => (
                      <ResultItem
                        key={`${result.function.FunctionName}-${result.type}-${index}`}
                        result={result}
                        onResultClick={handleResultClick}
                        onRemoveHistoryItem={onRemoveHistoryItem}
                        onDeleteSavedInvocation={onDeleteSavedInvocation}
                      />
                    ))}
                  </Box>
                </Box>
              ))}
            </>
          ) : (
            // Flat view when a toolchain is selected or when searching
            <>
              <ResultsSectionHeader
                label={
                  searchQuery.trim()
                    ? 'Search Results'
                    : toolchainFilter
                    ? toolchainFilter
                    : 'All Functions'
                }
                count={searchResults.length}
              />
              <Box sx={{ borderTop: `1px solid ${componentTheme.borderDefault}`, borderBottom: `1px solid ${componentTheme.borderDefault}` }}>
                {searchResults.map((result, index) => (
                  <ResultItem
                    key={`${result.function.FunctionName}-${result.type}-${index}`}
                    result={result}
                    onResultClick={handleResultClick}
                    onRemoveHistoryItem={onRemoveHistoryItem}
                    onDeleteSavedInvocation={onDeleteSavedInvocation}
                  />
                ))}
              </Box>
            </>
          )}
        </>
      ) : null}
    </>
  );
};

interface ResultsSectionHeaderProps {
  label: string;
  count: number;
}

const ResultsSectionHeader = ({ label, count }: ResultsSectionHeaderProps) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, mb: 0.75, px: 0.5 }}>
    <SearchIcon sx={{ fontSize: 12, color: componentTheme.fgSubtle }} />
    <Typography
      sx={{
        fontFamily: componentTheme.fontSans,
        fontWeight: 600,
        fontSize: 10,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: componentTheme.fgMuted,
      }}
    >
      {label}
    </Typography>
    <Typography
      sx={{
        fontFamily: componentTheme.fontSans,
        fontSize: 11,
        color: componentTheme.fgSubtle,
      }}
    >
      {count}
    </Typography>
  </Box>
);
