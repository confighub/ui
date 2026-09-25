// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';

import { DiffDrawer } from '@/components/diff-drawer/DiffDrawer';
import { useLazyUnitData, useRevisionDataMap, useRevisionMutationSourcesMap } from '@/hooks/useUnitData';
import { DATE_TIME_GRID_SLOTS } from '@/components/data-grid/cells';
import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { ErrorBox } from '@/components/error-box/ErrorBox';
import { MutationDrawer } from '@/components/mutation-drawer/MutationDrawer';
import { RevisionCompareDrawer } from '@/components/revision-compare-drawer/RevisionCompareDrawer';
import { Section } from '@/components/styled';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { useRevisionViewerUrl } from '@/hooks/useRevisionViewerUrl';
import {
  ResourceMutation,
  RevisionRead,
  TagRead,
  ExtendedUnitRead,
  UnitRead,
  UpdateUnitApiArg,
  useUpdateUnitMutation,
} from '@confighub/rtk-query';
import { CmpProps, type RevisionRow } from '@/types';
import { Direction } from '@/types/enums';
import { isIDInvalid } from '@/utility/validation-functions';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import SourceOutlinedIcon from '@mui/icons-material/SourceOutlined';
import Button from '@mui/material/Button';
import { GridRowSelectionModel } from '@mui/x-data-grid';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { RemoveTagModal } from '../../../../components/remove-tag-modal/RemoveTagModal';
import { TagRevisionModal } from '../../../../components/tag-revision-modal/TagRevisionModal';
import { RevisionsTreeView } from '../revisions-tree-view/RevisionsTreeView';
import { createRevisionTableColumns } from './revision-columns';

export interface IRevisionsTableProps extends CmpProps {
  rows: Array<RevisionRow>;
  currentUnitExtended: ExtendedUnitRead;
  upstreamUnit: UnitRead | undefined;
  onRowSelected?: (newSelection: Array<string>) => void;
  onRevisionApplied?: () => void;
  disableToolbar?: boolean;
  changesetId?: string;
  onRefresh?: () => void;
}

/**
 * RevisionsTable provides a comprehensive interface for managing unit revisions.
 */
