// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The write a Unit's staged set makes, built from the staging store: the whole upgrade when
// every upgradable field is ticked and nothing else is staged, else one document with every
// staged change merged in (a manual edit wins over the upgrade of its key).

import { isRemovalWrite, isYamlToolchain } from '../../componentValues';
import type { MergedUnit } from '../../componentTypes';
import { applyConfigWrites, parseUnitDataStructured, type ConfigWrite } from '../../configParser';
import { computeDocumentScopes, docStageKey, groupFieldEntriesByDocument, stageKeyDocId, stageKeyPath } from '../../diffTree';
import { fieldDiffKey, selectAllUpgradeKeys } from '../../entryBuilders';
import { commitPlan, type StagingState } from './stagingReducer';
import { isStagedDeleteSentinel, type StagedCommitPayload } from './types';

export type SheetCommit = { payload: StagedCommitPayload; keys: Set<string> } | { error: string } | null;

/** Builds the commit of one Unit, or null when nothing value-changing is staged. */
export function buildSheetCommit(unit: MergedUnit, state: StagingState): SheetCommit {
  const plan = commitPlan(state);
  // Only the wholesale upgrade adds or deletes a whole resource, so a ticked one is dropped
  // outside that batch: a merged document cannot add or delete a resource.
  const wholeKeys = new Set((unit.upgradeEntry?.wholeResourceChanges ?? []).map((c) => c.key));
  const valueUpgrades = new Set([...plan.upgrades].filter((k) => !wholeKeys.has(k)));
  const upgradeKeys = new Set((unit.upgradeEntry?.fieldDiffs ?? []).map(fieldDiffKey));
  // The whole upgrade takes every change, so it is the batch only when every change "Select all"
  // offers is ticked: an unticked whole-resource change must not come in with it.
  const selectAll = selectAllUpgradeKeys(unit);
  const upgradeAll =
    plan.edits.size === 0 &&
    selectAll.length > 0 &&
    selectAll.every((k) => plan.upgrades.has(k)) &&
    // A blocked upstream deletion is not in the upgrade's own diff: the wholesale upgrade keeps that
    // key, so a batch with one is a merged document, never upgrade-all.
    [...valueUpgrades].every((k) => upgradeKeys.has(k));
  const keys = new Set([...valueUpgrades, ...plan.edits.keys()]);
  if (upgradeAll) return { payload: { kind: 'upgrade-all' }, keys: new Set([...keys, ...plan.upgrades]) };
  if (keys.size === 0) return null;

  const upgradeValue = new Map<string, string>();
  const valueType = new Map<string, ConfigWrite['valueType']>();
  const insertion = new Map<string, NonNullable<ConfigWrite['insertion']>>();
  // A blocked upstream delete or a guarded key is accepted by writing the upstream value the
  // local override keeps out.
  for (const d of unit.variationEntry?.fieldDiffs ?? []) {
    upgradeValue.set(fieldDiffKey(d), d.oldValue);
    valueType.set(fieldDiffKey(d), d.oldValueType);
  }
  for (const d of unit.upgradeEntry?.fieldDiffs ?? []) {
    const key = fieldDiffKey(d);
    upgradeValue.set(key, d.newValue);
    valueType.set(key, d.newValueType);
    if (d.insertion) insertion.set(key, d.insertion);
  }

  const entries = parseUnitDataStructured(unit.data);
  const documentScopes = computeDocumentScopes(entries, { scopedWritesSupported: isYamlToolchain(unit.toolchainType) });
  const scopes = new Map(documentScopes.map((s) => [s.id, s]));
  // The stage keys the Unit holds, per document: a path two documents share is held by each.
  const held = new Set(
    groupFieldEntriesByDocument(entries).flatMap((group, i) => group.entries.map((e) => docStageKey(documentScopes[i], e.path))),
  );

  const writes: ConfigWrite[] = [];
  for (const key of keys) {
    const path = stageKeyPath(key);
    const documentId = stageKeyDocId(key);
    const scope = documentId !== undefined ? scopes.get(documentId) : undefined;
    const resource = scope?.writable ? scope.resource : undefined;
    const edit = plan.edits.get(key);
    const value = edit ?? upgradeValue.get(key);
    if (value === undefined) continue;
    const remove = edit !== undefined ? isStagedDeleteSentinel(edit) : isRemovalWrite(value, valueType.get(key), held.has(key));
    writes.push(
      remove
        ? { path, kind: 'delete', resource, documentId, insertion: insertion.get(key) }
        : { path, kind: 'set', value, valueType: edit !== undefined ? undefined : valueType.get(key), resource, documentId, insertion: insertion.get(key) },
    );
  }
  const { data, failedPaths } = applyConfigWrites(unit.data ?? '', writes);
  if (failedPaths.length > 0) {
    return { error: `Could not serialize path${failedPaths.length > 1 ? 's' : ''}: ${failedPaths.join(', ')}` };
  }
  return { payload: { kind: 'patch-data', data }, keys };
}
