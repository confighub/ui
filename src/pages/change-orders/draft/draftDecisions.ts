// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The draft's decisions: what the URL says, and what each decision is once the URL's
 * silences are filled from the last ChangeOrder and the Component's policy.
 *
 * THE URL IS THE WHOLE DRAFT, AND IT HOLDS ONLY WHAT WAS DECIDED. A parameter that is
 * absent takes its default, worked out here, every render, from the last ChangeOrder and
 * the policy. So a draft opened from a shared link shows what its author chose and, for
 * everything they left alone, what last time and the policy say now — never a copy of
 * what they said when the link was made. Slugs only: an id in a URL names nothing to the
 * person reading it.
 *
 * Pure: no React, no router, so the browser-free specs can import it.
 */
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@confighub/api';
import type { ChangeOrder } from '@confighub/rtk-query';

import { SOURCE_STAGE_ID } from '../../x/apps/change-order/changeOrderStages';
import { COMPLETE_STAGE_ID } from '../changeOrderCompleteStep';
import type { ImageChanges } from '../imageChange';
import { isFanOutType } from './draftFanOut';
import { draftCopy } from './draftCopy';
import {
  DRAFT_KINDS,
  DRAFT_KIND_WORDS,
  type DraftKind,
  draftKindOfWord,
} from './draftKinds';
import {
  DRAFT_UPDATE_TYPES,
  defaultUpdateType,
  updateTypeAvailability,
  type DraftLinkedSpaces,
  type DraftUpdateTypeAvailabilities,
} from './draftUpdateTypes';
import type {
  DraftDecision,
  DraftPastChangeOrder,
  DraftPolicy,
  DraftProblem,
  DraftProblemFix,
  DraftUpdateType,
  DraftVariant,
  DraftWorkflow,
} from './draftTypes';

/** `end=head`: each Unit's head. A ChangeSet slug ends at that ChangeSet's end Tag instead. */
export const DRAFT_END_HEAD = 'head';

/**
 * `from=-` and `wf=-`: no last ChangeOrder, and no workflow. `-` cannot be a slug (a slug
 * starts with a letter or a digit), so it cannot shadow a ChangeOrder or a workflow.
 */
export const DRAFT_NONE = '-';

export { DRAFT_UPDATE_TYPES } from './draftUpdateTypes';

/** The search parameters, by the name the URL uses. */
export const DRAFT_PARAMS = {
  space: 'space',
  from: 'from',
  end: 'end',
  stage: 'stage',
  name: 'name',
  desc: 'desc',
  wf: 'wf',
  out: 'out',
  update: 'update',
  kind: 'kind',
  fn: 'fn',
  inv: 'inv',
  img: 'img',
  via: 'via',
  until: 'until',
  container: 'container',
  tag: 'tag',
  where: 'where',
} as const;

/** An Invoke draft's argument values ride in the URL as `p.<name>=<value>`. */
export const DRAFT_PARAM_PREFIX = 'p.';

/**
 * What the URL says, and nothing else. `undefined` is "not decided": the default applies.
 * `name` and `desc` can be `''`, which is decided (the field was cleared). `out` is `[]`
 * when present and empty, which is decided too: every variant, where absent is "as last
 * time".
 */
export interface DraftAddress {
  /** The base Space's slug. */
  space?: string;
  /** The last ChangeOrder's slug, or `DRAFT_NONE` for the policy alone. */
  from?: string;
  /** `DRAFT_END_HEAD` or a closed ChangeSet's slug. */
  end?: string;
  /**
   * The node selected on the promotion path, as the URL writes it: a stage's name, or
   * `DRAFT_STAGE_WORDS.source` / `.complete` for the source node and the Complete step. A view,
   * not a decision. `DraftDecisions.stage` is the node's id.
   */
  stage?: string;
  name?: string;
  desc?: string;
  /** The workflow's slug, or `DRAFT_NONE`. */
  wf?: string;
  /** Slugs of the variants left out. */
  out?: string[];
  /** The value as written; `resolveDraftDecisions` refuses one that is not an update type. */
  update?: string;
  /**
   * The kind of change, by its word (`DRAFT_KIND_WORDS`): `invoke`, `transform`. `image` (Invoke
   * on the image function) and `value` are read too. Absent: as the template.
   */
  kind?: string;
  /** An Invoke draft's function, typed inline: `set-label`. */
  fn?: string;
  /** An Invoke draft's saved Invocation, as `<space>/<slug>`. Wins over `fn`. */
  inv?: string;
  /**
   * What an Invoke draft runs, as a link written for the image tag kind says it: a saved
   * Invocation as `<space>/<slug>`, or the image function by its name. `inv` and `fn` win.
   */
  img?: string;
  /** The image function's container. */
  container?: string;
  /** The image function's new image tag. `''` is decided: the field was cleared. */
  tag?: string;
  /** An Invoke draft's Unit selection (`WhereUnit`), when it is not the default. `''` is every Unit. */
  where?: string;
  /** A Transform paths draft's update type: `TransformPaths`, `Upsert` or `Insert`. */
  via?: string;
  /** A Transform paths draft's end: a closed ChangeSet in a source's Space, by slug. Absent: the head. */
  until?: string;
  /** An Invoke draft's argument values, by argument or parameter name (`p.<name>`). */
  params?: Record<string, string>;
}

