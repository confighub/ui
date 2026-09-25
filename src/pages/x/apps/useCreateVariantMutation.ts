// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  confighubApi,
  useBulkCreateSpacesMutation,
  useBulkCreateUnitsMutation,
  useInvokeFunctionsMutation,
  type BulkCreateSpacesApiResponse,
  type BulkCreateUnitsApiResponse,
} from '@confighub/rtk-query';
import { useAppDispatch } from '@/hooks/useApp';
import { getApiErrorMessage } from '@/utility/error-functions';
import { LABEL_VARIANT } from './componentData';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Per-space lifecycle. Unlike Phase 1's single flat `CreateVariantPhase`,
 * each requested name gets its OWN status — one space's Step 2 completeness
 * failure (or Step 3 namespace failure) must never gate the others (see the
 * module-level comment on Step 2 for why "one space's card" is the unit of
 * failure, not "the whole submit").
 */
export type PerSpacePhase =
  | 'cloning' // Step 1 (bulkCreateSpaces) in flight — shared across every requested name until it resolves.
  | 'cloningUnits' // Step 1 succeeded for this name; Step 2 (bulkCreateUnits, one call for every succeeded space) in flight.
  | 'namespacing' // Step 2 completeness check passed for this space; Step 3 (set-namespace) in flight for it.
  | 'success' // fully done — space + units cloned, namespace set or skipped.
  | 'nameCollision' // Step 1 rejected this name specifically (already exists) — see the client-side backstop note below.
  | 'cloneFailed' // Step 1 failed this name for a reason OTHER than a collision.
  | 'unitCloneFailed' // Step 2's per-space completeness check (§4 of the plan) found this space short of its expected unit count.
  | 'namespaceFailed'; // Step 3 failed for this space specifically — retryable via retryNamespace(name).

export type NamespaceOutcome = 'done' | 'skipped' | 'failed';

export interface CreateVariantError {
  title: string;
  detail: string;
}

/** One requested variant name's status, keyed by NAME (not SpaceID) in the
 *  map this hook returns — see the "why name, not SpaceID" note on
 *  `perSpaceStatus` below. `spaceId`/`slug` populate once Step 1 succeeds
 *  for this name. */
export interface PerSpaceStatus {
  name: string;
  spaceId?: string;
  slug?: string;
  phase: PerSpacePhase;
  error?: CreateVariantError;
  namespaceOutcome?: NamespaceOutcome;
}

/** Coarse aggregate over `perSpaceStatus`, for gating the composer form
 *  (locked while anything is in flight) and deciding whether to auto-close
 *  it (only on a clean `'success'` — see AppComponentView.tsx). Deliberately
 *  coarser than `PerSpacePhase`: the composer doesn't need to know WHICH
 *  step is running for the overall lock, only whether one is. */
export type OverallPhase = 'idle' | 'inFlight' | 'success' | 'partialFailure';

const IN_FLIGHT_PHASES: ReadonlySet<PerSpacePhase> = new Set(['cloning', 'cloningUnits', 'namespacing']);

/**
 * Annotation keys that are always managed internally and must never be
 * overridden by caller-supplied annotations.
 */
export const RESERVED_ANNOTATION_KEYS: string[] = ['UpstreamSpaceID', 'TargetID'];

/**
 * Label keys that are always managed internally and must never be overridden
 * by caller-supplied labels. `Variant` is set via the `variantLabels` query
 * param; supplying it in the body would create a collision.
 */
export const RESERVED_LABEL_KEYS: string[] = [LABEL_VARIANT];

