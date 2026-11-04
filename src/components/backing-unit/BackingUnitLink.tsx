// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { NavLink } from '@/components/nav-link/NavLink';
import { unitRevisionsHref } from '@/pages/unit-detail/unitDetailHrefs';
import { useListAllUnitsQuery } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

export interface BackingUnitLinkProps {
  /** The entity's BackingUnitID. Nothing renders without one. */
  backingUnitId: string | null | undefined;
  /** Open the Unit in a new tab, for a surface that holds work in progress. */
  newTab?: boolean;
}

const BACKING_UNIT_SELECT =
  'UnitID,SpaceID,Slug,DisplayName,HeadRevisionNum,LastReleasedRevisionNum';

/**
 * The backing Unit of an entity, which holds its configuration: a link to the Unit's
 * Revisions, marked when the Unit has Revisions after its last released one, which the
 * entity has not taken.
 */
export const BackingUnitLink = ({ backingUnitId, newTab = false }: BackingUnitLinkProps) => {
  // A backing Unit is hidden, but a where that names it by ID lists it.
  const { data, isLoading, isError } = useListAllUnitsQuery(
    {
      where: `UnitID = '${backingUnitId}'`,
      select: BACKING_UNIT_SELECT,
      include: 'SpaceID',
    },
    { skip: !backingUnitId },
  );

  if (!backingUnitId) return null;
  if (isLoading) {
    return (
      <CircularProgress
        size={12}
        aria-label='Loading the backing Unit'
        data-testid='backing-unit-loading'
      />
    );
  }
  if (isError) {
    return (
      <Typography
        component='span'
        variant='body2'
        color='error'
        data-testid='backing-unit-error'
      >
        Could not load the backing Unit
      </Typography>
    );
  }
  const extendedUnit = data?.[0];
  const unit = extendedUnit?.Unit;
  if (!unit?.UnitID || !unit.SpaceID) {
    return (
      <Typography
        component='span'
        variant='body2'
        color='text.secondary'
        data-testid='backing-unit-missing'
      >
        Not found
      </Typography>
    );
  }

  const spaceSlug = extendedUnit?.Space?.Slug;
  const unitName = unit.DisplayName || unit.Slug;
  const head = unit.HeadRevisionNum ?? 0;
  const released = unit.LastReleasedRevisionNum ?? 0;
  const unreleased = head > released;

  return (
    <Box
      component='span'
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
        minWidth: 0,
      }}
    >
      <NavLink
        to={unitRevisionsHref(unit.SpaceID, unit.UnitID)}
        data-testid='backing-unit-link'
        style={{ textDecoration: 'underline', wordBreak: 'break-word' }}
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {spaceSlug ? `${spaceSlug}/${unitName}` : unitName}
      </NavLink>
      {unreleased && (
        <Tooltip
          arrow
          title={
            head - released === 1
              ? `Revision ${head} is not released`
              : `Revisions ${released + 1}–${head} are not released`
          }
        >
          <Chip
            component='span'
            size='small'
            color='warning'
            label='Unreleased'
            data-testid='backing-unit-unreleased'
          />
        </Tooltip>
      )}
    </Box>
  );
};
