// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Resolving each Stage's selector against the server.
 *
 * THE SERVER IS THE ONLY AUTHORITY on what a selector means and whether it is valid.
 * The builder used to read `where` itself, and a hand-written grammar accepted three
 * operators where the server accepts seventeen -- so it reported correct Stages as
 * unreadable and refused to save work the server would have taken. A second grammar is
 * wrong in both directions and drifts; there is none here.
 *
 * WHY A LAZY TRIGGER, not `useListSpacesQuery`: the number of Stages varies as they are
 * added, removed and reordered, and a varying number of hooks is not legal React. An
 * imperative trigger fired from an effect is the only shape that works at all. It also
 * gives control over WHEN, which is what "resolve on pause" needs.
 *
 * WHY A DEBOUNCE: the preview is per-keystroke, and typing `Labels.Stage = 'prod'`
 * would otherwise issue a request per character, twenty-one of them for half-typed
 * expressions that are correctly refused, flickering an error under the field
 * mid-word. The debounce is what stops the junk being issued; the lazy trigger only
 * decides when the surviving one goes.
 *
 * This costs nothing in correctness: the server validates every Stage's `WhereSpace`
 * again on save (`internal/views/changeworkflow.go:128`), unbypassably. Resolution here
 * tells an author SOONER. It is not what keeps a bad selector out of the store.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLazyListSpacesQuery } from '@confighub/rtk-query';
import { getApiErrorMessage } from '@/utility/error-functions';

import { isContentRefusal } from '../saveOutcome';

import {
  UNRESOLVED,
  type SpaceRow,
  type StageResolution,
  type StageSelector,
} from './stageResolution';

/** Matches the debounce the query-builder's completions use, for one feel across the app. */
const RESOLVE_DEBOUNCE_MS = 300;

/**
 * Only what a selector preview reads. `summary` is deliberately absent: it makes the
 * server run roughly eighteen COUNT queries per Space, which no preview needs.
 */
const SPACE_SELECT = 'SpaceID,Slug,Labels';

type CacheEntry = { kind: 'spaces'; spaces: SpaceRow[] } | { kind: 'invalid'; message: string };

/**
 * No verdict was reached, so there is nothing to remember.
 *
 * A request that did not arrive says NOTHING about the selector, and must never be
 * cached: caching it would turn one network blip into a permanent "this expression is
 * invalid", raising a fault and blocking a save on work that was always correct.
 */
const NO_VERDICT = null;

/**
 * An answer, with the clause it answered and the scope that clause was narrowed by.
 *
 * The scope is kept separately even though `clause` already contains it, because the two
 * reasons a clause changes deserve different treatment. See the hold rule below.
 */
interface StageAnswer {
  clause: string | undefined;
  scope: string | undefined;
  resolution: StageResolution;
}

/**
 * The clause actually sent: the Stage's selector narrowed by whatever the caller scopes
 * the preview to.
 *
 * `scopeWhere` is OPAQUE here. This layer neither knows nor asks what it expresses --
 * it conjoins it and sends it. What the preview is scoped to is a decision made above,
 * and naming it here would settle a question that has not been answered.
 */
function clauseFor(where: string, scopeWhere: string | undefined): string | undefined {
  const selector = where.trim();
  const scope = scopeWhere?.trim();
  if (selector && scope) return `${selector} AND ${scope}`;
  return selector || scope || undefined;
}

export interface StageResolutions {
  byStageId: ReadonlyMap<string, StageResolution>;
  /**
   * True once the first resolution pass has finished.
   *
   * The caller gates the body on this AND on whatever else must be in hand, so nothing
   * renders against a half-filled set: the alternative is every rail tile painting
   * without a count and filling in a moment later, which is a reflow on every load
   * rather than a rare one.
   *
   * NOT "once every Stage has an answer", deliberately. A pass in which some requests
   * failed still lifts the gate, because a page that waited for an answer that is never
   * coming would show nothing at all -- and a Stage with no answer is already safe, since
   * `unresolved` raises no fault and blocks no save. Availability beats completeness
   * here; the cost is a count that arrives late, not a wrong one.
   *
   * It goes true once and stays true: a later refetch keeps the last answers, so a
   * background refresh never blanks a page someone is typing into.
   */
  isInitiallyResolved: boolean;
}

