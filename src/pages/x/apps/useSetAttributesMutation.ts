// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

import { confighubApi, useInvokeFunctionsMutation } from '@confighub/rtk-query';
import { useUnitDataMap } from '@/hooks/useUnitData';
import { useAppDispatch } from '@/hooks/useApp';
import { getApiErrorMessage } from '@/utility/error-functions';
import type { ExtendedUnitRead } from '@confighub/rtk-query';

import {
  buildFieldPathMeta,
  deleteValueAtPath,
  findFieldValue,
  parseUnitDataStructured,
  setValueAtPath,
} from './configParser';
import type { FieldEntry, FieldPathMeta, ResourceInfo, SetValueResult } from './configParser';
import { isYamlToolchain } from './componentValues';

// ============================================================================
// TYPES
// ============================================================================

type AttributeValueType = 'int' | 'bool' | 'string';

export interface UseSetAttributesMutationArgs {
  allUnits: ExtendedUnitRead[];
  unitById: Map<string, ExtendedUnitRead>;
  /** Persist a computed field mutation by PATCHing the unit's Data. */
  applyFieldPatch: (unitId: string, spaceId: string, result: SetValueResult, errorTitle: string) => Promise<void>;
  /** Record a per-deployment error (title + detail). */
  recordFieldError: (spaceId: string, title: string, detail: string) => void;
}

export interface UseSetAttributesMutationResult {
  /** Optimistic per-unit, per-path value overlay: null = field deleted. */
  fieldOverlay: Map<string, Map<string, string | null>>;
  handleSetFieldValue: (
    unitId: string,
    spaceId: string,
    path: string,
    newValue: string,
    meta?: FieldPathMeta,
  ) => Promise<boolean>;
  handleDeleteFieldValue: (
    unitId: string,
    spaceId: string,
    path: string,
    meta?: FieldPathMeta,
  ) => Promise<void>;
}

interface OverlayMeta {
  expected: string | null;
  resource?: ResourceInfo;
  type: AttributeValueType;
}

