// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Field diagnosis: what the details and the row card draw for one field. Tokens, not prose
// (PLAN.md R2): each fact is one short token, and what a token means is in its tooltip.
// The shape is the one the approved spike draws (commit 951538b, fieldViewModel.ts), with the
// state and staleness of ARCHITECTURE.md §5.
import type { BlameField, BlameOrigin, BlamePathChange, MutationConflict } from '@confighub/rtk-query';

// ---------------------------------------------------------------------------
// References: every token that names another thing is a FieldRef. Views never build hrefs;
// a link resolver of the host turns a ref into an href (PLAN.md U4).
// ---------------------------------------------------------------------------

/** What every reference has: its token, and the lines of its peek when they are known here. */
interface RefBase {
  label: string;
  /** The peek's lines, first one the title. A Unit's peek reads its own (it names a value there). */
  peek?: string[];
}

/** A Unit, optionally at a field of it (the same field as this one when `field` is unset). */
export interface UnitRef extends RefBase {
  kind: 'unit';
  spaceId?: string;
  unitId?: string;
  /** The field in that Unit when it is not this field's path (a Link's provided field). */
  field?: string;
  /** `ResourceType|ResourceName` of that field, when it is not this field's resource. */
  fres?: string;
}

export interface RevisionRef extends RefBase {
  kind: 'revision';
  spaceId?: string;
  unitId?: string;
  num: number;
}

/** A gate: the Trigger that validates the Unit. */
export interface GateRef extends RefBase {
  kind: 'gate';
  triggerId?: string;
  /** The recorded gate name, `Space/Trigger/function`. */
  gate?: string;
}

/** A Link that sets the field (NeedsProvides). */
export interface LinkRef extends RefBase {
  kind: 'link';
  name: string;
  linkId?: string;
  /** The Unit that provides the value. */
  providerUnitId?: string;
  /** The Space of the Link (its downstream Unit's Space). */
  spaceId?: string;
  /** The attribute the Link reads, for example `resource-name`. */
  attribute?: string;
  /** The provided resource's type, when the Link names it. */
  resourceType?: string;
}

/** A person. Plain text with a peek; never a link. */
export interface UserRef extends RefBase {
  kind: 'user';
  user?: string;
}

export interface ChangeOrderRef extends RefBase {
  kind: 'changeOrder';
  /** The ChangeOrder's Space slug, when its name says it (`space/slug`). */
  space?: string;
  slug: string;
}

export type FieldRef = UnitRef | RevisionRef | GateRef | LinkRef | UserRef | ChangeOrderRef;

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/** error > loading > absent > deleted > resource (empty Path) > ready (ARCHITECTURE §8). */
export type FieldState = 'loading' | 'error' | 'ready' | 'absent' | 'deleted' | 'resource';

export type NeedTone = 'block' | 'wait' | 'warn';

export type NeedKind = 'gate' | 'finding' | 'conflict' | 'upgrade' | 'warning';

/** One part of a need's text: plain text, or a token that names something. */
export type NeedPart = string | FieldRef;

/** A "needs you" line: something waits or blocks. */
export interface FieldNeed {
  kind: NeedKind;
  /** Unique among the needs of one field. */
  key: string;
  tone: NeedTone;
  parts: NeedPart[];
  /** The parts as one string. */
  text: string;
  /** What the line means, for its tooltip. */
  meaning: string;
  /** The action's label; the first need's action is the one contained button. */
  action?: string;
  secondary?: string;
  /** The withheld change, for Apply and Dismiss. */
  conflict?: MutationConflict;
  triggerId?: string;
}

export type GuardKind = 'override' | 'link' | 'trigger' | 'requirement';

/** One guard on the field: whether an edit and a merge go through. */
export interface FieldGuard {
  key: string;
  value: string;
  kind: GuardKind;
  inherited: boolean;
  edits: boolean;
  merges: boolean;
  meaning: string;
}

/** One Unit the value came through. `this` is the Unit open in the pane. */
export interface ChainHop {
  label: string;
  this?: boolean;
  ref?: UnitRef;
}

/** Who set the value, when, and why. */
export interface FieldSetBy {
  /** "admin", "automation" or "Link web-to-ns". */
  who: string;
  whoRef: UserRef | LinkRef;
  /** "2h ago", or "—" when the record has no time. */
  when: string;
  whenRef?: RevisionRef;
  /** The author's words, never the server's own text. */
  reason?: string;
  changeOrder?: ChangeOrderRef;
}

export interface FieldHistoryEntry {
  value: string;
  who: string;
  when: string;
  reason?: string;
  revisionNum?: number;
  /** The revision that set this value: a link to it. */
  revision?: RevisionRef;
  /** The function or Link that set it ("set-replicas", "Link web-to-ns"); a merge names none. */
  setBy?: string;
  /** The value is the field's value now. */
  current: boolean;
}

/** An attribute this field provides to Links ("Used by"). */
export interface FieldProvided {
  attribute: string;
  resourceType?: string;
}

export interface FieldView {
  state: FieldState;
  /** The data is being refetched; draw it dimmed, never blank. */
  stale: boolean;
  /** The server's path of the field. */
  path: string;
  ref?: string;
  resourceType?: string;
  resourceName?: string;
  value: string;
  /** The pane's unsaved value, when it differs from the saved one. */
  pending?: string;
  setBy?: FieldSetBy;
  /** The Units the value came through, oldest first, ending with this Unit. Absent when it was set here. */
  chain?: ChainHop[];
  needs: FieldNeed[];
  guards: FieldGuard[];
  history: FieldHistoryEntry[];
  provided: FieldProvided[];
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** What an adapter hands to explainField: the same shape from the blame and the path report. */
export interface FieldFacts {
  source: 'blame' | 'path';
  field: BlameField;
  /** The changes that brought the value here, newest first: this Unit's change, then upstream. */
  hops: BlameOrigin[];
  /** Only from a path report read with `history: true`. */
  history?: BlamePathChange[];
}

/** What the host knows beyond the field's own record. */
export interface ExplainContext {
  /** Milliseconds since the epoch; defaults to the clock. Tests pin it. */
  now?: number;
  loading?: boolean;
  error?: unknown;
  stale?: boolean;
  /** The pane's unsaved value of this field. */
  pending?: string;
  /**
   * The Unit's upstream. The revision of a withheld change is the Unit's UpstreamRevisionNum
   * when the change came from this upstream Unit (D4: MutationConflict carries no revision).
   */
  upstream?: { spaceId?: string; unitId?: string; revisionNum?: number; label?: string };
  /** The upstream Unit holds a newer value of this field (an Upgrade waits). */
  incomingUpgrade?: { value: string; revisionNum: number; spaceId?: string; unitId?: string };
}
