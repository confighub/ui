// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// blameFields turns a Unit's blame into the Blame tab's rows and builds the requests its actions
// send for the fields selected.
import type { BlameField } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import {
  BLAME_FLAGS,
  NEEDS_ATTENTION_FLAGS,
  blameActionApplies,
  blameFlagMeta,
  blameRows,
  conflictDismissalSummary,
  conflictSelectors,
  filterBlameRows,
  guardKeys,
  guardRemoveRequest,
  guardSetRequest,
  originUnitLabel,
  permanentDismissalSelectors,
  protectionRequest,
  setInThisUnit,
  setValueRequest,
  validationSummary,
} from '../src/pages/unit-detail/components/blame/blameFields';
import {
  UNIT_DETAIL_TAB,
  UNIT_DETAIL_TAB_ORDER,
  readBlamePath,
  readOverviewGate,
  unitBlameHref,
  unitOverviewHref,
  unitRevisionHref,
} from '../src/pages/unit-detail/unitDetailHrefs';

const DEPLOYMENT = 'apps/v1/Deployment';

const replicas: BlameField = {
  Ref: '7253c88',
  ResourceType: DEPLOYMENT,
  ResourceName: 'confighubplaceholder/web',
  Path: 'spec.replicas',
  Value: '3\n',
  Flags: ['Protected', 'Conflict'],
  Protected: true,
  Conflicts: [
    {
      Reason: 'ProtectedPath',
      Resource: { ResourceType: DEPLOYMENT, ResourceName: 'confighubplaceholder/web' },
      Path: 'spec.replicas',
      Source: { MutationType: 'Update', Index: 0, Value: '2\n' },
    },
  ],
  Chain: [
    { SpaceSlug: 'dev', UnitSlug: 'web', RevisionNum: 4, SetBy: 'link upgrade' },
    { SpaceSlug: 'base', UnitSlug: 'web', RevisionNum: 2, SetBy: 'set-replicas' },
  ],
};

const namespace: BlameField = {
  Ref: '9f7c173',
  ResourceType: DEPLOYMENT,
  ResourceName: 'confighubplaceholder/web',
  Path: 'metadata.namespace',
  Value: 'confighubplaceholder',
  Flags: ['ValidationError', 'Needed'],
  Guards: { owner: 'platform' },
};

const service: BlameField = {
  Ref: 'aa11bb2',
  ResourceType: 'v1/Service',
  ResourceName: 'confighubplaceholder/web',
  Path: 'spec.ports.?port=80.targetPort',
  Value: '8080',
  ResourceProtected: true,
  Protected: true,
  Flags: ['Protected'],
};

// The rows about the resources as a whole, which have no path.
const deployment: BlameField = {
  Ref: 'd0d0d0d',
  ResourceType: DEPLOYMENT,
  ResourceName: 'confighubplaceholder/web',
  Path: '',
  Flags: ['Protected', 'ValidationError'],
  Protected: true,
  ResourceProtected: true,
  Validation: [
    { Gate: 'dev/cel/vet-cel', Issues: [{ Message: 'needs a PodDisruptionBudget' }] },
  ],
  Chain: [{ SpaceSlug: 'dev', UnitSlug: 'web', RevisionNum: 1, SetBy: 'CreateUnit' }],
};

const worker: BlameField = {
  Ref: 'e1e1e1e',
  ResourceType: DEPLOYMENT,
  ResourceName: 'confighubplaceholder/worker',
  Path: '',
  Flags: ['Protected', 'Deleted'],
  Protected: true,
  ResourceProtected: true,
  Deleted: true,
  Chain: [{ SpaceSlug: 'dev', UnitSlug: 'web', RevisionNum: 3, SetBy: 'delete-resource' }],
};

const deletedPort: BlameField = {
  Ref: 'f2f2f2f',
  ResourceType: 'v1/Service',
  ResourceName: 'confighubplaceholder/web',
  Path: 'spec.ports.?port=443',
  Flags: ['Deleted'],
  Deleted: true,
};

test('rows are by resource and then path, and name the hop that set the value', () => {
  const rows = blameRows([service, replicas, namespace]);
  expect(rows.map((row) => row.field.Path)).toEqual([
    '',
    'metadata.namespace',
    'spec.replicas',
    '',
    'spec.ports.?port=80.targetPort',
  ]);
  const replicasRow = rows[2];
  expect(replicasRow.origin?.SpaceSlug).toBe('base');
  expect(replicasRow.here?.SpaceSlug).toBe('dev');
  expect(originUnitLabel(replicasRow.origin)).toBe('base/web');
  expect(new Set(rows.map((row) => row.id)).size).toBe(5);
});

