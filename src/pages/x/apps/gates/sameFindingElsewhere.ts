// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { BlameField, UnitBlame } from '@confighub/rtk-query';

import { originUnitKey } from './gateOrigin';

export type ElsewhereRelation = 'set' | 'copies' | 'this' | 'other';

export interface ElsewhereUnit {
  unitId: string;
  /** The Unit's Space, for its link; absent when the answer does not name it. */
  spaceId?: string;
  label: string;
  relation: ElsewhereRelation;
}

/** A Unit as a link: its IDs and its `SPACE/Unit`. */
export interface UnitRef {
  spaceId?: string;
  unitId?: string;
  label: string;
}

export interface SameFindingElsewhere {
  /** The Unit where the value was set; an empty label for a check that names no field. */
  origin: UnitRef;
  originSpace: string;
  units: ElsewhereUnit[];
}

/** A part of the block's sentence: text, or a Unit named in it. */
export type SentencePart = { text: string } | { unit: UnitRef };

const lastHop = (field: BlameField) => {
  const chain = field.Chain ?? [];
  return chain[chain.length - 1];
};

/**
 * The same finding on other Units of the Component: the same check (function) on the same path,
 * with a value from the same origin Unit. A Unit that changed the field itself has another origin
 * and is left out; a clone of a clone counts by its origin.
 */
export const sameFindingElsewhere = (
  componentBlame: UnitBlame[] | undefined,
  /** The Unit of the gate, as `originUnitKey` names a Unit. */
  thisUnit: { unitId: string; label: string },
  functionName: string,
  paths: string[],
  /** The origin Unit, as `originUnitKey` names it. */
  originKey: string | undefined,
  origin: UnitRef,
  originSpace: string,
): SameFindingElsewhere | undefined => {
  if (!componentBlame || !originKey) return undefined;
  const wanted = new Set(paths);
  const units = new Map<string, ElsewhereUnit>();
  for (const unit of componentBlame) {
    for (const field of unit.Fields ?? []) {
      const hop = lastHop(field);
      if (!hop || originUnitKey(hop) !== originKey) continue;
      const matches = (field.Validation ?? []).some(
        (v) => v.Function === functionName && wanted.has(v.Path || field.Path || ''),
      );
      if (!matches) continue;
      const label = [field.SpaceSlug, field.UnitSlug].filter(Boolean).join('/');
      const realId = field.UnitID ?? unit.UnitID;
      const unitId = realId ?? label;
      const key =
        unitId === thisUnit.unitId || label === thisUnit.label ? thisUnit.unitId : unitId;
      if (units.has(key)) continue;
      const isOrigin =
        originUnitKey({
          UnitID: field.UnitID ?? unit.UnitID,
          SpaceSlug: field.SpaceSlug,
          UnitSlug: field.UnitSlug,
        }) === originKey || label === origin.label;
      units.set(key, {
        unitId: key,
        spaceId: realId ? (field.SpaceID ?? unit.SpaceID) : undefined,
        label,
        relation: isOrigin ? 'set' : key === thisUnit.unitId ? 'this' : 'copies',
      });
    }
  }
  if (!units.has(thisUnit.unitId)) return undefined;
  const list = [...units.values()].sort(
    (a, b) => ORDER[a.relation] - ORDER[b.relation] || a.label.localeCompare(b.label),
  );
  if (list.length < 2) return undefined;
  return { origin, originSpace, units: list };
};

const ORDER: Record<ElsewhereRelation, number> = { set: 0, copies: 1, other: 1, this: 2 };

export const RELATION_LABEL: Record<ElsewhereRelation, string> = {
  set: 'where the value was set',
  copies: 'same source',
  this: 'this Unit',
  other: 'same check, other source',
};

/**
 * The same check failing on other Units of the Component, for a gate that names no field, so has
 * no origin: the same Trigger slug and function in each Unit's gates.
 */
export const sameCheckElsewhere = (
  units: { unitId: string; spaceId: string; label: string; gateNames: string[] }[],
  thisUnit: { unitId: string; spaceId: string; label: string },
  triggerSlug: string,
  functionName: string,
): SameFindingElsewhere | undefined => {
  const same = (gate: string) => {
    const [, trigger, fn] = gate.split('/');
    return trigger === triggerSlug && (fn ?? '').replace(/:\d+$/, '') === functionName;
  };
  const others = units.filter((u) => u.unitId !== thisUnit.unitId && u.gateNames.some(same));
  if (others.length === 0) return undefined;
  const list: ElsewhereUnit[] = [
    ...others.map((u) => ({
      unitId: u.unitId,
      spaceId: u.spaceId,
      label: u.label,
      relation: 'other' as const,
    })),
    { ...thisUnit, relation: 'this' as const },
  ].sort((a, b) => ORDER[a.relation] - ORDER[b.relation] || a.label.localeCompare(b.label));
  return { origin: { label: '' }, originSpace: '', units: list };
};

/** The sentence of the block, with the Units it names as parts, so each can be a link. */
export const elsewhereSentence = (found: SameFindingElsewhere): SentencePart[] => {
  const others = found.units.filter((u) => u.relation !== 'this');
  const source = found.units.find((u) => u.relation === 'set');
  const downstream = found.units.filter((u) => u.relation !== 'set');
  const total = found.units.length;
  if (!found.origin.label) {
    return [
      {
        text: `The same finding is on ${others.length} other ${others.length === 1 ? 'Unit' : 'Units'} of this Component.`,
      },
    ];
  }
  if (source) {
    return [
      { text: 'The same finding is on its source, ' },
      { unit: source },
      {
        text: `, and on ${
          downstream.length === 1
            ? 'this Unit'
            : `${downstream.length} Units, this one included`
        }. A fix there clears ${total === 2 ? 'both' : `all ${total}`}.`,
      },
    ];
  }
  return [
    { text: 'The same finding, from the same source (' },
    { unit: found.origin },
    {
      text: `), is on ${others.length} other ${others.length === 1 ? 'Unit' : 'Units'}. A fix in ${
        found.originSpace
      } clears it in ${downstream.length} Variants, this one included.`,
    },
  ];
};

/** The sentence as plain text. */
export const sentenceText = (parts: SentencePart[]): string =>
  parts.map((p) => ('text' in p ? p.text : p.unit.label)).join('');

export const elsewhereShowLabel = (found: SameFindingElsewhere): string =>
  found.units.length === 2 ? 'Show both Units' : `Show the ${found.units.length} Units`;
