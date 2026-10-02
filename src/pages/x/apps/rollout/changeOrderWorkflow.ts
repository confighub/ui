// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The ChangeWorkflow governing a ChangeOrder, and the clause one of its stages
 * selects Spaces with.
 *
 * A ChangeOrder carries two workflow fields, and they answer different
 * questions:
 *
 *  - `ChangeWorkflow` is a COPY of the workflow's spec, taken when the order
 *    was created and read-only thereafter. It is the rulebook this rollout is
 *    judged by, and it arrives with the order — resolving it costs no request.
 *    Editing the workflow afterwards cannot change what a rollout already under
 *    way is held to.
 *  - `ChangeWorkflowID` names the workflow the copy came from. It is
 *    provenance rather than a reference — no foreign key backs it, so it keeps
 *    naming a workflow that has since been edited or deleted.
 *
 * The copy has no `Slug`, no `DisplayName` and no id of its own. So a screen
 * that DRAWS a rollout's stages reads the copy and needs nothing else; a screen
 * that NAMES the workflow reads the id and looks the entity up, degrading to
 * the raw id when that lookup misses.
 *
 * READING THE COPY IS NOT A JUDGEMENT THIS MODULE MAKES ON ITS OWN.
 * `planPromotion` (`internal/views/promote_plan.go`) reads the same field, and
 * the server is the thing that actually refuses a promotion. A UI gating off a
 * different document than the server gates off would permit what the product
 * forbids, or forbid what it permits.
 */

import type {
  ChangeOrderRead,
  ChangeWorkflowPrerequisite,
  ChangeWorkflowSpec,
  ChangeWorkflowStage,
  ComponentRead,
} from '@confighub/rtk-query';

/**
 * Which of the three things a ChangeOrder can say about its workflow.
 *
 * `governed` with an undefined `changeWorkflowId` is the workflow that cannot
 * be named: its rules are in hand and there is nothing to look a name up by.
 * That is a display limitation, never a reason to withhold the sequence.
 *
 * `unresolved` is the opposite — an id and no copy. Nothing can be drawn from
 * it, and no amount of waiting produces one, because the copy is not fetched.
 */
export type ChangeOrderWorkflow =
  | { state: 'governed'; workflow: ChangeWorkflowSpec; changeWorkflowId: string | undefined }
  | { state: 'unresolved'; changeWorkflowId: string }
  | { state: 'ungoverned' };

const UNGOVERNED: ChangeOrderWorkflow = { state: 'ungoverned' };

/**
 * The governing workflow, read off the ChangeOrder itself.
 *
 * Synchronous and total: every answer is available from the order in hand, so
 * there is no loading state to render and no request to skip. A ChangeOrder
 * that has not arrived is `ungoverned` the same way one that names no workflow
 * is — the caller distinguishes them by whether it has an order at all.
 */
export function changeOrderWorkflow(order: ChangeOrderRead | undefined): ChangeOrderWorkflow {
  const changeWorkflowId =
    order?.ChangeWorkflowID !== undefined && order.ChangeWorkflowID !== null && order.ChangeWorkflowID !== ''
      ? order.ChangeWorkflowID
      : undefined;

  const frozen = order?.ChangeWorkflow;
  /*
   * ⚠️ `Stages` IS NOT GUARANTEED, WHATEVER THE GENERATED TYPE SAYS.
   *
   * `internal/models/changeworkflow.go` tags it `json:",omitempty"`, so a
   * ChangeWorkflow holding an empty slice serialises with the field absent
   * while the generated TS declares it required. Every reader downstream
   * dereferences it on that promise — `buildConsoleRow` does so per row inside
   * a `useMemo` during render, where one such ChangeOrder throws and takes the
   * fleet console down for every unrelated rollout on it.
   *
   * A frozen copy naming no stage describes no sequence, so it is not a
   * governed workflow: it is one that has not resolved, which callers already
   * render as such and can retry.
   */
  if (frozen?.Stages === undefined || frozen.Stages.length === 0) {
    return changeWorkflowId === undefined ? UNGOVERNED : { state: 'unresolved', changeWorkflowId };
  }
  return { state: 'governed', workflow: frozen, changeWorkflowId };
}