test('each resource is headed by its own row, made up when the server sent none', () => {
  const rows = blameRows([service, worker, replicas, deployment, namespace]);
  expect(
    rows.map((row) => [row.group, row.isResource, !!row.placeholder, row.field.Ref]),
  ).toEqual([
    [0, true, false, 'd0d0d0d'],
    [0, false, false, '9f7c173'],
    [0, false, false, '7253c88'],
    [1, true, false, 'e1e1e1e'],
    [2, true, true, ''],
    [2, false, false, 'aa11bb2'],
  ]);
  // The made-up heading names the resource, and says nothing else about it.
  expect(rows[4].field).toMatchObject({ ResourceType: 'v1/Service', Path: '' });
  expect(rows[4].field.Flags).toBeUndefined();
});

test('the filters keep a path, a resource, and any of the flags chosen, under their resource', () => {
  const rows = blameRows([service, replicas, namespace, deployment, worker]);
  const refs = (filter: Parameters<typeof filterBlameRows>[1]) =>
    filterBlameRows(rows, filter).map((r) => r.field.Ref);
  // A path filter matches no resource's own row, which is kept to head the fields it kept.
  expect(refs({ path: 'replicas', resource: '', flags: [] })).toEqual(['d0d0d0d', '7253c88']);
  expect(
    refs({ path: '', resource: `v1/Service confighubplaceholder/web`, flags: [] }),
  ).toEqual(['', 'aa11bb2']);
  expect(refs({ path: '', resource: '', flags: ['Conflict', 'ValidationError'] })).toEqual([
    'd0d0d0d',
    '9f7c173',
    '7253c88',
  ]);
  // A resource's own row is kept for a flag of its own, with none of its fields.
  expect(refs({ path: '', resource: '', flags: ['Deleted'] })).toEqual(['e1e1e1e']);
  // A made-up heading is kept only to head a field, and is not kept above for a flag the
  // Service's own row might have had.
  expect(refs({ path: '', resource: '', flags: ['Protected'] })).toEqual([
    'd0d0d0d',
    '7253c88',
    'e1e1e1e',
    '',
    'aa11bb2',
  ]);
});

test('a resource is protected and unprotected as a whole on its own row', () => {
  expect(
    protectionRequest([{ ...deployment, Protected: false, ResourceProtected: false }], true),
  ).toEqual([
    {
      Resource: { ResourceType: DEPLOYMENT, ResourceName: 'confighubplaceholder/web' },
      Protected: { '': true },
    },
  ]);
  expect(blameActionApplies.unprotect([deployment])).toBe(true);
  // A deleted resource is unprotected on its own row, which is what lets a merge from upstream
  // add it back; a deleted field is protected on its own.
  expect(protectionRequest([worker, replicas], false)).toEqual([
    {
      Resource: { ResourceType: DEPLOYMENT, ResourceName: 'confighubplaceholder/worker' },
      Protected: { '': false },
    },
    {
      Resource: { ResourceType: DEPLOYMENT, ResourceName: 'confighubplaceholder/web' },
      Protected: { 'spec.replicas': false },
    },
  ]);
  expect(protectionRequest([deletedPort], true)).toEqual([
    {
      Resource: { ResourceType: 'v1/Service', ResourceName: 'confighubplaceholder/web' },
      Protected: { 'spec.ports.?port=443': true },
    },
  ]);
  // A guard on a resource is on its own row; a field with no value takes none, nor a value.
  expect(guardSetRequest([deployment, deletedPort], 'owner', 'platform')).toEqual([
    {
      Resource: { ResourceType: DEPLOYMENT, ResourceName: 'confighubplaceholder/web' },
      Set: { '': { owner: 'platform' } },
    },
  ]);
  expect(blameActionApplies.guard([worker, deletedPort])).toBe(false);
  expect(blameActionApplies.setValue([deployment])).toBe(false);
  expect(blameActionApplies.setValue([deletedPort])).toBe(false);
});

test('every flag has a label and a meaning, and the needs-attention ones are those the server is asked for', () => {
  for (const flag of BLAME_FLAGS) {
    expect(flag.label).not.toBe('');
    expect(flag.meaning).not.toBe('');
  }
  expect(
    BLAME_FLAGS.filter((flag) => flag.attention)
      .map((flag) => flag.code)
      .join(','),
  ).toBe(NEEDS_ATTENTION_FLAGS);
  // A code this version does not know still shows.
  expect(blameFlagMeta('SomethingNew').label).toBe('SomethingNew');
});

