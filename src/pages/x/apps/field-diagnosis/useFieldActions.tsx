// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What the details' buttons do in the Component side pane (PLAN.md decision 14, owner answer Q3):
//   - Edit, Discard, Restore, Upgrade, and Remove of an Override guard are STAGED, like every
//     change in the pane (components.md rules 8 to 10): the row does them, the footer commits.
//   - Apply and Dismiss of a withheld change, and Remove of any other guard, WRITE AT ONCE after
//     the guard confirmation, with the Blame tab's own dialogs.
//   - Open gate and Open Link are links.
import { useMemo, useState } from 'react';
import { type BlameField, useGetUnitQuery, useResolveUnitConflictsMutation, useSetUnitGuardMutation } from '@confighub/rtk-query';

import type { FieldGuard, FieldNeed, FieldRef, FieldView } from '@/components/field-diagnosis/fieldDiagnosis.types';
import type { ActionTarget, FieldActions, FieldLinkResolver } from '@/components/field-diagnosis/fieldLinks';
import { useChangeSetLock } from '@/components/change-set-lock/useChangeSetLock';
import { useAppDispatch } from '@/hooks/useApp';
import { setAlert } from '@/state/slices/alert';
import { clearanceCovering, nonMergeClearance } from '@/utility/clearance-functions';
import { getApiErrorMessage } from '@/utility/error-functions';

import { ApplyConflictsDialog, DismissConflictsDialog, RemoveGuardDialog } from '../../../unit-detail/components/blame/BlameTable';
import {
  conflictGuardsToClear,
  conflictSelectors,
  guardRemoveRequest,
  ownGuards,
  permanentDismissalSelectors,
} from '../../../unit-detail/components/blame/blameFields';

/** What the field's row stages for the details. A missing one is an action the row cannot do. */
export interface FieldRowActions {
  /** Open the row's inline editor. */
  edit?: () => void;
  /** Drop the row's staged edit. */
  discard?: () => void;
  /** Stage a value as the row's edit. */
  stageValue?: (value: string) => void;
  /** Tick the row's upgrade checkbox. */
  stageUpgrade?: () => void;
  /** The row's Keep on merge toggle, when the row is kept and can be let go. */
  letMergesUpdate?: () => void;
}

export interface FieldActionsArgs {
  spaceId: string;
  unitId: string;
  /** The field as the path report has it: what the guarded writes select. */
  field: BlameField | undefined;
  view: FieldView | undefined;
  row: FieldRowActions;
  /** Where references go: the gate and Link actions are links. */
  resolve: FieldLinkResolver;
}

type Dialog = { kind: 'apply' } | { kind: 'dismiss' } | { kind: 'remove'; key: string } | undefined;

