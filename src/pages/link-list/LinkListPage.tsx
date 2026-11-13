// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ActionContextButton } from '@/components/action-context-button/ActionContextButton';
import { ConfirmationModal } from '@/components/confirmation-modal/ConfirmationModal';
import { ErrorList } from '@/components/error-list/ErrorList';
import { FilteredEmptyState } from '@/components/filtered-empty-state';
import { Header } from '@/components/header/Header';
import { IncludeHiddenToggle } from '@/components/hidden-entities/IncludeHiddenToggle';
import { useIncludeHidden } from '@/components/hidden-entities/useIncludeHidden';
import { extractLabelOptions, useQueryBuilder } from '@/components/query-builder';
import type { FieldOptions, NamedEntity } from '@/components/query-builder';
import { Main } from '@/components/styled';
import { runChunkedBulkWrite } from '@/hooks/chunkedBulkWrite';
import { EmptyLinks } from '@/pages/unit-detail/components/empty-links/EmptyLinks';
import { LinkDrawer } from '@/pages/unit-detail/components/link-drawer/LinkDrawer';
import { LINK_UPDATE_TYPES } from '@/pages/unit-detail/components/link-drawer/linkForm';
import { BulkEditLinksDrawer } from '@/pages/unit-detail/components/links-table/BulkEditLinksDrawer';
import { LINK_INCLUDE, type LinkRow, LinksTable } from '@/pages/unit-detail/components/links-table/LinksTable';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type ExtendedLinkRead,
  type Link,
  useBulkDeleteLinksMutation,
  useSearchListLinksQuery,
} from '@confighub/rtk-query';
import RefreshIcon from '@mui/icons-material/Cached';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

const Container = styled('div')`
  width: 100%;
`;

const EMPTY_LINKS: ExtendedLinkRead[] = [];

const toRows = (links: ExtendedLinkRead[]): LinkRow[] =>
  links.flatMap((link) => (link.Link?.LinkID ? [{ id: link.Link.LinkID, ...link }] : []));

// The Spaces the Links name through one reference, each once, by slug.
const referencedSpaces = (
  links: ExtendedLinkRead[],
  pick: (link: ExtendedLinkRead) => { SpaceID?: string; Slug?: string } | undefined,
): NamedEntity[] => {
  const byId = new Map<string, string>();
  for (const link of links) {
    const space = pick(link);
    if (space?.SpaceID) byId.set(space.SpaceID, space.Slug || space.SpaceID);
  }
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
};

const UPDATE_TYPE_OPTIONS: NamedEntity[] = LINK_UPDATE_TYPES.map((type) => ({ id: type, name: type }));

/**
 * Every Link in the organization, from all Spaces, with the same table as a Unit's Links tab. Links
 * are added, opened and edited, updated in bulk and deleted here as there.
 */
