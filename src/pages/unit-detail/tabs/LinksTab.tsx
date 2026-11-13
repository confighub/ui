// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActionButton, createEnablementRule } from '@/components/action-button/ActionButton';
import { ConfirmationModal } from '@/components/confirmation-modal/ConfirmationModal';
import { ErrorList } from '@/components/error-list/ErrorList';
import { IncludeHiddenToggle } from '@/components/hidden-entities/IncludeHiddenToggle';
import { useIncludeHidden } from '@/components/hidden-entities/useIncludeHidden';

import { Section } from '@/components/styled';
import { runChunkedBulkWrite } from '@/hooks/chunkedBulkWrite';
import { getApiErrorMessage } from '@/utility/error-functions';
import { EmptyLinks } from '@/pages/unit-detail/components/empty-links/EmptyLinks';
import {
  LinkRow,
  LinksTable,
} from '@/pages/unit-detail/components/links-table/LinksTable.tsx';
import { Direction } from '@/types/enums';
import { type ExtendedUnitRead, useBulkDeleteLinksMutation } from '@confighub/rtk-query';
import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';

import {
  LinkDirectionFilter,
  LinkFilter,
  UNIT_DETAIL_TAB,
  filterLinkRows,
  readLinkFilter,
  writeLinkFilter,
} from '../unitDetailHrefs';
import { LinkDrawer } from '../components/link-drawer/LinkDrawer';
import { BulkEditLinksDrawer } from '../components/links-table/BulkEditLinksDrawer';
import { linkEnd } from '../components/link-drawer/linkForm';

export interface ILinksTabProps {
  selectedTab: number;
  linkRows: Array<LinkRow>;
  /** The Unit whose Links these are: each Link is from it or to it. */
  unitId: string;
  spaceId: string;
  /** The Unit itself, which a new Link is from */
  unit?: ExtendedUnitRead;
  onLinkAction?: () => void;
}

export const LINKS_TAB_ID = UNIT_DETAIL_TAB.links;

const DIRECTION_LABELS: Record<LinkDirectionFilter, string> = {
  all: 'From and to this unit',
  from: 'From this unit',
  to: 'To this unit',
};

/**
 * LinksTab lists the Links from the unit and the Links to it, from any Space, narrowed by
 * the filters in the page's URL (`unitDetailHrefs`).
 */
