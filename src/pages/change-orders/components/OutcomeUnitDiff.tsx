// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo, type CSSProperties, type ReactNode } from 'react';

import { ConfigDiffView, type ConfigDiffColumns } from '@/components/config-diff/ConfigDiffView';
import type { DiffComments } from '@/components/config-diff/diffComments';
import type { KeptValue } from '../../x/apps/diffTree';
import { TreeDiffSection } from '../../x/apps/TreeDiffSection';
import type { ChangeOrderChangeGroup } from '../../x/apps/change-order/changeOrderTypes';
import { keptValueOf, rowRefusals } from '../changeOrderCard';
import { ChangeOrderRefusals } from '../changeOrderRefusals';

export interface OutcomeUnitDiffProps {
  unitId: string;
  /** What the promotion does to the resource. Absent: nothing is known about it. */
  group: Pick<ChangeOrderChangeGroup, 'fieldDiffs' | 'conflicts' | 'diff' | 'allPaths'> | undefined;
  /** Widths shared with the other diffs on the page. */
  columns: ConfigDiffColumns;
  /** The column style the field-diff fallback takes; defaults to `columns.columnStyle`. */
  fallbackColumnStyle?: CSSProperties;
  /** Unique among the page's trees, for the field-diff fallback's row keys. */
  keyPrefix: string;
  /** What shows in place of the diff when no field changes. Nothing by default. */
  empty?: ReactNode;
  /** Review comments on the diff's rows. */
  comments?: DiffComments;
  /** A path whose row the server's diff marks (`ConfigDiffView`'s `highlightPath`). */
  highlightPath?: string;
}

const NO_KEPT: readonly KeptValue[] = [];

/**
 * One resource's part of an outcome card: what the promotion writes, as the server's
 * diff, with the values the target keeps drawn as rows in that diff (a path kept on
 * merge, a local override) rather than as sentences above it. Refusals that are not a
 * kept value stay sentences: they say what stopped the change, not what a field holds.
 *
 * A kept value needs the server's diff to sit in. Where there is none to draw (no
 * field changes, or only the field-diff fallback), it is said as a sentence too, so
 * it is never lost.
 */
export function OutcomeUnitDiff({
  unitId,
  group,
  columns,
  fallbackColumnStyle,
  keyPrefix,
  empty = null,
  comments,
  highlightPath,
}: OutcomeUnitDiffProps) {
  const fieldDiffs = group?.fieldDiffs ?? [];
  const serverDiff = fieldDiffs.length > 0 ? group?.diff : undefined;
  const refusals = useMemo(() => rowRefusals(group), [group]);
  // A kept value is a row only where its resource is in the diff; anywhere else it stays a sentence.
  const { kept, sentences } = useMemo(() => {
    if (serverDiff === undefined) return { kept: NO_KEPT, sentences: refusals };
    const resources = serverDiff.Resources ?? [];
    const names = new Set(resources.map((resource) => resource.Resource?.ResourceName));
    const rows: KeptValue[] = [];
    const rest: typeof refusals[number][] = [];
    for (const conflict of refusals) {
      const value = keptValueOf(conflict);
      const placed =
        value !== undefined && (value.resourceName === undefined ? resources.length === 1 : names.has(value.resourceName));
      if (placed) rows.push(value);
      else rest.push(conflict);
    }
    return rows.length === 0 ? { kept: NO_KEPT, sentences: refusals } : { kept: rows, sentences: rest };
  }, [serverDiff, refusals]);
  return (
    <>
      <ChangeOrderRefusals conflicts={sentences} />
      {fieldDiffs.length === 0 ? (
        empty
      ) : serverDiff !== undefined ? (
        <ConfigDiffView
          diff={serverDiff}
          columns={columns}
          hideContext
          kept={kept}
          comments={comments}
          highlightPath={highlightPath}
        />
      ) : (
        <TreeDiffSection
          entry={{ unitId, fieldDiffs }}
          allPaths={group?.allPaths}
          keyPrefix={keyPrefix}
          label=""
          hideLabel
          variant="data"
          columnStyle={fallbackColumnStyle ?? columns.columnStyle}
          onDividerMouseDown={columns.onDividerMouseDown}
          isDragging={columns.isDragging}
        />
      )}
    </>
  );
}
