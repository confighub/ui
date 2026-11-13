// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ValidationResult } from '@confighub/rtk-query';

import { validationFindings } from '@/pages/unit-detail/components/action-side-bar/validationFindings';
import { unitOverviewHref } from '@/pages/unit-detail/unitDetailHrefs';

import type { MergedUnit } from './componentTypes';
import { countLogicalChanges, countUpgradableBadgeFields, fieldDiffKey } from './entryBuilders';
import { formatUnitDataSize } from './unitSizeGuard';

/**
 * The statuses a Unit header shows as icons, in the order the node card shows them. The three
 * read states (`loading`, `error`, `not-read`) come first: while a Unit's changes are not read,
 * the statuses that depend on them cannot be known.
 */
export type UnitHeaderStatusKind =
  | 'loading'
  | 'error'
  | 'not-read'
  | 'stale'
  | 'unreleased'
  | 'warnings'
  | 'gated';

export interface UnitHeaderStatus {
  kind: UnitHeaderStatusKind;
  /** The status words, also the icon's accessible name. */
  label: string;
  /** Eyebrow of the peek. */
  eyebrow: string;
  /** Lines of the peek: status words and revisions, never the change itself. */
  lines: string[];
  /** Accent action of the peek, when the icon has a click target. */
  action?: string;
  /** Where a click on the icon goes, when it is a link. */
  href?: string;
}

/** The gate the resolve queue sets on a Unit until its validating Triggers have run. */
export const AWAITING_TRIGGERS_GATE = 'awaiting/triggers';

/** How many findings a gate lists in its peek before saying how many more there are. */
const FINDING_LIMIT = 3;
/** How many gates a peek names before saying how many more there are. */
const GATE_LIMIT = 3;

/** One line per finding of a gate: where it is and what is wrong with it. */
export const gateFindingLines = (results: ValidationResult[] | undefined): string[] => {
  const findings = validationFindings(results);
  const lines = [
    ...findings.fields.map((finding) => {
      const where = [finding.resourceType, finding.resourceName, finding.path].filter(Boolean).join(' ');
      const what = finding.messages.join('; ');
      return [where, what].filter(Boolean).join(': ') || 'Did not pass';
    }),
    ...findings.unit.map(
      (finding) => finding.messages.join('; ') || `${finding.functionName ?? 'The function'} did not pass`,
    ),
  ];
  if (lines.length <= FINDING_LIMIT) return lines;
  return [...lines.slice(0, FINDING_LIMIT), `and ${lines.length - FINDING_LIMIT} more`];
};

const gatePeekLines = (
  gates: string[],
  results: { [gate: string]: ValidationResult[] } | undefined,
): string[] => {
  const lines: string[] = [];
  for (const gate of gates.slice(0, GATE_LIMIT)) {
    lines.push(gate);
    if (gate === AWAITING_TRIGGERS_GATE) lines.push('Waiting for the validating Triggers to run');
    else lines.push(...gateFindingLines(results?.[gate]));
  }
  if (gates.length > GATE_LIMIT) lines.push(`and ${gates.length - GATE_LIMIT} more`);
  return lines;
};

/** The revisions of a Stale or Unreleased changes status, as `r2→r3`. */
export const revisionRange = (from: number, to: number): string => `r${from}→r${to}`;

/**
 * The statuses of one Unit header, in display order. A healthy Unit has none.
 *
 * `expanded` matters for one status: a Unit held back by the oversized-Unit gate is "Not read
 * yet" only while it is closed, because opening it shows the gate's own card.
 */
export function unitHeaderStatuses(
  unit: MergedUnit,
  { expanded, held }: { expanded: boolean; held: boolean },
): UnitHeaderStatus[] {
  const out: UnitHeaderStatus[] = [];

  if (unit.isUpgradeLoading && !unit.upgradeEntry) {
    out.push({
      kind: 'loading',
      label: 'Reading the changes',
      eyebrow: 'Reading the changes',
      lines: ['The upgrade preview is being computed'],
    });
  }

  const upgradeError = unit.upgradeEntry ? undefined : unit.upgradeError;
  if (upgradeError || unit.variationError) {
    out.push({
      kind: 'error',
      label: 'Not read: failed',
      eyebrow: 'Not read · failed',
      lines: [
        upgradeError
          ? `The changes to this Unit could not be read: ${upgradeError}`
          : `The local overrides could not be read: ${unit.variationError}`,
      ],
    });
  }

  if (held && !expanded) {
    out.push({
      kind: 'not-read',
      label: 'Not read yet',
      eyebrow: 'Not read yet',
      lines: [`This Unit is ${formatUnitDataSize(unit.data)}. Its changes are read when you open it.`],
    });
  }

  if (unit.upgradeEntry && countUpgradableBadgeFields(unit) > 0) {
    const entry = unit.upgradeEntry;
    const changed = countUpgradableBadgeFields(unit);
    out.push({
      kind: 'stale',
      label: 'Stale',
      eyebrow: 'Stale · behind upstream',
      lines: [
        `Behind upstream: ${revisionRange(entry.upstreamRevisionNum, entry.upstreamHeadRevisionNum)}`,
        ...(changed > 1 ? [`${changed} fields change`] : []),
      ],
      action: 'Review & upgrade',
    });
  }

  // A Unit with no Target is never released, so the node card does not call its head unreleased either.
  if (unit.applyEntry && unit.targetId) {
    const entry = unit.applyEntry;
    const changed = countLogicalChanges(entry.fieldDiffs.map(fieldDiffKey));
    out.push({
      kind: 'unreleased',
      label: 'Unreleased changes',
      eyebrow: 'Unreleased changes',
      lines: [
        'Local edits not yet released',
        `Head r${entry.headRevision}, last released r${entry.appliedRevision}`,
        ...(changed > 1 ? [`${changed} fields changed`] : []),
      ],
      action: 'Review & release',
    });
  }

  const warnings = Object.keys(unit.validationWarnings ?? {});
  if (warnings.length > 0) {
    out.push({
      kind: 'warnings',
      label: 'Warnings',
      eyebrow: 'Warnings · validation warnings',
      lines: [...gatePeekLines(warnings, unit.validationResults), 'Advisory: they block no Release'],
      action: 'Review the warnings',
      href: unitOverviewHref(unit.spaceId, unit.unitId, warnings.length === 1 ? warnings[0] : ''),
    });
  }

  const gates = Object.keys(unit.validationErrors ?? {});
  if (gates.length > 0) {
    out.push({
      kind: 'gated',
      label: 'Gated',
      eyebrow: 'Gated · validation errors',
      lines: gatePeekLines(gates, unit.validationResults),
      action: 'Review the gate',
      href: unitOverviewHref(unit.spaceId, unit.unitId, gates.length === 1 ? gates[0] : ''),
    });
  }

  return out;
}

/** The accessible name of a header: its `SPACE/Unit` name, then the words of each status. */
export const unitHeaderAriaLabel = (spaceSlug: string, slug: string, statuses: UnitHeaderStatus[]): string =>
  [`${spaceSlug}/${slug}`, ...statuses.map((s) => s.label)].join(', ');