export const RevisionsTable = ({
  rows = [],
  currentUnitExtended = {} as ExtendedUnitRead,
  onRowSelected,
  onRevisionApplied,
  upstreamUnit,
  disableToolbar = false,
  changesetId,
  onRefresh,
}: IRevisionsTableProps) => {
  const {
    applyStoredWidths,
    columnVisibilityModel,
    onColumnVisibilityModelChange,
    sortModel,
    onSortModelChange,
  } = useGridPersistence('revisions-table', {
    sortModel: [{ field: 'RevisionNum', sort: 'desc' }],
    columnVisibility: {
      RevisionNum: true,
      tags: true,
      markers: true,
      source: true,
      description: true,
      userName: true,
      validationErrors: true,
      createdAt: false,
      updatedAt: true,
      liveAt: true,
    } as Record<string, boolean>,
  });

  const [updateUnit, { isSuccess: isUpdateSuccess, error: updateError }] =
    useUpdateUnitMutation();
  const [selectedTab, setSelectedTab] = useState(0);
  const [isUpstreamDiffOpen, setIsUpstreamDiffOpen] = useState(false);
  const [isMutationDetailDrawerOpen, setIsMutationDetailDrawerOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<GridRowSelectionModel>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [tagErrorMessage, setTagErrorMessage] = useState<string>('');
  const [revisionToTag, setRevisionToTag] = useState<RevisionRow | null>(null);
  const [isRemoveTagModalOpen, setIsRemoveTagModalOpen] = useState(false);
  const [tagToRemove, setTagToRemove] = useState<TagRead | null>(null);

  const [fromMessage, setFromMessage] = useState('');
  const [toMessage, setToMessage] = useState('');
  const [fromData, setFromData] = useState('');
  const [toData, setToData] = useState('');

  // URL-based revision viewer state
  const revisionViewerUrl = useRevisionViewerUrl();
  const {
    state: revisionViewerState,
    openRevision,
    closeDrawer,
    switchToRevision,
    setDiffTarget,
  } = revisionViewerUrl;
  const [selectedRevisionForView, setSelectedRevisionForView] = useState<RevisionRow | null>(
    null,
  );

  const fromRow = rows.find((row) => row.id === selectedRows?.[0]);
  const fromRevision = fromRow?.Revision || ({} as RevisionRead);

  // Configuration and mutation sources are not on the Revision. The two Revisions these
  // drawers can show are fetched together, and the upstream diff fetches its Units when it
  // opens.
  const { dataFor: revisionDataFor } = useRevisionDataMap([
    fromRevision?.RevisionID,
    selectedRevisionForView?.Revision?.RevisionID,
  ]);
  const { sourcesFor: revisionSourcesFor } = useRevisionMutationSourcesMap([
    fromRevision?.RevisionID,
  ]);
  const fetchUnitData = useLazyUnitData();

  const handleTagClick = (row: RevisionRow) => {
    setRevisionToTag(row);
    setIsTagModalOpen(true);
  };

  const handleTagDelete = (_row: RevisionRow, tag: TagRead) => {
    setTagToRemove(tag);
    setIsRemoveTagModalOpen(true);
  };

  useApiErrorMessage(updateError, isUpdateSuccess, setErrorMessage, {
    onSuccess: () => {
      onRevisionApplied?.();
      handleCloseRevisionViewer();
    },
    onError: () => {
      handleCloseRevisionViewer();
    },
  });

  // Sync URL state with selected revision
  useEffect(() => {
    if (revisionViewerState.isOpen && revisionViewerState.revisionNumber) {
      const revision = rows.find(
        (row) => row.RevisionNum === revisionViewerState.revisionNumber,
      );
      if (revision) {
        setSelectedRevisionForView(revision);
      }
    } else {
      setSelectedRevisionForView(null);
    }
  }, [revisionViewerState, rows]);

  const onRevisionConfirmed = async (revision: RevisionRow) => {
    const revisionId = revision?.Revision?.RevisionID || fromRevision.RevisionID;
    try {
      const input: UpdateUnitApiArg = {
        unitId: currentUnitExtended?.Unit?.UnitID || '',
        spaceId: currentUnitExtended?.Unit?.SpaceID || '',
        unit: {
          ...(currentUnitExtended?.Unit || ({} as UnitRead)),
        },
        revisionId,
        ...(changesetId ? { changesetId } : {}),
      };

      await updateUnit(input);
    } finally {
      handleCloseRevisionViewer();
    }
  };

  const handleRowSelection = (newSelection: GridRowSelectionModel) => {
    setSelectedRows(newSelection);
    // @ts-expect-error it's actually a string array
    onRowSelected?.(newSelection);
  };

  const onMutationDetailsClick = () => {
    setIsMutationDetailDrawerOpen(true);
  };

  const handleViewRevision = (revision: RevisionRow) => {
    openRevision(revision.RevisionNum);
  };

  const onUpstreamDiffClick = async () => {
    setFromMessage(`upstream unit ${upstreamUnit?.Slug}`);
    setToMessage(`current unit ${currentUnitExtended?.Unit?.Slug}`);

    // The configuration is not on the Unit; both sides are fetched when the diff opens.
    const [from, to] = await Promise.all([
      fetchUnitData(upstreamUnit?.SpaceID, upstreamUnit?.UnitID),
      fetchUnitData(currentUnitExtended?.Unit?.SpaceID, currentUnitExtended?.Unit?.UnitID),
    ]);
    setFromData(from);
    setToData(to);

    setIsUpstreamDiffOpen(true);
  };

  const handleCloseRevisionViewer = () => {
    closeDrawer();
  };

  const handleRevisionChange = (revision: RevisionRow) => {
    switchToRevision(revision.RevisionNum);
  };

  dayjs.extend(relativeTime);

  // Memoize hasUpstreamUnit check
  const hasUpstreamUnit = useMemo(
    () => !isIDInvalid(upstreamUnit?.UnitID),
    [upstreamUnit?.UnitID],
  );

  const customToolbarActions = (
    <>
      {hasUpstreamUnit && (
        <Button
          size='small'
          startIcon={<CompareArrowsOutlinedIcon />}
          onClick={onUpstreamDiffClick}
          sx={{ marginLeft: '8px' }}
        >
          View Upstream Diff
        </Button>
      )}
      {selectedRows.length === 1 && (
        <Button
          size='small'
          startIcon={<SourceOutlinedIcon />}
          onClick={onMutationDetailsClick}
          sx={{ marginLeft: '8px' }}
        >
          Mutation Details
        </Button>
      )}
    </>
  );

  // Memoize base columns definition
  const baseColumns = useMemo(
    () =>
      createRevisionTableColumns(currentUnitExtended, {
        onTagClick: handleTagClick,
        onTagDelete: handleTagDelete,
      }),
    [currentUnitExtended],
  );

  // Apply stored widths to columns
  const columns = useMemo(
    () => applyStoredWidths(baseColumns),
    [applyStoredWidths, baseColumns],
  );

  return (
    <>
      <Section $display={selectedTab === 0} $direction={Direction.FadeIn}>
        <ErrorBox
          error={errorMessage}
          sx={{ mt: 1, mb: 1 }}
          onClose={() => setErrorMessage('')}
        />
        {tagErrorMessage && (
          <ErrorBox
            error={tagErrorMessage}
            sx={{ mt: 1, mb: 1 }}
            onClose={() => setTagErrorMessage('')}
          />
        )}
        <EntityDataGrid
          rows={rows}
          columns={columns}
          checkboxSelection
          loading={false}
          slots={DATE_TIME_GRID_SLOTS}
          columnVisibilityModel={columnVisibilityModel}
          onColumnVisibilityModelChange={onColumnVisibilityModelChange}
          sortModel={sortModel}
          onSortModelChange={onSortModelChange}
          rowSelectionModel={selectedRows}
          onRowSelectionModelChange={handleRowSelection}
          customToolbarActions={disableToolbar ? undefined : customToolbarActions}
          onRowClick={(_, event) => {
            event.stopPropagation();
            handleViewRevision(_.row);
          }}
        />
        <MutationDrawer
          isMutationDrawerOpen={isMutationDetailDrawerOpen}
          onMutationDrawerClosed={() => setIsMutationDetailDrawerOpen(false)}
          unitExtended={currentUnitExtended}
          revisionData={revisionDataFor(fromRevision?.RevisionID)}
          revisionNum={fromRevision?.RevisionNum || 1}
          revisionID={fromRevision?.RevisionID || ''}
          mutations={
            (revisionSourcesFor(fromRevision?.RevisionID) as ResourceMutation[]) || ([] as ResourceMutation[])
          }
        />

        <DiffDrawer
          isDiffDrawerOpen={isUpstreamDiffOpen}
          onDiffDrawerClosed={() => setIsUpstreamDiffOpen(false)}
          fromData={fromData}
          toData={toData}
          diffFromMessage={fromMessage}
          diffToMessage={toMessage}
          canRestoreDiff={false}
          confirmationTooltip='Select to restore the revision'
          defaultShowConfirmation={false}
        />
        <RevisionCompareDrawer
          isOpen={revisionViewerState.isOpen}
          onClose={handleCloseRevisionViewer}
          revisionData={revisionDataFor(selectedRevisionForView?.Revision?.RevisionID)}
          revisionNumber={selectedRevisionForView?.RevisionNum || 0}
          revisionDescription={selectedRevisionForView?.Revision?.Description}
          allRevisions={rows}
          onRevisionChange={handleRevisionChange}
          urlState={revisionViewerState}
          setDiffTarget={setDiffTarget}
          showRestoreButton={true}
          onRevisionConfirmed={onRevisionConfirmed}
          revisionViewerUrl={revisionViewerUrl}
        />
      </Section>
      <Section $display={selectedTab === 1} $direction={Direction.FadeIn}>
        <RevisionsTreeView
          revisionsRows={rows}
          toolchainType={currentUnitExtended?.Unit?.ToolchainType ?? undefined}
          onViewToggle={() => setSelectedTab(0)}
        />
      </Section>
      {currentUnitExtended?.Unit && (
        <TagRevisionModal
          isOpen={isTagModalOpen}
          onClose={() => {
            setIsTagModalOpen(false);
            setRevisionToTag(null);
          }}
          unit={currentUnitExtended.Unit}
          selectedRevision={revisionToTag}
          setErrorMessage={setTagErrorMessage}
          onRefresh={onRefresh}
        />
      )}
      {currentUnitExtended?.Unit && tagToRemove && (
        <RemoveTagModal
          isOpen={isRemoveTagModalOpen}
          onClose={() => {
            setIsRemoveTagModalOpen(false);
            setTagToRemove(null);
          }}
          unit={currentUnitExtended.Unit}
          tag={tagToRemove}
          setErrorMessage={setTagErrorMessage}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
};
