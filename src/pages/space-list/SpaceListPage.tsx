// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useRef, useState } from 'react';

import { ActionContextButton } from '@/components/action-context-button/ActionContextButton';
import { BulkMetadataDrawer } from '@/components/bulk-edit/BulkMetadataDrawer';
import { ConfirmationModal } from '@/components/confirmation-modal/ConfirmationModal';
import { ErrorList } from '@/components/error-list/ErrorList';
import { FilteredEmptyState } from '@/components/filtered-empty-state';
import { Header } from '@/components/header/Header';
import { IncludeHiddenToggle } from '@/components/hidden-entities/IncludeHiddenToggle';
import { useIncludeHidden } from '@/components/hidden-entities/useIncludeHidden';
import { extractLabelOptions, useQueryBuilder } from '@/components/query-builder';
import type { FieldOptions, NamedEntity } from '@/components/query-builder';
import { Main } from '@/components/styled';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { useEditDrawerUrl } from '@/hooks/useEditDrawerUrl';
import { AddSpacePage } from '@/pages/add-space/AddSpacePage';
import { EmptySpaceList } from '@/pages/space-list/components/empty-space-list/EmptySpaceList';
import { SpaceSettingsDrawer } from '@/pages/space-list/components/space-settings-drawer/SpaceSettingsDrawer';
import { SpacesTable } from '@/pages/space-list/components/spaces-table/SpacesTable';
import {
  useBulkDeleteSpacesMutation,
  useBulkPatchSpacesMutation,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import { getApiErrorMessage } from '@/utility/error-functions';
import RefreshIcon from '@mui/icons-material/Cached';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

// The entities the Component, Trigger Filter and Release Target columns name, and the
// filters on those and on the Upstream Space name.
const SPACE_LIST_INCLUDE = 'ComponentID,TriggerFilterID,ReleaseTargetID,UpstreamSpaceID';

type SpaceListItem = NonNullable<ReturnType<typeof useListSpacesQuery>['data']>[number];

type Reference = { id?: string; slug?: string; spaceId?: string };

// The entities the Spaces name through one reference, each once, by slug. A slug is unique only
// within its Space for an entity that belongs to one, so those are grouped by that Space's slug.
const referencedEntities = (
  spaces: SpaceListItem[],
  pick: (space: SpaceListItem) => Reference | undefined,
): NamedEntity[] => {
  const spaceSlugs = new Map(spaces.map((s) => [s.Space?.SpaceID, s.Space?.Slug]));
  const byId = new Map<string, NamedEntity>();
  for (const space of spaces) {
    const ref = pick(space);
    if (!ref?.id || byId.has(ref.id)) continue;
    const group = ref.spaceId ? spaceSlugs.get(ref.spaceId) || ref.spaceId : undefined;
    byId.set(ref.id, { id: ref.id, name: ref.slug || ref.id, group });
  }
  return [...byId.values()].sort(
    (a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.name.localeCompare(b.name),
  );
};

const EMPTY_SPACES: SpaceListItem[] = [];

const Container = styled('div')`
  width: 100%;
`;

export const SpaceListPage = () => {
  const [isAddSpacePageOpen, setIsAddSpacePageOpen] = useState(false);
  const [serverErrors, setServerErrors] = useState<Array<string>>([]);
  const [isDeleteSpacesModalOpen, setIsDeleteSpacesModalOpen] = useState(false);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [selectedSpaces, setSelectedSpaces] = useState<Array<string>>([]);
  const { editEntityId, closeEditDrawer } = useEditDrawerUrl();

  const { includeHidden, setIncludeHidden, includeHiddenParam } = useIncludeHidden();

  // Fetch all spaces first (without filter) to get label options
  const { data: allSpacesData, error: allSpacesError, isFetching: isFetchingAll, refetch: refetchAll } = useListSpacesQuery({ summary: true, include: SPACE_LIST_INCLUDE, includeHidden: includeHiddenParam }, { refetchOnFocus: true });
  const allSpaces = allSpacesData ?? EMPTY_SPACES;

  // Extract label options from all spaces for the Labels filter dropdown
  const labelOptions = useMemo(() => {
    const spaceEntities = allSpaces.map((s) => s.Space);
    return extractLabelOptions(spaceEntities);
  }, [allSpaces]);

  // Use the QueryBuilder hook - manages all filter state internally
  // labelOptions updates when allSpaces loads, causing re-render
  // syncToUrl enables URL param persistence for shareable filter links
  // Map spaces to {id, name} for the save filter space dropdown
  const spaces = useMemo(
    () => allSpaces.map((s) => ({ id: s.Space?.SpaceID || '', name: s.Space?.DisplayName || s.Space?.Slug || '', labels: s.Space?.Labels })).filter((s) => s.id),
    [allSpaces],
  );

  // Extract slug options from spaces for the Slug autocomplete
  const slugOptions = useMemo(
    () => allSpaces.map((s) => ({
      slug: s.Space?.Slug || '',
      spaceName: '',
    })).filter((s) => s.slug),
    [allSpaces],
  );

  // Only the entities some Space refers to: any other would match nothing.
  const fieldOptions = useMemo<FieldOptions>(
    () => ({
      releaseTarget: referencedEntities(allSpaces, (s) => s.ReleaseTarget && { id: s.ReleaseTarget.TargetID, slug: s.ReleaseTarget.Slug, spaceId: s.ReleaseTarget.SpaceID }),
      component: referencedEntities(allSpaces, (s) => s.Component && { id: s.Component.ComponentID, slug: s.Component.Slug }),
      triggerFilter: referencedEntities(allSpaces, (s) => s.TriggerFilter && { id: s.TriggerFilter.FilterID, slug: s.TriggerFilter.Slug, spaceId: s.TriggerFilter.SpaceID }),
      upstreamSpace: referencedEntities(allSpaces, (s) => s.UpstreamSpace && { id: s.UpstreamSpace.SpaceID, slug: s.UpstreamSpace.Slug }),
    }),
    [allSpaces],
  );

  const { QueryBuilderElement, whereClause, clearFilters } = useQueryBuilder({
    entityType: 'Space',
    spaces,
    slugs: slugOptions,
    labelOptions,
    fieldOptions,
    syncToUrl: true,
  });

  // Fetch filtered spaces (skip if no filter applied to avoid duplicate query)
  const { data: filteredSpaces = EMPTY_SPACES, error: filteredSpacesError, isFetching: isFetchingFiltered, refetch: refetchFiltered } = useListSpacesQuery(
    {
      summary: true,
      include: SPACE_LIST_INCLUDE,
      where: whereClause,
      includeHidden: includeHiddenParam,
    },
    { skip: !whereClause, refetchOnFocus: true },
  );

  const whereClauseRef = useRef(whereClause);
  whereClauseRef.current = whereClause;

  const refetch = useCallback(() => {
    if (whereClauseRef.current) {
      refetchFiltered();
    }
    refetchAll();
  }, [refetchFiltered, refetchAll]);

  // Display filtered spaces if filter is applied, otherwise all spaces
  const displayedSpaces = whereClause ? filteredSpaces : allSpaces;
  // A read that failed lists nothing, which is not the same as there being no Spaces: it says so
  // instead, and the filters stay, so a Where the server refused can be corrected.
  const readError = whereClause ? filteredSpacesError : allSpacesError;
  const readErrorMessage = readError ? getApiErrorMessage(readError, 'The Spaces could not be read.') : '';
  const isLoading = isFetchingAll || isFetchingFiltered;

  const [
    bulkDeleteSpaces,
    { isSuccess: isBulkDeleteSuccess, error: bulkDeleteError, data: bulkDeleteData },
  ] = useBulkDeleteSpacesMutation();

  useBulkApiErrorMessage(
    bulkDeleteError,
    isBulkDeleteSuccess,
    bulkDeleteData,
    setServerErrors,
  );

  const onSpaceDeleted = async () => {
    await bulkDeleteSpaces({
      where: `SpaceID IN (${selectedSpaces.map((id) => `'${id}'`).join(',')})`,
    });

    setIsDeleteSpacesModalOpen(false);
  };

  const noneSelected = selectedSpaces.length === 0;

  const [bulkPatchSpaces] = useBulkPatchSpacesMutation();
  const spacesToEdit = useMemo(() => {
    const selected = new Set(selectedSpaces);
    return displayedSpaces.flatMap((s) =>
      s.Space?.SpaceID && selected.has(s.Space.SpaceID) ? [{ ...s.Space, id: s.Space.SpaceID }] : [],
    );
  }, [displayedSpaces, selectedSpaces]);

  return (
    <Container>
      <Header
        breadCrumbs={[
          {
            name: 'Spaces',
          },
        ]}
        addButtonText='Add'
        actions={
          <Tooltip arrow placement='bottom' title='Refresh space list'>
            <IconButton
              size='small'
              onClick={() => refetch()}
              sx={{
                color: 'primary.main',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        }
        onAddButtonClick={() => setIsAddSpacePageOpen(true)}
        editButton={
          <ActionContextButton
            label='Update'
            conditions={[
              {
                condition: noneSelected,
                message: 'Select at least one space to update.',
              },
            ]}
            disabled={noneSelected}
            onActionSelected={() => setIsBulkEditOpen(true)}
          />
        }
        deleteButton={
          <ActionContextButton
            label='Delete'
            conditions={[
              {
                condition: noneSelected,
                message: 'Select at least one space to delete.',
              },
            ]}
            disabled={noneSelected}
            onActionSelected={() => setIsDeleteSpacesModalOpen(true)}
          />
        }
      />
      <Main>
        <ErrorList errors={serverErrors} onClose={() => setServerErrors([])} />
        {readErrorMessage && (
          <Alert severity='error' sx={{ mb: 1 }} data-testid='spaces-read-error'>
            {readErrorMessage}
          </Alert>
        )}
        <SpacesTable
          onRowSelected={(selectedRows) => setSelectedSpaces(selectedRows)}
          spaces={displayedSpaces}
          isLoading={isLoading}
          filterElement={QueryBuilderElement}
          customToolbarActions={
            <IncludeHiddenToggle includeHidden={includeHidden} onChange={setIncludeHidden} entities='spaces' />
          }
          noRowsOverlay={
            readErrorMessage ? (
              <Typography variant='body2' color='error' sx={{ p: 2 }}>
                {readErrorMessage}
              </Typography>
            ) : (
              <FilteredEmptyState entityName='spaces' onClearFilters={clearFilters} />
            )
          }
          emptyState={<EmptySpaceList onAddSpace={() => setIsAddSpacePageOpen(true)} />}
          // Only a read that succeeded can say there are no Spaces.
          hasNoData={allSpacesData?.length === 0}
        />
        <AddSpacePage open={isAddSpacePageOpen} onClose={() => setIsAddSpacePageOpen(false)} />
        <SpaceSettingsDrawer spaceId={editEntityId} onClose={closeEditDrawer} />
        <BulkMetadataDrawer
          isOpen={isBulkEditOpen}
          onClose={() => setIsBulkEditOpen(false)}
          refresh={refetch}
          entityName='Spaces'
          idColumn='SpaceID'
          entities={spacesToEdit}
          // The selection names each Space by ID, so a hidden one shown in the list is written too.
          patch={(where, body) => bulkPatchSpaces({ where, body, includeHidden: '*' }).unwrap()}
        />
        <ConfirmationModal
          isOpen={isDeleteSpacesModalOpen}
          onClose={() => setIsDeleteSpacesModalOpen(false)}
          onSubmit={onSpaceDeleted}
          modalDescriptionText={`Are you sure you want to delete the selected Spaces?`}
          modalTitleText='Delete Spaces'
        />
      </Main>
    </Container>
  );
};

export default SpaceListPage;
