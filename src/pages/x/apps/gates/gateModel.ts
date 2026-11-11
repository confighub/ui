// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { validationFindings } from '@/pages/unit-detail/components/action-side-bar/validationFindings';
import { parseGateName } from '@/utility/name-format-functions';
import type {
  AttributeValue,
  ExtendedTriggerRead,
  Trigger,
  UnitRead,
} from '@confighub/rtk-query';

import { FixKind, fixKindOf, isFixableKind } from './gateFixKinds';

/** The gate a Unit carries while its Triggers still run on a new Revision. It has no Trigger. */
export const AWAITING_GATE = 'awaiting/triggers';

export interface GateIssue {
  identifier?: string;
  message: string;
}

/** One failed field of a gate, on one Unit. */
export interface GateField {
  /** Resource type, resource name and path: never a position, two resources can share a path. */
  key: string;
  /** The recorded gate (one function call of the Trigger) that names the field. */
  gateName: string;
  functionName: string;
  unitId: string;
  spaceId: string;
  /** The Space slug of the Unit, from the gate name. */
  spaceSlug: string;
  unitSlug: string;
  resourceType?: string;
  resourceName?: string;
  resourceNameWithoutScope?: string;
  path: string;
  attributeName?: string;
  dataType?: string;
  value: unknown;
  issues: GateIssue[];
  kind: FixKind;
}

/** A failed check of a gate that names no field. */
export interface GateUnitFinding {
  key: string;
  unitSlug: string;
  messages: string[];
}

export interface GateUnit {
  unitId: string;
  spaceId: string;
  slug: string;
  toolchainType?: string;
  headRevisionNum: number;
  lastReleasedRevisionNum?: number;
  /** The ChangeSet open on the Unit, which a write to it has to name. */
  changeSetId?: string;
}

/**
 * One gate of the Gates tab: one validating Trigger, over the Units it fails on. A Trigger that
 * calls several functions records a gate per call; they are shown as one, with each call's
 * findings under it.
 */
export interface Gate {
  /** The Trigger's ID, or, for a gate recorded without one, its Space and Trigger slugs. */
  key: string;
  /** The first recorded gate, for its name's parts. */
  gateName: string;
  /** Every recorded gate of the Trigger. */
  gateNames: string[];
  warning: boolean;
  units: GateUnit[];
  trigger?: Trigger;
  triggerSpaceId?: string;
  functionName: string;
  fields: GateField[];
  unitFindings: GateUnitFinding[];
  /** Blocking findings of the gate: one per failed field plus one per check that names no field. */
  findingCount: number;
}

export const fieldKey = (
  unitId: string,
  resourceType: string | undefined,
  resourceName: string | undefined,
  path: string,
  gateName = '',
) => [unitId, resourceType ?? '', resourceName ?? '', path, gateName].join('\u0000');

/** The Trigger a recorded gate belongs to: its ID, else its Space and Trigger slugs. */
const triggerKey = (gateName: string, unit: UnitRead): string => {
  const id = unit.ValidationTriggerIDs?.[gateName];
  if (id) return id;
  const { spaceSlug, triggerSlug } = parseGateName(gateName);
  return `${spaceSlug ?? ''}/${triggerSlug}`;
};

const attributeIssues = (attribute: AttributeValue | undefined): GateIssue[] =>
  (attribute?.Issues ?? [])
    .filter((issue) => issue.Message)
    .map((issue) => ({
      identifier: issue.Identifier || undefined,
      message: issue.Message ?? '',
    }));

const triggerFor = (
  gateName: string,
  unit: UnitRead,
  triggers: ExtendedTriggerRead[],
): ExtendedTriggerRead | undefined => {
  const id = unit.ValidationTriggerIDs?.[gateName];
  if (id) return triggers.find((t) => t.Trigger?.TriggerID === id);
  const { triggerSlug } = parseGateName(gateName);
  return triggers.find((t) => t.Trigger?.Slug === triggerSlug);
};

/** The number of fields of a gate whose new value is typed in the tab. */
const typedFieldCount = (gate: Gate): number =>
  gate.fields.filter((field) => field.kind === 'set').length;

/** The number of fields of a gate that can be fixed in the tab. */
export const fixableFieldCount = (gate: Gate): number =>
  gate.fields.filter((field) => isFixableKind(field.kind)).length;

/**
 * The gates and the warnings of a Space's Units, in fix order: gates with a field that can be
 * fixed in the tab first, and of those, the gates with more values to type in place first.
 * `awaiting/triggers` is not a gate here.
 */
