// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Staged edits across several deployments at once.
 *
 * NOTHING HERE WRITES. Edits stage, exactly as they do in the single-deployment
 * tree, and a commit is a separate act — which matters more here than there,
 * because one apply can touch five Spaces and the user should see the blast
 * radius before it happens rather than after.
 *
 * TWO THINGS ARE DELIBERATELY NOT BLOCKED, and both were checked against the
 * code rather than assumed:
 *
 *   - PROTECTED PATHS. `protectedPaths` means *kept on merge*: it is what a
 *     merge from upstream must not overwrite. The shipped editor's own gate is
 *     `!readOnly && onStageEdit != null` and protection is not in it, so a
 *     protected path has always been hand-editable. Blocking it here would
 *     invert the meaning and delete a shipped capability.
 *   - WRITE PERMISSION. The shipped editor has no client-side permission gate
 *     either: nothing sets `readOnly` in this view, `Space.Permissions` is not
 *     requested by the components query and has no reader anywhere in `ui/src`.
 *     Authorisation is enforced on commit, by the server. Guessing a role rule
 *     here would risk hiding a capability the user actually has, so the apply
 *     path is built to report a server refusal PER DEPLOYMENT instead.
 */

import { setValueAtPath, type ResourceInfo } from '../configParser';
import type { CompareLeafRow } from './deploymentCompareModel';

/** One pending change to one field of one deployment's unit. */
export interface StagedCompareEdit {
  deploymentId: string;
  /** The unit the field lives in — the join key across deployments. */
  unitSlug: string;
  /** How the grid names the field. Identifies the ROW. */
  identityPath: string;
  /**
   * How this deployment's own document names it. Identifies the WRITE.
   *
   * Resolved per deployment and never carried across from another column: the
   * same identity path is a different canonical path in each deployment
   * whenever a list is involved, which is the whole reason the grid is keyed by
   * identity.
   */
  positionalPath: string;
  /** Which document of a multi-document unit to write to. */
  resource?: ResourceInfo;
  /** What the field held before. `undefined` means it was not set — so this is an add. */
  before?: string;
  after: string;
}

/**
 * Why a cell cannot be edited.
 *
 * Exactly two, both of them real. A third — no write permission — was designed
 * and then dropped, because the UI cannot see per-Space permissions and the
 * shipped editor does not gate on them either.
 */
export type EditBlockReason = 'by-position' | 'unanswerable';

export const EDIT_BLOCK_EXPLANATION: Record<EditBlockReason, string> = {
  'by-position':
    'This list gives its elements no identity, so they could only be lined up by position. An edit here could write to a different element in another deployment.',
  unanswerable: 'There is nothing to edit here — this deployment has no value at this path to change.',
};

/** Identifies a staged edit. One per field per deployment. */
export function editKey(deploymentId: string, unitSlug: string, identityPath: string): string {
  return `${deploymentId}\u0000${unitSlug}\u0000${identityPath}`;
}

/** Setting a field nobody has set is an add, and stages green — green already means present-only-here. */
export function stagedKind(edit: StagedCompareEdit): 'edit' | 'add' {
  return edit.before === undefined ? 'add' : 'edit';
}

/**
 * Can this column of this row be edited, and if not, why?
 *
 * `by-position` outranks the rest: it is a correctness refusal and stays true
 * however the cell renders.
 */
export function editBlockReason(row: CompareLeafRow, columnIndex: number): EditBlockReason | null {
  if (row.isPositional) return 'by-position';
  if (row.editTargets[columnIndex] === undefined) return 'unanswerable';
  return null;
}

export interface DeploymentEditSummary {
  deploymentId: string;
  label: string;
  /** The Space name, when `label` is a variant label and so does not already say it. */
  displayName?: string;
  /** Slot letter, so the footer names the same thing the columns and nodes do. */
  letter: string;
  count: number;
}

/** What is staged, per deployment, in slot order — the footer's blast radius. */
export function summariseEdits(
  edits: readonly StagedCompareEdit[],
  columns: readonly { deploymentId: string; label: string; displayName?: string }[],
): DeploymentEditSummary[] {
  return columns
    .map((column, index) => ({
      deploymentId: column.deploymentId,
      label: column.label,
      displayName: column.displayName,
      letter: index < 26 ? String.fromCharCode(65 + index) : String(index + 1),
      count: edits.filter((edit) => edit.deploymentId === column.deploymentId).length,
    }))
    .filter((summary) => summary.count > 0);
}

export type ApplyToUnitResult =
  | { ok: true; data: string }
  | { ok: false; failedPaths: string[] };

/**
 * Fold every staged edit for one unit into its configuration.
 *
 * ALL OR NOTHING PER UNIT, matching the shipped commit: a partial write would
 * drop some staged changes with nothing on screen to say which. A path that
 * cannot be serialised aborts this unit and names itself, and the caller leaves
 * those edits staged.
 *
 * SETS ONLY. There was a delete branch here and nothing could reach it — no
 * surface stages a removal on this grid. It is gone rather than kept for a
 * future caller, and the reason is worth recording: these edits apply in
 * sequence against positional paths resolved ONCE, up front, so a delete that
 * splices an array would shift the indices every later edit in the batch is
 * holding. Whoever adds removals has to re-resolve between writes, and dead code
 * that looks ready would have hidden that from them.
 */
export function applyEditsToUnit(
  data: string | undefined,
  edits: readonly StagedCompareEdit[],
): ApplyToUnitResult {
  let next = data ?? '';
  const failedPaths: string[] = [];

  for (const edit of edits) {
    const result = setValueAtPath(next, edit.positionalPath, edit.after, edit.resource);
    if (result.ok) next = result.data;
    else failedPaths.push(edit.positionalPath);
  }

  return failedPaths.length > 0 ? { ok: false, failedPaths } : { ok: true, data: next };
}

/** What happened to one deployment when the user applied. */
export interface DeploymentApplyOutcome {
  deploymentId: string;
  label: string;
  /** The Space name, when `label` is a variant label and so does not already say it. */
  displayName?: string;
  ok: boolean;
  /** Why it did not land, in the user's words. Present only on failure. */
  reason?: string;
}

/**
 * Did the apply land everywhere?
 *
 * A separate question from "did it fail", because with N deployments the
 * interesting answer is usually neither. One apply can write to three Spaces and
 * be refused by two, and a footer that reported that as "apply failed" would be
 * describing an outcome that did not happen — after already having changed
 * production.
 */
export function describeApply(outcomes: readonly DeploymentApplyOutcome[]): {
  applied: DeploymentApplyOutcome[];
  refused: DeploymentApplyOutcome[];
  partial: boolean;
} {
  const applied = outcomes.filter((outcome) => outcome.ok);
  const refused = outcomes.filter((outcome) => !outcome.ok);
  return { applied, refused, partial: applied.length > 0 && refused.length > 0 };
}