export interface CreateVariantsInput {
  upstreamSpaceId: string;
  /** RTK where-clause scoping the upstream units, e.g. "SpaceID = '<id>'" */
  upstreamUnitWhere: string;
  /** One or more variant names, already validated/de-duped client-side
   *  (variantValidation.ts) — this hook does not re-validate them. */
  variantNames: string[];
  targetId?: string;
  namespace?: string;
  hasK8sUnits: boolean;
  /**
   * Count of source units matched by `upstreamUnitWhere` at submit time —
   * the expected per-destination-space unit count Step 2's completeness
   * check (see the comment on `runCloneUnits` below) compares each space's
   * success count against. All destination spaces clone from the SAME
   * upstream space, so this is one number, not per-space.
   */
  expectedUnitCount: number;
  /**
   * Optional user-supplied space annotations (e.g. `{ host: 'myhost' }`).
   * Reserved keys (`UpstreamSpaceID`, `TargetID`) are silently stripped before
   * they are merged into the Step 1 body so callers cannot override internals.
   */
  annotations?: Record<string, string>;
  /**
   * Optional user-supplied space labels (e.g. `{ env: 'prod' }`).
   * The reserved key `Variant` is silently stripped — it is set via the
   * `variantLabels` query param and must not be duplicated in the body.
   */
  labels?: Record<string, string>;
}

export interface UseCreateVariantMutationResult {
  submit: (input: CreateVariantsInput) => void;
  /** Retries ONLY the namespace step for one space, by the name it was requested under. */
  retryNamespace: (name: string) => void;
  reset: () => void;
  overallPhase: OverallPhase;
  /**
   * Keyed by the REQUESTED NAME, not `SpaceID` — a deliberate deviation from
   * the plan's literal "Map<spaceId, ...>" shorthand. `SpaceID` doesn't
   * exist until Step 1 resolves for that name, but the composer already
   * knows every requested name at submit time and needs a stable key to
   * render per-row status against from the very first render (phase
   * 'cloning', before any space exists). Keying by name is strictly more
   * available than keying by an id that doesn't exist yet, and it's the
   * identifier the UI already displays. `spaceId`/`slug` are populated on
   * each entry once known.
   */
  perSpaceStatus: Map<string, PerSpaceStatus>;
}

// ============================================================================
// HELPERS
// ============================================================================

/** True when the message suggests a duplicate-name / already-exists collision. */
function isAlreadyExistsMessage(msg: string): boolean {
  return msg.toLowerCase().includes('already exists');
}

/**
 * Inspect a BulkCreateSpaces / BulkCreateUnits 207 response array for
 * item-level Error fields. RTK `.unwrap()` resolves 207 as success —
 * callers must call this after unwrap to detect partial or full item-level
 * failures.
 *
 * Returns every item-level error message found (not just the first), since
 * Step 1 can carry independent failures for several requested names at once.
 */
export function extractItemLevelErrors(
  response: BulkCreateSpacesApiResponse | BulkCreateUnitsApiResponse,
): string[] {
  if (!Array.isArray(response)) return [];
  const messages: string[] = [];
  for (const item of response) {
    if (item.Error?.Message) messages.push(item.Error.Message);
  }
  return messages;
}

