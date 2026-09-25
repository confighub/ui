// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { InvokeUnitFunctionsModal } from '../../../components/invoke-unit-functions-modal/InvokeUnitFunctionsModal';
import { IUnitMutationModalProps } from '../../../types';
import { AddUnitModal } from '../../add-unit/AddUnitModal';
import { BulkEditUnitsDrawer } from '../components/modals/bulk-edit-units-drawer/BulkEditUnitsDrawer';
import { BulkRestoreModal } from '../components/modals/bulk-restore-modal/BulkRestoreModal';
import { BulkUpgradeModal } from '../components/modals/bulk-upgrade-modal/BulkUpgradeModal';
import { CloneUnitsDrawer } from '../components/modals/clone-units-drawer/CloneUnitsDrawer';

export const UnitModals = {
  add: (data: IUnitMutationModalProps) => <AddUnitModal {...data} />,
  invoke: (data: IUnitMutationModalProps) => <InvokeUnitFunctionsModal {...data} />,
  bulk_edit: (data: IUnitMutationModalProps) => <BulkEditUnitsDrawer {...data} />,
  bulk_restore: (data: IUnitMutationModalProps) => <BulkRestoreModal {...data} />,
  clone: (data: IUnitMutationModalProps) => <CloneUnitsDrawer {...data} />,
  upgrade: (data: IUnitMutationModalProps) => <BulkUpgradeModal {...data} />,
};
