// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Whether what a Release would bundle has ValidationErrors. Publishing a Release is
 * refused while any Revision it would bundle has them, with a ChangeWorkflow or
 * without one, so this is what the built-in `Validated` prerequisite checks and
 * what `Released` needs as well. The ChangeSet and ChangeOrder pages both show it.
 *
 * Pure: the hooks read the Revisions and pass them in.
 */
import { unitOverviewHref } from '@/pages/unit-detail/unitDetailHrefs';
import { FILTER_URL_PARAMS } from '@/utility/constants/url-params';

/** One Unit with ValidationErrors on the Revision a Release would bundle. */
export interface ValidationFailure {
  unitId: string;
  slug: string;
  spaceId: string;
  spaceSlug: string;
  /** The gates set on it, by name. */
  gates: string[];
  /** The Trigger that set each gate, when the Revision records it. */
  triggerIdByGate: Record<string, string>;
}

/**
 * Where a failure's names lead, to read the error and fix it: the Unit's Overview with
 * the gate's card open (only the tab when it has several), the Trigger's page on the
 * Validation board, which lists every Unit failing it, and the Units of the Space that
 * have ValidationErrors.
 */
export function validationUnitHref(
  failure: Pick<ValidationFailure, 'spaceId' | 'unitId' | 'gates'>,
): string {
  return unitOverviewHref(
    failure.spaceId,
    failure.unitId,
    failure.gates.length === 1 ? (failure.gates[0] ?? '') : '',
  );
}

export function validationGateHref(
  failure: Pick<ValidationFailure, 'triggerIdByGate'>,
  gate: string,
): string | undefined {
  const triggerId = failure.triggerIdByGate[gate];
  return triggerId === undefined || triggerId === '' ? undefined : `/validation/${triggerId}`;
}

export function validationSpaceHref(spaceId: string): string {
  const where = `SpaceID = '${spaceId}' AND LEN(ValidationErrors) > 0`;
  return `/units?${new URLSearchParams({ [FILTER_URL_PARAMS.WHERE]: where }).toString()}`;
}

export type ReleaseValidation =
  | { status: 'loading' }
  | { status: 'failed' }
  /** `unitCount` Units were read; `failures` are those with ValidationErrors. */
  | { status: 'read'; unitCount: number; failures: ValidationFailure[] };

/** The gates a Revision or Unit carries, by name, in order. */
export function gatesOf(
  validationErrors: Record<string, boolean> | null | undefined,
): string[] {
  return Object.keys(validationErrors ?? {}).sort();
}

/** Whether there is anything to say: nothing is said of a change no Revision marks yet. */
export function hasValidationNote(
  validation: ReleaseValidation | undefined,
): validation is ReleaseValidation {
  return (
    validation !== undefined && !(validation.status === 'read' && validation.unitCount === 0)
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "No ValidationErrors." or how many Units have them. */
export function validationSummaryText(validation: ReleaseValidation): string {
  if (validation.status === 'loading') return 'Checking…';
  if (validation.status === 'failed') return 'Could not be read.';
  if (validation.unitCount === 0) return 'No Unit to validate yet.';
  if (validation.failures.length === 0) return 'No ValidationErrors.';
  return `${plural(validation.failures.length, 'Unit')} with ValidationErrors.`;
}

/**
 * One Unit as a Release would bundle it: named, with the gates on what would be bundled.
 * The names are read with the rows (`include=UnitID,SpaceID`), so a Unit is never shown
 * by its id.
 */
export type BundledUnit = ValidationFailure;

/** One Revision a Tag marks, as read. */
export interface MarkedRevision extends BundledUnit {
  revisionNum: number;
  tags: readonly string[];
}

/**
 * What a Release of a ChangeOrder would bundle of each Unit: the highest Revision its
 * release Tag marks, or without one, the highest its end Tag marks. Units neither
 * marks are not bundled.
 */
export function bundledRevisions(
  rows: readonly MarkedRevision[],
  releaseTagId: string | undefined,
  endTagId: string | undefined,
): MarkedRevision[] {
  const release = new Map<string, MarkedRevision>();
  const end = new Map<string, MarkedRevision>();
  const keep = (map: Map<string, MarkedRevision>, row: MarkedRevision) => {
    const had = map.get(row.unitId);
    if (had === undefined || row.revisionNum > had.revisionNum) map.set(row.unitId, row);
  };
  for (const row of rows) {
    if (releaseTagId !== undefined && row.tags.includes(releaseTagId)) keep(release, row);
    if (endTagId !== undefined && row.tags.includes(endTagId)) keep(end, row);
  }
  const out = new Map(end);
  for (const [unitId, row] of release) out.set(unitId, row);
  return [...out.values()];
}

/** The validation of the Units given: those with ValidationErrors, by Space and then Unit. */
export function validationOf(units: readonly BundledUnit[]): ReleaseValidation {
  const failures = units
    .filter((unit) => unit.gates.length > 0)
    .map(({ unitId, slug, spaceId, spaceSlug, gates, triggerIdByGate }) => ({
      unitId,
      slug,
      spaceId,
      spaceSlug,
      gates,
      triggerIdByGate,
    }))
    .sort((a, b) => a.spaceSlug.localeCompare(b.spaceSlug) || a.slug.localeCompare(b.slug));
  return { status: 'read', unitCount: units.length, failures };
}

/** What a list of failures shows of one, in a list of names. */
export function failureName(failure: Pick<ValidationFailure, 'slug' | 'spaceSlug'>): string {
  return `${failure.spaceSlug}/${failure.slug}`;
}
