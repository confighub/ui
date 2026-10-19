// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { FullDetailsLink, SettingsDrawer } from '@/components/settings-drawer/SettingsDrawer';
import { UnitSettingsForm } from '@/pages/unit-detail/components/unit-settings/UnitSettingsForm';
import { UNIT_DETAIL_TAB } from '@/pages/unit-detail/unitDetailHrefs';
import { useListAllUnitsQuery } from '@confighub/rtk-query';
import Typography from '@mui/material/Typography';

export interface UnitSettingsDrawerProps {
  /** The Unit to edit; the drawer is closed without one */
  unitId: string | null;
  onClose: () => void;
}

/** Edits a Unit's settings from the Unit list, with links to the Unit's page and its main tabs. */
export const UnitSettingsDrawer = ({ unitId, onClose }: UnitSettingsDrawerProps) => {
  // The drawer is opened by the Unit's ID alone, which names it in any Space.
  const { extendedUnit, isLoading } = useListAllUnitsQuery(
    { where: `UnitID = '${unitId}'`, include: 'UpstreamUnitID' },
    {
      skip: !unitId,
      selectFromResult: ({ data, isFetching }) => ({ extendedUnit: data?.[0], isLoading: isFetching && !data?.[0] }),
    },
  );
  const unit = extendedUnit?.Unit;
  const unitPage = `/units/${unit?.SpaceID}/${unit?.UnitID}`;

  return (
    <SettingsDrawer
      isOpen={!!unitId}
      onClose={onClose}
      backLabel='Back to Units'
      title={unit?.Slug || 'Unit'}
      entityId={unitId || undefined}
      isLoading={isLoading}
      testId='unit-settings-drawer'
    >
      {extendedUnit && unit?.UnitID === unitId ? (
        <UnitSettingsForm
          extendedUnit={extendedUnit}
          upstreamUnit={extendedUnit.UpstreamUnit}
          onUnitUpdated={onClose}
          actions={
            <FullDetailsLink
              to={unitPage}
              tabs={[
                { label: 'Config', to: `${unitPage}?tab=${UNIT_DETAIL_TAB.config}` },
                { label: 'Revisions', to: `${unitPage}?tab=${UNIT_DETAIL_TAB.revisions}` },
                { label: 'Links', to: `${unitPage}?tab=${UNIT_DETAIL_TAB.links}` },
                { label: 'Resources', to: `${unitPage}?tab=${UNIT_DETAIL_TAB.resources}` },
              ]}
            />
          }
        />
      ) : (
        <Typography color='text.secondary'>The Unit was not found.</Typography>
      )}
    </SettingsDrawer>
  );
};