export const buildGates = (
  units: UnitRead[],
  triggers: ExtendedTriggerRead[],
): { gates: Gate[]; warnings: Gate[] } => {
  const byName = new Map<string, Gate>();
  const order: string[] = [];
  for (const unit of units) {
    if (!unit.UnitID || !unit.SpaceID) continue;
    const gateUnit: GateUnit = {
      unitId: unit.UnitID,
      spaceId: unit.SpaceID,
      slug: unit.Slug,
      toolchainType: unit.ToolchainType,
      headRevisionNum: unit.HeadRevisionNum ?? 0,
      lastReleasedRevisionNum: unit.LastReleasedRevisionNum ?? undefined,
      changeSetId: unit.ChangeSetID ?? undefined,
    };
    const named: [string, boolean][] = [
      ...Object.keys(unit.ValidationErrors ?? {}).map((name): [string, boolean] => [
        name,
        false,
      ]),
      ...Object.keys(unit.ValidationWarnings ?? {}).map((name): [string, boolean] => [
        name,
        true,
      ]),
    ];
    for (const [gateName, warning] of named) {
      if (gateName === AWAITING_GATE) continue;
      const results = unit.ValidationResults?.[gateName];
      const findings = validationFindings(results);
      const trigger = triggerFor(gateName, unit, triggers);
      const functionName =
        trigger?.Trigger?.FunctionName ||
        parseGateName(gateName).functionName ||
        results?.[0]?.FunctionName ||
        '';
      const callFunction =
        parseGateName(gateName).functionName || results?.[0]?.FunctionName || functionName;
      const key = triggerKey(gateName, unit);
      const mapKey = `${warning ? 'w' : 'e'}\u0000${key}`;
      let gate = byName.get(mapKey);
      if (!gate) {
        gate = {
          key,
          gateName,
          gateNames: [],
          warning,
          units: [],
          trigger: trigger?.Trigger,
          triggerSpaceId: trigger?.Space?.SpaceID ?? trigger?.Trigger?.SpaceID,
          functionName,
          fields: [],
          unitFindings: [],
          findingCount: 0,
        };
        byName.set(mapKey, gate);
        order.push(mapKey);
      }
      if (!gate.gateNames.includes(gateName)) gate.gateNames.push(gateName);
      if (!gate.units.some((u) => u.unitId === gateUnit.unitId)) gate.units.push(gateUnit);
      for (const finding of findings.fields) {
        const [resultIndex, attributeIndex] = finding.key.split('/').map(Number);
        const attribute = results?.[resultIndex]?.FailedAttributes?.[attributeIndex];
        const path = attribute?.Path ?? finding.path ?? '';
        const issues = attributeIssues(attribute);
        gate.fields.push({
          key: fieldKey(
            unit.UnitID,
            attribute?.ResourceType,
            attribute?.ResourceName,
            path,
            gateName,
          ),
          gateName,
          functionName: callFunction,
          unitId: unit.UnitID,
          spaceId: unit.SpaceID,
          spaceSlug: parseGateName(gateName).spaceSlug ?? '',
          unitSlug: unit.Slug,
          resourceType: attribute?.ResourceType || undefined,
          resourceName: attribute?.ResourceName || undefined,
          resourceNameWithoutScope: attribute?.ResourceNameWithoutScope || undefined,
          path,
          attributeName: attribute?.AttributeName,
          dataType: attribute?.DataType,
          value: attribute?.Value,
          issues,
          kind: fixKindOf(
            callFunction,
            attribute?.AttributeName,
            path,
            issues[0]?.identifier,
            attribute?.DataType,
          ),
        });
      }
      for (const finding of findings.unit) {
        gate.unitFindings.push({
          key: `${unit.UnitID}/${gateName}/${finding.key}`,
          unitSlug: unit.Slug,
          messages: finding.messages,
        });
      }
      gate.findingCount = gate.fields.length + gate.unitFindings.length;
    }
  }
  const all = order.map((key) => byName.get(key)!);
  const fixableFirst = (list: Gate[]) =>
    list
      .map((gate, index) => ({ gate, index }))
      .sort(
        (a, b) =>
          Number(fixableFieldCount(b.gate) > 0) - Number(fixableFieldCount(a.gate) > 0) ||
          typedFieldCount(b.gate) - typedFieldCount(a.gate) ||
          a.index - b.index,
      )
      .map(({ gate }) => gate);
  return {
    gates: fixableFirst(all.filter((gate) => !gate.warning)),
    warnings: fixableFirst(all.filter((gate) => gate.warning)),
  };
};

/** The count of the Gates tab badge: the blocking findings of the gates. Warnings never count. */
export const blockingFindingCount = (gates: Gate[]): number =>
  gates.reduce((sum, gate) => sum + gate.findingCount, 0);

/** Whether a Space's Units are still being checked on a new Revision. */
export const awaitingUnit = (units: UnitRead[]): UnitRead | undefined =>
  units.find((unit) => !!unit.ValidationErrors?.[AWAITING_GATE]);

/** The resource a row is in, as "Deployment mydep". */
export const resourceShortLabel = (
  field: Pick<GateField, 'resourceType' | 'resourceNameWithoutScope' | 'resourceName'>,
) =>
  [field.resourceType?.split('/').pop(), field.resourceNameWithoutScope ?? field.resourceName]
    .filter(Boolean)
    .join(' ');

/** A value a function found, as the row shows it. */
export const valueText = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '(not set)';
  return typeof value === 'string' ? value : JSON.stringify(value);
};

/**
 * The gate a save was for, if it still fails after the save: looked up among the warnings for a
 * warning, which is never a numbered gate, else among the gates.
 */
export const gateAfterSave = (
  saved: Gate,
  gates: Gate[],
  warnings: Gate[],
): Gate | undefined => (saved.warning ? warnings : gates).find((g) => g.key === saved.key);
