// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useRef, useState } from 'react';

import {
  confighubApi,
  useBulkCreateSpacesMutation,
  useBulkCreateUnitsMutation,
  type BulkCreateSpacesApiResponse,
  type BulkCreateUnitsApiResponse,
} from '@confighub/rtk-query';
import { useAppDispatch } from '@/hooks/useApp';
import { getApiErrorMessage } from '@/utility/error-functions';

import { extractItemLevelErrors } from './useCreateVariantMutation';

// ============================================================================
// TYPES
// ============================================================================

export interface DownstreamSpec {
  /** Target to attach to the new variant space. */
  targetId: string;
  /** Variant name → the Space's `Variant` label and its derived slug segment. */
  variantName: string;
}

export interface CreateDownstreamsInput {
  upstreamSpaceId: string;
  /** RTK where-clause scoping the upstream units, e.g. "SpaceID='<id>'". */
  upstreamUnitWhere: string;
  downstreams: DownstreamSpec[];
}

export type CreateDownstreamsPhase =
  | 'idle'
  | 'creating'
  | 'success'
  | 'partialFailure'
  | 'error';

export interface DownstreamResult {
  targetId: string;
  variantName: string;
  status: 'created' | 'failed';
  spaceId?: string;
  spaceSlug?: string;
  /** Failure detail; set only when status is 'failed'. */
  message?: string;
}

