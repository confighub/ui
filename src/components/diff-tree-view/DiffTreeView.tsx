// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import React, { useState } from 'react';

import { DiffEditor } from '@/components/diff-editor/DiffEditor';
import { Ellipses } from '@/components/styled';
import { ExtendedUnitRead } from '@confighub/rtk-query';
import { useRevisionDataMap } from '@/hooks/useUnitData';
import { getDiffStats } from '@/utility/diff-methods';
import Editor from '@monaco-editor/react';
import Edit from '@mui/icons-material/Edit';
import Save from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

/** Width of the sidebar in pixels */
const SIDEBAR_WIDTH = 280;

/** Background color for the content area */
const CONTENT_BACKGROUND_COLOR = 'rgb(249, 250, 251)';

export interface IDiffTreeViewProps {
  /** Array of diff items to display */
  units: ExtendedUnitRead[];
  /** Optional height for each diff container. Defaults to 400px */
  diffHeight?: string | number;
  /** Optional language for syntax highlighting. Defaults to 'yaml' */
  language?: string;
  action?: React.ReactNode;
  title?: React.ReactNode;
  editorOffset?: string | number;
  containerHeight?: string | number;
  /** Array of selected unit IDs */
  selectedUnitIds?: string[];
  /** Callback when unit selection changes */
  onSelectionChange?: (unitIds: string[]) => void;
  /** Optional toolbar content to display in the left nav header (e.g., Add Units button) */
  headerToolbar?: React.ReactNode;
  /** Enable edit mode for inline editing */
  enableEditMode?: boolean;
  /** Callback when save is clicked in edit mode */
  onSave?: (unitId: string, newData: string) => Promise<void>;
  /** Callback to refresh data after save */
  onRefresh?: () => void;
}

/**
 * DiffTreeView Component
 *
 * A reusable component that displays a list of revision diffs in an accordion format.
 * Each accordion shows diff statistics in the header and a side-by-side diff editor in the content.
 *
 * Features:
 * - Expand/collapse individual diffs
 * - Expand/collapse all controls
 * - Visual diff statistics (additions, deletions, changes)
 * - Revision number display
 * - Syntax highlighted diff editor
 */