/** A change to the address. `null` removes the parameter, which returns it to its default. */
export type DraftAddressPatch = { [K in Exclude<keyof DraftAddress, 'params'>]?: DraftAddress[K] | null } & {
  /**
   * Argument values, merged into the URL's by name: a name given `null` is removed. `null` for
   * the whole removes them all. Merged, not replaced, so that two inputs typed in one after the
   * other each keep their value whatever render the second was typed in.
   */
  params?: Record<string, string | null> | null;
};

/**
 * The fields each kind of change owns. They sit in the URL side by side: a kind reads only its
 * own, so switching kind and back finds what was typed for it still there.
 */
export const KIND_FIELDS: Readonly<Record<DraftKind, readonly (keyof DraftAddress)[]>> = {
  baseChanges: ['end', 'update'],
  invoke: ['fn', 'inv', 'img', 'container', 'tag', 'where', 'params'],
  transformPaths: ['via', 'until'],
};

/** Every field any kind decided, with the template: what starting over clears. */
export const KIND_FIELDS_CLEARED: DraftAddressPatch = {
  from: null,
  end: null,
  update: null,
  fn: null,
  inv: null,
  img: null,
  via: null,
  until: null,
  container: null,
  tag: null,
  where: null,
  params: null,
};

/**
 * Whether a workflow can govern a kind of change: an Invoke or fan-out one cannot start in a gated
 * first stage (the server refuses it).
 */
export const workflowGovernsKind = (workflow: DraftWorkflow, kind: DraftKind) =>
  kind === 'baseChanges' || (workflow.stages[0]?.Prerequisites ?? []).length === 0;

/**
 * What choosing another kind writes. The kind re-aims its own newest ChangeOrder (or the policy),
 * so the template goes; every kind's typed fields stay where they are. A workflow the reader has
 * is kept when the kind's template names none and the kind can use it, rather than lost to the
 * policy's default.
 */
export function kindSwitchPatch(input: { next: DraftKind; address: DraftAddress; decisions: DraftDecisions }): DraftAddressPatch {
  const { next, address, decisions } = input;
  const patch: DraftAddressPatch = { kind: DRAFT_KIND_WORDS[next], from: null };
  const current = decisions.workflow.value;
  const template = decisions.kindTemplates[next];
  if (address.wf === undefined && template === undefined && current.kind === 'workflow' && workflowGovernsKind(current.workflow, next))
    patch.wf = current.workflow.slug;
  return patch;
}

/** Where the draft page is routed. */
export const DRAFT_ROUTE = '/change-orders/new';

/** What the URL calls the source node and the Complete step: plain words, not synthetic ids. */
export const DRAFT_STAGE_WORDS = { source: 'source', complete: 'complete' } as const;

/**
 * The node a URL's `stage` names, among a workflow's stages: the stage of that name; else the
 * source node or the Complete step for their words. A workflow stage of the same name as a word
 * is the one meant. The synthetic ids are read too, so a link written before still opens its
 * node. `undefined` when it names no node of this path.
 */
export function draftStageIdOf(
  param: string | undefined,
  stageNames: readonly string[],
): string | undefined {
  if (param === undefined) return undefined;
  if (stageNames.includes(param)) return param;
  if (param === DRAFT_STAGE_WORDS.source || param === SOURCE_STAGE_ID) return SOURCE_STAGE_ID;
  if (param === DRAFT_STAGE_WORDS.complete || param === COMPLETE_STAGE_ID)
    return COMPLETE_STAGE_ID;
  return undefined;
}

/**
 * The URL's word for a node: the inverse of `draftStageIdOf`. A synthetic node whose word a
 * workflow stage has taken keeps its id, which reads back as itself.
 */
export function draftStageParamOf(stageId: string, stageNames: readonly string[]): string {
  if (stageId === SOURCE_STAGE_ID && !stageNames.includes(DRAFT_STAGE_WORDS.source))
    return DRAFT_STAGE_WORDS.source;
  if (stageId === COMPLETE_STAGE_ID && !stageNames.includes(DRAFT_STAGE_WORDS.complete))
    return DRAFT_STAGE_WORDS.complete;
  return stageId;
}

