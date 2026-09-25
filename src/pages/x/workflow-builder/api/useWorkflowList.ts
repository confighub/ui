// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every ChangeWorkflow in the organisation, for the console.
 *
 * ONE UNPARAMETERISED, ORG-WIDE LIST, deliberately, for the reason
 * `useChangeWorkflowNames` gives: a `where` keyed on whatever is currently visible
 * mints a fresh cache entry per filter, per sort and per navigation, and no two of them
 * can serve each other. The unparameterised list is a SINGLE entry every view answers
 * from. An organisation's workflows are few -- they are definitions, not rollouts -- so
 * reading all of them costs less than repeatedly reading the right subset.
 *
 * THE GOVERNED COUNT IS OFF BY DEFAULT, AND THAT IS THE INTERESTING PART.
 *
 * The count is not on the entity, and the API offers no aggregate for it: `where`,
 * `filter`, `contains`, `include` and `select` are the only parameters on the ChangeOrder
 * list, with no count, no summary and no paging. So the only way to learn how many change
 * orders a definition governs is TO READ THEM ALL and count the rows.
 *
 * The cheapness argument for the workflow list above does not extend to it, and it is
 * worth being explicit about that rather than letting one justification appear to cover
 * both. Workflows are few BECAUSE they are definitions rather than rollouts -- which is
 * precisely what makes change orders the numerous thing. Reading every change order in an
 * organisation to display one number is cheap at a hundred and not at ten thousand, and
 * `select` trims the width of the response without changing how many rows come back.
 *
 * So the caller asks for it. Nothing fires unless something renders the number.
 */

import { useMemo } from 'react';

import {
  useListAllChangeOrdersQuery,
  useListAllChangeWorkflowsQuery,
} from '@confighub/rtk-query';
import { SerializedError } from '@reduxjs/toolkit';
import { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { MALFORMED_RESPONSE, tryFromWire, type MappedEntity } from './mapping';

/** Only what the count reads. Entity and parent ids come back regardless. */
const CHANGE_ORDER_SELECT = 'ChangeWorkflowID';

const NO_ENTITIES: MappedEntity[] = [];

export interface WorkflowList {
  entities: MappedEntity[];
  isLoading: boolean;
  error: FetchBaseQueryError | SerializedError | undefined;
  /**
   * True when the governed counts were asked for and could not be read, although the
   * workflows could.
   *
   * Callers show the workflows anyway: a count that failed is a gap in what can be said
   * about a definition, never a reason to withhold the definition itself.
   *
   * It also tells a caller what a `governs` of 0 means. Uncounted and genuinely none are
   * different facts, and a failed count rendered as a confident zero asserts something
   * nobody measured.
   */
  countsFailed: boolean;
  /**
   * How many rows the server returned that no workflow could be read out of, and which
   * are therefore not in `entities`.
   *
   * COUNTS BOTH CAUSES, because a reader is misled equally by either. A row may hold a
   * workflow whose shape could not be understood, or hold none at all -- and an entry
   * holding none is not a normal thing this list contains: the server builds every entry
   * from a workflow (`ExtendedChangeWorkflowFromChangeWorkflow`), and the envelope's
   * `Error` field exists for "partial failures in a list", which is the server saying it
   * could not give us that one. Both shorten the list by one. The cause differs; the
   * consequence for someone searching it does not.
   *
   * Exposed because dropping them is right and dropping them SILENTLY is not: a count
   * rendered beside the rows is a completeness claim, and a reader scanning a list for a
   * workflow that is not in it concludes it does not exist. "We could not read it" must
   * not arrive as "it is not there" -- and a wrong count is read by someone deciding
   * whether to look at all, so the failure ends their search rather than misinforming it.
   *
   * Not an error, and not a fault. Nothing is wrong with the workflows and there is
   * nothing for anyone to fix -- the list simply is not the whole list, and says so.
   */
  unreadableRows: number;
  /**
   * How many change orders each workflow governs, when counts were asked for.
   *
   * Beside the workflows rather than inside them: a workflow carries no count of its own,
   * and writing one into the object would make an absent entry indistinguishable from a
   * counted zero. A missing key means UNCOUNTED; a key holding 0 means none.
   */
  governedCounts: ReadonlyMap<string, number>;
  refetch: () => void;
}

export function useWorkflowList(skip = false, withGovernedCounts = false): WorkflowList {
  const {
    data: workflowData,
    isLoading,
    error,
    refetch,
  } = useListAllChangeWorkflowsQuery({}, { skip });

  const { data: changeOrderData, error: changeOrderError } = useListAllChangeOrdersQuery(
    { select: CHANGE_ORDER_SELECT },
    { skip: skip || !withGovernedCounts },
  );

  /*
   * MEMOISED ON `data`, not rebuilt inline: the console holds its rows in a `useMemo`
   * keyed on this, and a value whose identity changed every render would rebuild every
   * row every time.
   */
  const governedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const extended of changeOrderData ?? []) {
      const id = extended.ChangeOrder?.ChangeWorkflowID;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [changeOrderData]);

  /*
   * A row that cannot be read is dropped, and the whole list is only unreadable when the
   * response is not a list at all. `data` is typed as an array and is not guaranteed to be
   * one -- the base query parses by content type, so an intermediary answering 200 with an
   * HTML page yields a string, and `.flatMap` on a string throws inside a render, past
   * every error state a caller has.
   *
   * Dropping one bad row rather than failing the console is deliberate: the other
   * workflows are readable and withholding them helps nobody. A row nobody can read is
   * already invisible; the alternative is a console that shows none of them.
   */
  const { entities, unreadable, unreadableRows } = useMemo(() => {
    if (workflowData === undefined) {
      return { entities: NO_ENTITIES, unreadable: false, unreadableRows: 0 };
    }
    if (!Array.isArray(workflowData)) {
      return { entities: NO_ENTITIES, unreadable: true, unreadableRows: 0 };
    }
    let dropped = 0;
    const rows = workflowData.flatMap((extended) => {
      const wire = extended?.ChangeWorkflow;
      if (!wire) {
        // Not a normal entry: every one the server builds carries a workflow, and the
        // envelope's Error field is for partial failures in a list. So this is a row we
        // were not given, and it shortens the list exactly as an unreadable one does.
        dropped += 1;
        return [];
      }
      const mapped = tryFromWire(wire);
      if (!mapped) {
        dropped += 1;
        return [];
      }
      return [mapped];
    });
    return { entities: rows, unreadable: false, unreadableRows: dropped };
  }, [workflowData]);

  return {
    entities,
    isLoading,
    error: error ?? (unreadable ? MALFORMED_RESPONSE : undefined),
    countsFailed: changeOrderError !== undefined,
    unreadableRows,
    governedCounts,
    refetch,
  };
}
