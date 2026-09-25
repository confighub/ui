// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export type ModalType =
  | 'invoke'
  | 'delete'
  | 'clone'
  | 'add'
  | 'addTarget'
  | 'upgrade';

const invokeFunctionsModal = {
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

const deleteUnitModal = {
  conditions: {
    any: [
      {
        fact: 'type',
        operator: 'equal',
        value: 'delete',
      },
    ],
  },
  event: {
    type: 'delete' as ModalType,
    params: {},
  },
};

const cloneUnitModal = {
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

const addUnitModal = {
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

const addTargetModal = {
  conditions: {
    any: [
      {
        fact: 'type',
        operator: 'equal',
        value: 'addTarget',
      },
    ],
  },
  event: {
    type: 'addTarget' as ModalType,
    params: {},
  },
};

const upgradeUnitModal = {
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

const rules = [
  invokeFunctionsModal,
  deleteUnitModal,
  cloneUnitModal,
  addUnitModal,
  addTargetModal,
  upgradeUnitModal,
];

export default rules;
