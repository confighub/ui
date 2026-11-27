// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// buildSheetCommit: the write a Unit's staged set makes. A staged edit the document cannot hold
// returns an error and no payload, so nothing of the batch is written. buildProtectionEdits: the
// Keep on merge write.
import { expect, test } from '@playwright/test';

import type { MergedUnit } from '../src/pages/x/apps/componentTypes';
import { parseUnitDataStructured } from '../src/pages/x/apps/configParser';
import { computeDocumentScopes, docStageKey } from '../src/pages/x/apps/diffTree';
import { buildProtectionEdits } from '../src/pages/x/apps/spec-sheet/staging/protectionPayload';
import { buildSheetCommit } from '../src/pages/x/apps/spec-sheet/staging/commitPayload';
import { EMPTY_STAGING, stagingReducer } from '../src/pages/x/apps/spec-sheet/staging/stagingReducer';

const DATA = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: app\ndata:\n  mode: fast\n';
const unit = { unitId: 'u', spaceId: 's', slug: 'app', data: DATA, toolchainType: 'Kubernetes/YAML' } as unknown as MergedUnit;

test('a staged edit that can be written is one patch of the document', () => {
  const state = stagingReducer(EMPTY_STAGING, { type: 'stageEdit', key: 'data.mode', value: 'slow' });
  const built = buildSheetCommit(unit, state);
  expect(built && 'payload' in built && built.payload.kind === 'patch-data' && built.payload.data).toContain('mode: slow');
});

test('a staged edit under a plain value cannot be written: an error, and no payload', () => {
  let state = stagingReducer(EMPTY_STAGING, { type: 'stageEdit', key: 'data.mode', value: 'slow' });
  state = stagingReducer(state, { type: 'stageEdit', key: 'data.mode.level', value: '3' });
  const built = buildSheetCommit(unit, state);
  expect(built).toEqual({ error: 'Could not serialize path: data.mode.level' });
});

test('the whole upgrade is the batch only when every change is ticked, whole-resource ones included', () => {
  const upgrading = {
    ...unit,
    upgradeEntry: {
      fieldDiffs: [{ path: 'data.mode', key: 'data.mode', oldValue: 'fast', newValue: 'slow' }],
      wholeResourceChanges: [{ key: 'whole:svc', wholeResource: 'added', resource: undefined }],
      allPaths: [],
    },
  } as unknown as MergedUnit;
  const both = stagingReducer(EMPTY_STAGING, { type: 'stageAll', keys: ['data.mode', 'whole:svc'] });
  expect(buildSheetCommit(upgrading, both)).toMatchObject({ payload: { kind: 'upgrade-all' } });
  // The new Service is unticked: the field alone is written, and the Service does not come in.
  const fieldOnly = stagingReducer(both, { type: 'stageUpgrade', key: 'whole:svc', on: false });
  const built = buildSheetCommit(upgrading, fieldOnly);
  expect(built && 'payload' in built && built.payload.kind).toBe('patch-data');
  expect(built && 'payload' in built && built.payload.kind === 'patch-data' && built.payload.data).toContain('mode: slow');
});

test('Keep on merge in a Unit of two documents goes to the document its key names', () => {
  const two = [
    'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 2\n',
    'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: worker\nspec:\n  replicas: 1\n',
  ].join('---\n');
  const [web] = computeDocumentScopes(parseUnitDataStructured(two));
  const guards = buildProtectionEdits(new Map([[docStageKey(web, 'spec.replicas'), true]]), two, true);
  expect(guards).toHaveLength(1);
  expect(guards[0].Resource?.ResourceName).toContain('web');
  expect(Object.keys(guards[0].Set ?? {})).toEqual(['spec.replicas']);
});