export const LinkListPage = () => {
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const { includeHidden, setIncludeHidden, includeHiddenParam } = useIncludeHidden();

  // Every Link, filtered or not: the filters' options, and the Links when none is applied.
  const {
    data: allLinksData,
    error: allLinksError,
    isFetching: isFetchingAll,
    refetch: refetchAll,
  } = useSearchListLinksQuery({ include: LINK_INCLUDE, includeHidden: includeHiddenParam }, { refetchOnFocus: true });
  const allLinks = allLinksData ?? EMPTY_LINKS;

  const labelOptions = useMemo(() => extractLabelOptions(allLinks.map((l) => l.Link)), [allLinks]);
  const slugOptions = useMemo(
    () =>
      allLinks.flatMap((l) => (l.Link?.Slug ? [{ slug: l.Link.Slug, spaceName: l.Space?.Slug ?? l.Link.SpaceSlug ?? '' }] : [])),
    [allLinks],
  );
  // Only the Spaces some Link is in or to: any other would match nothing.
  const spaces = useMemo(() => referencedSpaces(allLinks, (l) => l.Space), [allLinks]);
  const fieldOptions = useMemo<FieldOptions>(
    () => ({
      updateType: UPDATE_TYPE_OPTIONS,
      toSpace: referencedSpaces(allLinks, (l) => l.ToSpace),
    }),
    [allLinks],
  );

  const { QueryBuilderElement, whereClause, clearFilters } = useQueryBuilder({
    entityType: 'Link',
    spaces,
    slugs: slugOptions,
    labelOptions,
    fieldOptions,
    syncToUrl: true,
  });

  const {
    data: filteredLinks = EMPTY_LINKS,
    error: filteredLinksError,
    isFetching: isFetchingFiltered,
    refetch: refetchFiltered,
  } = useSearchListLinksQuery(
    { include: LINK_INCLUDE, includeHidden: includeHiddenParam, where: whereClause },
    { skip: !whereClause, refetchOnFocus: true },
  );

  const whereClauseRef = useRef(whereClause);
  whereClauseRef.current = whereClause;
  const refetch = useCallback(() => {
    if (whereClauseRef.current) refetchFiltered();
    refetchAll();
  }, [refetchFiltered, refetchAll]);

  const rows = useMemo(() => toRows(whereClause ? filteredLinks : allLinks), [whereClause, filteredLinks, allLinks]);
  // A read that failed lists nothing, which is not the same as there being no Links: it says so
  // instead, and the filters stay, so a Where the server refused can be corrected.
  const readError = whereClause ? filteredLinksError : allLinksError;
  const readErrorMessage = readError ? getApiErrorMessage(readError, 'The Links could not be read.') : '';

  // A Link deleted, or filtered out of the table, leaves the selection: Update and Delete act only
  // on what is shown checked.
  useEffect(() => {
    const shown = new Set(rows.map((row) => row.id));
    setSelectedLinkIds((ids) => {
      const kept = ids.filter((id) => shown.has(id));
      return kept.length === ids.length ? ids : kept;
    });
  }, [rows]);

  const selectedLinks = useMemo(() => {
    const selected = new Set(selectedLinkIds);
    return rows.flatMap((row) => (row.Link && selected.has(row.id) ? [row.Link] : [])) as Link[];
  }, [rows, selectedLinkIds]);

  const [bulkDeleteLinks] = useBulkDeleteLinksMutation();
  // The Links can be in many Spaces, so they are deleted by ID across the organization. When any
  // fails the selection stays, so Delete can be tried again.
  const deleteSelected = async () => {
    const failures = await runChunkedBulkWrite(
      'LinkID',
      selectedLinkIds,
      (where) => bulkDeleteLinks({ where, includeHidden: includeHiddenParam }).unwrap(),
      (error) => getApiErrorMessage(error, 'The Links could not be deleted.'),
    );
    setIsDeleteConfirmOpen(false);
    setErrorMessages(failures);
    if (failures.length === 0) setSelectedLinkIds([]);
    refetch();
  };

  const noneSelected = selectedLinkIds.length === 0;

  return (
    <Container>
      <Header
        breadCrumbs={[{ name: 'Links' }]}
        actions={
          <Tooltip arrow placement='bottom' title='Refresh link list'>
            <IconButton
              size='small'
              onClick={refetch}
              sx={{ color: 'primary.main', '&:hover': { backgroundColor: 'action.hover' } }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        }
        addButtonText='Add'
        onAddButtonClick={() => setIsCreating(true)}
        editButton={
          <ActionContextButton
            label='Update'
            conditions={[{ condition: noneSelected, message: 'Select at least one link to update.' }]}
            disabled={noneSelected}
            onActionSelected={() => setIsBulkEditOpen(true)}
          />
        }
        deleteButton={
          <ActionContextButton
            label='Delete'
            conditions={[{ condition: noneSelected, message: 'Select at least one link to delete.' }]}
            disabled={noneSelected}
            onActionSelected={() => setIsDeleteConfirmOpen(true)}
          />
        }
      />
      <Main>
        <ErrorList errors={errorMessages} onClose={() => setErrorMessages([])} />
        {readErrorMessage && (
          <Alert severity='error' sx={{ mb: 1 }} data-testid='links-read-error'>
            {readErrorMessage}
          </Alert>
        )}
        <LinksTable
          rows={rows}
          isLoading={isFetchingAll || isFetchingFiltered}
          persistenceKey='all-links-table'
          selectedRows={selectedLinkIds}
          onRowSelected={setSelectedLinkIds}
          onLinkAction={refetch}
          filterElement={QueryBuilderElement}
          customToolbarActions={
            <IncludeHiddenToggle includeHidden={includeHidden} onChange={setIncludeHidden} entities='links' />
          }
          noRowsOverlay={
            readErrorMessage ? (
              <Typography variant='body2' color='error' sx={{ p: 2 }}>
                {readErrorMessage}
              </Typography>
            ) : (
              <FilteredEmptyState entityName='links' onClearFilters={clearFilters} />
            )
          }
          emptyState={<EmptyLinks />}
          // Only a read that succeeded can say there are no Links.
          hasNoData={allLinksData?.length === 0 && !includeHidden}
        />
        <LinkDrawer
          subject={isCreating ? { mode: 'create', from: [] } : undefined}
          onClose={() => setIsCreating(false)}
          onSaved={() => {
            setIsCreating(false);
            refetch();
          }}
        />
        <BulkEditLinksDrawer
          isOpen={isBulkEditOpen}
          onClose={() => setIsBulkEditOpen(false)}
          links={selectedLinks}
          refresh={refetch}
        />
        <ConfirmationModal
          isOpen={isDeleteConfirmOpen}
          onClose={() => setIsDeleteConfirmOpen(false)}
          onSubmit={deleteSelected}
          modalTitleText='Delete Links'
          modalDescriptionText='Are you sure you want to delete the selected Links?'
        />
      </Main>
    </Container>
  );
};

export default LinkListPage;