export const DiffTreeView = ({
  units,
  language = 'yaml',
  title,
  action,
  editorOffset = '250px',
  containerHeight = '100%',
  selectedUnitIds = [],
  onSelectionChange,
  headerToolbar,
  enableEditMode = false,
  onSave,
  onRefresh,
}: IDiffTreeViewProps) => {
  const theme = useTheme();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(
    units.length > 0 ? units[0].Unit?.UnitID || null : null,
  );
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedData, setEditedData] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // The configuration is not on the Revision, so both sides of every diff in this list are
  // fetched in one request rather than two per Unit.
  const { dataFor } = useRevisionDataMap(
    units.flatMap((unit) => [unit.LastReleasedRevision?.RevisionID, unit.HeadRevision?.RevisionID]),
  );

  const handleCheckboxToggle = (unitId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!onSelectionChange) return;

    const newSelection = selectedUnitIds.includes(unitId)
      ? selectedUnitIds.filter((id) => id !== unitId)
      : [...selectedUnitIds, unitId];

    onSelectionChange(newSelection);
  };

  const handleToggleAll = () => {
    if (!onSelectionChange) return;
    const allUnitIds = units.map((unit) => unit.Unit?.UnitID || '').filter(Boolean);
    // If all are selected, uncheck all. Otherwise, check all
    if (selectedUnitIds.length === allUnitIds.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(allUnitIds);
    }
  };

  const handleToggleEditMode = () => {
    const selectedDiff = units.find((unit) => unit.Unit?.UnitID === selectedUnitId);
    if (!isEditMode && selectedDiff) {
      // Entering edit mode - initialize with head revision data
      setEditedData(dataFor(selectedDiff.HeadRevision?.RevisionID));
    }
    setIsEditMode(!isEditMode);
  };

  const handleSave = async () => {
    if (!selectedUnitId || !onSave) return;

    setIsSaving(true);
    try {
      await onSave(selectedUnitId, editedData);
      // Refresh data first to get updated revisions
      if (onRefresh) {
        onRefresh();
      }
      // Then exit edit mode to show the updated diff
      setIsEditMode(false);
    } catch (error) {
      console.error('Failed to save unit data:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const allSelected = units.length > 0 && selectedUnitIds.length === units.length;

  if (units.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant='body2' color='text.secondary'>
          No diffs to display
        </Typography>
      </Box>
    );
  }

  const selectedDiff = units.find((unit) => unit.Unit?.UnitID === selectedUnitId);

  return (
    <Box sx={{ display: 'flex', overflow: 'hidden', height: containerHeight }}>
      {/* Left Sidebar - Unit List */}
      <Box
        sx={{
          width: SIDEBAR_WIDTH,
          borderRight: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header with controls */}
        {(onSelectionChange || headerToolbar) && (
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Stack direction='row' justifyContent='space-between' alignItems='center'>
              {onSelectionChange && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={allSelected}
                      indeterminate={
                        selectedUnitIds.length > 0 && selectedUnitIds.length < units.length
                      }
                      onChange={handleToggleAll}
                      size='small'
                    />
                  }
                  label={
                    <Typography variant='body2' fontWeight='medium'>
                      Select All
                    </Typography>
                  }
                />
              )}
              {headerToolbar}
            </Stack>
          </Box>
        )}
        <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
          {units.map((unit) => {
            const unitId = unit.Unit?.UnitID || '';
            const unitSlug = unit.Unit?.Slug || 'Unknown Unit';
            const stats = getDiffStats(
              dataFor(unit.LastReleasedRevision?.RevisionID),
              dataFor(unit.HeadRevision?.RevisionID),
            );
            const totalChanges = stats.additions + stats.deletions + stats.changes;
            const isActive = selectedUnitId === unitId;

            const isSelected = selectedUnitIds.includes(unitId);

            return (
              <ListItem
                key={unitId}
                secondaryAction={
                  onSelectionChange && (
                    <Checkbox
                      edge='end'
                      onChange={(e) =>
                        handleCheckboxToggle(unitId, e as unknown as React.MouseEvent)
                      }
                      checked={isSelected}
                      size='small'
                    />
                  )
                }
                sx={{
                  backgroundColor: isActive ? 'action.selected' : 'transparent',
                  borderLeft: '3px solid',
                  borderLeftColor: isActive ? 'primary.main' : 'transparent',
                }}
              >
                <ListItemButton onClick={() => setSelectedUnitId(unitId)} dense>
                  <ListItemText
                    primary={
                      <Stack direction='row' spacing={1} alignItems='center'>
                        <Typography variant='body2' fontWeight={isActive ? 600 : 400}>
                          {unitSlug}
                        </Typography>
                        <Chip label={totalChanges} size='small' sx={{ height: 18 }} />
                      </Stack>
                    }
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>

      {/* Right Content Area */}
      <Stack direction='column' width='100%'>
        {title}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: CONTENT_BACKGROUND_COLOR,
            overflow: 'hidden',
          }}
        >
          {selectedDiff ? (
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <Box
                sx={{
                  height: `calc(100vh - ${editorOffset})`,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 1,
                  overflow: 'auto',
                  backgroundColor: theme.palette.background.paper,
                  p: 2,
                }}
              >
                {/* Header with Stats and Edit Controls */}
                <Stack direction='row' spacing={1} alignItems='center' mb={2}>
                  <Ellipses variant='subtitle1' fontWeight='medium' flex={1}>
                    {selectedDiff.Unit?.Slug || 'Unknown Unit'}
                  </Ellipses>
                  <Stack direction='row' spacing={1} alignItems='center'>
                    {!isEditMode &&
                      (() => {
                        const liveData = dataFor(selectedDiff.LastReleasedRevision?.RevisionID);
                        const headData = dataFor(selectedDiff.HeadRevision?.RevisionID);
                        const stats = getDiffStats(liveData, headData);

                        return (
                          <>
                            {stats.additions > 0 && (
                              <Chip
                                label={`+${stats.additions}`}
                                size='small'
                                color='success'
                                variant='outlined'
                              />
                            )}
                            {stats.deletions > 0 && (
                              <Chip
                                label={`-${stats.deletions}`}
                                size='small'
                                color='error'
                                variant='outlined'
                              />
                            )}
                            {stats.changes > 0 && (
                              <Chip
                                label={`~${stats.changes}`}
                                size='small'
                                color='warning'
                                variant='outlined'
                              />
                            )}
                          </>
                        );
                      })()}
                    {!isEditMode && (
                      <Typography variant='body2' color='text.secondary'>
                        Rev {selectedDiff.LastReleasedRevision?.RevisionNum} →{' '}
                        {selectedDiff.HeadRevision?.RevisionNum}
                      </Typography>
                    )}
                    {enableEditMode && (
                      <>
                        {isEditMode ? (
                          <>
                            <Button
                              size='small'
                              variant='contained'
                              startIcon={isSaving ? <CircularProgress size={16} /> : <Save />}
                              onClick={handleSave}
                              disabled={isSaving}
                            >
                              {isSaving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button
                              size='small'
                              variant='outlined'
                              onClick={handleToggleEditMode}
                              disabled={isSaving}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Tooltip title='Edit Config'>
                            <IconButton size='small' onClick={handleToggleEditMode}>
                              <Edit fontSize='small' />
                            </IconButton>
                          </Tooltip>
                        )}
                      </>
                    )}
                  </Stack>
                </Stack>

                {/* Editor Content */}
                {isEditMode ? (
                  <Box sx={{ height: 'calc(100% - 50px)' }}>
                    <Editor
                      height='100%'
                      language={language}
                      value={editedData}
                      onChange={(value) => setEditedData(value || '')}
                      theme={'vs-dark'}
                      options={{
                        minimap: { enabled: true },
                        scrollBeyondLastLine: false,
                        fontSize: 14,
                        wordWrap: 'on',
                      }}
                    />
                  </Box>
                ) : (
                  <DiffEditor
                    originalContent={dataFor(selectedDiff.LastReleasedRevision?.RevisionID)}
                    modifiedContent={dataFor(selectedDiff.HeadRevision?.RevisionID)}
                    language={language}
                    height='90%'
                  />
                )}
              </Box>
            </Box>
          ) : (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant='body2' color='text.secondary'>
                Select a unit from the list to view diff
              </Typography>
            </Box>
          )}
          {action}
        </Box>
      </Stack>
    </Box>
  );
};
