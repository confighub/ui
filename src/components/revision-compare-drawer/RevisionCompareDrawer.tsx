// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CopyLinkButton } from '@/components/copy-link-button/CopyLinkButton';
import { CodeEditor, type Language } from '@/components/code-editor/CodeEditor';
import { DiffEditor } from '@/components/diff-editor/DiffEditor';
import { useRevisionDataMap } from '@/hooks/useUnitData';
import { buildUnitDiff } from '@/components/invoker/utils/diff-from-revisions';
import { Ellipses } from '@/components/styled';
import { RevisionViewerUrlState, UseRevisionViewerUrlReturn } from '@/hooks/useRevisionViewerUrl';
import { TreeDiffSection } from '@/pages/x/apps/TreeDiffSection';
import { useColumnResize } from '@/pages/x/apps/useColumnResize';
import { type RevisionRow } from '@/types';
import { TOP_NAV_HEIGHT } from '@/utility/constants';
import CloseIcon from '@mui/icons-material/Close';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

/** Width of the drawer in pixels */
const DRAWER_WIDTH = 1200;

/** Width of the sidebar in pixels */
const SIDEBAR_WIDTH = 280;

/** Background color for the drawer content area */
const CONTENT_BACKGROUND_COLOR = 'rgb(249, 250, 251)';

/**
 * Height of the scrollable content pane. The drawer paper starts below the top
 * nav (see the MuiDrawer theme override), so the nav height is subtracted in
 * addition to the drawer's own header/toolbar chrome.
 */
const CONTENT_PANE_HEIGHT = `calc(100vh - ${TOP_NAV_HEIGHT + 180}px)`;

export interface RevisionCompareDrawerProps {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Callback when the drawer is closed */
  onClose: () => void;
  /** The data for the currently selected revision */
  revisionData: string;
  /** The revision number of the currently selected revision */
  revisionNumber: number;
  /** Optional description for the current revision */
  revisionDescription?: string;
  /** All available revisions */
  allRevisions: RevisionRow[];
  /** Callback when user selects a different revision */
  onRevisionChange?: (revision: RevisionRow) => void;
  /** URL state for managing view mode */
  urlState?: RevisionViewerUrlState;
  /** Callback to set diff target (previous/next) */
  setDiffTarget?: (target: 'previous' | 'next' | null) => void;
  /** Optional language for syntax highlighting. Defaults to 'yaml' */
  language?: string;
  /** Whether to show the restore button. Defaults to false */
  showRestoreButton?: boolean;
  /** Callback when restore is confirmed */
  onRevisionConfirmed?: (revision: RevisionRow) => Promise<void>;
  /** Revision viewer URL helper */
  revisionViewerUrl?: UseRevisionViewerUrlReturn;
}

type ViewMode = 'single' | 'compare';

/**
 * RevisionDiffCompareView Component
 *
 * A comprehensive revision viewer with sidebar navigation and comparison capabilities.
 * Drop-in replacement for RevisionViewerDrawer with enhanced UX.
 *
 * Features:
 * - Sidebar with all revisions (click to view, checkbox to compare)
 * - Single view mode (view one revision)
 * - Compare mode (diff two selected revisions)
 * - Navigation arrows to move between revisions
 * - Quick compare with previous/next
 * - Optional restore functionality
 */
