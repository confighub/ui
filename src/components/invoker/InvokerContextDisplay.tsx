// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Fragment, useMemo, useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import IndeterminateCheckBoxIcon from '@mui/icons-material/IndeterminateCheckBox';
import AddIcon from '@mui/icons-material/Add';

import { componentTheme } from '@/pages/x/apps/componentTheme';

import { InvokerContext } from './types/invoker.types';
import { ContextCaption, ContextCount, ContextGroupHeader, ContextUnitRow } from './ContextParts';

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
        aria-expanded={expanded}
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
        <ContextCaption>Context</ContextCaption>
        <ContextCount>
          {selectedCount} {unitLabel}
        </ContextCount>
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
                <ContextGroupHeader first={groupIdx === 0}>{groupKey}</ContextGroupHeader>
                {units!.map((unit, unitIdx) => {
                  const isCompatible =
                    !functionToolchainType || unit.toolchainType === functionToolchainType;
                  return (
                    <ContextUnitRow
                      key={unit.id}
                      unitId={unit.id}
                      spaceId={unit.spaceId}
                      name={unit.name}
                      first={unitIdx === 0}
                      dimmed={!isCompatible}
                      onRemove={onRemoveUnit}
                      right={
                        unit.toolchainType ? (
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
                        ) : undefined
                      }
                    />
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
