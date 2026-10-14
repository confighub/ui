// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Section } from '@/components/styled';
import { EmptyLinks } from '@/pages/unit-detail/components/empty-links/EmptyLinks';
import {
  LinkRow,
  LinksTable,
} from '@/pages/unit-detail/components/links-table/LinksTable.tsx';
import { Direction } from '@/types/enums';
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

export interface ILinksTabProps {
  selectedTab: number;
  linkRows: Array<LinkRow>;
  /** The Unit whose Links these are: each Link is from it or to it. */
  unitId: string;
  spaceId: string;
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
export const LinksTab = ({ selectedTab, linkRows, unitId, spaceId, onLinkAction }: ILinksTabProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
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

  return (
    <Section
      $display={selectedTab === LINKS_TAB_ID}
      $direction={Direction.FadeIn}
      $width='100%'
    >
      {selectedTab === LINKS_TAB_ID &&
        (linkRows.length > 0 ? (
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
            </Stack>
            <LinksTable rows={filteredRows} onLinkAction={onLinkAction} />
          </>
        ) : (
          <EmptyLinks />
        ))}
    </Section>
  );
};
