// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Where each value of the sheet comes from, joined from the Unit's Blame onto the sheet's stage
// keys in one pass. Pure: SpecSheet.tsx reads Blame.
import type { BlameField, UnitBlame } from '@confighub/rtk-query';

import { resolveConflictPaths } from '../configDiffFieldDiffs';
import { type OriginKind, hopUnitLabel, originKindOf } from '../gates/gateOrigin';

/** What the sheet says about a value's origin. `pending` while Blame reads; `unknown` with no match. */
export type AtomOriginKind = OriginKind | 'pending' | 'unknown';

export interface AtomOrigin {
  kind: AtomOriginKind;
  /** `SPACE/Unit rN` of the hop that set the value. */
  source?: string;
  /** The full path in the server's form (merge keys), for the peek. */
  fullPath?: string;
  /** Blame says the value changed since the last Release. */
  unreleased: boolean;
}

const COMMENT_PATH = /(^|\.)\$comment\$/;

/**
 * Stage key → origin, for the fields of one Unit's Blame. Each Blame path is resolved to the
 * stage key of the row it names (`resolveConflictPaths`, merge keys looked up in the
 * document); paths that name nothing the sheet draws are left out.
 */
export function joinBlame(
  blame: UnitBlame | undefined,
  data: string | undefined,
  unitId: string,
): Map<string, AtomOrigin> {
  const out = new Map<string, AtomOrigin>();
  const fields: BlameField[] = (blame?.Fields ?? []).filter(
    (f) => !!f.Path && !COMMENT_PATH.test(f.Path),
  );
  if (fields.length === 0) return out;
  const resources = fields.map((f) => ({
    Path: f.Path,
    Resource:
      f.ResourceType || f.ResourceName
        ? { ResourceType: f.ResourceType, ResourceName: f.ResourceName }
        : undefined,
  }));
  const keys = resolveConflictPaths(resources, data);
  fields.forEach((field, i) => {
    const key = keys[i];
    if (key === undefined || out.has(key)) return;
    const { kind, from } = originKindOf(field, blame?.UnitID ?? unitId);
    out.set(key, {
      kind,
      source: from
        ? `${hopUnitLabel(from)}${from.RevisionNum !== undefined ? ` r${from.RevisionNum}` : ''}`
        : undefined,
      fullPath: field.Path,
      unreleased: (field.Flags ?? []).includes('Unreleased'),
    });
  });
  return out;
}

/** The peek's eyebrow for an origin. Nothing unknown is ever called "Inherited". */
export function originWord(kind: AtomOriginKind): string {
  switch (kind) {
    case 'here':
      return 'Set in this Unit';
    case 'link':
      return 'Provided by a Link';
    case 'inherited':
      return 'Inherited';
    case 'pending':
      return 'Reading where this value comes from';
    case 'unreadable':
      return 'Origin not readable';
    default:
      return 'Origin unknown';
  }
}
