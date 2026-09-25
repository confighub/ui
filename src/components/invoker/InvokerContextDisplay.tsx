// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Fragment, useMemo, useState } from 'react';
import { Box, IconButton, Link, Tooltip, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import IndeterminateCheckBoxIcon from '@mui/icons-material/IndeterminateCheckBox';
import AddIcon from '@mui/icons-material/Add';

import { componentTheme } from '@/pages/x/apps/componentTheme';

import { InvokerContext } from './types/invoker.types';

interface InvokerContextDisplayProps {
  context: InvokerContext;
  defaultExpanded?: boolean;
  onRemoveUnit?: (unitId: string) => void;
  onRemoveAllUnits?: () => void;
  onRestoreAllUnits?: () => void;
  onAddUnitClick?: (event: React.MouseEvent<HTMLElement>) => void;
  functionToolchainType?: string;
  totalVisibleUnits?: number;
}

export const InvokerContextDisplay = ({
  context,
  defaultExpanded = false,
  onRemoveUnit,
  onRemoveAllUnits,
  onRestoreAllUnits,
  onAddUnitClick,
  functionToolchainType,
  totalVisibleUnits,
}: InvokerContextDisplayProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const selectedCount = context.selectedUnits?.length ?? 0;
  const unitLabel = selectedCount === 1 ? 'unit' : 'units';

  const checkboxState = useMemo(() => {
    const totalCount = totalVisibleUnits ?? 0;
    if (selectedCount === 0) return { checked: false, indeterminate: false };
    if (totalCount > 0 && selectedCount < totalCount) {
      return { checked: false, indeterminate: true };
    }
    return { checked: true, indeterminate: false };
  }, [selectedCount, totalVisibleUnits]);

  const selectedUnits = context.selectedUnits;
  const groupedUnits = useMemo(() => {
    const map = new Map<string, typeof selectedUnits>();
    for (const unit of (selectedUnits ?? [])) {
      const key = unit.spaceName ?? unit.spaceId ?? 'Ungrouped';
      const list = map.get(key) ?? [];
      list.push(unit);
      map.set(key, list);
    }
    return map;
  }, [selectedUnits]);

  const hasVisibleUnits = !!totalVisibleUnits && totalVisibleUnits > 0;
  const hasSelectedUnits = checkboxState.checked || checkboxState.indeterminate;
  const willSelectAll = !checkboxState.checked && hasVisibleUnits;
  const willDeselectAll =
    checkboxState.checked || (checkboxState.indeterminate && !hasVisibleUnits);
  const canToggleSelection = hasSelectedUnits || hasVisibleUnits;

  const selectTooltip = !canToggleSelection
    ? 'No units available to select'
    : checkboxState.checked
    ? 'Deselect all units'
    : checkboxState.indeterminate
    ? hasVisibleUnits
      ? 'Select all units'
      : 'Deselect all units'
    : 'Select all units';

  const handleSelectToggle = () => {
    if (!canToggleSelection) return;
    if (willDeselectAll) onRemoveAllUnits?.();
    else if (willSelectAll) onRestoreAllUnits?.();
  };

  const showUnitList = expanded && selectedCount > 0;
  const compatibleCount =
    functionToolchainType && context.selectedUnits
      ? context.selectedUnits.filter((u) => u.toolchainType === functionToolchainType).length
      : 0;

  return (
    <Box sx={{ borderBottom: `1px solid ${componentTheme.borderDefault}` }}>
      {/* Header — clicking the title area toggles expand. Inner buttons stop
          propagation so they don't toggle. */}
      <Box
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          minHeight: 36,
          cursor: 'pointer',
          userSelect: 'none',
          outline: 'none',
          '&:hover': { backgroundColor: componentTheme.bgSubtle },
          '&:focus-visible': { backgroundColor: componentTheme.bgSubtle },
        }}
      >
        <ExpandMoreIcon
          sx={{
            fontSize: 16,
            color: componentTheme.fgMuted,
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 150ms ease-in-out',
            flexShrink: 0,
          }}
        />
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
          Context
        </Typography>
        <Typography
          sx={{
            fontFamily: componentTheme.fontSans,
            fontSize: 12,
            color: componentTheme.fgDefault,
          }}
        >
          {selectedCount} {unitLabel}
        </Typography>
        {context.primaryToolchainType && (
          <>
            <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle }}>·</Typography>
            <Typography
              sx={{
                fontFamily: componentTheme.fontSans,
                fontSize: 11,
                color: componentTheme.fgMuted,
              }}
            >
              {context.primaryToolchainType}
            </Typography>
          </>
        )}
        <Box
          sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.25 }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {onRemoveAllUnits && onRestoreAllUnits && (
            <Tooltip title={selectTooltip}>
              <span>
                <IconButton
                  size="small"
                  disabled={!canToggleSelection}
                  onClick={handleSelectToggle}
                  sx={{
                    color: componentTheme.fgMuted,
                    p: 0.5,
                    '&:hover': { color: componentTheme.fgDefault, backgroundColor: componentTheme.bgInset },
                    '&.Mui-disabled': { color: componentTheme.fgSubtle, opacity: 0.5 },
                  }}
                >
                  {checkboxState.indeterminate ? (
                    <IndeterminateCheckBoxIcon sx={{ fontSize: 16 }} />
                  ) : checkboxState.checked ? (
                    <CheckBoxIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <CheckBoxOutlineBlankIcon sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}
          {onAddUnitClick && (
            <Tooltip title="Add unit">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddUnitClick(e);
                }}
                sx={{
                  color: componentTheme.fgMuted,
                  p: 0.5,
                  '&:hover': { color: componentTheme.fgDefault, backgroundColor: componentTheme.bgInset },
                }}
              >
                <AddIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Body — only when expanded and there are units to show */}
      {showUnitList && (
        <Box sx={{ pb: 0.5 }}>
          {functionToolchainType && (
            <Typography
              sx={{
                px: 1.5,
                pt: 0.5,
                pb: 0.5,
                fontFamily: componentTheme.fontSans,
                fontSize: 11,
                color: componentTheme.fgMuted,
              }}
            >
              Runs on {compatibleCount} of {selectedCount} {unitLabel}
            </Typography>
          )}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {[...groupedUnits.entries()].map(([groupKey, units], groupIdx) => (
              <Fragment key={groupKey}>
                {/* Group header — always shown (even for a single group) so the
                    component/space name is always visible in the context panel. */}
                <Box
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    backgroundColor: componentTheme.bgSubtle,
                    borderTop: groupIdx === 0 ? 'none' : `1px solid ${componentTheme.borderSubtle}`,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <Typography
                    sx={{
                      fontFamily: componentTheme.fontSans,
                      fontWeight: 600,
                      fontSize: 10,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      color: componentTheme.fgMuted,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {groupKey}
                  </Typography>
                </Box>
                {units!.map((unit, unitIdx) => {
                  const isCompatible =
                    !functionToolchainType || unit.toolchainType === functionToolchainType;
                  return (
                    <Box
                      key={unit.id}
                      sx={{
                        px: 1.5,
                        py: 0.75,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        borderTop: unitIdx === 0 ? 'none' : `1px solid ${componentTheme.borderSubtle}`,
                        opacity: isCompatible ? 1 : 0.45,
                        '&:hover': { backgroundColor: componentTheme.bgSubtle },
                        transition: 'background-color 120ms ease-in-out',
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Link
                          href={`/units/${unit.spaceId}/${unit.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                          onClick={(e) => e.stopPropagation()}
                          sx={{
                            display: 'block',
                            fontFamily: componentTheme.fontSans,
                            fontWeight: 500,
                            fontSize: 12,
                            color: componentTheme.fgDefault,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            '&:hover': { color: componentTheme.accent },
                          }}
                        >
                          {unit.name}
                        </Link>
                      </Box>
                      {unit.toolchainType && (
                        <Typography
                          sx={{
                            fontFamily: componentTheme.fontSans,
                            fontSize: 10,
                            letterSpacing: 0.4,
                            textTransform: 'uppercase',
                            color: componentTheme.fgMuted,
                          }}
                        >
                          {unit.toolchainType}
                        </Typography>
                      )}
                      {onRemoveUnit && (
                        <Tooltip title="Remove from selection">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveUnit(unit.id);
                            }}
                            sx={{
                              color: componentTheme.fgMuted,
                              p: 0.5,
                              '&:hover': { color: componentTheme.danger, backgroundColor: componentTheme.dangerFaint },
                            }}
                          >
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  );
                })}
              </Fragment>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};