test('protection is set per resource, on the paths it changes', () => {
  expect(protectionRequest([replicas, namespace], true)).toEqual([
    {
      Resource: { ResourceType: DEPLOYMENT, ResourceName: 'confighubplaceholder/web' },
      Protected: { 'metadata.namespace': true },
    },
  ]);
  // A field protected as part of its resource is not unprotected by selecting it.
  expect(protectionRequest([replicas, service], false)).toEqual([
    {
      Resource: { ResourceType: DEPLOYMENT, ResourceName: 'confighubplaceholder/web' },
      Protected: { 'spec.replicas': false },
    },
  ]);
  expect(blameActionApplies.unprotect([service])).toBe(false);
  expect(blameActionApplies.protect([replicas])).toBe(false);
});

test('a guard is set on each selected path, and removed only where the field holds it', () => {
  expect(guardSetRequest([replicas, service], 'owner', 'platform')).toEqual([
    {
      Resource: { ResourceType: DEPLOYMENT, ResourceName: 'confighubplaceholder/web' },
      Set: { 'spec.replicas': { owner: 'platform' } },
    },
    {
      Resource: { ResourceType: 'v1/Service', ResourceName: 'confighubplaceholder/web' },
      Set: { 'spec.ports.?port=80.targetPort': { owner: 'platform' } },
    },
  ]);
  expect(guardRemoveRequest([replicas, namespace], 'owner')).toEqual([
    {
      Resource: { ResourceType: DEPLOYMENT, ResourceName: 'confighubplaceholder/web' },
      Remove: { 'metadata.namespace': ['owner'] },
    },
  ]);
  expect(guardKeys([replicas, namespace])).toEqual(['owner']);
});

test('conflicts are selected by resource type, name and path, once each', () => {
  expect(conflictSelectors([replicas, replicas, namespace])).toEqual([
    {
      ResourceType: DEPLOYMENT,
      ResourceName: 'confighubplaceholder/web',
      Path: 'spec.replicas',
    },
  ]);
  // A Service of the same name, with a conflict at the same path, is its own selector.
  const serviceReplicas: BlameField = {
    ...replicas,
    ResourceType: 'v1/Service',
    Conflicts: (replicas.Conflicts ?? []).map((conflict) => ({
      ...conflict,
      Resource: { ...conflict.Resource, ResourceType: 'v1/Service' },
    })),
  };
  expect(conflictSelectors([replicas, serviceReplicas])).toEqual([
    {
      ResourceType: DEPLOYMENT,
      ResourceName: 'confighubplaceholder/web',
      Path: 'spec.replicas',
    },
    {
      ResourceType: 'v1/Service',
      ResourceName: 'confighubplaceholder/web',
      Path: 'spec.replicas',
    },
  ]);
  expect(blameActionApplies.conflicts([namespace])).toBe(false);
  expect(blameActionApplies.conflicts([replicas])).toBe(true);
});

test('a permanent dismissal names the reason, and a guarded conflict every guard that withheld it', () => {
  const guarded: BlameField = {
    ...replicas,
    ResourceName: 'prod/web',
    Conflicts: [
      {
        Reason: 'Guarded',
        // As the upstream named the resource; the dismissal is recorded on this Unit's.
        Resource: { ResourceType: DEPLOYMENT, ResourceName: 'confighubplaceholder/web' },
        Path: 'spec.replicas',
        Guard: { Key: 'owner', Value: 'platform' },
        Guards: [
          { Key: 'owner', Value: 'platform' },
          { Key: 'reviewed', Value: '' },
        ],
      },
      { Reason: 'ProtectedPath', Path: 'spec.replicas' },
    ],
  };
  expect(permanentDismissalSelectors([guarded, guarded, namespace])).toEqual([
    {
      ResourceType: DEPLOYMENT,
      ResourceName: 'prod/web',
      Path: 'spec.replicas',
      Reason: 'Guarded',
      Guards: ['owner=platform', 'reviewed'],
    },
    {
      ResourceType: DEPLOYMENT,
      ResourceName: 'prod/web',
      Path: 'spec.replicas',
      Reason: 'ProtectedPath',
      Guards: undefined,
    },
  ]);
  // A conflict recorded before every guard was reported names its one guard.
  const legacy: BlameField = {
    ...replicas,
    Conflicts: [
      { Reason: 'Guarded', Path: 'spec.replicas', Guard: { Key: 'owner', Value: 'platform' } },
    ],
  };
  expect(permanentDismissalSelectors([legacy])[0].Guards).toEqual(['owner=platform']);
});