function deriveOverallPhase(statuses: PerSpaceStatus[]): OverallPhase {
  if (statuses.length === 0) return 'idle';
  if (statuses.some((s) => IN_FLIGHT_PHASES.has(s.phase))) return 'inFlight';
  if (statuses.every((s) => s.phase === 'success')) return 'success';
  return 'partialFailure';
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Orchestrates the N-at-once variant-create sequence:
 *   Step 1: ONE bulkCreateSpaces call, `variantLabels: Variant=name1|name2|...`
 *   Step 2: ONE bulkCreateUnits call, `whereSpace: Slug IN ('slug1','slug2',...)`
 *           using the REAL slugs Step 1 returned (never predicted/templated
 *           client-side — see CONTEXT.md's "slug is a cosmetic preview"
 *           caveat, which does not apply here: this reads the server's own
 *           assigned value after the fact).
 *   Step 3: Promise.allSettled over runSetNamespace(spaceId, namespace),
 *           once per space that needs it — independently retryable.
 *
 * ── Step 1 attribution (a gap the plan didn't call out, but the SAME bug
 * shape as its own §4 finding, one step earlier) ──
 * A failed Step-1 item's response carries `Space` set to the UPSTREAM space
 * (internal/models/space.go's `SpaceErrorToSpaceCreateOrUpdateResponse` is
 * called with `sourceEntity`, the pre-loop original — see
 * internal/views/bulk_handlers.go:664,927 — never the per-iteration
 * `patchedEntity` that actually carries the requested name's computed
 * slug/labels). So a failed item CANNOT be attributed to a specific
 * requested name by reading its `Space`/`Labels` — every failed item looks
 * identical on that axis regardless of which name it was for. This mirrors
 * §4's Step-2 finding exactly, and the fix is the same principle: derive
 * per-name success from the SUCCESSFUL items (which DO carry the correct
 * `Labels.Variant`, since `toResponse` uses `patchedEntity` on the success
 * path), and treat every requested name absent from that successful set as
 * failed — never by trying to read which failed item belongs to which name.
 *
 * ── Step 2 completeness (§4 of the plan, the documented finding) ──
 * Same shape, worse stakes (silently wrong per-space attribution on
 * PARTIAL failure, not just "we don't know which of several equally-failed
 * names failed"). See `runCloneUnits` below for the fix in code.
 */
export function useCreateVariantMutation(): UseCreateVariantMutationResult {
  const [bulkCreateSpaces] = useBulkCreateSpacesMutation();
  const [bulkCreateUnits] = useBulkCreateUnitsMutation();
  const [invokeFunctions] = useInvokeFunctionsMutation();
  const dispatch = useAppDispatch();

  // ── State ─────────────────────────────────────────────────────────────────
  const [perSpaceStatus, setPerSpaceStatus] = useState<Map<string, PerSpaceStatus>>(() => new Map());

  const overallPhase = useMemo(() => deriveOverallPhase(Array.from(perSpaceStatus.values())), [perSpaceStatus]);

  /** Retained for retryNamespace(name) — holds the namespace step args after a successful clone, per space. */
  const namespaceRetryRef = useRef<Map<string, { spaceId: string; namespace: string }>>(new Map());

  const patchStatus = useCallback((name: string, patch: Partial<PerSpaceStatus>) => {
    setPerSpaceStatus((prev) => {
      const existing = prev.get(name);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(name, { ...existing, ...patch });
      return next;
    });
  }, []);

  // ── Step 3: set-namespace ─────────────────────────────────────────────────
  const runSetNamespace = useCallback(
    async (spaceId: string, namespace: string): Promise<'done' | 'failed'> => {
      try {
        await invokeFunctions({
          spaceId,
          where: `SpaceID='${spaceId}'`,
          functionInvocationsRequest: {
            FunctionInvocations: [
              {
                FunctionName: 'set-namespace',
                Arguments: [{ ParameterName: 'namespace-name', Value: namespace }],
              },
            ],
          },
        }).unwrap();
        return 'done';
      } catch {
        return 'failed';
      }
    },
    [invokeFunctions],
  );

  const runNamespaceForSpace = useCallback(
    async (name: string, spaceId: string, namespace: string) => {
      namespaceRetryRef.current.set(name, { spaceId, namespace });
      patchStatus(name, { phase: 'namespacing' });
      const result = await runSetNamespace(spaceId, namespace);
      if (result === 'done') {
        patchStatus(name, { phase: 'success', namespaceOutcome: 'done' });
      } else {
        patchStatus(name, {
          phase: 'namespaceFailed',
          namespaceOutcome: 'failed',
          error: {
            title: 'Namespace step failed',
            detail: 'Could not set namespace on the new variant. You can retry or set it manually.',
          },
        });
      }
    },
    [patchStatus, runSetNamespace],
  );

  // ── submit ────────────────────────────────────────────────────────────────
  const submit = useCallback(
    async (input: CreateVariantsInput) => {
      const {
        upstreamSpaceId,
        upstreamUnitWhere,
        variantNames,
        targetId,
        namespace,
        hasK8sUnits,
        expectedUnitCount,
        annotations,
        labels,
      } = input;

      if (variantNames.length === 0) return;

      namespaceRetryRef.current = new Map();
      setPerSpaceStatus(new Map(variantNames.map((name) => [name, { name, phase: 'cloning' as const }])));

      // Pre-compute filtered labels before Step 1 (strip reserved keys)
      const filteredLabels = labels
        ? Object.fromEntries(Object.entries(labels).filter(([k]) => !RESERVED_LABEL_KEYS.includes(k)))
        : {};

      // ── Step 1: clone spaces (one call for every requested name) ─────────
      let spaceResponse: BulkCreateSpacesApiResponse;
      try {
        spaceResponse = await bulkCreateSpaces({
          where: `SpaceID='${upstreamSpaceId}'`,
          variantLabels: `${LABEL_VARIANT}=${variantNames.join('|')}`,
          body: {
            Annotations: {
              ...(annotations
                ? Object.fromEntries(
                    Object.entries(annotations).filter(([k]) => !RESERVED_ANNOTATION_KEYS.includes(k)),
                  )
                : {}),
              UpstreamSpaceID: upstreamSpaceId,
              ...(targetId ? { TargetID: targetId } : {}),
            },
            ...(Object.keys(filteredLabels).length > 0 ? { Labels: filteredLabels } : {}),
          },
        }).unwrap();
      } catch (err) {
        // Total failure (network, or the backend collapsed an all-failed,
        // all-same-error batch into a single ResponseError — see
        // bulk_handlers.go:973-975). Every requested name shares this one
        // failure; there is no per-name response to read at all here.
        const detail = getApiErrorMessage(err);
        const collision = isAlreadyExistsMessage(detail);
        setPerSpaceStatus(
          new Map(
            variantNames.map((name) => [
              name,
              {
                name,
                phase: collision ? ('nameCollision' as const) : ('cloneFailed' as const),
                error: { title: 'Failed to create variant', detail },
              },
            ]),
          ),
        );
        return;
      }

      // ── Attribute Step 1 results BY NAME, from successes only ────────────
      // A failed item's `Space` field is the UPSTREAM space (see this
      // function's docstring) — never trustworthy for "which name failed."
      // Successful items DO carry the correct `Labels.Variant`, since the
      // success path's toResponse uses the per-iteration patchedEntity, not
      // the shared sourceEntity. So: read who succeeded from the successes,
      // and treat every requested name absent from that set as failed —
      // never by trying to read a failed item's identity directly.
      const succeededByName = new Map<string, { spaceId: string; slug: string }>();
      if (Array.isArray(spaceResponse)) {
        for (const item of spaceResponse) {
          const spaceId = item.Space?.SpaceID;
          const slug = item.Space?.Slug;
          const variantName = item.Space?.Labels?.[LABEL_VARIANT];
          if (spaceId && slug && variantName) succeededByName.set(variantName, { spaceId, slug });
        }
      }

      const failedNames = variantNames.filter((name) => !succeededByName.has(name));
      if (failedNames.length > 0) {
        // Best-effort shared reason: if every failed item reports the SAME
        // message, it's safe to show that message for every failed name
        // (they really do share the reason). If messages differ, we cannot
        // attribute a specific one to a specific name — say so rather than
        // fabricating an attribution the response doesn't support.
        const itemErrors = extractItemLevelErrors(spaceResponse);
        const distinctMessages = new Set(itemErrors);
        const sharedMessage =
          distinctMessages.size === 1
            ? [...distinctMessages][0]
            : itemErrors.length > 0
              ? 'Failed to create variant (reason varies per name — see the space list for details).'
              : 'Failed to create variant';
        const collision = distinctMessages.size === 1 && isAlreadyExistsMessage(sharedMessage);
        setPerSpaceStatus((prev) => {
          const next = new Map(prev);
          for (const name of failedNames) {
            next.set(name, {
              name,
              phase: collision ? 'nameCollision' : 'cloneFailed',
              error: { title: 'Failed to create variant', detail: sharedMessage },
            });
          }
          return next;
        });
      }

      if (succeededByName.size === 0) return; // nothing to clone units into

      setPerSpaceStatus((prev) => {
        const next = new Map(prev);
        for (const [name, { spaceId, slug }] of succeededByName) {
          const existing = next.get(name);
          if (existing) next.set(name, { ...existing, spaceId, slug, phase: 'cloningUnits' });
        }
        return next;
      });
      dispatch(confighubApi.util.invalidateTags(['Unit', 'Space']));

      // ── Step 2: clone units into every succeeded space in ONE call ───────
      const succeededSlugs = [...succeededByName.values()].map((s) => s.slug);
      let unitResponse: BulkCreateUnitsApiResponse;
      try {
        unitResponse = await bulkCreateUnits({
          where: upstreamUnitWhere,
          // Slug IN (...), never SpaceID IN (...): SpaceID is a UUID column
          // and the filter grammar hard-rejects any UUID operator but =/!=/
          // IS [NOT] NULL (internal/views/filter_parser.go:839) — Slug is a
          // String column, and String explicitly supports IN.
          whereSpace: `Slug IN (${succeededSlugs.map((s) => `'${s}'`).join(',')})`,
          body: {
            ...(targetId ? { TargetID: targetId } : {}),
          },
        }).unwrap();
      } catch (err) {
        // Total Step-2 failure: every succeeded space is unit-clone-failed.
        const detail = getApiErrorMessage(err);
        setPerSpaceStatus((prev) => {
          const next = new Map(prev);
          for (const [name] of succeededByName) {
            const existing = next.get(name);
            if (existing) {
              next.set(name, {
                ...existing,
                phase: 'unitCloneFailed',
                error: { title: 'Failed to clone units', detail },
              });
            }
          }
          return next;
        });
        return;
      }

      // ── Per-space Step-2 completeness — from SUCCESSES, never failures ───
      // §4 of the plan, verbatim mechanism: every failure item's Unit.SpaceID
      // is the UPSTREAM space (internal/views/bulk_handlers.go's nine
      // toErrorResponse(sourceEntity, err) call sites), identical across
      // every failure regardless of destination — reading it would attribute
      // every partial failure to the wrong space, or all of them, or none.
      // Successful items DO carry the real destination SpaceID (the success
      // path's toResponse uses the destination-stamped patchedEntity). So:
      // count successes per destination SpaceID and compare against
      // `expectedUnitCount` — never inspect which unit failed or why.
      const successCountBySpaceId = new Map<string, number>();
      if (Array.isArray(unitResponse)) {
        for (const item of unitResponse) {
          const spaceId = item.Unit?.SpaceID;
          if (!spaceId || item.Error) continue; // only count genuine successes
          successCountBySpaceId.set(spaceId, (successCountBySpaceId.get(spaceId) ?? 0) + 1);
        }
      }
      const namespaceWork: Array<{ name: string; spaceId: string }> = [];
      setPerSpaceStatus((prev) => {
        const next = new Map(prev);
        for (const [name, { spaceId }] of succeededByName) {
          const existing = next.get(name);
          if (!existing || existing.phase !== 'cloningUnits') continue;
          const successCount = successCountBySpaceId.get(spaceId) ?? 0;
          if (successCount < expectedUnitCount) {
            next.set(name, {
              ...existing,
              phase: 'unitCloneFailed',
              error: {
                title: 'Failed to clone units',
                detail: `Cloned ${successCount} of ${expectedUnitCount} units into this variant. See the space for details.`,
              },
            });
          } else {
            const shouldSetNamespace = !!(namespace && hasK8sUnits);
            if (shouldSetNamespace) {
              namespaceWork.push({ name, spaceId });
              // Left in 'cloningUnits' here; runNamespaceForSpace (below,
              // outside this updater) flips it to 'namespacing'.
            } else {
              next.set(name, { ...existing, phase: 'success', namespaceOutcome: 'skipped' });
            }
          }
        }
        return next;
      });

      // ── Step 3: set-namespace, independently per space that needs it ─────
      if (namespaceWork.length > 0) {
        await Promise.allSettled(namespaceWork.map(({ name, spaceId }) => runNamespaceForSpace(name, spaceId, namespace!)));
      }
    },
    [bulkCreateSpaces, bulkCreateUnits, dispatch, runNamespaceForSpace],
  );

  // ── retryNamespace ────────────────────────────────────────────────────────
  const retryNamespace = useCallback(
    (name: string) => {
      const retryArgs = namespaceRetryRef.current.get(name);
      if (!retryArgs) return;
      void runNamespaceForSpace(name, retryArgs.spaceId, retryArgs.namespace);
    },
    [runNamespaceForSpace],
  );

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setPerSpaceStatus(new Map());
    namespaceRetryRef.current = new Map();
  }, []);

  return {
    submit,
    retryNamespace,
    reset,
    overallPhase,
    perSpaceStatus,
  };
}