/**
 * A link to a draft: `draftHref({ space: 'payments-base' })` for "New ChangeOrder",
 * `draftHref({ space, from: slug })` for "Re-aim".
 */
export function draftHref(address: DraftAddress): string {
  const search = applyDraftAddressPatch(new URLSearchParams(), address).toString();
  return search === '' ? DRAFT_ROUTE : `${DRAFT_ROUTE}?${search}`;
}

/** The order parameters are written in, so a URL reads the same however it was built. */
const PARAM_ORDER: (keyof DraftAddress)[] = [
  'space',
  'from',
  'kind',
  'end',
  'stage',
  'name',
  'desc',
  'wf',
  'out',
  'update',
  'fn',
  'inv',
  'img',
  'via',
  'until',
  'container',
  'tag',
  'where',
  'params',
];

/** Parameters whose empty value is a decision, not an absence. */
const KEEPS_EMPTY: ReadonlySet<keyof DraftAddress> = new Set(['name', 'desc', 'tag', 'where']);

/** Whether a search parameter is the draft's own. */
const isDraftKey = (key: string) =>
  key.startsWith(DRAFT_PARAM_PREFIX) || (PARAM_ORDER as string[]).includes(key);

/** Read the draft from a URL's search parameters. */
export function parseDraftAddress(params: URLSearchParams): DraftAddress {
  const address: DraftAddress = {};
  for (const key of PARAM_ORDER) {
    if (key === 'params') {
      const values: Record<string, string> = {};
      for (const [name, value] of params)
        if (name.startsWith(DRAFT_PARAM_PREFIX) && name.length > DRAFT_PARAM_PREFIX.length) values[name.slice(DRAFT_PARAM_PREFIX.length)] = value;
      if (Object.keys(values).length > 0) address.params = values;
      continue;
    }
    if (!params.has(key)) continue;
    const raw = params.get(key) ?? '';
    if (key === 'out') {
      address.out = raw
        .split(',')
        .map((slug) => slug.trim())
        .filter((slug) => slug !== '');
      continue;
    }
    if (KEEPS_EMPTY.has(key)) {
      (address as Record<string, string>)[key] = key === 'name' || key === 'desc' ? raw : raw.trim();
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed !== '') (address as Record<string, string>)[key] = trimmed;
  }
  return address;
}

/**
 * The search parameters after `patch`. Parameters the draft does not own are kept where they
 * are, so a parameter something else put on the URL survives an edit of the draft.
 */
export function applyDraftAddressPatch(
  previous: URLSearchParams,
  patch: DraftAddressPatch,
): URLSearchParams {
  const address = { ...parseDraftAddress(previous) };
  for (const key of PARAM_ORDER) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === null || value === undefined) {
      delete address[key];
    } else if (key === 'out') {
      address.out = [...(value as string[])];
    } else if (key === 'params') {
      const merged: Record<string, string> = { ...(address.params ?? {}) };
      for (const [name, text] of Object.entries(value as Record<string, string | null>)) {
        if (text === null) delete merged[name];
        else merged[name] = text;
      }
      if (Object.keys(merged).length === 0) delete address.params;
      else address.params = merged;
    } else {
      (address as Record<string, string>)[key] = value as string;
    }
  }
  const next = new URLSearchParams();
  for (const [key, value] of previous) {
    if (!isDraftKey(key)) next.append(key, value);
  }
  for (const key of PARAM_ORDER) {
    const value = address[key];
    if (value === undefined) continue;
    if (key === 'params') {
      for (const [name, text] of Object.entries(value as Record<string, string>)) next.set(`${DRAFT_PARAM_PREFIX}${name}`, text);
      continue;
    }
    next.set(key, Array.isArray(value) ? value.join(',') : (value as string));
  }
  return next;
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

const DATE_IN_SLUG = /\d{4}-\d{2}-\d{2}/;

/** `YYYY-MM-DD` of a date, in the reader's own time zone. */
export function localDateStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A name for the new ChangeOrder: the last one's, with its date moved to today
 * (`payments-2026-10-09` on 18 Oct is `payments-2026-10-18`), or `<component>-<today>` when
 * there is no last one or its name holds no date. A name the Space already has gets `-2`,
 * `-3`, … so the suggestion is never one the server would refuse.
 */
