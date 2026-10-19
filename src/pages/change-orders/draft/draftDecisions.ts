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
import { draftCopy } from './draftCopy';
import type {
  DraftDecision,
  DraftDecisionOrigin,
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

export const DRAFT_UPDATE_TYPES: readonly DraftUpdateType[] = ['UpgradeUnit', 'MergeUnits'];

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
} as const;

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
}

/** A change to the address. `null` removes the parameter, which returns it to its default. */
export type DraftAddressPatch = { [K in keyof DraftAddress]?: DraftAddress[K] | null };

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
  'end',
  'stage',
  'name',
  'desc',
  'wf',
  'out',
  'update',
];

/** Read the draft from a URL's search parameters. */
export function parseDraftAddress(params: URLSearchParams): DraftAddress {
  const address: DraftAddress = {};
  for (const key of PARAM_ORDER) {
    if (!params.has(key)) continue;
    const raw = params.get(key) ?? '';
    if (key === 'out') {
      address.out = raw
        .split(',')
        .map((slug) => slug.trim())
        .filter((slug) => slug !== '');
      continue;
    }
    if (key === 'name' || key === 'desc') {
      address[key] = raw;
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed !== '') address[key] = trimmed;
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
    } else {
      (address as Record<string, string>)[key] = value as string;
    }
  }
  const next = new URLSearchParams();
  for (const [key, value] of previous) {
    if (!(PARAM_ORDER as string[]).includes(key)) next.append(key, value);
  }
  for (const key of PARAM_ORDER) {
    const value = address[key];
    if (value === undefined) continue;
    next.set(key, Array.isArray(value) ? value.join(',') : value);
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
  name: DraftDecision<string>;
  description: DraftDecision<string>;
  workflow: DraftDecision<DraftWorkflowChoice>;
  end: DraftDecision<DraftEndChoice>;
  /** In-scope variant Space ids, in the variants' order. */
  scope: DraftDecision<string[]>;
  /** The variants out of scope, by slug, as `out=` would name them. */
  leftOut: string[];
  updateType: DraftDecision<DraftUpdateType>;
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
}

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
  isDraftUpdateType(order.updateType) &&
  !ABANDONED_STATES.has(order.state ?? '') &&
  (order.changeOrder.AbortedReason ?? '') === '';

function decision<T>(
  value: T,
  fallbackOrigin: Exclude<DraftDecisionOrigin, 'you'>,
  last: T | undefined,
  explicit: boolean,
  same: (a: T, b: T) => boolean = Object.is,
): DraftDecision<T> {
  const differsFromLast = last !== undefined && !same(value, last);
  // A value set here that is what last time had reads as last time: the ledger shows no change.
  const origin: DraftDecisionOrigin =
    explicit && (last === undefined || differsFromLast) ? 'you' : fallbackOrigin;
  return { value, origin, last, differsFromLast };
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
 * Every decision of the draft, with where its value came from.
 *
 * Defaults, in the order the ledger reads them:
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
  } = input;
  const problems: DraftProblem[] = [];
  const problem = (
    row: DraftProblem['row'],
    code: string,
    message: string,
    blocks = true,
    fix?: DraftProblemFix,
  ) => problems.push({ row, code, message, source: 'client', blocks, fix });

  // Template.
  let template: DraftTemplate = { kind: 'policy' };
  if (address.from === undefined) {
    const newest = pastChangeOrders.find(isDefaultTemplate);
    if (newest !== undefined) template = { kind: 'changeOrder', changeOrder: newest };
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
  let workflowOrigin: Exclude<DraftDecisionOrigin, 'you'> = 'policy';
  const explicitWorkflow = address.wf !== undefined;
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
    // A Component that names its workflows decides the path; last time only agrees with it.
    workflowOrigin =
      policy.required || policy.allowedWorkflowIds.length > 0 ? 'policy' : 'last';
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
  const workflow = decision(
    workflowValue,
    workflowOrigin,
    lastWorkflow,
    explicitWorkflow,
    sameWorkflow,
  );

  // End.
  const endValue: DraftEndChoice =
    address.end === undefined || address.end === DRAFT_END_HEAD
      ? { kind: 'head' }
      : { kind: 'changeSet', slug: address.end };
  const end: DraftDecision<DraftEndChoice> = {
    value: endValue,
    origin: address.end === undefined ? 'policy' : 'you',
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
  const scope = decision(
    scopeIds,
    last === undefined ? 'policy' : 'last',
    lastScope,
    address.out !== undefined,
    sameIds,
  );
  const inScope = new Set(scopeIds);
  const leftOut = variants
    .filter((variant) => !inScope.has(variant.spaceId))
    .map((variant) => variant.slug);

  // Update type.
  const lastUpdateType =
    last !== undefined && isDraftUpdateType(last.updateType) ? last.updateType : undefined;
  let updateTypeValue: DraftUpdateType = lastUpdateType ?? 'UpgradeUnit';
  if (address.update !== undefined) {
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
  const updateType = decision(
    updateTypeValue,
    lastUpdateType === undefined ? 'policy' : 'last',
    lastUpdateType,
    address.update !== undefined && isDraftUpdateType(address.update),
  );

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
    origin:
      address.name !== undefined && address.name !== suggestedName
        ? 'you'
        : last === undefined
          ? 'policy'
          : 'last',
    last: last?.slug,
    differsFromLast: last !== undefined && last.slug !== nameValue,
  };
  problems.push(...nameProblems(nameValue, taken));

  // Description.
  // The change's own suggestion is folded in once it is read (`withDescriptionSuggestion`).
  const descriptionValue = address.desc ?? '';
  const description: DraftDecision<string> = {
    value: descriptionValue,
    origin: address.desc !== undefined ? 'you' : 'policy',
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
    name,
    description,
    workflow,
    end,
    scope,
    leftOut,
    updateType,
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
      origin: 'policy',
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
  /** `undefined` while the end has not resolved; `null` for the head. */
  endTagId: string | null | undefined;
}): ChangeOrder | undefined {
  const { decisions, endTagId } = input;
  if (endTagId === undefined) return undefined;
  // A ChangeOrder headed nowhere is never asked for: an empty list is not a scope.
  if (decisions.scope.value.length === 0) return undefined;
  if (decisions.workflow.value.kind === 'unset') return undefined;
  const request: ChangeOrder = {
    Slug: decisions.name.value,
    Description: decisions.description.value,
    UpdateType: decisions.updateType.value,
    // An explicit list, not a selection, so that leaving a variant out is what is recorded.
    InScopeSpaceIDs: [...decisions.scope.value],
  };
  if (endTagId !== null) request.EndTagID = endTagId;
  if (decisions.workflow.value.kind === 'workflow')
    request.ChangeWorkflowID = decisions.workflow.value.workflow.workflowId;
  return request;
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
