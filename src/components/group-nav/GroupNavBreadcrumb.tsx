// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo, useRef, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, styled, useTheme } from '@mui/material/styles';

import type { FieldIconKey } from '@/components/query-builder/field-icons';

import { BreadcrumbChip } from './BreadcrumbChip';
import { FieldPickerDropdown } from './FieldPickerDropdown';
import { type GroupableFieldCatalog, getFieldLabel, getGroupableCategories } from './groupable-fields';

const HeaderGrid = styled(Box)(() => ({
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  alignItems: 'flex-start',
  gap: 8,
  padding: '10px 8px 10px 12px',
  borderBottom: '1px solid',
  borderColor: 'divider',

}));

const CrumbsArea = styled(Box)(() => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px 0',
}));

const ChipSeparator = styled('span')(({ theme }) => ({
  fontSize: 12,
  color: theme.palette.text.disabled,
  padding: '0 4px',
  userSelect: 'none',
}));

const AddChipButton = styled('button')(({ theme }) => ({
  height: 30,
  borderStyle: 'dashed',
  borderWidth: 1,
  borderColor: theme.palette.divider,
  borderRadius: 8,
  background: 'transparent',
  color: theme.palette.text.disabled,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 10px',
  fontSize: '0.875rem',
  fontWeight: 500,
  transition: 'border-color 140ms, background 140ms, color 140ms',
  cursor: 'pointer',
  fontFamily: theme.typography.fontFamily,
  '&:hover:not(:disabled)': {
    borderColor: theme.palette.primary.main,
    background: alpha(theme.palette.primary.main, 0.08),
    color: theme.palette.primary.main,
  },
  '&:disabled': {
    cursor: 'default',
    opacity: 0.4,
  },
}));

interface GroupNavBreadcrumbProps {
  /**
   * The current local grouping levels — driven by the parent's localGroupByColumns.
   * This is now the single source of truth for chip rendering; no internal draft state.
   */
  localLevels: string[];
  /**
   * Called on every chip add / remove / change with the full new level array.
   * Parent updates localGroupByColumns and resets selectedGroups atomically.
   */
  onEditLevels: (newLevels: string[]) => void;
  labelKeys: string[];
  spaceLabelKeys: string[];
  /** Per-label-key unit counts — shown right-aligned in the Labels submenu. */
  labelKeyCounts?: Record<string, number>;
  /** Per-space-label-key unit counts — shown right-aligned in the Space Labels submenu. */
  spaceLabelKeyCounts?: Record<string, number>;
  /** When provided renders the collapse chevron in the right rail. */
  onToggleOpen?: () => void;
  /** Field catalog for the add/change-field picker. Defaults to the Unit catalog. */
  catalog?: GroupableFieldCatalog;
  /** Label overrides for chips and picker rows. Defaults to the Unit catalog's labels. */
  fieldLabels?: Record<string, string>;
  /** Icon overrides for chips and picker rows. Defaults to the Unit catalog's icons. */
  iconMap?: Partial<Record<string, FieldIconKey>>;
}

/**
 * Controlled chip breadcrumb for GroupNavPanel.
 *
 * The component has no internal draft state — it renders `localLevels` directly
 * and delegates every mutation to the parent via `onEditLevels`.
 */
