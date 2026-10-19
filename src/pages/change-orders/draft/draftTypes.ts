// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The shapes the "create a ChangeOrder" draft's data layer hands the page.
 *
 * Pure types: no React, no RTK, so the browser-free specs can import them.
 */
import type {
  ChangeOrderRead,
  ChangeWorkflowSpec,
  ChangeWorkflowStage,
} from '@confighub/rtk-query';

import type { HistoryPerson } from '../changeOrderHistory';
import type { DraftAddressPatch } from './draftDecisions';

/** Where a read is: nothing is said of a value until it is `resolved`. */
export type DraftReadStatus = 'loading' | 'resolved' | 'failed';

/**
 * Where a value worked out from reads is. `undetermined`: every read it needs is in hand (or
 * none can be made), and the draft still does not say it — no variant in scope to start from,
 * a MergeUnits change, an end that names nothing. "Could not establish", with no retry: asking
 * again would get the same answer.
 */
export type DraftDerivedStatus = DraftReadStatus | 'undetermined';

/** The update types a "Base changes" draft can propagate by. */
export type DraftUpdateType = 'UpgradeUnit' | 'MergeUnits';

/**
 * Where a decision's value came from, for the ledger's provenance icon.
 *
 * - `last`: as the ChangeOrder the draft re-aims had it, or worked out the same way it was.
 * - `policy`: worked out from the Component's policy and the change itself, with no last
 *   ChangeOrder to copy, or where copying it is not allowed any more.
 * - `you`: set on this draft, and different from last time.
 */
export type DraftDecisionOrigin = 'last' | 'policy' | 'you';

export interface DraftDecision<T> {
  value: T;
  origin: DraftDecisionOrigin;
  /** What the last ChangeOrder had. `undefined` when there is none, or it is not comparable. */
  last: T | undefined;
  /** True when `last` is known and `value` is not it: the ledger strikes the left side. */
  differsFromLast: boolean;
}

/** The ledger rows, and the other places a problem can be shown. */
export type DraftRow =
  | 'template'
  | 'what'
  | 'howMuch'
  | 'where'
  | 'path'
  | 'name'
  | 'description'
  | 'same'
  /** Belongs to no row: shown beside Create. */
  | 'create';

/**
 * Something that stops Create, or that the page cannot establish, on the row it belongs to.
 * `message` is user-facing (`draftCopy.ts`, or the server's words for a refusal it made).
 */
export interface DraftProblem {
  row: DraftRow;
  /** Stable, for tests and for the page to pick an icon: `name-taken`, `start-disagrees`, … */
  code: string;
  message: string;
  /** `client`: found before asking the server. `server`: the create dry run refused. */
  source: 'client' | 'server';
  /** True when Create cannot run while this stands. */
  blocks: boolean;
  /** The one-click way out, where there is one: "End at latest", "Leave out". */
  fix?: DraftProblemFix;
}

/** A change to the draft that clears a problem: a button beside it. */
export interface DraftProblemFix {
  /** The button's words (`draftCopy.fixes`). */
  label: string;
  /** What `update` is called with. */
  patch: DraftAddressPatch;
}

/**
 * What a value is worked out from, when that has failed: the value fails with it (never waits
 * for it), and its `retry` asks the failed reads again.
 */
export interface DraftUpstream {
  failed: boolean;
  retry: () => void;
}

/** A variant of the base: a Space of the same Component. */
export interface DraftVariant {
  spaceId: string;
  slug: string;
  /** `DisplayName` when it has one, else the slug. */
  name: string;
  stage: string | undefined;
  region: string | undefined;
}

export interface DraftPolicy {
  /** `Component.AllowedChangeWorkflowIDs`. Empty allows every workflow. */
  allowedWorkflowIds: string[];
  /** `Component.ChangeWorkflowRequired`. */
  required: boolean;
}

/** A ChangeWorkflow the policy allows, with what the draft shows of it. */
export interface DraftWorkflow {
  workflowId: string;
  slug: string;
  name: string;
  /** In promotion order, as the rail and the picker draw them ("dev → staging → prod"). */
  stageNames: string[];
  stages: ChangeWorkflowStage[];
  /** The spec as a ChangeOrder would copy it, for `buildChangeOrderSequence`. */
  spec: ChangeWorkflowSpec;
}

/** A ChangeOrder of the base Space, for the template picker and the ledger's left side. */
export interface DraftPastChangeOrder {
  changeOrderId: string;
  slug: string;
  description: string;
  updateType: string;
  workflowId: string | undefined;
  inScopeSpaceIds: string[];
  /** The Tag its creator supplied as the end, if any (the ChangeSet's end Tag, say). */
  adoptedEndTagId: string | undefined;
  state: string | undefined;
  createdAt: string | undefined;
  author: HistoryPerson;
  /** The whole read, for anything the page needs that is not lifted out above. */
  changeOrder: ChangeOrderRead;
}