export function suggestDraftName(input: {
  lastSlug: string | undefined;
  /** The Component's slug, or the base Space's when it has none. */
  stem: string;
  today: string;
  taken: ReadonlySet<string>;
}): string {
  const { lastSlug, stem, today, taken } = input;
  const base =
    lastSlug !== undefined && DATE_IN_SLUG.test(lastSlug)
      ? lastSlug.replace(DATE_IN_SLUG, today)
      : `${stem}-${today}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** `v1.30.4` reads `1.30.4` in a description, as the last one wrote it. */
const withoutVPrefix = (tag: string) => (/^v\d/.test(tag) ? tag.slice(1) : tag);

/**
 * A description from the image tags the change moves to, in the last ChangeOrder's style:
 * the first image's tag bare, each further tag with its container's name
 * (`1.15.0 + envoy 1.30.4`). `undefined` when the change moves no image tag, or its image
 * changes cannot be read yet: a description is not made up out of nothing.
 */
export function suggestDraftDescription(imageChanges: ImageChanges): string | undefined {
  if (imageChanges.status !== 'some') return undefined;
  const parts: string[] = [];
  const seenTags = new Set<string>();
  for (const image of imageChanges.images) {
    const tag = image.to.tag ?? image.to.digest;
    if (tag === undefined || seenTags.has(tag)) continue;
    seenTags.add(tag);
    parts.push(
      parts.length === 0
        ? withoutVPrefix(tag)
        : `${image.containerName} ${withoutVPrefix(tag)}`,
    );
  }
  return parts.length > 0 ? parts.join(' + ') : undefined;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/** The ChangeOrder the draft re-aims, or none. */
export type DraftTemplate =
  | { kind: 'changeOrder'; changeOrder: DraftPastChangeOrder }
  /** No last ChangeOrder: everything comes from the policy. */
  | { kind: 'policy' };

/** Where the change ends, as decided: before it is resolved against the base's ChangeSets. */
export type DraftEndChoice = { kind: 'head' } | { kind: 'changeSet'; slug: string };

/** The governing workflow, as decided. */
export type DraftWorkflowChoice =
  | { kind: 'workflow'; workflow: DraftWorkflow }
  /** Ungoverned, which only a Component that does not require a workflow allows. */
  | { kind: 'none' }
  /** Nothing chosen, and nothing to default to: Create waits for a pick. */
  | { kind: 'unset' };

export interface DraftDecisions {
  template: DraftTemplate;
  /** The kind of change. Last time's is the kind of the ChangeOrder re-aimed; none from the policy. */
  kind: DraftDecision<DraftKind>;
  /** The newest ChangeOrder of each kind: what choosing that kind re-aims, or the policy. */
  kindTemplates: Readonly<Record<DraftKind, DraftPastChangeOrder | undefined>>;
  name: DraftDecision<string>;
  description: DraftDecision<string>;
  workflow: DraftDecision<DraftWorkflowChoice>;
  end: DraftDecision<DraftEndChoice>;
  /** In-scope variant Space ids, in the variants' order. */
  scope: DraftDecision<string[]>;
  /** The variants out of scope, by slug, as `out=` would name them. */
  leftOut: string[];
  updateType: DraftDecision<DraftUpdateType>;
  /** Whether each update type's Links reach the scope: what the sub bar offers. */
  updateTypes: DraftUpdateTypeAvailabilities;
  /**
   * The node the URL selects on the path, as an id (`draftStageIdOf`): a stage's name,
   * `SOURCE_STAGE_ID` or `COMPLETE_STAGE_ID`. `undefined` when the URL names none, or names a
   * node this path does not have. A view: never part of what is created.
   */
  stage: string | undefined;
  /** What the URL says that names nothing, or that the policy does not allow. */
  problems: DraftProblem[];
}

export interface ResolveDraftDecisionsInput {
  address: DraftAddress;
  /** The Component's slug, for names and messages. */
  componentSlug: string | undefined;
  baseSpaceSlug: string;
  /** The base Space's ChangeOrders, newest first. */
  pastChangeOrders: readonly DraftPastChangeOrder[];
  variants: readonly DraftVariant[];
  /** The workflows the policy allows (all of them, when it names none). */
  workflows: readonly DraftWorkflow[];
  policy: DraftPolicy;
  /** `localDateStamp(new Date())`, passed in so this stays pure. */
  today: string;
  /** The variants each update type's Links reach from the base. `undefined` while that is not known. */
  linkedSpaces?: DraftLinkedSpaces;
}

/**
 * The kind of change a past ChangeOrder made, by its update type: Base changes for UpgradeUnit and
 * MergeUnits, Invoke for Invoke (whatever function it ran), Transform paths for a fan-out type.
 * `undefined` for one no draft can re-aim.
 */
export const kindOfPast = (order: DraftPastChangeOrder): DraftKind | undefined => {
  if (isDraftUpdateType(order.updateType)) return 'baseChanges';
  if (order.updateType === 'Invoke') return 'invoke';
  return isFanOutType(order.updateType) ? 'transformPaths' : undefined;
};

const isDraftUpdateType = (value: string | undefined): value is DraftUpdateType =>
  value !== undefined && (DRAFT_UPDATE_TYPES as readonly string[]).includes(value);

/** States in which a ChangeOrder was given up on, which a new one is not modelled on by default. */
const ABANDONED_STATES: ReadonlySet<string> = new Set([
  'Aborted',
  'Restored',
  'RestoreReleased',
]);

/**
 * The template a draft opens on: the newest ChangeOrder that propagated over Links and was not
 * given up on. One that was can still be picked; it is only not the default.
 */
export const isDefaultTemplate = (order: DraftPastChangeOrder) =>
  isDraftUpdateType(order.updateType) && !isAbandoned(order);

/** Given up on: aborted or restored. Such a ChangeOrder can still be picked, but is no default. */
export const isAbandoned = (order: DraftPastChangeOrder) =>
  ABANDONED_STATES.has(order.state ?? '') || (order.changeOrder.AbortedReason ?? '') !== '';

/**
 * A ChangeOrder a draft opens on by default, of any kind: one that carried base changes over
 * Links, or ran an Invocation, and was not given up on. "The last ChangeOrder" means this one,
 * here and in New ChangeOrder's picker.
 */
export const isReAimable = (order: DraftPastChangeOrder) =>
  (isDraftUpdateType(order.updateType) || order.updateType === 'Invoke' || isFanOutType(order.updateType)) && !isAbandoned(order);

function decision<T>(
  value: T,
  last: T | undefined,
  same: (a: T, b: T) => boolean = Object.is,
): DraftDecision<T> {
  return { value, last, differsFromLast: last !== undefined && !same(value, last) };
}

const sameIds = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
};

const sameWorkflow = (a: DraftWorkflowChoice, b: DraftWorkflowChoice) =>
  a.kind === b.kind &&
  (a.kind !== 'workflow' ||
    (b.kind === 'workflow' && a.workflow.workflowId === b.workflow.workflowId));

/**
 * Every decision of the draft, with what the last ChangeOrder had beside it.
 *
 * Defaults, in the order the summary card reads them:
 * - Template: the newest ChangeOrder of the base that propagated over Links.
 * - Workflow: the template's, while the policy still allows it; otherwise the only one the
 *   policy allows; otherwise none where none is allowed, and nothing where a workflow is
 *   required (the policy names no default, so none is invented).
 * - End: each Unit's head. A ChangeSet is an end only when picked.
 * - Scope: the template's variants that still exist; every variant without a template.
 * - Update type: the template's.
 * - Name: the template's with today's date, unique in the Space.
 * - Description: from the image tags the change moves to.
 */
export function resolveDraftDecisions(input: ResolveDraftDecisionsInput): DraftDecisions {
  const {
    address,
    componentSlug,
    baseSpaceSlug,
    pastChangeOrders,
    variants,
    workflows,
    policy,
    today,
    linkedSpaces,
  } = input;
  const kindOf = kindOfPast;
  const problems: DraftProblem[] = [];
  const problem = (
    row: DraftProblem['row'],
    code: string,
    message: string,
    blocks = true,
    fix?: DraftProblemFix,
  ) => problems.push({ row, code, message, source: 'client', blocks, fix });

  // Kind, and the template: the newest ChangeOrder of the kind, unless the URL names one.
  const newestOf = (kind: DraftKind | undefined) =>
    pastChangeOrders.find((order) => {
      const its = kindOf(order);
      return its !== undefined && !isAbandoned(order) && (kind === undefined || its === kind);
    });
  const kindTemplates = Object.fromEntries(DRAFT_KINDS.map((kind) => [kind, newestOf(kind)])) as Record<
    DraftKind,
    DraftPastChangeOrder | undefined
  >;
  const newest = newestOf(undefined);
  const addressKind = draftKindOfWord(address.kind);
  if (address.kind !== undefined && addressKind === undefined)
    problem('what', 'kind-unknown', draftCopy.problems.kindUnknown(address.kind), false, {
      label: draftCopy.fixes.defaultKind,
      patch: { kind: null },
    });
  let template: DraftTemplate = { kind: 'policy' };
  if (address.from === undefined) {
    const chosen = addressKind === undefined ? newest : kindTemplates[addressKind];
    if (chosen !== undefined) template = { kind: 'changeOrder', changeOrder: chosen };
  } else if (address.from !== DRAFT_NONE) {
    const named = pastChangeOrders.find((order) => order.slug === address.from);
    if (named === undefined)
      problem(
        'template',
        'template-not-found',
        draftCopy.problems.templateNotFound(address.from),
        false,
        { label: draftCopy.fixes.lastChangeOrder, patch: { from: null } },
      );
    else template = { kind: 'changeOrder', changeOrder: named };
  }
  const last = template.kind === 'changeOrder' ? template.changeOrder : undefined;
  const lastKind = last === undefined ? undefined : kindOf(last);
  const kindValue: DraftKind = addressKind ?? lastKind ?? 'baseChanges';
  const kind = decision(kindValue, lastKind);
  // Only Base changes chooses between UpgradeUnit and MergeUnits.
  const invoke = kindValue !== 'baseChanges';

  // Workflow.
  const workflowById = new Map(workflows.map((workflow) => [workflow.workflowId, workflow]));
  const lastWorkflow: DraftWorkflowChoice | undefined =
    last === undefined
      ? undefined
      : last.workflowId === undefined
        ? { kind: 'none' }
        : workflowById.has(last.workflowId)
          ? { kind: 'workflow', workflow: workflowById.get(last.workflowId) as DraftWorkflow }
          : undefined;
  let workflowValue: DraftWorkflowChoice;
  if (address.wf === DRAFT_NONE) {
    workflowValue = { kind: 'none' };
  } else if (address.wf !== undefined) {
    const matches = workflows.filter((workflow) => workflow.slug === address.wf);
    if (matches.length === 1) {
      workflowValue = { kind: 'workflow', workflow: matches[0] };
    } else {
      workflowValue = { kind: 'unset' };
      // Only the workflows the policy allows are listed, so a slug that names none of them is
      // not allowed here, whether or not a workflow of that name exists.
      problem(
        'path',
        'workflow-not-allowed',
        draftCopy.problems.workflowNotAllowed(address.wf),
        true,
        { label: draftCopy.fixes.defaultWorkflow, patch: { wf: null } },
      );
    }
  } else if (
    lastWorkflow !== undefined &&
    !(lastWorkflow.kind === 'none' && policy.required)
  ) {
    workflowValue = lastWorkflow;
  } else if (
    workflows.length === 1 &&
    (policy.allowedWorkflowIds.length > 0 || policy.required)
  ) {
    workflowValue = { kind: 'workflow', workflow: workflows[0] };
  } else {
    workflowValue = policy.required ? { kind: 'unset' } : { kind: 'none' };
  }
  if (workflowValue.kind === 'none' && policy.required) {
    problem(
      'path',
      'workflow-required',
      draftCopy.problems.workflowRequired(componentSlug ?? baseSpaceSlug),
    );
  } else if (workflowValue.kind === 'unset' && problems.every((p) => p.row !== 'path')) {
    problem('path', 'workflow-unset', draftCopy.problems.workflowUnset);
  }
  const workflow = decision(workflowValue, lastWorkflow, sameWorkflow);

  // End.
  const endValue: DraftEndChoice =
    address.end === undefined || address.end === DRAFT_END_HEAD
      ? { kind: 'head' }
      : { kind: 'changeSet', slug: address.end };
  const end: DraftDecision<DraftEndChoice> = {
    value: endValue,
    // Last time's end was a boundary of a different change.
    last: undefined,
    differsFromLast: false,
  };

  // Scope.
  const variantBySlug = new Map(variants.map((variant) => [variant.slug, variant]));
  const lastScope = last === undefined ? undefined : last.inScopeSpaceIds;
  let scopeIds: string[];
  if (address.out !== undefined) {
    const out = new Set(address.out);
    for (const slug of address.out) {
      if (!variantBySlug.has(slug))
        problem(
          'where',
          'variant-not-found',
          draftCopy.problems.variantNotFound(slug),
          false,
          {
            label: draftCopy.fixes.dropVariant(slug),
            patch: { out: address.out.filter((other) => other !== slug) },
          },
        );
    }
    scopeIds = variants
      .filter((variant) => !out.has(variant.slug))
      .map((variant) => variant.spaceId);
  } else if (lastScope !== undefined) {
    const inLast = new Set(lastScope);
    scopeIds = variants
      .filter((variant) => inLast.has(variant.spaceId))
      .map((variant) => variant.spaceId);
  } else {
    scopeIds = variants.map((variant) => variant.spaceId);
  }
  if (scopeIds.length === 0) problem('where', 'scope-empty', draftCopy.problems.scopeEmpty);
  const scope = decision(scopeIds, lastScope, sameIds);
  const inScope = new Set(scopeIds);
  const leftOut = variants
    .filter((variant) => !inScope.has(variant.spaceId))
    .map((variant) => variant.slug);

  // Update type: one whose Links reach the scope. The URL may name one whose Links do not.
  const updateTypes = updateTypeAvailability(linkedSpaces, scopeIds);
  const lastUpdateType =
    last !== undefined && isDraftUpdateType(last.updateType) ? last.updateType : undefined;
  const fallbackUpdateType = defaultUpdateType(lastUpdateType, updateTypes);
  let updateTypeValue: DraftUpdateType = fallbackUpdateType;
  if (address.update !== undefined && !invoke) {
    if (isDraftUpdateType(address.update)) updateTypeValue = address.update;
    else
      problem(
        'same',
        'update-type-unknown',
        draftCopy.problems.updateTypeUnknown(address.update),
        false,
        { label: draftCopy.fixes.defaultUpdateType, patch: { update: null } },
      );
  }
  const reachable = DRAFT_UPDATE_TYPES.find((type) => updateTypes[type] === 'available');
  // With neither type reaching the scope, the scope's own problem says nothing is promoted.
  if (!invoke && updateTypes[updateTypeValue] === 'unavailable' && reachable !== undefined)
    problem('same', 'update-type-no-link', draftCopy.problems.updateTypeNoLink(updateTypeValue), true, {
      label: draftCopy.fixes.useUpdateType(reachable),
      patch: { update: reachable === fallbackUpdateType ? null : reachable },
    });
  const updateType = decision(updateTypeValue, lastUpdateType);

  // Name.
  const taken = new Set(pastChangeOrders.map((order) => order.slug));
  const suggestedName = suggestDraftName({
    lastSlug: last?.slug,
    stem: componentSlug ?? baseSpaceSlug,
    today,
    taken,
  });
  const nameValue = address.name ?? suggestedName;
  const name: DraftDecision<string> = {
    value: nameValue,
    last: last?.slug,
    differsFromLast: last !== undefined && last.slug !== nameValue,
  };
  problems.push(...nameProblems(nameValue, taken));

  // Description.
  // The change's own suggestion is folded in once it is read (`withDescriptionSuggestion`).
  const descriptionValue = address.desc ?? '';
  const description: DraftDecision<string> = {
    value: descriptionValue,
    last: last?.description,
    differsFromLast: last !== undefined && last.description !== descriptionValue,
  };

  // Stage. Only a path has nodes to name; without a workflow the stage card is the scope.
  let stage: string | undefined;
  if (address.stage !== undefined && workflowValue.kind === 'workflow') {
    stage = draftStageIdOf(address.stage, workflowValue.workflow.stageNames);
    if (stage === undefined)
      problem(
        'path',
        'stage-not-found',
        draftCopy.problems.stageNotFound(address.stage, workflowValue.workflow.slug),
        false,
        { label: draftCopy.fixes.clearStage, patch: { stage: null } },
      );
  }

  return {
    template,
    kind,
    kindTemplates,
    name,
    description,
    workflow,
    end,
    scope,
    leftOut,
    updateType,
    updateTypes,
    stage,
    problems,
  };
}

/**
 * The description decision once the change's own suggestion is known. The decisions are
 * worked out before the change is read (the change depends on them), so the suggestion
 * arrives after and fills the description only where the URL says nothing.
 */
export function withDescriptionSuggestion(
  decisions: DraftDecisions,
  address: DraftAddress,
  suggestion: string | undefined,
): DraftDecisions {
  if (
    address.desc !== undefined ||
    suggestion === undefined ||
    suggestion === decisions.description.value
  )
    return decisions;
  const last = decisions.description.last;
  return {
    ...decisions,
    description: {
      value: suggestion,
      last,
      differsFromLast: last !== undefined && last !== suggestion,
    },
  };
}

/** What is wrong with a name before the server is asked: the server's slug rule, and the Space's names. */
export function nameProblems(name: string, taken: ReadonlySet<string>): DraftProblem[] {
  const refuse = (code: string, message: string): DraftProblem[] => [
    { row: 'name', code, message, source: 'client', blocks: true },
  ];
  if (name.trim() === '') return refuse('name-empty', draftCopy.problems.nameEmpty);
  if (name.length > SLUG_MAX_LENGTH)
    return refuse('name-too-long', draftCopy.problems.nameTooLong(SLUG_MAX_LENGTH));
  if (!SLUG_PATTERN.test(name)) return refuse('name-format', draftCopy.problems.nameFormat);
  if (taken.has(name)) return refuse('name-taken', draftCopy.problems.nameTaken(name));
  return [];
}

/**
 * The create request the decisions make: what the dry run asks about and what Create sends.
 *
 * `endTagId` is the end the decisions resolve to (`useDraftChangeCards`): absent for each
 * Unit's head, the ChangeSet's end Tag otherwise. `undefined` comes back while there is no
 * request to make: an end that names nothing, or a workflow nobody has picked.
 */
export function draftCreateRequest(input: {
  decisions: DraftDecisions;
  /** `undefined` while the end has not resolved; `null` for the head. Not read for an Invoke draft. */
  endTagId: string | null | undefined;
  /**
   * An Invoke draft's Invocation, values and Unit selection (`DraftInvoke.request`); `undefined`
   * while it has none to run. Not read for Base changes.
   */
  invoke?: DraftInvokeRequestPart;
  /** A Transform paths draft's type and end (`DraftFanOut.request`); `undefined` while it follows no Link. */
  fanOut?: { updateType: string; endTagId: string | undefined };
}): ChangeOrder | undefined {
  const { decisions, endTagId, invoke, fanOut } = input;
  const kind = decisions.kind.value;
  const invokes = kind === 'invoke';
  if (kind === 'transformPaths') {
    if (fanOut === undefined || decisions.scope.value.length === 0 || decisions.workflow.value.kind === 'unset') return undefined;
    const request: ChangeOrder = {
      Slug: decisions.name.value,
      Description: decisions.description.value,
      UpdateType: fanOut.updateType,
      InScopeSpaceIDs: [...decisions.scope.value],
    };
    if (fanOut.endTagId !== undefined) request.EndTagID = fanOut.endTagId;
    if (decisions.workflow.value.kind === 'workflow') request.ChangeWorkflowID = decisions.workflow.value.workflow.workflowId;
    return request;
  }
  if (invokes ? invoke === undefined : endTagId === undefined) return undefined;
  // A ChangeOrder headed nowhere is never asked for: an empty list is not a scope.
  if (decisions.scope.value.length === 0) return undefined;
  if (decisions.workflow.value.kind === 'unset') return undefined;
  const request: ChangeOrder = {
    Slug: decisions.name.value,
    Description: decisions.description.value,
    UpdateType: invokes ? 'Invoke' : decisions.updateType.value,
    // An explicit list, not a selection, so that leaving a variant out is what is recorded.
    InScopeSpaceIDs: [...decisions.scope.value],
  };
  if (invokes && invoke !== undefined) {
    if (invoke.invocationId !== undefined) request.InvocationID = invoke.invocationId;
    request.Parameters = invoke.parameters;
    if (invoke.whereUnit !== '') request.WhereUnit = invoke.whereUnit;
  } else if (endTagId !== null && endTagId !== undefined) request.EndTagID = endTagId;
  if (decisions.workflow.value.kind === 'workflow')
    request.ChangeWorkflowID = decisions.workflow.value.workflow.workflowId;
  return request;
}

/** What an Invoke ChangeOrder adds to the create request. */
export interface DraftInvokeRequestPart {
  /** `undefined` for an inline call: Create saves its Invocation first, and names it then. */
  invocationId: string | undefined;
  parameters: Record<string, unknown>;
  /** `''` for every Unit of each Space. */
  whereUnit: string;
}

/**
 * The Where problem for in-scope variants no stage of the workflow selects, by their display
 * names (never a Space id: one the variants do not list is left out of the words), with Leave
 * out as its fix. Not blocking: the server accepts such a scope, and a promotion only never gets
 * there. `undefined` when every variant in scope is on the path.
 */
export function outsideEveryStageProblem(input: {
  outsideSpaceIds: readonly string[];
  variants: readonly DraftVariant[];
  workflow: DraftWorkflow;
  leftOut: readonly string[];
}): DraftProblem | undefined {
  const { outsideSpaceIds, variants, workflow, leftOut } = input;
  const byId = new Map(variants.map((variant) => [variant.spaceId, variant]));
  const outside = outsideSpaceIds.flatMap((spaceId) => {
    const variant = byId.get(spaceId);
    return variant === undefined ? [] : [variant];
  });
  if (outside.length === 0) return undefined;
  return {
    row: 'where',
    code: 'outside-every-stage',
    message: draftCopy.problems.outsideEveryStage(
      outside.map((variant) => variant.name).join(', '),
      workflow.name,
    ),
    source: 'client',
    blocks: false,
    fix: {
      label: draftCopy.fixes.leaveOut,
      patch: { out: [...leftOut, ...outside.map((variant) => variant.slug)] },
    },
  };
}