interface CapturedField {
  previousValue: string | undefined;
  previousType: AttributeValueType;
  wasAbsent: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

// Re-exported from its leaf module so the values treeview can gate on it without
// importing this hook (and its RTK Query dependencies). See componentValues.ts.
export { isYamlToolchain };

/**
 * Determine the set-attributes DataType for a field.
 * Matches the original value's type when present; infers from newValue for new fields.
 */
function inferValueType(newValue: string, originalValue: unknown): AttributeValueType {
  if (typeof originalValue === 'number') return 'int';
  if (typeof originalValue === 'boolean') return 'bool';
  // Infer from the string representation for newly-created fields
  if (newValue === 'true' || newValue === 'false') return 'bool';
  if (newValue !== '' && !isNaN(Number(newValue)) && !newValue.includes('.')) return 'int';
  return 'string';
}

/** Convert a string value to the typed representation expected by set-attributes. */
function toTypedValue(value: string, type: AttributeValueType): unknown {
  if (type === 'int') return parseInt(value, 10);
  if (type === 'bool') return value === 'true';
  return value;
}

/**
 * True when the value returned by the server for a path reflects what we expected.
 * Handles null (expected deletion → after must be undefined) and typed comparison.
 */
function overlayValueReflected(
  after: string | undefined,
  expected: string | null,
  type: AttributeValueType,
): boolean {
  if (expected === null) return after === undefined;
  if (after === undefined) return false;
  if (type === 'int') {
    const a = parseInt(after, 10);
    const e = parseInt(expected, 10);
    if (!isNaN(a) && !isNaN(e)) return a === e;
  }
  return after === expected;
}

/**
 * Find the FieldEntry for a path in an entry list, optionally scoped to a resource.
 * Mirrors the resource-matching logic in configParser's matchesResource.
 */
function findEntry(
  entries: FieldEntry[],
  path: string,
  resource?: ResourceInfo,
): FieldEntry | undefined {
  for (const e of entries) {
    if (e.path !== path) continue;
    if (!resource) return e;
    const er = e.resource;
    if (!er) continue;
    if (resource.ResourceType !== undefined && er.ResourceType !== resource.ResourceType) continue;
    if (resource.ResourceName !== undefined && er.ResourceName !== resource.ResourceName) continue;
    return e;
  }
  return undefined;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Encapsulates set-attributes / delete-path function invocations for the
 * component sidebar, including an optimistic per-unit field overlay that
 * clears itself once the server confirms the change via RTK Query refetch.
 */
export function useSetAttributesMutation({
  allUnits,
  unitById,
  applyFieldPatch,
  recordFieldError,
}: UseSetAttributesMutationArgs): UseSetAttributesMutationResult {
  const [invokeFunctions] = useInvokeFunctionsMutation();
  const dispatch = useAppDispatch();

  // The configuration is not on the Unit. Every Unit this hook may edit is fetched in one
  // request, and dataFor stands in for what used to be unit.Unit.Data.
  const { dataFor } = useUnitDataMap([...unitById.keys()]);

  // ── State / refs ──────────────────────────────────────────────────────────
  const [fieldOverlay, setFieldOverlay] = useState<Map<string, Map<string, string | null>>>(() => new Map());
  /** Per-key overlay metadata used to detect when the server's data catches up. */
  const overlayMetaRef = useRef<Map<string, OverlayMeta>>(new Map());
  /** Pre-edit state captured on first edit of a path (for revert). */
  const capturedFieldsRef = useRef<Map<string, CapturedField>>(new Map());
  /** Tracks the last-seen unit Data so we only re-scan on actual changes. */
  const prevUnitDataRef = useRef<Map<string, string | undefined>>(new Map());

  // ── Upstream meta fallback ────────────────────────────────────────────────
  /**
   * When the downstream unit doesn't have a field (upstream-only path), look up
   * the resource identity from the upstream unit's data.
   */
  const synthesizeUpstreamMeta = useCallback(
    (unit: ExtendedUnitRead, path: string): FieldPathMeta | undefined => {
      const upstreamId = unit.Unit?.UpstreamUnitID;
      if (!upstreamId) return undefined;
      const upstreamUnit = unitById.get(upstreamId);
      if (!upstreamUnit) return undefined;
      return buildFieldPathMeta(dataFor(upstreamUnit.Unit?.UnitID)).get(path);
    },
    [unitById],
  );

  // ── Overlay helpers ───────────────────────────────────────────────────────
  const setOverlay = useCallback((unitId: string, path: string, value: string | null) => {
    setFieldOverlay((prev) => {
      const next = new Map(prev);
      const unitOverlay = new Map(next.get(unitId) ?? []);
      unitOverlay.set(path, value);
      next.set(unitId, unitOverlay);
      return next;
    });
  }, []);

  const clearOverlay = useCallback((unitId: string, path: string) => {
    overlayMetaRef.current.delete(`${unitId}::${path}`);
    setFieldOverlay((prev) => {
      const unitOverlay = prev.get(unitId);
      if (!unitOverlay?.has(path)) return prev;
      const next = new Map(prev);
      const nextUnit = new Map(unitOverlay);
      nextUnit.delete(path);
      if (nextUnit.size === 0) next.delete(unitId);
      else next.set(unitId, nextUnit);
      return next;
    });
  }, []);

  // ── Auto-clear overlay once RTK delivers updated unit data ────────────────
  useEffect(() => {
    for (const [unitId, unit] of unitById) {
      const newData = dataFor(unit.Unit?.UnitID);
      const prevData = prevUnitDataRef.current.get(unitId);
      if (newData === prevData) continue;
      prevUnitDataRef.current.set(unitId, newData);

      for (const [key, meta] of overlayMetaRef.current) {
        const prefix = `${unitId}::`;
        if (!key.startsWith(prefix)) continue;
        const path = key.slice(prefix.length);
        const after = findFieldValue(newData, path, meta.resource);
        if (overlayValueReflected(after, meta.expected, meta.type)) {
          overlayMetaRef.current.delete(key);
          setFieldOverlay((prev) => {
            const unitOverlay = prev.get(unitId);
            if (!unitOverlay?.has(path)) return prev;
            const next = new Map(prev);
            const nextUnit = new Map(unitOverlay);
            nextUnit.delete(path);
            if (nextUnit.size === 0) next.delete(unitId);
            else next.set(unitId, nextUnit);
            return next;
          });
        }
      }
    }
  }, [unitById]);

  // ── handleSetFieldValue ───────────────────────────────────────────────────
  const handleSetFieldValue = useCallback(
    async (
      unitId: string,
      spaceId: string,
      path: string,
      newValue: string,
      meta?: FieldPathMeta,
    ): Promise<boolean> => {
      const unit = allUnits.find((u) => u.Unit?.UnitID === unitId);
      if (!unit) return false;

      // Non-YAML: fall back to client-side YAML mutation
      if (!isYamlToolchain(unit.Unit?.ToolchainType)) {
        const result = setValueAtPath(dataFor(unit.Unit?.UnitID), path, newValue);
        await applyFieldPatch(unitId, spaceId, result, 'Field update failed');
        return result.ok;
      }


      // Resolve meta: explicit parameter → downstream data → upstream unit
      const effectiveMeta =
        meta ??
        buildFieldPathMeta(dataFor(unit.Unit?.UnitID)).get(path) ??
        synthesizeUpstreamMeta(unit, path);

      // Get original typed value to infer DataType
      const entries = parseUnitDataStructured(dataFor(unit.Unit?.UnitID));
      const existingEntry = findEntry(entries, path, effectiveMeta?.resource);
      const originalTypedValue = existingEntry?.value;
      const wasAbsent = existingEntry === undefined;
      const valueType = inferValueType(newValue, originalTypedValue);

      // Capture pre-edit state (only on first edit of this path)
      const captureKey = `${unitId}::${path}`;
      if (!capturedFieldsRef.current.has(captureKey)) {
        capturedFieldsRef.current.set(captureKey, {
          previousValue: wasAbsent ? undefined : String(originalTypedValue ?? ''),
          previousType: valueType,
          wasAbsent,
        });
      }

      // Optimistic overlay
      setOverlay(unitId, path, newValue);
      overlayMetaRef.current.set(captureKey, {
        expected: newValue,
        resource: effectiveMeta?.resource,
        type: valueType,
      });

      // Build set-attributes attribute-list
      const resource = effectiveMeta?.resource;
      const resourceType = resource?.ResourceType;
      const resourceName = resource?.ResourceName;

      const attrList: object[] = [
        {
          AttributeName: path,
          Path: path,
          DataType: valueType,
          Value: toTypedValue(newValue, valueType),
          ...(resourceType !== undefined ? { ResourceType: resourceType } : {}),
          ...(resourceName !== undefined
            ? { ResourceName: resourceName, ResourceNameWithoutScope: resource?.ResourceNameWithoutScope ?? '' }
            : {}),
        },
      ];

      try {
        await invokeFunctions({
          spaceId,
          where: `UnitID='${unitId}'`,
          functionInvocationsRequest: {
            FunctionInvocations: [
              {
                FunctionName: 'set-attributes',
                Arguments: [
                  { ParameterName: 'attribute-list', Value: JSON.stringify(attrList) },
                ],
              },
            ],
          },
        }).unwrap();

        dispatch(confighubApi.util.invalidateTags(['Unit']));

        return true;
      } catch (err: unknown) {
        clearOverlay(unitId, path);
        recordFieldError(spaceId, 'Field update failed', getApiErrorMessage(err));
        return false;
      }
    },
    [
      allUnits,
      synthesizeUpstreamMeta,
      invokeFunctions,
      dispatch,
      applyFieldPatch,
      recordFieldError,
      setOverlay,
      clearOverlay,
    ],
  );

  // ── handleDeleteFieldValue ────────────────────────────────────────────────
  const handleDeleteFieldValue = useCallback(
    async (
      unitId: string,
      spaceId: string,
      path: string,
      meta?: FieldPathMeta,
    ): Promise<void> => {
      const unit = allUnits.find((u) => u.Unit?.UnitID === unitId);
      if (!unit) return;

      // Non-YAML: fall back to client-side deletion
      if (!isYamlToolchain(unit.Unit?.ToolchainType)) {
        const result = deleteValueAtPath(dataFor(unit.Unit?.UnitID), path);
        await applyFieldPatch(unitId, spaceId, result, 'Field revert failed');
        return;
      }

      const captureKey = `${unitId}::${path}`;
      const captured = capturedFieldsRef.current.get(captureKey);
      const wasAbsent = captured?.wasAbsent ?? false;

      if (wasAbsent) {
        // Revert of a newly-added field: delete via server-side delete-path.
        // Fall back to upstream meta since the path may be upstream-only and
        // absent from the downstream unit's data (and fieldPathMeta).
        const effectiveMeta =
          meta ??
          buildFieldPathMeta(dataFor(unit.Unit?.UnitID)).get(path) ??
          synthesizeUpstreamMeta(unit, path);
        const resource = effectiveMeta?.resource;
        const resourceType = resource?.ResourceType;

        setOverlay(unitId, path, null);
        overlayMetaRef.current.set(captureKey, { expected: null, resource, type: 'string' });

        try {
          await invokeFunctions({
            spaceId,
            where: `UnitID='${unitId}'`,
            functionInvocationsRequest: {
              FunctionInvocations: [
                {
                  FunctionName: 'delete-path',
                  Arguments: [
                    ...(resourceType
                      ? [{ ParameterName: 'resource-type', Value: resourceType }]
                      : []),
                    { ParameterName: 'path', Value: path },
                  ],
                },
              ],
            },
          }).unwrap();
          dispatch(confighubApi.util.invalidateTags(['Unit']));
        } catch (err: unknown) {
          clearOverlay(unitId, path);
          recordFieldError(spaceId, 'Field revert failed', getApiErrorMessage(err));
        }
      } else {
        // Revert of an existing field: restore previous value via set-attributes
        const previousValue = captured?.previousValue;
        if (previousValue !== undefined) {
          await handleSetFieldValue(unitId, spaceId, path, previousValue, meta);
        } else {
          // No captured state (e.g. accepting a delete upgrade directly) — fall back to delete-path.
          // Resolve resource identity from meta, downstream data, or upstream unit.
          const fallbackMeta =
            meta ??
            buildFieldPathMeta(dataFor(unit.Unit?.UnitID)).get(path) ??
            synthesizeUpstreamMeta(unit, path);
          const fallbackResourceType = fallbackMeta?.resource?.ResourceType;
          setOverlay(unitId, path, null);
          try {
            await invokeFunctions({
              spaceId,
              where: `UnitID='${unitId}'`,
              functionInvocationsRequest: {
                FunctionInvocations: [
                  {
                    FunctionName: 'delete-path',
                    Arguments: [
                      ...(fallbackResourceType
                        ? [{ ParameterName: 'resource-type', Value: fallbackResourceType }]
                        : []),
                      { ParameterName: 'path', Value: path },
                    ],
                  },
                ],
              },
            }).unwrap();
            dispatch(confighubApi.util.invalidateTags(['Unit']));
          } catch {
            clearOverlay(unitId, path);
          }
        }
      }
    },
    [
      allUnits,
      synthesizeUpstreamMeta,
      invokeFunctions,
      dispatch,
      applyFieldPatch,
      recordFieldError,
      setOverlay,
      clearOverlay,
      handleSetFieldValue,
    ],
  );

  return { fieldOverlay, handleSetFieldValue, handleDeleteFieldValue };
}