export function GroupNavBreadcrumb({
  localLevels,
  onEditLevels,
  labelKeys,
  spaceLabelKeys,
  labelKeyCounts,
  spaceLabelKeyCounts,
  onToggleOpen,
  catalog,
  fieldLabels,
  iconMap,
}: GroupNavBreadcrumbProps) {
  const theme = useTheme();

  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  /**
   * Insertion position among the non-dragged chips (0 = before first, N-1 = after last).
   * Drives the live preview order.
   */
  const [insertAmong, setInsertAmong] = useState<number | null>(null);

  /**
   * Live-preview order: the dragged chip is inserted at `insertAmong` among the
   * remaining chips. When no drag is active this equals `localLevels`.
   */
  const previewLevels = useMemo(() => {
    if (dragIndex === null || insertAmong === null) return localLevels;
    const rest = localLevels.filter((_, i) => i !== dragIndex);
    const result = [...rest];
    result.splice(insertAmong, 0, localLevels[dragIndex]);
    return result;
  }, [dragIndex, insertAmong, localLevels]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    // Initialise insert position to the chip's current slot among non-dragged chips
    setInsertAmong(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleChipDragOver = (e: React.DragEvent<HTMLDivElement>, previewField: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex === null || previewField === localLevels[dragIndex]) return;
    // Map the hovered chip back to its position among non-dragged chips
    const rest = localLevels.filter((_, i) => i !== dragIndex);
    const nonDraggedIdx = rest.indexOf(previewField);
    if (nonDraggedIdx === -1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setInsertAmong(e.clientX < rect.left + rect.width / 2 ? nonDraggedIdx : nonDraggedIdx + 1);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex !== null && insertAmong !== null) {
      const rest = localLevels.filter((_, i) => i !== dragIndex);
      const newLevels = [...rest];
      newLevels.splice(insertAmong, 0, localLevels[dragIndex]);
      onEditLevels(newLevels);
    }
    setDragIndex(null);
    setInsertAmong(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setInsertAmong(null);
  };

  const categories = useMemo(
    () => getGroupableCategories(labelKeys, spaceLabelKeys, labelKeyCounts, spaceLabelKeyCounts, catalog),
    [labelKeys, spaceLabelKeys, labelKeyCounts, spaceLabelKeyCounts, catalog],
  );

  const handleRemove = (index: number) => {
    onEditLevels(localLevels.filter((_, i) => i !== index));
  };

  const handleChangeField = (index: number, newField: string) => {
    onEditLevels(localLevels.map((f, i) => (i === index ? newField : f)));
  };

  const handleAddField = (field: string) => {
    onEditLevels([...localLevels, field]);
    setAddPickerOpen(false);
  };

  return (
    <HeaderGrid sx={{ borderColor: theme.palette.divider }}>
      {/* Left: crumbs area */}
      <CrumbsArea>
        {localLevels.length === 0 ? (
          <Typography
            sx={{
              fontSize: '0.875rem',
              fontStyle: 'italic',
              color: 'text.disabled',
              height: 30,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Group by…
          </Typography>
        ) : (
          previewLevels.map((field) => {
            const sourceIndex = localLevels.indexOf(field);
            const isDragging = sourceIndex === dragIndex;
            return (
              <Box
                key={field}
                draggable
                onDragStart={(e) => handleDragStart(e as React.DragEvent, sourceIndex)}
                onDragOver={(e) => handleChipDragOver(e as React.DragEvent<HTMLDivElement>, field)}
                onDrop={(e) => handleDrop(e as React.DragEvent)}
                onDragEnd={handleDragEnd}
                sx={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  cursor: 'grab',
                  opacity: isDragging ? 0.25 : 1,
                  transition: 'opacity 120ms ease',
                }}
              >
                <BreadcrumbChip
                  field={field}
                  label={getFieldLabel(field, fieldLabels)}
                  categories={categories}
                  usedFields={localLevels.filter((_, i) => i !== sourceIndex)}
                  onChangeField={(newField) => handleChangeField(sourceIndex, newField)}
                  onRemove={() => handleRemove(sourceIndex)}
                  isDragActive={dragIndex !== null}
                  iconMap={iconMap}
                />
                <ChipSeparator>/</ChipSeparator>
              </Box>
            );
          })
        )}

        {/* + Add chip */}
        <Box sx={{ display: 'inline-flex', alignItems: 'center', pl: localLevels.length > 0 ? 1 : 0 }}>
          <AddChipButton
            ref={addButtonRef}
            type="button"
            onClick={() => setAddPickerOpen(true)}
            aria-label="Add grouping level"
          >
            <AddIcon sx={{ fontSize: 13 }} />
            {localLevels.length === 0 && <span>Field</span>}
          </AddChipButton>

          {addPickerOpen && (
            <FieldPickerDropdown
              anchorEl={addButtonRef.current}
              open={addPickerOpen}
              onClose={() => setAddPickerOpen(false)}
              categories={categories}
              usedFields={localLevels}
              onSelect={handleAddField}
              iconMap={iconMap}
            />
          )}
        </Box>
      </CrumbsArea>

      {/* Right: rail — [Chevron] */}
      {onToggleOpen && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '2px', pt: 0.25 }}>
          <Tooltip title="Collapse grouping panel" placement="right">
            <IconButton
              size="small"
              onClick={onToggleOpen}
              sx={{ p: 0.5, color: 'text.secondary' }}
              aria-label="Collapse grouping panel"
            >
              <ChevronLeftIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </HeaderGrid>
  );
}
