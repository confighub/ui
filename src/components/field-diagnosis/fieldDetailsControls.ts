// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Which buttons the field details show, and when they are disabled (PLAN.md U2). Pure.
// No inert button: an action the host gives no handler for is not shown. One contained button at
// most: the first need's action (R2).
import type { FieldHistoryEntry, FieldNeed, FieldState, FieldView } from './fieldDiagnosis.types';

export interface ControlState {
  shown: boolean;
  disabled: boolean;
  /** Why it is disabled, for its tooltip. */
  reason?: string;
}

const HIDDEN: ControlState = { shown: false, disabled: true };
const ENABLED: ControlState = { shown: true, disabled: false };

/** The field has no value to act on. */
function noValueReason(state: FieldState): string | undefined {
  if (state === 'absent') return 'This Unit does not have this field';
  if (state === 'deleted') return 'A change deleted this field';
  return undefined;
}

export function editControl(view: FieldView, hasHandler: boolean): ControlState {
  if (!hasHandler || view.state === 'resource') return HIDDEN;
  const reason = noValueReason(view.state);
  return reason ? { shown: true, disabled: true, reason } : ENABLED;
}

export function needActionControl(
  view: FieldView,
  need: FieldNeed,
  index: number,
  hasHandler: boolean,
): ControlState & { contained: boolean } {
  if (!hasHandler || !need.action) return { ...HIDDEN, contained: false };
  const contained = index === 0;
  // Applying a withheld change writes the field; a field with no value takes none.
  const reason = need.kind === 'conflict' ? noValueReason(view.state) : undefined;
  return reason ? { shown: true, disabled: true, reason, contained } : { ...ENABLED, contained };
}

export function restoreControl(view: FieldView, entry: FieldHistoryEntry, hasHandler: boolean): ControlState {
  if (!hasHandler || entry.current) return HIDDEN;
  const reason = noValueReason(view.state);
  return reason ? { shown: true, disabled: true, reason } : ENABLED;
}
