// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo } from 'react';

import type { ExtendedSpaceRead, ExtendedUnitRead } from '@confighub/rtk-query';
import type { Theme } from '@mui/material/styles';

import { getAdapter } from '../adapters';
import type { ResourceViewRow } from '../adapters/resource-row';
import type { GroupNavRow } from '../cell-value';
import { fieldById, fieldCatalog, STATUS_LABEL, type EntityRow, type FieldDef } from '../model/fields';
import type { GroupNode } from '../model/grouping';
import { groupLevelFor } from '../model/sort';
import type { EntityKind, StatusKind } from '../model/types';
import { withExplorerReturn } from '../results/explorer-link';
import { useExplorerContext } from '../state/context';
import type { CellActions } from '../table/cells/TableCellContent';
import { groupValueText, pathLenses, type GroupStep } from '../table/groups';

/**
 * What the Board layout shares with the table: the label keys the rows carry,
 * the field the board's lanes follow, and the actions behind a click (a row
 * opens the drawer, a value its popover, a count a peek).
 */

/** The label keys the rows carry (the Units' labels, a Space's, a Resource's Unit's), sorted. */
export function rowLabelKeys(entity: EntityKind, rows: readonly EntityRow[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    const labels =
      entity === 'Unit'
        ? (row as ExtendedUnitRead).Unit?.Labels
        : entity === 'Space'
          ? (row as ExtendedSpaceRead).Space?.Labels
          : (row as ResourceViewRow).UnitLabels;
    for (const k of Object.keys(labels ?? {})) keys.add(k);
  }
  return [...keys].sort();
}

/** The fields rows can be grouped (and laned) on: every field with a group order, labels included. */
export function groupableFields(entity: EntityKind, labelKeys: readonly string[]): FieldDef[] {
  return fieldCatalog(entity, labelKeys).filter((f) => groupLevelFor(entity, f.id) !== null);
}

/**
 * Fields whose values name single rows (or near enough): a lane each would be
 * one card wide, and thousands of them.
 */
const ROW_NAMES = new Set(['Slug', 'DisplayName', 'ResourceName', 'Unit.Slug', 'LastChangeDescription', 'UpstreamUnitSlug']);

/**
 * The fields the board's lanes can follow: a few values each (strings,
 * statuses, flags and labels), never a row's own name, an id, a number or a time.
 */
export function laneableFields(entity: EntityKind, labelKeys: readonly string[]): FieldDef[] {
  return groupableFields(entity, labelKeys).filter(
    (f) => (f.type === 'string' || f.type === 'status' || f.type === 'bool') && !ROW_NAMES.has(f.id) && !/ID$/.test(f.id),
  );
}

const DEFAULT_LANE: Record<EntityKind, readonly string[]> = {
  Unit: ['Status'],
  // A Space's env label when the Spaces have one; their Component otherwise.
  Space: ['Labels.env', 'Component'],
  Resource: ['ResourceType'],
};

/** The field the board's lanes follow: the first group level, or the entity's default. */
export function laneFieldOf(entity: EntityKind, groupBy: readonly string[], labelKeys: readonly string[]): { field: string; isDefault: boolean } {
  const first = groupBy.find((g) => groupLevelFor(entity, g) !== null);
  if (first) return { field: first, isDefault: false };
  const candidates = DEFAULT_LANE[entity];
  const usable = candidates.find((f) => !f.startsWith('Labels.') || labelKeys.includes(f.slice('Labels.'.length)));
  return { field: usable ?? candidates[candidates.length - 1], isDefault: true };
}

/** Group levels with `field` first (or in place of the first): what picking the board's lanes writes to Group. */
export function withLaneField(groupBy: readonly string[], field: string): string[] {
  return [field, ...groupBy.slice(1).filter((g) => g !== field)];
}

/** "1 unit", "3 units": a count with its noun. */
export function countOf(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The colour of a status, for a lane dot. Status colours only, never the brand colour. */
export function statusColor(theme: Theme, label: string): string {
  switch (label) {
    case STATUS_LABEL.unreleased:
      return theme.palette.warning.main;
    case STATUS_LABEL.upgradable:
      return theme.palette.secondary.main;
    case STATUS_LABEL.released:
      return theme.palette.success.main;
    default:
      return theme.palette.text.disabled;
  }
}

/** A group's title for a peek: "Space payments-prod › Target k8s-prod". */
export function pathTitle(entity: EntityKind, path: readonly GroupStep[]): string {
  return path.map((s) => `${fieldById(entity, s.field)?.label ?? s.field} ${groupValueText(s.value) || 'none'}`).join(' › ');
}

export function pathOf(node: GroupNode<EntityRow>, parent: readonly GroupStep[] = []): GroupStep[] {
  return [...parent, { field: node.field, value: node.value }];
}

/** The keys held during a click or a keypress: ⌘/Ctrl opens a row's own page. */
export interface OpenModifiers {
  metaKey: boolean;
  ctrlKey: boolean;
}

/** What a click in a layout does. */
export function useLayoutActions(entity: EntityKind, groupBy: readonly string[], rows: readonly EntityRow[], rowId: (row: EntityRow) => string) {
  const { slots } = useExplorerContext();
  const groupKey = groupBy.join('|');

  const actions = useMemo<CellActions>(
    () => ({
      onValue: (anchorEl, rowId, field, value, additive) => slots.current.openCellPopover({ entity, field, value, rowId, anchorEl, additive }),
      onStatus: (anchorEl, status: StatusKind) => {
        const statusField = fieldById(entity, 'Status');
        const rowIds = statusField ? rows.filter((r) => statusField.value(r) === STATUS_LABEL[status]).map(rowId) : undefined;
        slots.current.openPeek({ anchorEl, title: STATUS_LABEL[status], lenses: [{ kind: 'status', status }], groupBy: [...groupBy], rowIds });
      },
    }),
    // groupKey stands for groupBy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, entity, groupKey, rows, rowId],
  );

  /** A peek at a group: its path as lenses, with the levels below it kept, and exactly its rows. */
  const peek = useCallback(
    (anchorEl: HTMLElement, path: readonly GroupStep[], groupRows: readonly EntityRow[]) =>
      slots.current.openPeek({
        anchorEl,
        title: pathTitle(entity, path),
        lenses: pathLenses(entity, path),
        groupBy: groupBy.slice(path.length),
        rowIds: groupRows.map(rowId),
      }),
    // groupKey stands for groupBy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, entity, groupKey, rowId],
  );

  /** A row or card: the details panel, or with ⌘/Ctrl the row's own page in a new tab. */
  const openRow = useCallback(
    (row: EntityRow, e: OpenModifiers) => {
      if (e.metaKey || e.ctrlKey) {
        const href = getAdapter(entity).getRowHref(row as GroupNavRow);
        // The page it opens offers a way back to this tab.
        if (href) window.open(withExplorerReturn(href), '_blank', 'noopener');
        return;
      }
      slots.current.openRow(row);
    },
    [slots, entity],
  );

  return { actions, peek, openRow };
}
