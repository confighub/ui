// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The two sources of one field's record, in one shape (ARCHITECTURE.md §5 FieldFacts): a field of
// the whole-unit blame (with its Chain) for the row card, and the path report for the details.
// Both list the changes newest first: this Unit's change, then each upstream hop.
import type { BlameField, UnitPathReport } from '@confighub/rtk-query';

import type { FieldFacts } from './fieldDiagnosis.types';

/** A field of the whole-unit blame. It has no history. */
export function factsFromBlame(field: BlameField): FieldFacts {
  return { source: 'blame', field, hops: field.Chain ?? [] };
}

/** A path report (`GET .../unit/{unit}/path`). */
export function factsFromPath(report: UnitPathReport): FieldFacts {
  return {
    source: 'path',
    field: report.Field ?? {},
    hops: (report.Changes ?? []).map((change) => change.Origin ?? {}),
    history: report.History,
  };
}
