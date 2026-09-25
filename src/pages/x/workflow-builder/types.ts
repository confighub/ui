// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The shapes the builder edits.
 *
 * `Stage` and `CustomPrerequisite` mirror `ChangeWorkflowStage` and the custom
 * prerequisite declarations in `internal/models/changeworkflow.go`, with one
 * addition: a client-side `id`. The server identifies a Stage by its position
 * and its Name, but a Name is the thing being edited, so it cannot also be the
 * key React reconciles on — renaming a Stage would remount its editor and take
 * the caret with it.
 */

/** One wave of a rollout: the variants it covers, and what must hold to enter it. */
export interface Stage {
  id: string;
  /** `ChangeWorkflowStage.Name`. Unique within the workflow. */
  name: string;
  /** `ChangeWorkflowStage.WhereSpace`. A where expression over Spaces. Empty selects every variant. */
  where: string;
  /** `ChangeWorkflowStage.Prerequisites`. Names of built-in or custom checks. */
  prereqs: string[];
}

/**
 * A named cel expression, declared once on the workflow and gated on by name.
 * Anything beyond the three built-in checks takes this shape.
 */
export interface CustomPrerequisite {
  id: string;
  name: string;
  /** Carries a `cel:` prefix, which is what says the value is an expression and not a literal. */
  expression: string;
  description: string;
}

/** The terminal node. Stored as `Final`; called Complete in the interface. */
export interface FinalStage {
  prereqs: string[];
}

export interface Workflow {
  key: string;
  displayName: string;
  slug: string;
  space: string;
  /** The Component label value whose Spaces this workflow's Stages select over. */
  component: string;
  labels: Array<[string, string]>;
  /**
   * How many change orders are being promoted under this definition, or
   * undefined when that could not be counted.
   *
   * ⚠️ UNDEFINED AND ZERO ARE DIFFERENT FACTS. The count is not on the entity --
   * it is counted from the change orders naming this workflow -- so the read can
   * fail while the definition itself reads fine. Zero means none; undefined means
   * nobody counted. Defaulting one to the other states something no one checked.
   */
  governs?: number;
  updated: string;
  age: string;
  stages: Stage[];
  final: FinalStage;
  custom: CustomPrerequisite[];
}

/** A Space in the mock inventory. A Space belongs to exactly one component. */
export interface MockSpace {
  slug: string;
  component: string;
  labels: Record<string, string>;
}

/** The rail's selection. The prerequisites column keeps its own, separately. */
export type Selection = { kind: 'stage'; id: string } | { kind: 'final' } | null;

export type ProblemSeverity = 'problem' | 'note';

/** Where a problem's "Go to it" lands. */
export type ProblemTarget =
  | { kind: 'stage'; id: string }
  | { kind: 'final' }
  | { kind: 'custom'; id: string }
  | null;

export interface Problem {
  sev: ProblemSeverity;
  /** Message text with `code` runs marked up; rendered through a small formatter, never `innerHTML`. */
  msg: MessagePart[];
  go: ProblemTarget;
  /** A custom prerequisite whose expression can be repaired in one click. */
  fix?: string;
}

/** One run of a message: plain prose, or a name set in the mono face. */
export type MessagePart = { text: string; code?: boolean };

/** What the rail tile reads, so the rail and the problem list cannot come to differ. */
export interface StageProblem {
  sev: ProblemSeverity;
  short: string;
  msg: MessagePart[];
}

/** A reorder, described in full, for as long as it is unsaved. */
export interface ReorderNote {
  parts: MoveSentence[];
  /** The two positions, so Undo can put the Stage back. */
  a: number;
  b: number;
}

/** A sentence about a move. `strong` runs are Stage names; `gate` runs are prerequisite names. */
export type MoveSentence = Array<{ text: string; strong?: boolean; gate?: boolean }>;
