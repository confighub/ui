// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export type ModalType = 'add' | 'link' | 'invoke' | 'bulk_edit' | 'clone' | 'changesets' | 'upgrade' | 'bulk_restore';

const changesetModal = {
  conditions: {
    any: [
      {
        fact: 'type',
        operator: 'equal',
        value: 'changesets',
      },
    ],
  },
  event: {
    type: 'changesets' as ModalType,
    params: {},
  },
};

const addUnitsModal = {
  conditions: {
    any: [
      {
        fact: 'type',
        operator: 'equal',
        value: 'add',
      },
    ],
  },
  event: {
    type: 'add' as ModalType,
    params: {},
  },
};

const linkUnitsModal = {
  conditions: {
    any: [
      {
        fact: 'type',
        operator: 'equal',
        value: 'link',
      },
    ],
  },
  event: {
    type: 'link' as ModalType,
    params: {},
  },
};

const invokeUnitsFunctionModal = {
  conditions: {
    any: [
      {
        fact: 'type',
        operator: 'equal',
        value: 'invoke',
      },
    ],
  },
  event: {
    type: 'invoke' as ModalType,
    params: {},
  },
};

const bulkEditUnits = {
  conditions: {
    any: [
      {
        fact: 'type',
        operator: 'equal',
        value: 'bulk_edit',
      },
    ],
  },
  event: {
    type: 'bulk_edit' as ModalType,
    params: {},
  },
};

const cloneUnitsModal = {
  conditions: {
    any: [
      {
        fact: 'type',
        operator: 'equal',
        value: 'clone',
      },
    ],
  },
  event: {
    type: 'clone' as ModalType,
    params: {},
  },
};

const upgradUnitsModal = {
  conditions: {
    any: [
      {
        fact: 'type',
        operator: 'equal',
        value: 'upgrade',
      },
    ],
  },
  event: {
    type: 'upgrade' as ModalType,
    params: {},
  },
};

const bulkRestoreUnitsModal = {
  conditions: {
    any: [
      {
        fact: 'type',
        operator: 'equal',
        value: 'bulk_restore',
      },
    ],
  },
  event: {
    type: 'bulk_restore' as ModalType,
    params: {},
  },
};

const rules = [
  addUnitsModal,
  linkUnitsModal,
  invokeUnitsFunctionModal,
  bulkEditUnits,
  cloneUnitsModal,
  changesetModal,
  upgradUnitsModal,
  bulkRestoreUnitsModal
];

export default rules;
