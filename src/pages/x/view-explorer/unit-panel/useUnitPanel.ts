// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ExtendedUnitRead } from '@confighub/rtk-query';

import { useAppDispatch } from '@/hooks/useApp';
import { requestInvokerOpen } from '@/state/slices/invokerRequest';

import { innermostGroup } from '../compare/suggest';
import { type EntityRow, fieldById } from '../model/fields';
import type { TableOrder } from '../model/table-order';
import { needsAttention, rowClass, rowFacts, rowNeedsAttention, unreleasedCount } from './attention';
import { announcement } from './copy';
import { type GroupSummary, groupName, nextProblemIndex, summarizeGroup } from './group-context';
import { panelLinks } from './links';
import { useGateChecks } from './useGateChecks';
import { useUnitPanelData } from './useUnitPanelData';
import { upgradePreviewRequest } from './upgrade-preview';
import { type ActionId, buildVerdict, type NextProblem, releaseState } from './verdict';
import type { PanelActions, PanelDialog, PanelDialogActions, UnitPanelModel, UnitPanelTab } from './view/types';

const unitOf = (r: EntityRow) => r as ExtendedUnitRead;
const classOf = (r: EntityRow) => rowClass(unitOf(r));
const fieldLabel = (field: string) => fieldById('Unit', field)?.label ?? field;

/** What the panel needs of the Table's row selection. */
export interface PanelSelection {
  /** The layout has a row selection (a Units Table). */
  enabled: boolean;
  count: number;
  picked: ReadonlySet<string>;
  /** Pick a row; a picked row stays picked. */
  pick: (id: string) => void;
}

interface Args {
  /** The open Unit's row, current as the universe has it; null when no Unit is open (or it is hidden behind compare mode). */
  row: ExtendedUnitRead | null;
  rowId: string | null;
  order: TableOrder;
  /** Every Unit loaded, filtered or not: what a Release of the open Unit's Space would take is counted from them. */
  allRows: readonly EntityRow[];
  rowIdOf: (row: EntityRow) => string;
  selection: PanelSelection;
  /** The explorer tab's URL query, which the panel's links carry back. */
  search: string;
  /** The Unit has left the rows (deleted): the panel shows it as it was, says so, and runs nothing on it. */
  gone: boolean;
  /** The panel has stayed on this row long enough to read its details. */
  settled: boolean;
  /** Open a row of the view and show it in the table. */
  goTo: (row: EntityRow) => void;
  move: (delta: 1 | -1) => void;
  tab: UnitPanelTab;
  onTabChange: (tab: UnitPanelTab) => void;
  /** Give focus to the panel itself. */
  focusPanel: () => void;
}

/**
 * The model of the open Unit's panel: its verdict, its place in the view, its
 * group's counts, the next Unit that needs attention, and the actions that run
 * from here. The place and the counts come from the rows already loaded; the
 * verdict also reads the open Unit's own details (`useUnitPanelData`).
 */
