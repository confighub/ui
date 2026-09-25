// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { AddUnitModal } from '@/pages/add-unit/AddUnitModal';
import { BulkDeleteModal } from '@/pages/unit-list/components/modals/bulk-delete-modal/BulkDeleteModal';
import { BulkEditUnitsDrawer } from '@/pages/unit-list/components/modals/bulk-edit-units-drawer/BulkEditUnitsDrawer';
import { BulkRestoreModal } from '@/pages/unit-list/components/modals/bulk-restore-modal/BulkRestoreModal';
import { BulkUpgradeModal } from '@/pages/unit-list/components/modals/bulk-upgrade-modal/BulkUpgradeModal';
import { CloneUnitsDrawer } from '@/pages/unit-list/components/modals/clone-units-drawer/CloneUnitsDrawer';
import { UnitRead } from '@confighub/rtk-query';
import { type SpaceRead, useListSpacesQuery } from '@confighub/rtk-query';

import { ModalKey } from './useHeaderBulkActions';

interface HeaderModalsProps {
  unitsToEdit: UnitRead[];
  modalsOpen: {
    bulkEdit: boolean;
    upgrade: boolean;
    delete: boolean;
    clone: boolean;
    restore: boolean;
    import: boolean;
    add: boolean;
  };
  closeModal: (key: ModalKey) => void;
}

export const HeaderModals = ({ unitsToEdit, modalsOpen, closeModal }: HeaderModalsProps) => {
  const { spaces = [] } = useListSpacesQuery(
    {},
    {
      selectFromResult: (result) => ({
        spaces: result?.data?.map((space) => space.Space).filter(Boolean) as SpaceRead[],
      }),
    },
  );

  return (
    <>
      <BulkEditUnitsDrawer
        isOpen={modalsOpen.bulkEdit}
        onClose={() => closeModal('bulkEdit')}
        unitsToEdit={unitsToEdit}
      />
      <BulkUpgradeModal
        isOpen={modalsOpen.upgrade}
        onClose={() => closeModal('upgrade')}
        unitsToEdit={unitsToEdit}
      />
      <BulkDeleteModal
        isOpen={modalsOpen.delete}
        onClose={() => closeModal('delete')}
        unitsToEdit={unitsToEdit}
      />
      <CloneUnitsDrawer
        isOpen={modalsOpen.clone}
        onClose={() => closeModal('clone')}
        unitsToEdit={unitsToEdit}
      />
      <BulkRestoreModal
        isOpen={modalsOpen.restore}
        onClose={() => closeModal('restore')}
        unitsToEdit={unitsToEdit}
      />
      <AddUnitModal
        spaces={spaces}
        isOpen={modalsOpen.add}
        onClose={() => closeModal('add')}
      />
    </>
  );
};
