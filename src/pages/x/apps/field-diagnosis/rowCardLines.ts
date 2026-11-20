// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What the row hover card ("Edit this value") adds for a field (PLAN.md U5, contract D5). Pure.
//   - the set-by row, unless the card's own status line says something more urgent (a staged edit,
//     a staged or waiting upgrade);
//   - at most one attention line: the first block, else the first thing that waits. Warnings stay
//     in the details;
//   - a guard line only where the card's "Keep on merge" / "Let merges update this" row does not
//     already say it (that row is the Override guard).
import type { FieldGuard, FieldNeed, FieldSetBy, FieldView } from '@/components/field-diagnosis/fieldDiagnosis.types';

export interface RowCardLines {
  setBy?: FieldSetBy;
  attention?: FieldNeed;
  guards: FieldGuard[];
}

export function rowCardLines(view: FieldView, { keepShown, hasStatus }: { keepShown: boolean; hasStatus: boolean }): RowCardLines {
  return {
    setBy: hasStatus ? undefined : view.setBy,
    attention: view.needs.find((n) => n.tone === 'block') ?? view.needs.find((n) => n.tone === 'wait'),
    guards: view.guards.filter((g) => !(g.kind === 'override' && keepShown)),
  };
}
