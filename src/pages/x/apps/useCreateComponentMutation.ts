// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useRef, useState } from 'react';

import {
  confighubApi,
  useCreateComponentMutation as useCreateComponentEntityMutation,
  useCreateSpaceMutation,
  useCreateUnitMutation,
  useUploadMutation,
} from '@confighub/rtk-query';
import { useAppDispatch } from '@/hooks/useApp';
import { describeQueryError, getApiErrorMessage } from '@/utility/error-functions';
import { slugify } from '@/components/query-builder/ViewTabs';

import { LABEL_OWNER, LABEL_VARIANT } from './componentData';
import { type PlannableDoc, buildUnitPlan } from './createComponentInput';
import {
  type OciSourceForm,
  BASE_VARIANT,
  buildOciUploadRequest,
  ociSpaceSlug,
  resolveSpaceSlug,
  uploadItemErrors,
  uploadSkippedSecrets,
  uploadSpace,
  uploadUnits,
} from './ociUpload';
import { useUploadUnitData } from '@/hooks/useUnitData';

// ============================================================================
// TYPES
// ============================================================================

export type CreateComponentPhase =
  | 'idle'
  | 'creatingSpace'
  | 'creatingUnits'
  | 'success'
  | 'spaceError'
  // Total step-2 failure: the client-side plan produced zero Units (empty or
  // all-Secret source), or every createUnit call failed. The base Space
  // exists but zero Units were authored, so the user can retry step 2 alone.
  | 'unitsError'
  // Some createUnit calls succeeded, some failed.
  | 'partialFailure';

export type CreateComponentSource =
  | { kind: 'inline'; documents: PlannableDoc[] }
  // The server pulls the bundle (a browser can't: registries send no CORS
  // headers) and creates the base Space and its Units in one /upload call.
  // `digest` is the manifest the preview pulled, so what was reviewed is what
  // is created even if the tag moves.
  | { kind: 'oci'; form: OciSourceForm; digest?: string };

export interface CreateComponentInput {
  componentName: string;
  owner: string;
  source: CreateComponentSource;
  granularity: 'minimal' | 'per-resource' | 'per-file';
  namespace?: string;
  /** Space labels. */
  labels?: Record<string, string>;
  /**
   * Labels and annotations for every Unit the create writes. An OCI upload has
   * the server set them; the inline path does not carry them yet.
   */
  unitLabels?: Record<string, string>;
  unitAnnotations?: Record<string, string>;
  /** Recorded on each Unit write, by both sources. */
  changeDescription?: string;
  /**
   * An explicit Space slug. The `<component>-base` default applies when empty.
   * An OCI source carries the same value on its form, which is what the upload
   * request is built from.
   */
  spaceSlugOverride?: string;
}

export interface CreateComponentError {
  title: string;
  detail: string;
  /**
   * One suggested action, set only where the failure has a cause the user can
   * act on — a bundle the server could not pull, for one. The `detail` below
   * it stays the server's own words.
   */
  suggestion?: string;
}

export interface CreatedUnitInfo {
  slug: string;
  kind: string;
}

export interface CreateComponentItemError {
  slug: string;
  message: string;
}

/** Identity of the newly-created base Space, returned by `submit` ONLY on a
 * clean success — never on `spaceError`, `unitsError`, or `partialFailure`. A
 * caller (the wizard's downstream-variant chaining) uses this to know both
 * THAT it's safe to clone from and WHAT to clone. */
export interface CreateComponentOutcome {
  spaceId: string;
  spaceSlug: string;
}