test('a recorded dismissal reads as the reasons and guards it covers', () => {
  expect(
    conflictDismissalSummary({
      Subtracted: '',
      'Guarded-owner': 'platform',
      'Guarded-policy-exception': '',
    }),
  ).toEqual([
    'Guarded by guard owner=platform',
    'Guarded by guard policy-exception',
    'Subtracted',
  ]);
});

test('set value runs set-path on the field, narrowed to its resource', () => {
  const request = setValueRequest(namespace, 'dev', 'dev namespace');
  expect(request.FunctionInvocations).toEqual([
    {
      FunctionName: 'set-path',
      Arguments: [
        { ParameterName: 'path', Value: 'metadata.namespace' },
        { ParameterName: 'value', Value: 'dev' },
      ],
    },
  ]);
  expect(request.WhereResource).toBe(
    "ConfigHub.ResourceType = 'apps/v1/Deployment' AND ConfigHub.ResourceName = 'confighubplaceholder/web'",
  );
  expect(request.ChangeDescription).toBe('dev namespace');
  expect(
    setValueRequest({ ...namespace, ResourceName: "it's" }, 'x', '').WhereResource,
  ).toContain("'it''s'");
  expect(blameActionApplies.setValue([namespace, replicas])).toBe(false);
});

test('the Blame tab has a value of its own, and the other tabs keep theirs', () => {
  expect(UNIT_DETAIL_TAB.blame).toBe(7);
  expect(UNIT_DETAIL_TAB.resources).toBe(5);
  expect(UNIT_DETAIL_TAB.settings).toBe(6);
  expect(UNIT_DETAIL_TAB_ORDER.indexOf(UNIT_DETAIL_TAB.blame)).toBe(
    UNIT_DETAIL_TAB_ORDER.indexOf(UNIT_DETAIL_TAB.mutations) + 1,
  );
  expect(new Set(UNIT_DETAIL_TAB_ORDER).size).toBe(Object.keys(UNIT_DETAIL_TAB).length);
  const href = unitBlameHref('s1', 'u1', 'spec.template.spec.containers.?name=web.image');
  expect(href).toBe(
    '/units/s1/u1?tab=7&blamePath=spec.template.spec.containers.%3Fname%3Dweb.image',
  );
  expect(readBlamePath(new URLSearchParams(href.split('?')[1]))).toBe(
    'spec.template.spec.containers.?name=web.image',
  );
  expect(unitRevisionHref('s1', 'u1', 4)).toBe(
    '/units/s1/u1?tab=2&revisionViewer=true&revision=4&viewMode=single',
  );
});

test('every flag has a hue of its own', () => {
  const colors = BLAME_FLAGS.map((flag) => flag.color);
  expect(new Set(colors).size).toBe(colors.length);
  for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
});

test('a validation flag summarizes the checks it stands for', () => {
  const field: BlameField = {
    Validation: [
      { Gate: 'dev/placeholders/vet-placeholders', Value: 'confighubplaceholder' },
      {
        Gate: 'dev/pins/vet-cel',
        Warning: true,
        Score: 'High',
        Path: 'spec.template.spec.containers.0.image',
        Issues: [{ Message: 'image must be pinned' }],
      },
    ],
  };
  expect(validationSummary(field, false)).toEqual([
    'dev/placeholders/vet-placeholders: found "confighubplaceholder"',
  ]);
  expect(validationSummary(field, true)).toEqual([
    'dev/pins/vet-cel (High) at spec.template.spec.containers.0.image: image must be pinned',
  ]);
  expect(validationSummary({}, false)).toEqual([]);
});

test('a validation flag opens the Overview tab at its gate', () => {
  const href = unitOverviewHref('s', 'u', 'dev/placeholders/vet-placeholders');
  expect(href.startsWith(`/units/s/u?tab=${UNIT_DETAIL_TAB.overview}`)).toBe(true);
  expect(readOverviewGate(new URL(href, 'http://x').searchParams)).toBe(
    'dev/placeholders/vet-placeholders',
  );
  expect(unitOverviewHref('s', 'u')).toBe(`/units/s/u?tab=${UNIT_DETAIL_TAB.overview}`);
});

test('a value is set in this Unit or upstream', () => {
  const field: BlameField = { UnitID: 'dev' };
  expect(setInThisUnit({ field, origin: { UnitID: 'dev' } })).toBe(true);
  expect(setInThisUnit({ field, origin: { UnitID: 'base' } })).toBe(false);
  expect(setInThisUnit({ field, origin: undefined })).toBeUndefined();
});