export interface UseCreateDownstreamsMutationResult {
  submit: (input: CreateDownstreamsInput) => Promise<void>;
  /** Re-run only the entries whose status is 'failed', against the same upstream. */
  retryFailed: () => Promise<void>;
  reset: () => void;
  phase: CreateDownstreamsPhase;
  results: DownstreamResult[];
  error: { title: string; detail: string } | null;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Clones a freshly created component space into N downstream "deployment
 * variant" spaces, one per selected Target.
 *
 * Per downstream this is exactly the CreateVariantPane recipe (see
 * `useCreateVariantMutation.ts` steps 1–2 and
 * `docs/solutions/ui-components-create-variant.md`):
 *
 *   Step 1: `bulkCreateSpaces` — clone the upstream space, stamping
 *           `Variant=<name>` plus the `UpstreamSpaceID` / `TargetID` annotations.
 *   Step 2: `bulkCreateUnits`  — clone the upstream units into the new space
 *           with the Target attached.
 *
 * There is deliberately **no** `set-namespace` step (Step 3 of the variant
 * flow). The create-component wizard has no namespace to derive and the target
 * picker offers no field for one; users set namespaces from the existing
 * variant flow.
 *
 * Two properties are load-bearing and must not be "optimised":
 *
 * 1. **Sequential, never `Promise.all`.** Each downstream issues two bulk
 *    calls against the same upstream space. Running them concurrently races on
 *    the derived space slugs and yields non-deterministic partial results.
 *    Sequencing also makes `results` accumulate in a stable, user-visible order.
 * 2. **207 Multi-Status is not a failure to RTK.** `.unwrap()` resolves an
 *    HTTP 207 as success even when an item in the response array carries an
 *    `Error`. `extractItemLevelErrors` is therefore called after *every* unwrap;
 *    it is imported from `useCreateVariantMutation.ts`, never reimplemented.
 *
 * A failure in one downstream never aborts the rest — it is recorded as
 * `status: 'failed'` and the loop continues. Final phase: all created →
 * `'success'`; some → `'partialFailure'`; none → `'error'`.
 */
export function useCreateDownstreamsMutation(): UseCreateDownstreamsMutationResult {
  const [bulkCreateSpaces] = useBulkCreateSpacesMutation();
  const [bulkCreateUnits] = useBulkCreateUnitsMutation();
  const dispatch = useAppDispatch();

  // ── State ─────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<CreateDownstreamsPhase>('idle');
  const [results, setResults] = useState<DownstreamResult[]>([]);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  /**
   * Mirror of `results` that is safe to read inside an in-flight async loop.
   * `retryFailed` needs the latest results without taking `results` as a
   * dependency (which would churn its identity on every progress tick and
   * invalidate callers' `useCallback` deps mid-flight).
   */
  const resultsRef = useRef<DownstreamResult[]>([]);

  /**
   * Retained upstream args so `retryFailed` can re-run against the same
   * upstream space. Mirrors `namespaceRetryRef` in `useCreateVariantMutation`.
   */
  const retryRef = useRef<{ upstreamSpaceId: string; upstreamUnitWhere: string } | null>(null);

  /** Write both the ref (for async readers) and the state (for renderers). */
  const commitResults = useCallback((next: DownstreamResult[]) => {
    resultsRef.current = next;
    setResults(next);
  }, []);

  // ── One downstream: spaces → units ────────────────────────────────────────
  const createOne = useCallback(
    async (
      spec: DownstreamSpec,
      upstreamSpaceId: string,
      upstreamUnitWhere: string,
    ): Promise<DownstreamResult> => {
      const { targetId, variantName } = spec;
      const failed = (message: string, partial?: Pick<DownstreamResult, 'spaceId' | 'spaceSlug'>): DownstreamResult => ({
        targetId,
        variantName,
        status: 'failed',
        message,
        ...partial,
      });

      // ── Step 1: clone space ────────────────────────────────────────────────
      let spaceResponse: BulkCreateSpacesApiResponse;
      try {
        spaceResponse = await bulkCreateSpaces({
          where: `SpaceID='${upstreamSpaceId}'`,
          variantLabels: `Variant=${variantName}`,
          body: {
            Annotations: {
              UpstreamSpaceID: upstreamSpaceId,
              TargetID: targetId,
            },
          },
        }).unwrap();
      } catch (err) {
        return failed(getApiErrorMessage(err));
      }

      // 207: RTK resolved it as success — inspect for item-level errors.
      const spaceItemErrors = extractItemLevelErrors(spaceResponse);
      if (spaceItemErrors.length > 0) {
        return failed(spaceItemErrors[0]);
      }

      const firstSpaceEntry = Array.isArray(spaceResponse) ? spaceResponse[0] : undefined;
      const newSpaceId = firstSpaceEntry?.Space?.SpaceID;
      const newSpaceSlug = firstSpaceEntry?.Space?.Slug;
      if (!newSpaceId || !newSpaceSlug) {
        return failed('No space ID returned from clone');
      }

      // ── Step 2: clone units ────────────────────────────────────────────────
      let unitResponse: BulkCreateUnitsApiResponse;
      try {
        unitResponse = await bulkCreateUnits({
          where: upstreamUnitWhere,
          whereSpace: `SpaceID='${newSpaceId}'`,
          body: { TargetID: targetId },
        }).unwrap();
      } catch (err) {
        // The space exists but has no units — report the slug so the user can
        // find and clean up the half-built variant.
        return failed(getApiErrorMessage(err), { spaceId: newSpaceId, spaceSlug: newSpaceSlug });
      }

      // 207 again — same trap, same guard.
      const unitItemErrors = extractItemLevelErrors(unitResponse);
      if (unitItemErrors.length > 0) {
        return failed(unitItemErrors[0], { spaceId: newSpaceId, spaceSlug: newSpaceSlug });
      }

      return {
        targetId,
        variantName,
        status: 'created',
        spaceId: newSpaceId,
        spaceSlug: newSpaceSlug,
      };
    },
    [bulkCreateSpaces, bulkCreateUnits],
  );

  /** Derive the terminal phase (and error banner) from a completed result set. */
  const finalize = useCallback((collected: DownstreamResult[]) => {
    const failures = collected.filter((r) => r.status === 'failed');

    if (failures.length === 0) {
      setError(null);
      setPhase('success');
      return;
    }

    const detail = failures[0].message ?? 'Unknown error';
    if (failures.length === collected.length) {
      setError({ title: 'Failed to create deployment variants', detail });
      setPhase('error');
      return;
    }

    setError({
      title: `${failures.length} of ${collected.length} deployment variants failed`,
      detail,
    });
    setPhase('partialFailure');
  }, []);

  // ── submit ────────────────────────────────────────────────────────────────
  const submit = useCallback(
    async (input: CreateDownstreamsInput) => {
      const { upstreamSpaceId, upstreamUnitWhere, downstreams } = input;

      retryRef.current = { upstreamSpaceId, upstreamUnitWhere };
      setError(null);
      commitResults([]);

      // Nothing to do — stay idle rather than reporting a vacuous 'error'.
      if (downstreams.length === 0) {
        setPhase('idle');
        return;
      }

      setPhase('creating');

      // Sequential by design — do not convert to Promise.all (see the module doc comment).
      const collected: DownstreamResult[] = [];
      for (const spec of downstreams) {
        const outcome = await createOne(spec, upstreamSpaceId, upstreamUnitWhere);
        collected.push(outcome);
        commitResults([...collected]);
      }

      // Once, after the loop — never per iteration. Fired even when every entry
      // failed: a step-2 failure still leaves a created space behind, so the
      // cache cannot be assumed clean.
      dispatch(confighubApi.util.invalidateTags(['Unit', 'Space']));

      finalize(collected);
    },
    [commitResults, createOne, dispatch, finalize],
  );

  // ── retryFailed ───────────────────────────────────────────────────────────
  const retryFailed = useCallback(async () => {
    const retained = retryRef.current;
    if (!retained) return;

    const previous = resultsRef.current;
    const failedIndices = previous.reduce<number[]>((acc, r, i) => {
      if (r.status === 'failed') acc.push(i);
      return acc;
    }, []);
    if (failedIndices.length === 0) return;

    setError(null);
    setPhase('creating');

    // Sequential, in-place: retried entries keep their original position so the
    // receipt rows do not reshuffle under the user.
    const next = [...previous];
    for (const index of failedIndices) {
      const { targetId, variantName } = next[index];
      next[index] = await createOne(
        { targetId, variantName },
        retained.upstreamSpaceId,
        retained.upstreamUnitWhere,
      );
      commitResults([...next]);
    }

    dispatch(confighubApi.util.invalidateTags(['Unit', 'Space']));

    finalize(next);
  }, [commitResults, createOne, dispatch, finalize]);

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setPhase('idle');
    setError(null);
    commitResults([]);
    retryRef.current = null;
  }, [commitResults]);

  return { submit, retryFailed, reset, phase, results, error };
}