export interface UseCreateComponentMutationResult {
  /**
   * Returns the created Space's identity on a clean success, or `null` on
   * `spaceError`, `unitsError`, **or `partialFailure`**. Callers that chain
   * further work off a successful create (e.g. cloning downstream variants)
   * must treat `null` as "do not proceed" — in particular, a `partialFailure`
   * deliberately yields `null` so a half-authored base is never cloned into N
   * targets, which would only multiply the mess.
   */
  submit: (input: CreateComponentInput) => Promise<CreateComponentOutcome | null>;
  /**
   * Re-run ONLY step 2 (author Units) against the already-created Space, using a
   * FRESHLY-built input (the user may have edited the source or granularity after
   * the failure). Never re-creates the Space.
   */
  retryUnits: (input: CreateComponentInput) => Promise<void>;
  reset: () => void;
  /** Clear a surfaced space-level error/collision (e.g. after the user edits the name). */
  clearSpaceError: () => void;
  phase: CreateComponentPhase;
  createdSpaceId: string | null;
  createdSpaceSlug: string | null;
  /** The Component label the create wrote. An OCI upload writes the slugified name. */
  createdComponentName: string | null;
  createdUnits: CreatedUnitInfo[];
  /** Resource identifiers of Secrets the server dropped (never authored as Units). */
  skippedSecrets: string[];
  itemErrors: CreateComponentItemError[];
  error: CreateComponentError | null;
  isNameCollision: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/** True when the message suggests a duplicate-name / already-exists collision. */
function isAlreadyExistsMessage(msg: string): boolean {
  return msg.toLowerCase().includes('already exists');
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Orchestrates the component-create sequence:
 *   Step 1: createSpace — a new, un-targeted base Space labeled `Component`/`Owner`
 *           (plus any caller-supplied extra labels), slug `<slugified-name>-base`.
 *   Step 2: plan the source's documents into Units client-side (buildUnitPlan)
 *           and create each with the generic, pre-existing createUnit mutation —
 *           one call per Unit, so a single failure doesn't abort the batch.
 *
 * For an inline source, step 2 is client-side: buildUnitPlan offers the
 * per-resource and (a simplified, non-dependency-ordered) minimal/per-file
 * granularities. An OCI source skips both steps: one /upload call has the
 * server pull the bundle and create the Space and one Unit per resource.
 *
 * Failure surfaces:
 *   - `spaceError`: step 1 failed (nothing was created). `isNameCollision` flags a
 *     duplicate-slug 409 so the pane can route the user back to the name step.
 *   - `unitsError`: step 2 authored zero Units (empty/all-Secret source, or every
 *     createUnit call failed). The base Space exists. The pane offers a
 *     `retryUnits()` that re-runs ONLY step 2 — it must NOT re-create the Space,
 *     or it would collide on the slug and orphan the first one.
 *   - `partialFailure`: some createUnit calls succeeded, some failed.
 *
 * Mirrors `useCreateVariantMutation.ts`.
 */
export function useCreateComponentMutation(): UseCreateComponentMutationResult {
  const [createComponent] = useCreateComponentEntityMutation();
  const [createSpace] = useCreateSpaceMutation();
  const [createUnit] = useCreateUnitMutation();
  const [uploadUnitData] = useUploadUnitData();
  const [upload] = useUploadMutation();
  const dispatch = useAppDispatch();

  // ── State ─────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<CreateComponentPhase>('idle');
  const [createdSpaceId, setCreatedSpaceId] = useState<string | null>(null);
  const [createdSpaceSlug, setCreatedSpaceSlug] = useState<string | null>(null);
  const [createdComponentName, setCreatedComponentName] = useState<string | null>(null);
  const [createdUnits, setCreatedUnits] = useState<CreatedUnitInfo[]>([]);
  const [skippedSecrets, setSkippedSecrets] = useState<string[]>([]);
  const [itemErrors, setItemErrors] = useState<CreateComponentItemError[]>([]);
  const [error, setError] = useState<CreateComponentError | null>(null);
  const [isNameCollision, setIsNameCollision] = useState(false);

  // Retained so retryUnits() can re-drive step 2 against the existing Space
  // without re-creating it. The retry INPUT is re-derived from live pane state at
  // click time (passed in), not cached here — the user may have fixed the source.
  const spaceIdRef = useRef<string | null>(null);
  // Retained alongside spaceIdRef so authorUnits can build a CreateComponentOutcome
  // on success without depending on the (possibly stale, closed-over) `createdSpaceSlug`
  // state value.
  const spaceSlugRef = useRef<string | null>(null);

  // ── Step 2: author Units from the given source ──────────────────────────────
  // Returns the outcome ONLY on a clean success; `null` on unitsError or
  // partialFailure (see CreateComponentOutcome's doc comment for why a partial
  // failure must not be treated as a green light by callers).
  const authorUnits = useCallback(
    async (spaceId: string, input: CreateComponentInput): Promise<CreateComponentOutcome | null> => {
      const { source, granularity, changeDescription } = input;
      const spaceSlug = spaceSlugRef.current ?? spaceId;

      setPhase('creatingUnits');
      setItemErrors([]);
      setError(null);
      setSkippedSecrets([]);
      setCreatedUnits([]);

      if (source.kind === 'oci') {
        // An OCI upload creates the Space and its Units together, so there is no
        // step 2 to run on its own.
        setError({ title: 'Failed to author units', detail: 'An OCI upload cannot be retried per unit; upload again.' });
        setPhase('unitsError');
        return null;
      }

      const plan = buildUnitPlan(source.documents, granularity, spaceSlug);
      setSkippedSecrets(plan.skippedSecrets);

      if (plan.units.length === 0) {
        const detail =
          plan.skippedSecrets.length > 0
            ? `source produced no authorable Units; ${plan.skippedSecrets.length} Secret resource(s) were skipped`
            : 'source produced no authorable Units';
        setError({ title: 'Failed to author units', detail });
        setPhase('unitsError');
        return null;
      }

      // One createUnit call per planned Unit, in its own try/catch, so a
      // single failure (e.g. a slug collision) doesn't abort the rest — the
      // same partial-failure shape the old server endpoint had, just driven
      // from the client instead of one request.
      const created: CreatedUnitInfo[] = [];
      const errors: CreateComponentItemError[] = [];
      for (const unit of plan.units) {
        try {
          const response = await createUnit({
            spaceId,
            unit: {
              Slug: unit.slug,
              DisplayName: unit.slug,
              ToolchainType: 'Kubernetes/YAML',
              ...(changeDescription ? { LastChangeDescription: changeDescription } : {}),
            },
          }).unwrap();
          const createdUnit = response.Unit;
          if (unit.content && createdUnit?.UnitID) {
            await uploadUnitData({
              spaceId,
              unitId: createdUnit.UnitID,
              body: unit.content,
              ...(changeDescription ? { lastChangeDescription: changeDescription } : {}),
            }).unwrap();
          }
          created.push({ slug: createdUnit?.Slug ?? unit.slug, kind: unit.kind });
        } catch (err) {
          errors.push({ slug: unit.slug, message: getApiErrorMessage(err) });
        }
      }

      setCreatedUnits(created);
      setItemErrors(errors);
      // Space, and any successfully authored Units, exist regardless of the
      // outcome below — refresh callers.
      dispatch(confighubApi.util.invalidateTags(['Unit', 'Space']));

      if (errors.length > 0 && created.length > 0) {
        setPhase('partialFailure');
        // Deliberately null: do not let a caller chain further work (e.g.
        // downstream-variant cloning) off a half-authored base.
        return null;
      }
      if (errors.length > 0) {
        setError({ title: 'Failed to author units', detail: errors[0].message });
        setPhase('unitsError');
        return null;
      }

      setPhase('success');
      return { spaceId, spaceSlug };
    },
    [createUnit, uploadUnitData, dispatch],
  );

  // ── OCI: one server-side pull and upload ────────────────────────────────────
  // Nothing is written when the call fails outright (4xx), so that is a
  // spaceError. A 207 means the Space exists and some Unit or Link writes failed.
  const submitOci = useCallback(
    async (input: CreateComponentInput, form: OciSourceForm, digest?: string): Promise<CreateComponentOutcome | null> => {
      const componentSlug = slugify(input.componentName);
      const baseSlug = `${componentSlug}-base`;
      // What the request asks for, so the fallbacks below name the Space the
      // server was told to write, not the default it was told to replace.
      const spaceSlug = ociSpaceSlug(form, baseSlug);
      setPhase('creatingUnits');
      let result;
      try {
        result = await upload({
          uploadRequest: buildOciUploadRequest({
            form,
            componentSlug,
            baseSlug,
            owner: input.owner,
            labels: input.labels,
            unitLabels: input.unitLabels,
            unitAnnotations: input.unitAnnotations,
            changeDescription: input.changeDescription,
            digest,
          }),
        }).unwrap();
      } catch (err) {
        // A failed pull is the registry's fault, not the request's, so it gets
        // the same classified headline and suggestion the preview shows.
        const described = describeQueryError(err, 'the bundle');
        setError({ title: described.headline, detail: described.detail ?? '', suggestion: described.suggestion });
        setPhase('spaceError');
        return null;
      }

      const space = uploadSpace(result);
      const errors = uploadItemErrors(result);
      const created = uploadUnits(result)
        .filter((u) => !u.Error && u.Slug)
        .map((u) => ({ slug: u.Slug as string, kind: 'normal' }));
      spaceIdRef.current = space?.SpaceID ?? null;
      spaceSlugRef.current = space?.SpaceSlug ?? spaceSlug;
      setCreatedSpaceId(space?.SpaceID ?? null);
      setCreatedSpaceSlug(space?.SpaceSlug ?? spaceSlug);
      setCreatedComponentName(componentSlug);
      setCreatedUnits(created);
      setSkippedSecrets(uploadSkippedSecrets(result));
      setItemErrors(errors);
      dispatch(confighubApi.util.invalidateTags(['Unit', 'Space']));

      if (errors.length > 0 || !space?.SpaceID) {
        setPhase('partialFailure');
        return null;
      }
      setPhase('success');
      return { spaceId: space.SpaceID, spaceSlug: space.SpaceSlug ?? spaceSlug };
    },
    [upload, dispatch],
  );

  // ── submit ────────────────────────────────────────────────────────────────
  const submit = useCallback(
    async (input: CreateComponentInput): Promise<CreateComponentOutcome | null> => {
      const { componentName, owner, labels } = input;

      setPhase('creatingSpace');
      setCreatedSpaceId(null);
      setCreatedSpaceSlug(null);
      setCreatedUnits([]);
      setSkippedSecrets([]);
      setItemErrors([]);
      setError(null);
      setIsNameCollision(false);
      setCreatedComponentName(null);

      if (input.source.kind === 'oci') {
        return submitOci(input, input.source.form, input.source.digest);
      }

      const spaceSlug = resolveSpaceSlug(input.spaceSlugOverride, `${slugify(componentName)}-base`);

      // ── Step 1: create the base Space (no Target) in its Component ────────
      let spaceId: string;
      try {
        // The Component with this slug, created unless it already exists, as
        // an upload does for the OCI path.
        const componentSlug = slugify(componentName);
        const component = await createComponent({
          component: { Slug: componentSlug, DisplayName: componentName },
          allowExists: 'true',
        }).unwrap();

        const spaceResponse = await createSpace({
          space: {
            Slug: spaceSlug,
            ComponentID: component.ComponentID,
            Labels: {
              // Spread caller labels first so the reserved keys below always win
              ...(labels ?? {}),
              // Owner is optional, and the server refuses an empty label value, so a
              // component with no owner carries no Owner label, as an upload's does.
              ...(owner ? { [LABEL_OWNER]: owner } : {}),
              // The Component view names the card from this label, and the
              // server matches a dependency to the same variant of another
              // component by it. An upload and `cub` both write it, so the
              // inline path writes it too or its cards get a different title.
              [LABEL_VARIANT]: BASE_VARIANT,
            },
          },
        }).unwrap();

        if (!spaceResponse.SpaceID) {
          setError({ title: 'Failed to create component', detail: 'No space ID returned from create' });
          setPhase('spaceError');
          return null;
        }
        spaceId = spaceResponse.SpaceID;
        spaceIdRef.current = spaceId;
        spaceSlugRef.current = spaceResponse.Slug ?? spaceSlug;
        setCreatedComponentName(component.Slug);
        setCreatedSpaceId(spaceId);
        setCreatedSpaceSlug(spaceResponse.Slug ?? spaceSlug);
      } catch (err) {
        const detail = getApiErrorMessage(err);
        const collision = isAlreadyExistsMessage(detail);
        setIsNameCollision(collision);
        setError({ title: 'Failed to create component', detail });
        setPhase('spaceError');
        return null;
      }

      // ── Step 2: author the Space's Units from the given source ────────────
      return authorUnits(spaceId, input);
    },
    [createComponent, createSpace, authorUnits, submitOci],
  );

  // ── retryUnits ──────────────────────────────────────────────────────────────
  // Re-run ONLY step 2 against the already-created Space, with a freshly-built
  // input (the caller re-derives it from current pane state). Never re-creates
  // the Space (that would collide on the slug and orphan the first one).
  // `authorUnits`' return value is intentionally discarded — callers only need
  // to know it ran, not its outcome.
  const retryUnits = useCallback(
    async (input: CreateComponentInput) => {
      const spaceId = spaceIdRef.current;
      if (!spaceId) return;
      await authorUnits(spaceId, input);
    },
    [authorUnits],
  );

  // ── clearSpaceError ─────────────────────────────────────────────────────────
  // Drop a surfaced step-1 error/collision — called when the user edits the name
  // after a collision so a now-valid name doesn't keep showing the stale error.
  const clearSpaceError = useCallback(() => {
    setIsNameCollision(false);
    setError(null);
    setPhase((p) => (p === 'spaceError' ? 'idle' : p));
  }, []);

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setPhase('idle');
    setCreatedSpaceId(null);
    setCreatedSpaceSlug(null);
    setCreatedComponentName(null);
    setCreatedUnits([]);
    setSkippedSecrets([]);
    setItemErrors([]);
    setError(null);
    setIsNameCollision(false);
    spaceIdRef.current = null;
    spaceSlugRef.current = null;
  }, []);

  return {
    submit,
    retryUnits,
    reset,
    clearSpaceError,
    phase,
    createdSpaceId,
    createdSpaceSlug,
    createdComponentName,
    createdUnits,
    skippedSecrets,
    itemErrors,
    error,
    isNameCollision,
  };
}