/**
 * The gates a stage may name without the workflow declaring them.
 *
 * ONE HOME FOR THESE LITERALS. The generated client carries no constant for
 * them — they are Go constants (`internal/models/changeworkflow.go`) that no
 * schema exposes — so a UI-side literal is unavoidable; what is avoidable is
 * having several. They are CAPITALISED, and the spelling is the whole of the
 * check: a build matching `released` matches nothing a server now sends, and
 * matches it silently.
 */
export const BUILT_IN_PREREQUISITES = {
  released: 'Released',
  healthy: 'Healthy',
  validated: 'Validated',
} as const;

/** What a prerequisite named on a stage turns out to be. */
export type PrerequisiteKind =
  /** One of the checks the server knows by name, without the workflow declaring it. */
  | { kind: 'built-in'; name: 'Released' | 'Healthy' | 'Validated' }
  /**
   * A check the workflow declared, carrying a CEL expression. `ui/` has no CEL
   * evaluator, so this is reported and never evaluated — never as passing, and
   * never as failing.
   */
  | { kind: 'custom'; name: string; description?: string }
  /** Named by neither, which is a workflow this build cannot fully read. */
  | { kind: 'unrecognised'; name: string };

/**
 * What a named prerequisite is — a CLASSIFIER, not an allowlist.
 *
 * The distinction is the whole point. An allowlist answers "may this name be
 * used", and the answer for a custom prerequisite would be no; a classifier
 * answers "what kind of thing is this", and a custom one is a real declaration
 * that simply cannot be evaluated here. Deciding that once, in one place, is
 * what stops a custom prerequisite from being rendered as a failure.
 */
export function classifyPrerequisite(
  name: string,
  customPrerequisites: readonly ChangeWorkflowPrerequisite[] | undefined,
): PrerequisiteKind {
  if (
    name === BUILT_IN_PREREQUISITES.released ||
    name === BUILT_IN_PREREQUISITES.healthy ||
    name === BUILT_IN_PREREQUISITES.validated
  ) {
    return { kind: 'built-in', name };
  }
  const declared = customPrerequisites?.find((custom) => custom.Name === name);
  if (declared !== undefined) {
    return { kind: 'custom', name, description: declared.Description };
  }
  return { kind: 'unrecognised', name };
}

/**
 * A stage that names no selector at all.
 *
 * An empty `WhereSpace` is a DECLARATION, not an omission: it selects every
 * Space of the change order's component. Reading it as "match nothing" is the
 * quiet way to get this wrong — the stage draws as empty, the rollout looks
 * mis-configured, and no error is reported anywhere.
 *
 * Whitespace counts as empty. A selector of spaces is not a predicate, and a
 * clause built from one is a syntax error rather than a stage.
 */
export function stageSelectsWholeComponent(stage: ChangeWorkflowStage): boolean {
  return (stage.WhereSpace ?? '').trim() === '';
}

/** Every Space of a component, as a `where` clause. */
export function componentWhereSpace(component: ComponentRead): string {
  return `ComponentID = '${component.ComponentID}'`;
}

/**
 * The `where` clause that selects one stage's Spaces: the stage's own selector
 * conjoined with the component the ChangeOrder is for, or the component alone
 * where the stage names no selector.
 *
 * Mirrors `stageWhereSpace` in `public/cmd/cub/variant_promote.go`, so the
 * console, the rollout detail page and `cub variant promote` resolve a stage to
 * the same Spaces. The component is declared once, by the change being promoted, which
 * is what lets one workflow govern another component's rollouts unchanged —
 * and why a stage naming `Labels.Component` itself is refused when the workflow
 * is written (`validateStageWhereSpace`, `internal/views/changeworkflow.go`).
 *
 * THE EMPTY BRANCH LIVES HERE AND NOWHERE ELSE. Four call sites build this
 * clause; a branch repeated at each of them is three chances for one of them to
 * keep reading an empty selector as a refusal.
 */
export function stageWhereSpace(stage: ChangeWorkflowStage, component: ComponentRead): string {
  const componentTerm = componentWhereSpace(component);
  return stageSelectsWholeComponent(stage) ? componentTerm : `${stage.WhereSpace} AND ${componentTerm}`;
}
