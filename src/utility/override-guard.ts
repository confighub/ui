// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Keep on merge, as the guards that record it. A value a merge must not overwrite has the
 * Override guard on its path. The paths a Link's resolve or a Trigger's functions write are kept
 * by the guard naming what maintains them, Link=<UpdateType> or Trigger=<Slug>, which the Link or
 * Trigger states with the clearance to write over it again. Kept free of React so the requests
 * can be checked without a page.
 */
import type {
  Clearance,
  GuardStamp,
  ResourceGuards,
  ResourceInfo,
  ResourcePathAnnotations,
} from '@confighub/rtk-query';

import { clearanceAdmitting, clearanceWithout } from './clearance-functions';

/** The guard key of a value kept on merge. */
export const OVERRIDE_GUARD_KEY = 'Override';

/** The guard key a Link states to keep what its resolve writes; its value is the UpdateType. */
export const LINK_GUARD_KEY = 'Link';

/** The guard key a Trigger states to keep what its functions write; its value is the slug. */
export const TRIGGER_GUARD_KEY = 'Trigger';

export type OverrideGuardValue = 'Upstream' | 'External';

/**
 * The value of the Override guard that keeps a value on a Unit: Upstream on a Unit with an
 * upstream Unit, whose upgrades it holds the value against, and External on one without, whose
 * configuration comes from outside ConfigHub, such as an upload or a rendered chart. Takes the
 * Unit's UpstreamUnitID, or whether it has one.
 */
export const overrideGuardValue = (
  upstreamUnitId?: string | boolean | null,
): OverrideGuardValue => (upstreamUnitId ? 'Upstream' : 'External');

/** Whether guards, a field's or a path's own, include the Override guard: the value is kept. */
export const hasOverrideGuard = (
  guards: Readonly<Record<string, string>> | null | undefined,
): boolean => guards?.[OVERRIDE_GUARD_KEY] !== undefined;

/**
 * The guard edit of one resource that keeps some of its paths on merge and lets merges update
 * others: the Override guard set on the first and removed from the second. The empty path is the
 * resource as a whole.
 */
export function overrideGuardEdit(
  resource: ResourceInfo | undefined,
  keep: readonly string[],
  release: readonly string[],
  value: OverrideGuardValue,
): ResourceGuards {
  const edit: ResourceGuards = { Resource: resource };
  if (keep.length > 0) {
    edit.Set = Object.fromEntries(keep.map((path) => [path, { [OVERRIDE_GUARD_KEY]: value }]));
  }
  if (release.length > 0) {
    edit.Remove = Object.fromEntries(release.map((path) => [path, [OVERRIDE_GUARD_KEY]]));
  }
  return edit;
}

/**
 * The Override guard in effect at a path of a resource, as the server finds a path's guards: the
 * path's own entry, then each ancestor's, nearest first, then the resource's. Undefined when none
 * of them has one. The path is matched as the annotations key it, so an array element has to be
 * named by merge key, not by position.
 */
export function overrideGuardAt(
  annotations: ResourcePathAnnotations | undefined,
  path: string,
): string | undefined {
  if (!annotations) return undefined;
  let remaining = path;
  for (;;) {
    const value = annotations.PathAnnotationMap?.[remaining]?.Guard?.[OVERRIDE_GUARD_KEY];
    if (value !== undefined) return value;
    const lastDot = remaining.lastIndexOf('.');
    if (lastDot < 0) break;
    remaining = remaining.slice(0, lastDot);
  }
  return annotations.ResourceAnnotations?.Guard?.[OVERRIDE_GUARD_KEY];
}

/** A Link's or Trigger's guards and clearance, with Keep on merge taken out of them. */
export interface KeepGuardForm {
  /** The guard that keeps what it writes is stated, and its clearance admits it. */
  keep: boolean;
  guards?: GuardStamp;
  clearance?: Clearance;
}

/**
 * Keep on merge read from a Link's or Trigger's guards: on when it states the guard `key=value`.
 * That guard, and the clearance requirement that admits it, are then left out of the guards and
 * clearance returned, since Keep on merge stands for them.
 */
export function splitKeepGuard(
  guards: GuardStamp | null | undefined,
  clearance: Clearance | null | undefined,
  key: string,
  value: string,
): KeepGuardForm {
  if (!value || guards?.[key] !== value) {
    return { keep: false, guards: guards ?? undefined, clearance: clearance ?? undefined };
  }
  const rest = Object.fromEntries(Object.entries(guards).filter(([k]) => k !== key));
  return {
    keep: true,
    guards: rest,
    clearance: clearanceWithout(clearance ?? [], key, value),
  };
}

/**
 * The guards and clearance a Link or Trigger is written with: those given, with the guard
 * `key=value` and a clearance admitting it when Keep on merge is on. The guard replaces another
 * value of the same key, since Keep on merge is what the person asked for. Empty ones are
 * undefined, so the Link or Trigger is written without them.
 */
export function joinKeepGuard(
  form: KeepGuardForm,
  key: string,
  value: string,
): { guards?: GuardStamp; clearance?: Clearance } {
  let guards = form.guards ?? {};
  let clearance = form.clearance ?? [];
  if (form.keep && value) {
    guards = { ...guards, [key]: value };
    clearance = clearanceAdmitting(clearance, key, value);
  }
  return {
    guards: Object.keys(guards).length > 0 ? guards : undefined,
    clearance: clearance.length > 0 ? clearance : undefined,
  };
}

/** What a merge conflict says about the guards that withheld it, as the API sends it. */
interface GuardedConflictLike {
  Reason?: string;
  Guards?: readonly { Key?: string }[] | null;
  Guard?: { Key?: string } | null;
}

/**
 * Whether a merge conflict is a value kept on merge: withheld by Override guards alone, or
 * ProtectedPath, which a merge reported before keeping a value became a guard. A change some
 * other guard also withheld is that guard's to explain.
 */
export function isKeptOnMergeConflict(conflict: GuardedConflictLike): boolean {
  if (conflict.Reason === 'ProtectedPath') return true;
  if (conflict.Reason !== 'Guarded') return false;
  const guards = conflict.Guards ?? (conflict.Guard ? [conflict.Guard] : []);
  return guards.length > 0 && guards.every((guard) => guard.Key === OVERRIDE_GUARD_KEY);
}