export function useStageResolutions(
  selectors: StageSelector[],
  scopeWhere: string | undefined,
): StageResolutions {
  const [triggerListSpaces] = useLazyListSpacesQuery();

  /**
   * Answers already had, keyed by the exact clause sent, so a settled expression is
   * fetched once however often it is revisited. A ref because nothing renders from it.
   */
  const cache = useRef(new Map<string, CacheEntry>());

  /**
   * The last answer for each Stage, WITH the clause it answered.
   *
   * Held as state rather than a ref because the render reads it: keeping the clause
   * alongside is what lets a render tell a current answer from one being held over
   * while a newer clause is in flight.
   */
  const [answers, setAnswers] = useState<ReadonlyMap<string, StageAnswer>>(new Map());
  const [isInitiallyResolved, setIsInitiallyResolved] = useState(false);

  const wanted = useMemo(
    () =>
      selectors.map((selector) => ({
        id: selector.id,
        clause: clauseFor(selector.where, scopeWhere),
      })),
    [selectors, scopeWhere],
  );

  /*
   * WHAT wants resolving, reduced to a value that changes only when the answer would.
   *
   * Everything below keys off this string rather than off `wanted` itself, and reads the
   * array through a ref. A caller that rebuilds its Stage array every render -- which is
   * ordinary, since the workflow is replaced wholesale on each edit -- would otherwise
   * hand the effect a new identity every time, restarting the debounce before it could
   * ever fire. The ref is safe precisely because the key captures the whole of what the
   * effect reads: the two cannot be out of step.
   */
  const wantedKey = useMemo(() => JSON.stringify(wanted), [wanted]);
  const wantedRef = useRef(wanted);
  wantedRef.current = wanted;

  const resolveClause = useCallback(
    async (clause: string | undefined): Promise<CacheEntry | null> => {
      const key = clause ?? '';
      const cached = cache.current.get(key);
      if (cached) return cached;

      const result = await triggerListSpaces({ where: clause, select: SPACE_SELECT });

      if (result.error) {
        // Only an actual refusal is the author's problem. Everything else leaves the
        // selector unjudged, and is neither reported as a fault nor remembered.
        if (!isContentRefusal(result.error)) return NO_VERDICT;
        const entry: CacheEntry = {
          kind: 'invalid',
          message: getApiErrorMessage(result.error, 'That selector could not be read.'),
        };
        cache.current.set(key, entry);
        return entry;
      }

      // Typed as an array and not guaranteed to be one: the base query parses by content
      // type, so an intermediary answering 200 with an HTML page yields a string, and
      // `.flatMap` on a string throws inside a render. A shape nobody can read is no more
      // of a verdict on the selector than a timeout is, so it yields none.
      if (!Array.isArray(result.data)) return NO_VERDICT;

      const entry: CacheEntry = {
        kind: 'spaces',
        spaces: result.data.flatMap((extended) => {
          const space = extended?.Space;
          if (!space?.Slug) return [];
          return [{ spaceId: space.SpaceID ?? '', slug: space.Slug, labels: space.Labels ?? {} }];
        }),
      };
      cache.current.set(key, entry);
      return entry;
    },
    [triggerListSpaces],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const pending = wantedRef.current;
        const entries = await Promise.all(
          pending.map(async (item) => [item.id, await resolveClause(item.clause)] as const),
        );
        if (cancelled) return;
        setAnswers((previous) => {
          const next = new Map(previous);
          for (const [index, [id, entry]] of entries.entries()) {
            // No verdict says nothing about the selector, so the Stage keeps whatever it
            // last knew and nothing is recorded against it.
            if (entry === NO_VERDICT) continue;
            next.set(id, {
              clause: pending[index].clause,
              scope: scopeWhere,
              resolution:
                entry.kind === 'invalid'
                  ? { kind: 'invalid', message: entry.message }
                  : { kind: 'matched', spaces: entry.spaces, stale: false },
            });
          }
          // A Stage that has gone away should not keep an answer alive behind it.
          const live = new Set(pending.map((item) => item.id));
          for (const id of [...next.keys()]) {
            if (!live.has(id)) next.delete(id);
          }
          return next;
        });
        setIsInitiallyResolved(true);
      })();
    }, RESOLVE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `scopeWhere` is already folded into `wantedKey` via each clause; named separately
    // because the answers record it, and a dependency the linter cannot infer is one a
    // reader cannot either.
  }, [wantedKey, scopeWhere, resolveClause]);

  const byStageId = useMemo(() => {
    const map = new Map<string, StageResolution>();
    for (const item of wanted) {
      const answer = answers.get(item.id);
      if (!answer) {
        map.set(item.id, UNRESOLVED);
        continue;
      }
      if (answer.clause === item.clause) {
        map.set(item.id, answer.resolution);
        continue;
      }
      /*
       * The answer is for a clause that has since changed, and WHY it changed decides
       * whether the old one may still be shown.
       *
       * SAME SCOPE -- the selector was edited. The held answer is a previous answer to
       * the same question, so showing it beats blanking the count mid-edit. Marked held.
       *
       * DIFFERENT SCOPE -- the component being previewed against changed. The held answer
       * is about a DIFFERENT question: those are another component's variants, and
       * presenting them beside the new component's name is not late information, it is
       * wrong information. Dropped.
       *
       * A held refusal is dropped either way: an error about an expression nobody is
       * looking at any more would accuse the author of a mistake they have already moved
       * past.
       */
      const sameScope = answer.scope === scopeWhere;
      map.set(
        item.id,
        sameScope && answer.resolution.kind === 'matched'
          ? { ...answer.resolution, stale: true }
          : UNRESOLVED,
      );
    }
    return map;
  }, [wanted, answers, scopeWhere]);

  return { byStageId, isInitiallyResolved };
}