export function useFieldActions({ spaceId, unitId, field, view, row, resolve }: FieldActionsArgs) {
  const dispatch = useAppDispatch();
  const [dialog, setDialog] = useState<Dialog>(undefined);
  const [setGuard, { isLoading: isGuarding }] = useSetUnitGuardMutation();
  const [resolveConflicts, { isLoading: isResolving }] = useResolveUnitConflictsMutation();
  const unitRead = useGetUnitQuery({ spaceId, unitId }).currentData?.Unit;
  const annotations = unitRead?.PathAnnotations;
  // A ChangeSet open on the Unit locks it: a write names it, once the person acknowledges that the
  // change will be part of it (as the Blame tab does).
  const lockUnits = useMemo(() => [{ unitId, changeSetId: unitRead?.ChangeSetID }], [unitId, unitRead?.ChangeSetID]);
  const lock = useChangeSetLock(lockUnits);
  const changeSetId = lock.changeSetFor(unitId);
  const busy = isGuarding || isResolving;
  const fields = field ? [field] : [];
  const applyGuards = conflictGuardsToClear(fields);
  const applyClearanceList = clearanceCovering(applyGuards);
  const applyClearance = applyClearanceList.length > 0 ? applyClearanceList : undefined;

  const alert = (message: string, type: 'success' | 'error') => dispatch(setAlert({ message, type, isOpen: true }));
  const done = (message: string) => {
    setDialog(undefined);
    alert(message, 'success');
  };
  const failed = (err: unknown, fallback: string) => alert(getApiErrorMessage(err, fallback), 'error');

  const needAction = (need: FieldNeed): ActionTarget | undefined => {
    if (need.kind === 'upgrade') return row.stageUpgrade ? { onClick: row.stageUpgrade } : undefined;
    if (need.kind === 'conflict') return field ? { onClick: () => setDialog({ kind: 'apply' }) } : undefined;
    // A gate opens in the pane's Gates tab (a jump); a finding, the Unit's Links.
    const ref: FieldRef | undefined =
      need.kind === 'gate' || need.kind === 'warning'
        ? need.parts.find((p): p is FieldRef => typeof p !== 'string' && p.kind === 'gate')
        : need.kind === 'finding'
          ? { kind: 'link', label: 'Link', name: '' }
          : undefined;
    const target = ref ? resolve(ref) : undefined;
    return target?.href ? { href: target.href, newTab: target.newTab, onClick: target.jump } : undefined;
  };

  const removeGuard = (guard: FieldGuard): ActionTarget | undefined => {
    // An Override guard is let go by the row's staged toggle; any other guard is removed at once.
    if (guard.kind === 'override') return row.letMergesUpdate ? { onClick: row.letMergesUpdate } : undefined;
    if (!field || field.Guards?.[guard.key] === undefined) return undefined;
    // A guard on an ancestor or on the resource is not on the field's own path: it is removed
    // where it is held, not here (the server would find no such key at this path).
    const own = ownGuards(annotations, field);
    if (own && own.guards[guard.key] === undefined) return { disabled: 'Held by a field that contains this one' };
    return { onClick: () => setDialog({ kind: 'remove', key: guard.key }) };
  };

  const actions: FieldActions = {
    edit: row.edit,
    discard: row.discard,
    restore: row.stageValue ? (entry) => row.stageValue?.(entry.value) : undefined,
    needAction,
    needSecondary: (need) => (need.kind === 'conflict' && field ? { onClick: () => setDialog({ kind: 'dismiss' }) } : undefined),
    removeGuard,
  };

  const dialogs = field && view && (
    <>
      <ApplyConflictsDialog
        open={dialog?.kind === 'apply'}
        busy={busy}
        guards={applyGuards}
        changeSetLock={lock}
        onClose={() => setDialog(undefined)}
        preview={async () =>
          (
            await resolveConflicts({
              spaceId,
              unitId,
              unitConflictsRequest: {
                Action: 'Apply',
                DryRun: true,
                Select: conflictSelectors(fields),
                Clearance: applyClearance,
                ChangeSetID: changeSetId,
              },
            }).unwrap()
          ).Diff
        }
        onSubmit={async () => {
          try {
            const result = await resolveConflicts({
              spaceId,
              unitId,
              unitConflictsRequest: { Action: 'Apply', Select: conflictSelectors(fields), Clearance: applyClearance, ChangeSetID: changeSetId },
            }).unwrap();
            done(`Applied ${result.Applied ?? 0} withheld change${result.Applied === 1 ? '' : 's'}`);
          } catch (err) {
            failed(err, 'Failed to apply the withheld change');
          }
        }}
      />
      <DismissConflictsDialog
        open={dialog?.kind === 'dismiss'}
        busy={busy}
        conflicts={permanentDismissalSelectors(fields)}
        changeSetLock={lock}
        onClose={() => setDialog(undefined)}
        onSubmit={async (permanent) => {
          try {
            const result = await resolveConflicts({
              spaceId,
              unitId,
              unitConflictsRequest: permanent
                ? { Action: 'Dismiss', Permanent: true, Select: permanentDismissalSelectors(fields), ChangeSetID: changeSetId }
                : { Action: 'Dismiss', Select: conflictSelectors(fields), ChangeSetID: changeSetId },
            }).unwrap();
            done(`Dismissed ${result.Dismissed ?? 0} withheld change${result.Dismissed === 1 ? '' : 's'}`);
          } catch (err) {
            failed(err, 'Failed to dismiss the withheld change');
          }
        }}
      />
      <RemoveGuardDialog
        open={dialog?.kind === 'remove'}
        busy={busy}
        keys={Object.keys(field.Guards ?? {}).sort()}
        initialKey={dialog?.kind === 'remove' ? dialog.key : undefined}
        fields={fields}
        annotations={annotations}
        changeSetLock={lock}
        onClose={() => setDialog(undefined)}
        onSubmit={async (key, clearance) => {
          try {
            await setGuard({
              spaceId,
              unitId,
              unitGuardRequest: {
                ResourceGuards: guardRemoveRequest(fields, key),
                Clearance: nonMergeClearance(undefined, clearance),
                ChangeSetID: changeSetId,
              },
            }).unwrap();
            done(`Guard ${key} removed`);
          } catch (err) {
            failed(err, 'Failed to remove the guard');
          }
        }}
      />
    </>
  );

  return { actions, dialogs };
}