export const LinksTab = ({ selectedTab, linkRows, unitId, spaceId, unit, onLinkAction }: ILinksTabProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const from = unit ? linkEnd(unit) : undefined;
  const addLinkButton = (
    <Button
      variant='outlined'
      size='small'
      startIcon={<AddIcon />}
      onClick={() => setCreating(true)}
      disabled={!from}
      data-testid='links-add-link'
    >
      Add Link
    </Button>
  );
  const { includeHidden, setIncludeHidden, includeHiddenParam } = useIncludeHidden();
  const filter = useMemo(() => readLinkFilter(searchParams), [searchParams]);

  const setFilter = (update: Partial<LinkFilter>) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        writeLinkFilter(next, { ...filter, ...update });
        return next;
      },
      { replace: true },
    );
  };

  // The filtered type is offered even when no Link has it, so a link that names it reads
  // as an empty result rather than as a filter that was ignored.
  const updateTypes = useMemo(() => {
    const types = new Set(linkRows.map((row) => row.Link?.UpdateType ?? '').filter((type) => type !== ''));
    if (filter.updateType !== '') types.add(filter.updateType);
    return [...types].sort();
  }, [linkRows, filter.updateType]);

  const filteredRows = useMemo(
    () => filterLinkRows(linkRows, filter, { unitId, spaceId }),
    [linkRows, filter, unitId, spaceId],
  );

  const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);
  const [bulkDeleteLinks] = useBulkDeleteLinksMutation();

  // A Link deleted, or filtered out of the table, leaves the selection: Delete deletes only what
  // is shown checked.
  useEffect(() => {
    const shown = new Set(filteredRows.map((row) => row.id));
    setSelectedLinkIds((ids) => {
      const kept = ids.filter((id) => shown.has(id));
      return kept.length === ids.length ? ids : kept;
    });
  }, [filteredRows]);

  // The Links can be in several Spaces, so they are deleted by ID across the organization. When
  // any fails the selection stays, so Delete can be tried again.
  const deleteSelected = async () => {
    const failures = await runChunkedBulkWrite(
      'LinkID',
      selectedLinkIds,
      (where) => bulkDeleteLinks({ where, includeHidden: includeHiddenParam }).unwrap(),
      (error) => getApiErrorMessage(error, 'The Links could not be deleted.'),
    );
    setIsDeleteConfirmOpen(false);
    setDeleteErrors(failures);
    if (failures.length === 0) setSelectedLinkIds([]);
    onLinkAction?.();
  };

  const selectedCount = selectedLinkIds.length;
  const selectedLinks = useMemo(() => {
    const selected = new Set(selectedLinkIds);
    return filteredRows.flatMap((row) => (row.Link && selected.has(row.id) ? [row.Link] : []));
  }, [filteredRows, selectedLinkIds]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const updateButton = (
    <ActionButton
      buttonText={selectedCount > 1 ? `Update ${selectedCount} Links` : 'Update Link'}
      onButtonClick={() => setIsBulkEditOpen(true)}
      enablementRules={[createEnablementRule(selectedCount === 0, 'Select at least one Link to update.')]}
    />
  );
  const deleteButton = (
    <ActionButton
      buttonText={selectedCount > 1 ? `Delete ${selectedCount} Links` : 'Delete Link'}
      onButtonClick={() => setIsDeleteConfirmOpen(true)}
      enablementRules={[createEnablementRule(selectedCount === 0, 'Select at least one Link to delete.')]}
    />
  );

  return (
    <Section
      $display={selectedTab === LINKS_TAB_ID}
      $direction={Direction.FadeIn}
      $width='100%'
    >
      {selectedTab === LINKS_TAB_ID &&
        // With hidden Links listed, the filters stay so the toggle can be turned off.
        (linkRows.length > 0 || includeHidden ? (
          <>
            <Stack direction='row' spacing={2} alignItems='center' sx={{ mb: 1 }} data-testid='links-filters'>
              <TextField
                select
                size='small'
                label='Update type'
                value={filter.updateType}
                onChange={(e) => setFilter({ updateType: e.target.value })}
                // "All" is the empty value, which a select otherwise shows as blank.
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                sx={{ minWidth: 200 }}
                data-testid='links-filter-update-type'
              >
                <MenuItem value=''>All</MenuItem>
                {updateTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size='small'
                label='Direction'
                value={filter.direction}
                onChange={(e) => setFilter({ direction: e.target.value as LinkDirectionFilter })}
                sx={{ minWidth: 200 }}
                data-testid='links-filter-direction'
              >
                {(Object.keys(DIRECTION_LABELS) as LinkDirectionFilter[]).map((direction) => (
                  <MenuItem key={direction} value={direction}>
                    {DIRECTION_LABELS[direction]}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={
                  <Switch
                    checked={filter.otherSpacesOnly}
                    onChange={(e) => setFilter({ otherSpacesOnly: e.target.checked })}
                    data-testid='links-filter-other-spaces'
                  />
                }
                label='Other spaces only'
              />
              <Box sx={{ flex: 1 }} />
              {addLinkButton}
              <Box data-testid='links-update'>{updateButton}</Box>
              <Box data-testid='links-delete'>{deleteButton}</Box>
            </Stack>
            <ErrorList errors={deleteErrors} onClose={() => setDeleteErrors([])} />
            <LinksTable
              rows={filteredRows}
              onLinkAction={onLinkAction}
              selectedRows={selectedLinkIds}
              onRowSelected={setSelectedLinkIds}
              customToolbarActions={
                <IncludeHiddenToggle includeHidden={includeHidden} onChange={setIncludeHidden} entities='Links' />
              }
            />
          </>
        ) : (
          <EmptyLinks action={addLinkButton} />
        ))}
      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onSubmit={deleteSelected}
        modalTitleText={selectedCount > 1 ? 'Delete Links' : 'Delete Link'}
        modalDescriptionText={
          selectedCount > 1
            ? `Are you sure you want to delete the ${selectedCount} selected Links?`
            : `Are you sure you want to delete ${
                filteredRows.find((row) => row.id === selectedLinkIds[0])?.Link?.Slug ?? 'the selected Link'
              }?`
        }
      />
      <BulkEditLinksDrawer
        isOpen={isBulkEditOpen}
        onClose={() => setIsBulkEditOpen(false)}
        links={selectedLinks}
        refresh={onLinkAction}
      />
      <LinkDrawer
        subject={creating && from ? { mode: 'create', from: [from] } : undefined}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          onLinkAction?.();
        }}
      />
    </Section>
  );
};