export const RevisionCompareDrawer = ({
  isOpen,
  onClose,
  revisionData,
  revisionNumber,
  allRevisions,
  onRevisionChange,
  urlState,
  setDiffTarget,
  language = 'yaml' as Language,
  onRevisionConfirmed,
  revisionViewerUrl,
}: RevisionCompareDrawerProps) => {
  const { columnStyle, onDividerMouseDown, isDragging: isColumnDragging } = useColumnResize();

  const [showFieldTree, setShowFieldTree] = useState(true);

  // Sort revisions by revision number (newest first for display)
  const sortedRevisions = useMemo(
    () => [...allRevisions].sort((a, b) => (b.RevisionNum || 0) - (a.RevisionNum || 0)),
    [allRevisions],
  );

  // Find current revision
  const currentRevision = useMemo(
    () => sortedRevisions.find((rev) => rev.RevisionNum === revisionNumber),
    [sortedRevisions, revisionNumber],
  );

  // Selected revision IDs for viewing/comparing
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    return currentRevision ? [currentRevision.id] : [];
  });

  // Track if comparison order is swapped
  const [isSwapped, setIsSwapped] = useState(false);

  // Sync with current revision when it changes
  useEffect(() => {
    if (currentRevision) {
      setSelectedIds((prev) => {
        // If we're not in compare mode, update to current revision
        if (prev.length === 1) {
          return [currentRevision.id];
        }
        return prev;
      });
    }
  }, [currentRevision]);

  // Sync with URL state for diff mode and compare mode
  useEffect(() => {
    if (urlState?.viewMode === 'diff' && currentRevision) {
      const currentIndex = sortedRevisions.findIndex((rev) => rev.id === currentRevision.id);

      if (urlState.diffTarget === 'previous' && currentIndex < sortedRevisions.length - 1) {
        const previousRev = sortedRevisions[currentIndex + 1];
        setSelectedIds([previousRev.id, currentRevision.id]);
        setIsSwapped(false);
      } else if (urlState.diffTarget === 'next' && currentIndex > 0) {
        const nextRev = sortedRevisions[currentIndex - 1];
        setSelectedIds([currentRevision.id, nextRev.id]);
        setIsSwapped(false);
      }
    } else if (urlState?.viewMode === 'compare' && urlState.compareRevision1 && urlState.compareRevision2) {
      // Handle compare mode with two specific revisions
      const rev1 = sortedRevisions.find((rev) => rev.RevisionNum === urlState.compareRevision1);
      const rev2 = sortedRevisions.find((rev) => rev.RevisionNum === urlState.compareRevision2);
      if (rev1 && rev2) {
        setSelectedIds([rev1.id, rev2.id]);
        setIsSwapped(false);
      }
    } else if (urlState?.viewMode === 'single' && currentRevision) {
      setSelectedIds([currentRevision.id]);
      setIsSwapped(false);
    }
  }, [urlState, currentRevision, sortedRevisions]);

  // Determine view mode based on number of selected revisions
  const viewMode: ViewMode = selectedIds.length === 2 ? 'compare' : 'single';

  // Get selected revisions
  const selectedRevisions = useMemo(
    () => sortedRevisions.filter((rev) => selectedIds.includes(rev.id)),
    [sortedRevisions, selectedIds],
  );

  const activeRevision = selectedRevisions[0] || currentRevision;

  // The configuration is not on the Revision. Both sides of the comparison, and the single
  // Revision the non-compare view shows, come from one request.
  const { dataFor } = useRevisionDataMap([
    ...selectedRevisions.map((r) => r.Revision?.RevisionID),
    activeRevision?.Revision?.RevisionID,
  ]);

  // Handle revision selection
  const handleRevisionClick = useCallback(
    (revision: RevisionRow) => {
      setSelectedIds([revision.id]);
      setIsSwapped(false);
      setDiffTarget?.(null);
      onRevisionChange?.(revision);
    },
    [onRevisionChange, setDiffTarget],
  );

  // Handle checkbox toggle for comparison
  const handleCheckboxToggle = useCallback((revisionId: string) => {
    setSelectedIds((prev) => {
      const newSelection = prev.includes(revisionId)
        ? prev.filter((id) => id !== revisionId) // Uncheck: remove from selection
        : prev.length >= 2
          ? [prev[1], revisionId] // Replace the oldest selection
          : [...prev, revisionId]; // Check: add to selection (max 2)

      // Update URL if two revisions are selected for comparison
      if (newSelection.length === 2 && revisionViewerUrl) {
        const rev1 = sortedRevisions.find((rev) => rev.id === newSelection[0]);
        const rev2 = sortedRevisions.find((rev) => rev.id === newSelection[1]);
        if (rev1 && rev2) {
          revisionViewerUrl.openCompare(rev1.RevisionNum, rev2.RevisionNum);
        }
      } else if (newSelection.length === 1 && revisionViewerUrl) {
        // If only one is selected, switch to single view
        const rev = sortedRevisions.find((rev) => rev.id === newSelection[0]);
        if (rev) {
          revisionViewerUrl.openRevision(rev.RevisionNum);
        }
      }

      return newSelection;
    });
    // Reset swap state when selections change
    setIsSwapped(false);
  }, [sortedRevisions, revisionViewerUrl]);

  // Swap comparison order
  const handleSwapCompare = useCallback(() => {
    if (selectedIds.length === 2) {
      setIsSwapped((prev) => !prev);
    }
  }, [selectedIds]);

  // Get data for rendering
  const renderData = useMemo(() => {
    if (viewMode === 'compare' && selectedRevisions.length === 2) {
      const [rev1, rev2] = selectedRevisions;
      // Determine older and newer revisions
      const older = (rev1.RevisionNum || 0) < (rev2.RevisionNum || 0) ? rev1 : rev2;
      const newer = (rev1.RevisionNum || 0) < (rev2.RevisionNum || 0) ? rev2 : rev1;

      // Apply swap if toggled
      const fromRevision = isSwapped ? newer : older;
      const toRevision = isSwapped ? older : newer;

      const unitDiff = buildUnitDiff(
        `${fromRevision.id}-${toRevision.id}`,
        '',
        '',
        dataFor(fromRevision.Revision?.RevisionID),
        dataFor(toRevision.Revision?.RevisionID),
      );

      const additions = unitDiff.diffs.filter((d) => d.oldValue === '-').length;
      const deletions = unitDiff.diffs.filter((d) => d.newValue === '-').length;
      const changes = unitDiff.diffs.filter((d) => d.oldValue !== '-' && d.newValue !== '-').length;
      const totalChanges = additions + deletions + changes;

      return {
        type: 'compare' as const,
        fromRevision,
        toRevision,
        unitDiff,
        additions,
        deletions,
        changes,
        totalChanges,
      };
    } else if (activeRevision) {
      const unitDiff = buildUnitDiff(
        activeRevision.id,
        '',
        '',
        undefined,
        dataFor(activeRevision.Revision?.RevisionID) || revisionData,
      );
      return {
        type: 'single' as const,
        revision: activeRevision,
        unitDiff,
        decodedData: dataFor(activeRevision.Revision?.RevisionID) || revisionData,
      };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedRevisions, activeRevision, revisionData, isSwapped, dataFor]);

  return (
    <Drawer
      anchor='right'
      open={isOpen}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
        },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            py: 2,
            pl: 2,
            pr: 2,
            pb: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.paper',
          }}
        >
          {/* Title Row */}
          <Stack direction='row' justifyContent='space-between' alignItems='center' mb={1}>
            <Typography variant='h4' fontWeight='bold' color='text.primary'>
              Diff
            </Typography>
            <Stack direction='row' spacing={1} alignItems='center'>
              {revisionViewerUrl && (
                <CopyLinkButton
                  shareUrl={revisionViewerUrl.getCurrentUrl()}
                  show={true}
                  type='view'
                  showText={false}
                />
              )}
              <IconButton onClick={onClose} size='small' sx={{ color: 'text.secondary' }}>
                <CloseIcon />
              </IconButton>
            </Stack>
          </Stack>

          {viewMode === 'compare' && renderData?.type === 'compare' && (
            <Stack direction='row' alignItems='center' spacing={2}>
              <IconButton size='small' onClick={handleSwapCompare}>
                <SwapVertIcon color='primary' />
              </IconButton>
              <Typography variant='body2' color='text.secondary'>
                Comparing revision {renderData.fromRevision.RevisionNum} to{' '}
                {renderData.toRevision.RevisionNum}
              </Typography>
              <Chip
                label={`${renderData.totalChanges} ${renderData.totalChanges === 1 ? 'change' : 'changes'}`}
                size='small'
                color='primary'
                variant='outlined'
              />
              <ToggleButtonGroup
                value={showFieldTree ? 'fields' : 'source'}
                exclusive
                size='small'
                onChange={(_e, val: 'fields' | 'source' | null) => {
                  if (val !== null) setShowFieldTree(val === 'fields');
                }}
              >
                <ToggleButton value='fields' sx={{ py: 0.25, px: 1, fontSize: 12 }}>
                  Fields
                </ToggleButton>
                <ToggleButton value='source' sx={{ py: 0.25, px: 1, fontSize: 12 }}>
                  Source
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          )}
          {viewMode === 'single' && activeRevision && (
            <Stack direction='row' alignItems='center' spacing={2}>
              <IconButton size='small'>
                <SwapVertIcon />
              </IconButton>
              <Typography variant='body2' color='text.secondary'>
                Viewing revision {activeRevision.RevisionNum}
              </Typography>
              <ToggleButtonGroup
                value={showFieldTree ? 'fields' : 'source'}
                exclusive
                size='small'
                onChange={(_e, val: 'fields' | 'source' | null) => {
                  if (val !== null) setShowFieldTree(val === 'fields');
                }}
              >
                <ToggleButton value='fields' sx={{ py: 0.25, px: 1, fontSize: 12 }}>
                  Fields
                </ToggleButton>
                <ToggleButton value='source' sx={{ py: 0.25, px: 1, fontSize: 12 }}>
                  Source
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          )}
        </Box>

        {/* Main Content Area */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Sidebar - Revision List */}
          <Box
            sx={{
              width: SIDEBAR_WIDTH,
              borderRight: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'background.default',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
              {sortedRevisions.map((revision) => {
                const isSelected = selectedIds.includes(revision.id);
                const isActive =
                  selectedIds.length === 1 ? isSelected : selectedIds.includes(revision.id);

                return (
                  <ListItem
                    key={revision.id}
                    disablePadding
                    secondaryAction={
                      <Checkbox
                        edge='end'
                        onChange={() => handleCheckboxToggle(revision.id)}
                        checked={isSelected}
                        disabled={!isSelected && selectedIds.length >= 2}
                      />
                    }
                    sx={{
                      backgroundColor: isActive ? 'action.selected' : 'transparent',
                      borderLeft: '3px solid',
                      borderLeftColor: isActive ? 'primary.main' : 'transparent',
                    }}
                  >
                    <ListItemButton onClick={() => handleRevisionClick(revision)} dense>
                      <ListItemText
                        primary={
                          <Stack direction='row' spacing={1} alignItems='center'>
                            <Typography variant='body2' fontWeight={isActive ? 600 : 400}>
                              Rev {revision.RevisionNum}
                            </Typography>
                            {revision.Revision?.Source && (
                              <Chip
                                label={revision.Revision.Source}
                                size='small'
                                sx={{ height: 18 }}
                              />
                            )}
                          </Stack>
                        }
                        secondary={
                          <Ellipses
                            variant='caption'
                            color='text.secondary'
                            sx={{ display: 'block' }}
                          >
                            {revision.Revision?.Description || 'No description'}
                          </Ellipses>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>

          {/* Right Content Area */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: CONTENT_BACKGROUND_COLOR,
              overflow: 'hidden',
            }}
          >
            {/* Content */}
            <Box sx={{ flex: 1, overflow: 'hidden', p: 2 }}>
              {renderData?.type === 'single' && (
                <Box
                  sx={{
                    height: CONTENT_PANE_HEIGHT,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    overflow: showFieldTree ? 'auto' : 'hidden',
                    backgroundColor: 'background.paper',
                    p: 2,
                  }}
                >
                  {viewMode === 'single' && activeRevision && (
                    <Stack direction='row' alignItems='center' spacing={2} mb={2}>
                      <Ellipses
                        variant='subtitle1'
                        fontWeight='medium'
                        flex={1}
                        sx={{ maxWidth: 850 }}
                      >
                        Revision {activeRevision.RevisionNum}
                        {activeRevision.Revision?.Description &&
                          `: ${activeRevision.Revision.Description}`}
                      </Ellipses>
                      <Button
                        variant='text'
                        onClick={() => {
                          if (onRevisionConfirmed) {
                            onRevisionConfirmed(activeRevision);
                          }
                        }}
                      >
                        Restore
                      </Button>
                    </Stack>
                  )}

                  {showFieldTree ? (
                    renderData.unitDiff.diffs.length > 0 ? (
                      <TreeDiffSection
                        entry={{
                          unitId: renderData.unitDiff.unitId,
                          fieldDiffs: renderData.unitDiff.diffs,
                        }}
                        allPaths={renderData.unitDiff.allPaths}
                        keyPrefix='rev-single'
                        label={`Revision ${renderData.revision.RevisionNum}`}
                        variant='data'
                        viewOnly
                        columnStyle={columnStyle}
                        onDividerMouseDown={onDividerMouseDown}
                        isDragging={isColumnDragging}
                        hideLabel
                      />
                    ) : (
                      <Typography variant='body2' color='text.secondary' fontStyle='italic'>
                        Structured diff unavailable for this format
                      </Typography>
                    )
                  ) : (
                    <CodeEditor
                      value={renderData.decodedData}
                      language={language as Language}
                      readonly
                      height='90%'
                    />
                  )}
                </Box>
              )}

              {renderData?.type === 'compare' && (
                <Box
                  sx={{
                    height: CONTENT_PANE_HEIGHT,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    overflow: showFieldTree ? 'auto' : 'hidden',
                    backgroundColor: 'background.paper',
                    p: 2,
                  }}
                >
                  {/* Diff Stats Header */}
                  <Stack direction='row' spacing={1} alignItems='center' mb={2}>
                    <Ellipses variant='subtitle1' fontWeight='medium' flex={1}>
                      {renderData.fromRevision.Revision?.Description ||
                        `Revision ${renderData.fromRevision.RevisionNum}`}
                    </Ellipses>
                    <Stack direction='row' spacing={1}>
                      {renderData.additions > 0 && (
                        <Chip
                          label={`+${renderData.additions}`}
                          size='small'
                          color='success'
                          variant='outlined'
                        />
                      )}
                      {renderData.deletions > 0 && (
                        <Chip
                          label={`-${renderData.deletions}`}
                          size='small'
                          color='error'
                          variant='outlined'
                        />
                      )}
                      {renderData.changes > 0 && (
                        <Chip
                          label={`~${renderData.changes}`}
                          size='small'
                          color='warning'
                          variant='outlined'
                        />
                      )}
                    </Stack>
                    <Typography variant='body2' color='text.secondary'>
                      Rev {renderData.fromRevision.RevisionNum} →{' '}
                      {renderData.toRevision.RevisionNum}
                    </Typography>
                  </Stack>

                  {showFieldTree ? (
                    renderData.unitDiff.diffs.length > 0 ? (
                      <TreeDiffSection
                        entry={{
                          unitId: renderData.unitDiff.unitId,
                          fieldDiffs: renderData.unitDiff.diffs,
                        }}
                        allPaths={renderData.unitDiff.allPaths}
                        keyPrefix='rev'
                        label={`r${renderData.fromRevision.RevisionNum} → r${renderData.toRevision.RevisionNum}`}
                        variant='data'
                        showAllContext
                        columnStyle={columnStyle}
                        onDividerMouseDown={onDividerMouseDown}
                        isDragging={isColumnDragging}
                        hideLabel
                      />
                    ) : (
                      <Typography variant='body2' color='text.secondary' fontStyle='italic'>
                        Structured diff unavailable for this format
                      </Typography>
                    )
                  ) : (
                    <DiffEditor
                      originalContent={dataFor(renderData.fromRevision.Revision?.RevisionID)}
                      modifiedContent={dataFor(renderData.toRevision.Revision?.RevisionID)}
                      language={language}
                      height='91%'
                    />
                  )}
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
};