export function useUnitPanel({ row, rowId, order, allRows, rowIdOf, selection, search, gone: rowGone, settled, goTo, move, tab, onTabChange, focusPanel }: Args): {
  model: UnitPanelModel | null;
  announcement: string;
} {
  const onGoTo = useCallback(
    (id: string) => {
      const at = order.index.get(id);
      if (at !== undefined) goTo(order.ordered[at]);
    },
    [order, goTo],
  );
  const onPrevious = useCallback(() => move(-1), [move]);
  const onNext = useCallback(() => move(1), [move]);

  // The counts of each group, kept while the rows stay the same.
  const groupCache = useMemo(() => ({ rows: order.ordered, cache: new Map<string, GroupSummary>() }), [order.ordered]).cache;
  const place = useMemo(() => {
    if (!row || !rowId) return null;
    const at = order.index.get(rowId);
    const shownRow = at === undefined ? undefined : order.ordered[at];
    const group = shownRow
      ? summarizeGroup({ tree: order.tree, shown: order.ordered, row: shownRow, classOf, fieldLabel, cache: groupCache })
      : null;
    const nextAt = nextProblemIndex(order.ordered, at ?? -1, 1, rowNeedsAttention);
    let nextProblem: NextProblem | null = null;
    if (nextAt !== null) {
      const next = order.ordered[nextAt];
      const node = order.tree.length ? innermostGroup(order.tree, next) : undefined;
      nextProblem = {
        id: rowIdOf(next),
        slug: unitOf(next).Unit?.Slug ?? '',
        groupLabel: node && node.key !== group?.key ? groupName(node, fieldLabel) : undefined,
      };
    }
    return {
      position: at === undefined ? null : at + 1,
      first: at === 0,
      last: at === order.ordered.length - 1,
      group,
      nextProblem,
    };
  }, [row, rowId, order, rowIdOf, groupCache]);

  const facts = useMemo(() => (row ? rowFacts(row) : null), [row]);
  // The Units a Release of the Space would take: those of its release Target with revisions to release. From the rows
  // already loaded, which a write refetches, so the count follows an upgrade or a restore.
  const spaceId = facts?.spaceId;
  const releaseTargetId = row?.Space?.ReleaseTargetID || undefined;
  const releaseReach = useMemo(() => {
    if (!spaceId || !releaseTargetId) return undefined;
    let n = 0;
    for (const r of allRows) {
      const u = unitOf(r);
      if (u.Unit?.SpaceID === spaceId && u.Unit.TargetID === releaseTargetId && unreleasedCount(u) > 0) n++;
    }
    return n;
  }, [allRows, spaceId, releaseTargetId]);
  const data = useUnitPanelData(row, settled);
  const gone = rowGone || data.gone;
  // A Unit that is gone has nothing to confirm: its verdict rests on the row as it was, provisionally.
  const fetched = useMemo(() => (gone ? { ...data.fetched, status: 'error' as const, gone: true } : data.fetched), [gone, data.fetched]);
  const isPicked = !!rowId && selection.picked.has(rowId);

  const toolchainType = row?.Unit?.ToolchainType ?? '';
  const gateTarget = useMemo(
    () =>
      facts && !gone && facts.gateNames.length > 0 && toolchainType
        ? { spaceId: facts.spaceId, unitId: facts.unitId, head: facts.head, toolchainType, gates: facts.gateNames, triggerIds: fetched.triggerIds }
        : null,
    [facts, gone, toolchainType, fetched.triggerIds],
  );
  const gateChecks = useGateChecks(gateTarget);

  const verdict = useMemo(
    () =>
      facts && place
        ? buildVerdict({
            row: facts,
            fetched,
            checks: gateChecks.checks,
            context: {
              nextProblem: place.nextProblem,
              selectionEnabled: selection.enabled,
              pickedCount: selection.count,
              isPicked,
              hidden: place.position === null,
              releaseReach,
              now: Date.now(),
            },
          })
        : null,
    [facts, place, fetched, gateChecks.checks, selection.enabled, selection.count, isPicked, releaseReach],
  );

  const preview = useMemo(() => (facts ? upgradePreviewRequest(facts) : null), [facts]);
  // The dialog open on the Unit it was opened on; a move to another row closes it, so a return does not open it again.
  const [dialogState, setDialog] = useState<PanelDialog | null>(null);
  const dialog = dialogState && facts && dialogState.unitId === facts.unitId ? dialogState : null;
  if (dialogState && !dialog) setDialog(null);
  const wrote = useRef(false);
  // What opened the confirm (a fix link, the primary) may leave with the change: the panel keeps focus, so its keys still work.
  // MUI gives focus back to the dialog's opener in an effect cleanup when the dialog unmounts, and React runs every cleanup of
  // a commit before that commit's effects, so this effect always comes after it. A frame can come before it, and then the
  // opener keeps focus and drops it to the page when the verdict disables it.
  const [refocusAfterWrite, setRefocusAfterWrite] = useState(0);
  useEffect(() => {
    if (refocusAfterWrite > 0) focusPanel();
  }, [refocusAfterWrite, focusPanel]);
  const unit = row?.Unit;
  const dialogActions = useMemo<PanelDialogActions>(
    () => ({
      close: () => {
        setDialog(null);
        if (wrote.current) setRefocusAfterWrite((n) => n + 1);
        wrote.current = false;
      },
      confirmUpgrade: () => setDialog((d) => (d?.kind === 'preview' && unit ? { kind: 'upgrade', unitId: d.unitId, unit } : d)),
      previewAgain: () => setDialog((d) => (d?.kind !== 'preview' ? d : preview ? { kind: 'preview', unitId: preview.unitId, request: preview } : null)),
      written: () => {
        wrote.current = true;
      },
    }),
    [unit, preview],
  );

  const links = useMemo(() => (facts && !gone ? panelLinks(facts, data.componentSlug, search) : {}), [facts, gone, data.componentSlug, search]);
  const dispatch = useAppDispatch();
  const { enabled: selectionEnabled, pick } = selection;
  const nextProblemId = place?.nextProblem?.id;
  const hidden = place?.position === null;
  const checkGate = gateChecks.check;
  const restorable = !!facts && facts.released > 0 && facts.head > facts.released;
  const diffArgs = restorable ? facts : null;
  // Release is listed with its reason when it cannot run, so it needs an entry then too; it runs only with its link.
  const releaseOff = !!facts && releaseState(facts, fetched)?.enabled === false;
  const actions = useMemo<PanelActions>(() => {
    const list: PanelActions = {};
    for (const [id, href] of Object.entries(links) as [ActionId, string][]) list[id] = () => void window.open(href, '_blank', 'noopener');
    if (nextProblemId) list['next-problem'] = () => onGoTo(nextProblemId);
    if (gone) return list;
    if (!list['release-space'] && releaseOff) list['release-space'] = () => undefined;
    // Outside a Units Table there is no selection to add the Unit to; the verdict lists it, off, with the reason.
    list['run-function'] = () => {
      if (!selectionEnabled || !rowId || hidden) return;
      pick(rowId);
      dispatch(requestInvokerOpen());
    };
    if (gateTarget) list['check-gate'] = (gate) => checkGate(gate);
    if (diffArgs)
      list['see-diff'] = () =>
        setDialog({
          kind: 'diff',
          unitId: diffArgs.unitId,
          request: { spaceId: diffArgs.spaceId, unitId: diffArgs.unitId, slug: diffArgs.slug, from: diffArgs.released, to: diffArgs.head },
        });
    // Upgrade shows what changes first; its confirm is the only step that writes.
    if (preview) list['preview-upgrade'] = list.upgrade = () => setDialog({ kind: 'preview', unitId: preview.unitId, request: preview });
    if (restorable && unit?.UnitID) {
      const unitId = unit.UnitID;
      list.restore = () => setDialog({ kind: 'restore', unitId, unit });
    }
    return list;
  }, [links, releaseOff, nextProblemId, onGoTo, gone, selectionEnabled, rowId, hidden, pick, dispatch, gateTarget, checkGate, diffArgs, preview, restorable, unit]);

  const details = useMemo(
    () => ({ status: fetched.status, gone, componentError: !!fetched.space?.componentError, retry: data.retry }),
    [fetched.status, gone, fetched.space?.componentError, data.retry],
  );
  // The read can find a cause the row does not show (a conflict, a failed action, an unmet need): the Unit then needs
  // attention, so its group's line counts Units rather than those that need attention, and "Nothing else" is said.
  // The counts, ⇧J and the next Unit come from the rows alone, since the panel reads no other Unit.
  const selfNeeds = (!!row && needsAttention(row)) || !!verdict?.causes.some((c) => c.kind !== 'checking');
  const group = place?.group ?? null;

  const model = useMemo<UnitPanelModel | null>(() => {
    if (!row || !facts || !place || !verdict) return null;
    return {
      facts,
      verdict,
      position: place.position,
      total: order.ordered.length,
      group,
      status: rowClass(row).status,
      needsAttention: selfNeeds,
      nextProblem: place.nextProblem,
      onPrevious: place.position !== null && !place.first ? onPrevious : undefined,
      onNext: place.position !== null && !place.last ? onNext : undefined,
      onGoTo,
      actions,
      links,
      details,
      tab,
      onTabChange,
      dialog,
      dialogActions,
      upgrade: preview,
    };
  }, [row, facts, place, verdict, group, selfNeeds, order.ordered.length, onPrevious, onNext, onGoTo, actions, links, details, tab, onTabChange, dialog, dialogActions, preview]);

  // Said once per row the panel settles on, when its verdict is known: not "Checking…" and then the verdict, nor an
  // error an earlier visit left in the cache while the read is asked again.
  const [announced, setAnnounced] = useState<{ id: string; text: string } | null>(null);
  if (model && rowId && settled && fetched.status !== 'loading' && data.current && announced?.id !== rowId)
    setAnnounced({ id: rowId, text: announcement(model.facts.slug, model.position, model.total, model.verdict.headline) });
  if (!rowId && announced) setAnnounced(null);

  return {
    model,
    announcement: announced && announced.id === rowId ? announced.text : '',
  };
}
