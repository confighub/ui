// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A "Transform paths" draft: the server's fan-out ChangeOrder (TransformPaths, Upsert, Insert).
 *
 * WHAT IT CARRIES IS A NEW STATE OF A SHARED SOURCE. Its change is made in source Units outside
 * the scope (a platform's facts, a registry's tags), which each variant reads through a staged
 * Link of the ChangeOrder's type. The ChangeOrder fixes which Revision of each source the variants
 * resolve to: the end, the source's head unless a closed ChangeSet there is named. It edits no
 * Link and renders no template: what a variant takes is what its own Link makes of the source.
 *
 * The Links it follows are the server's (`fanOutLinks`): of its type, in a Space in scope,
 * pointing into a Space outside the scope and not their own. It is offered only where such
 * Links exist.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */
import type { LinkRead } from '@confighub/rtk-query';

import { linkedSourcePaths } from '../../x/apps/change-order/linkedSourcePaths';
import { draftCopy } from './draftCopy';
import type { DraftAddress, DraftAddressPatch } from './draftDecisions';
import type { DraftDecision, DraftPastChangeOrder, DraftProblem, DraftVariant } from './draftTypes';

/** The update types of a fan-out ChangeOrder, in the order the sub bar offers them. */
export const FAN_OUT_TYPES = ['TransformPaths', 'Upsert', 'Insert'] as const;
export type DraftFanOutType = (typeof FAN_OUT_TYPES)[number];

export const isFanOutType = (value: string | undefined): value is DraftFanOutType =>
  value !== undefined && (FAN_OUT_TYPES as readonly string[]).includes(value);

/** A Link a fan-out ChangeOrder may follow, as the draft reads it. */
export interface DraftFanOutLink {
  linkId: string;
  slug: string;
  /** The variant it leaves from. */
  spaceId: string;
  fromUnitId: string;
  /** The source it reads. */
  toUnitId: string;
  toSpaceId: string;
  updateType: string;
  autoUpdate: boolean;
  /** The source Revision the variant last resolved to; 0 for never. */
  lastMergedRevisionNum: number;
  /** What it reads of the source: the paths `linkedSourcePaths` narrows the source's diff to. */
  upstreamPaths: LinkRead['UpstreamPaths'];
  upstreamGetters: LinkRead['UpstreamGetters'];
}

export function fanOutLinkOf(link: LinkRead | undefined): DraftFanOutLink | undefined {
  if (link?.LinkID === undefined || link.SpaceID === undefined || link.FromUnitID === undefined || link.ToUnitID === undefined) return undefined;
  return {
    linkId: link.LinkID,
    slug: link.Slug,
    spaceId: link.SpaceID,
    fromUnitId: link.FromUnitID,
    toUnitId: link.ToUnitID,
    toSpaceId: link.ToSpaceID ?? '',
    updateType: link.UpdateType ?? '',
    autoUpdate: link.AutoUpdate === true,
    lastMergedRevisionNum: link.UpstreamLastMergedRevisionNum ?? 0,
    upstreamPaths: link.UpstreamPaths,
    upstreamGetters: link.UpstreamGetters,
  };
}

/**
 * The Links a fan-out ChangeOrder of `type` follows over `scopeIds`, as the server finds them: of
 * that type, in a Space in scope, pointing into a Space outside the scope and not their own. By
 * slug.
 */
export function fanOutLinksOf(links: readonly DraftFanOutLink[], type: string, scopeIds: readonly string[]): DraftFanOutLink[] {
  const inScope = new Set(scopeIds);
  return links
    .filter((link) => link.updateType === type && inScope.has(link.spaceId) && link.toSpaceId !== link.spaceId && !inScope.has(link.toSpaceId))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export type DraftFanOutAvailability = 'available' | 'unavailable' | 'unknown';

/** Each fan-out type's availability for a scope: whether it follows any Link there. `unknown` while the Links are read. */
export function fanOutAvailability(
  links: readonly DraftFanOutLink[] | undefined,
  scopeIds: readonly string[],
): Readonly<Record<DraftFanOutType, DraftFanOutAvailability>> {
  const of = (type: DraftFanOutType): DraftFanOutAvailability => {
    if (links === undefined) return 'unknown';
    return fanOutLinksOf(links, type, scopeIds).length > 0 ? 'available' : 'unavailable';
  };
  return { TransformPaths: of('TransformPaths'), Upsert: of('Upsert'), Insert: of('Insert') };
}

/** The kind is offered: some fan-out type follows a Link over the scope (or the Links are not known yet). */
export function fanOutOffered(availability: Readonly<Record<DraftFanOutType, DraftFanOutAvailability>>): DraftFanOutAvailability {
  const values = FAN_OUT_TYPES.map((type) => availability[type]);
  if (values.includes('available')) return 'available';
  if (values.includes('unknown')) return 'unknown';
  return 'unavailable';
}

/** A source Unit, as the draft reads it. */
export interface DraftFanOutUnit {
  unitId: string;
  slug: string;
  spaceId: string;
  spaceSlug: string;
  headRevisionNum: number;
}

/** A Revision of a source after what some variant has taken. */
export interface DraftFanOutRevision {
  revisionId: string;
  unitId: string;
  revisionNum: number;
  description: string;
  createdAt: string | undefined;
  /** The Tags it carries: how a ChangeSet's end is found on it. */
  tagIds: readonly string[];
}

/** A closed ChangeSet in a source's Space: an end the change can stop at. */
export interface DraftFanOutChangeSet {
  slug: string;
  spaceId: string;
  spaceSlug: string;
  endTagId: string;
  description: string;
}

/** Why the server passes over a source, before it is asked. */
export type DraftFanOutSkip = 'alreadyTaken' | 'notMarked';

/** One source the change reads from, with what it carries. */
export interface DraftFanOutSource {
  unit: DraftFanOutUnit;
  /** The followed Links that read it. */
  links: DraftFanOutLink[];
  /** The oldest Revision a variant has taken: where the change starts. 0 when one never resolved. */
  start: number;
  /** The newest a variant has taken: past the end, the server refuses. */
  highest: number;
  /** Where it ends: the head, or the Revision the chosen ChangeSet's end Tag marks. `undefined` when no Revision read carries it. */
  end: number | undefined;
  /** The Revisions it carries, start (exclusive) to end, oldest first. */
  revisions: DraftFanOutRevision[];
  skip: DraftFanOutSkip | undefined;
  /** What its Links read of it: the paths its diff is narrowed to; `undefined` for all of it. */
  paths: string[] | undefined;
}

/** The end of the change, as decided. */
export type DraftFanOutEnd = { kind: 'head' } | { kind: 'changeSet'; changeSet: DraftFanOutChangeSet };

/** The resolve dry run that previews it: each followed Link resolved in its variant, to the end. */
export interface DraftResolveRequest {
  fromUnitIds: string[];
  /** Which of those Units' Links resolve: `Link:<this>`. */
  linkWhere: string;
  /** `Tag:<id>` for a ChangeSet's end; absent for the head. */
  mergeEnd: string | undefined;
}

export interface DraftFanOut {
  type: DraftDecision<DraftFanOutType>;
  /** The types the sub bar offers: those whose Links reach the scope, and the chosen one. */
  types: DraftFanOutType[];
  availability: Readonly<Record<DraftFanOutType, DraftFanOutAvailability>>;
  followed: DraftFanOutLink[];
  /** By the source's Space, then slug. */
  sources: DraftFanOutSource[];
  end: DraftFanOutEnd;
  /** Closed ChangeSets in the sources' Spaces: what End at offers. */
  changeSets: readonly DraftFanOutChangeSet[];
  /** What the create request takes from this draft. */
  request: { updateType: DraftFanOutType; endTagId: string | undefined } | undefined;
  previewRequest: DraftResolveRequest | undefined;
  /** What the rail's source node calls it: the sources' Spaces. */
  sourceName: string;
  /** How many of the sources' Revisions the change carries. */
  carried: number;
  problems: DraftProblem[];
}

export interface ResolveFanOutInput {
  address: DraftAddress;
  /** The ChangeOrder re-aimed, when it was a fan-out one. */
  last: DraftPastChangeOrder | undefined;
  /** Every fan-out Link of the variants; `undefined` while read. */
  links: readonly DraftFanOutLink[] | undefined;
  scopeIds: readonly string[];
  variants: readonly DraftVariant[];
  units: ReadonlyMap<string, DraftFanOutUnit>;
  revisions: readonly DraftFanOutRevision[];
  changeSets: readonly DraftFanOutChangeSet[];
}

/** The ids of the rows' controls, which a blocker focuses. */
export const FAN_OUT_IDS = { type: 'draft-fan-out-type', end: 'draft-fan-out-end', sources: 'draft-fan-out-sources' } as const;

const quoted = (ids: readonly string[]) => ids.map((id) => `'${id}'`).join(', ');

/**
 * Every decision of a fan-out draft. Problems mirror what the server refuses on create: no Link
 * to follow, an AutoUpdate Link, a variant already past the end, an end that names nothing, and a
 * change that carries nothing.
 */
export function resolveFanOutDraft(input: ResolveFanOutInput): DraftFanOut {
  const { address, last, links, scopeIds, variants, units, revisions, changeSets } = input;
  const words = draftCopy.fanOut.problems;
  const problems: DraftProblem[] = [];
  const problem = (code: string, message: string, extra: Partial<DraftProblem> = {}) =>
    problems.push({ row: 'what', code, message, source: 'client', blocks: true, ...extra });

  // The type: the URL's, else last time's while it reaches the scope, else the first that does.
  const availability = fanOutAvailability(links, scopeIds);
  const lastType = last !== undefined && isFanOutType(last.updateType) ? last.updateType : undefined;
  const reaching = FAN_OUT_TYPES.filter((type) => availability[type] === 'available');
  const fallback = lastType !== undefined && availability[lastType] !== 'unavailable' ? lastType : (reaching[0] ?? lastType ?? 'TransformPaths');
  let typeValue: DraftFanOutType = fallback;
  if (address.via !== undefined) {
    if (isFanOutType(address.via)) typeValue = address.via;
    else problem('fan-out-type-unknown', words.typeUnknown(address.via), { blocks: false, fix: { label: draftCopy.fixes.defaultUpdateType, patch: { via: null } } });
  }
  const type = { value: typeValue, last: lastType, differsFromLast: lastType !== undefined && lastType !== typeValue };
  const types = FAN_OUT_TYPES.filter((candidate) => availability[candidate] === 'available' || candidate === typeValue);

  const followed = links === undefined ? [] : fanOutLinksOf(links, typeValue, scopeIds);
  if (links !== undefined && followed.length === 0) {
    const other = reaching.find((candidate) => candidate !== typeValue);
    problem('no-shared-source', reaching.length === 0 ? words.noSharedSource : words.noLinkOfType(typeValue), {
      focusId: FAN_OUT_IDS.type,
      blockerLabel: reaching.length === 0 ? words.noSharedSourceBlocker : words.noLinkOfType(typeValue),
      ...(other === undefined ? {} : { fix: { label: draftCopy.fixes.useUpdateType(other), patch: { via: other === fallback ? null : other } } }),
    });
  }
  // An AutoUpdate Link takes the change before a ChangeOrder can name it: the server refuses it.
  const automatic = followed.filter((link) => link.autoUpdate);
  if (automatic.length > 0) {
    const names = variants.filter((variant) => automatic.some((link) => link.spaceId === variant.spaceId));
    const leaveOut: DraftAddressPatch = { out: [...variants.filter((variant) => !scopeIds.includes(variant.spaceId)).map((variant) => variant.slug), ...names.map((variant) => variant.slug)] };
    problem('auto-update', words.autoUpdate(automatic.map((link) => link.slug).join(', '), names.map((variant) => variant.name).join(', ')), {
      row: 'where',
      fix: { label: draftCopy.fixes.leaveOutNamed(names.map((variant) => variant.name).join(', ')), patch: leaveOut },
    });
  }

  // The end: the sources' head, or a closed ChangeSet in a source's Space.
  let end: DraftFanOutEnd = { kind: 'head' };
  if (address.until !== undefined) {
    const named = changeSets.find((changeSet) => changeSet.slug === address.until);
    if (named === undefined) problem('fan-out-end-not-found', draftCopy.problems.endNotFound(address.until), { row: 'howMuch', focusId: FAN_OUT_IDS.end, fix: { label: draftCopy.fixes.endAtLatest, patch: { until: null } } });
    else end = { kind: 'changeSet', changeSet: named };
  }
  const endTagId = end.kind === 'changeSet' ? end.changeSet.endTagId : undefined;

  // The sources, each with what it carries.
  const bySource = new Map<string, DraftFanOutLink[]>();
  for (const link of followed) bySource.set(link.toUnitId, [...(bySource.get(link.toUnitId) ?? []), link]);
  const sources: DraftFanOutSource[] = [];
  for (const [unitId, sourceLinks] of bySource) {
    const unit = units.get(unitId);
    if (unit === undefined) continue;
    const merged = sourceLinks.map((link) => link.lastMergedRevisionNum);
    const start = Math.min(...merged);
    const highest = Math.max(...merged);
    const own = revisions.filter((revision) => revision.unitId === unitId).sort((a, b) => a.revisionNum - b.revisionNum);
    let endNum: number | undefined = unit.headRevisionNum;
    if (endTagId !== undefined) endNum = own.find((revision) => revision.tagIds.includes(endTagId))?.revisionNum;
    let skip: DraftFanOutSkip | undefined;
    if (endNum === undefined && endTagId !== undefined) skip = 'notMarked';
    else if (endNum !== undefined && start >= endNum) skip = 'alreadyTaken';
    if (endNum !== undefined && highest > endNum)
      problem('past-end', words.pastEnd(unit.slug, sourceLinks.filter((link) => link.lastMergedRevisionNum > (endNum ?? 0)).map((link) => link.slug).join(', ')), {
        row: 'howMuch',
        focusId: FAN_OUT_IDS.end,
        fix: { label: draftCopy.fixes.endAtLatest, patch: { until: null } },
      });
    sources.push({
      unit,
      links: sourceLinks,
      start,
      highest,
      end: endNum,
      revisions: endNum === undefined ? [] : own.filter((revision) => revision.revisionNum > start && revision.revisionNum <= (endNum ?? 0)),
      skip,
      paths: typeValue === 'TransformPaths' ? linkedSourcePaths(sourceLinks.map((link) => ({ UpstreamPaths: link.upstreamPaths, UpstreamGetters: link.upstreamGetters }))) : undefined,
    });
  }
  sources.sort((a, b) => a.unit.spaceSlug.localeCompare(b.unit.spaceSlug) || a.unit.slug.localeCompare(b.unit.slug));
  const carried = sources.reduce((total, source) => total + (source.skip === undefined && source.end !== undefined ? source.end - source.start : 0), 0);
  // Every source the variants have taken to the end already: nothing to carry, nothing to create.
  const sourcesKnown = links !== undefined && followed.every((link) => units.has(link.toUnitId));
  if (sourcesKnown && sources.length > 0 && sources.every((source) => source.skip !== undefined))
    problem('nothing-to-carry', words.nothingToCarry, { blockerLabel: words.nothingToCarry, focusId: FAN_OUT_IDS.end });

  const sourceUnitIds = [...bySource.keys()].sort();
  const previewRequest: DraftResolveRequest | undefined =
    followed.length === 0 || !sourcesKnown
      ? undefined
      : {
          fromUnitIds: [...new Set(followed.map((link) => link.fromUnitId))].sort(),
          linkWhere: `UpdateType = '${typeValue}' AND ToUnitID IN (${quoted(sourceUnitIds)})`,
          mergeEnd: endTagId === undefined ? undefined : `Tag:${endTagId}`,
        };
  const spaceSlugs = [...new Set(sources.map((source) => source.unit.spaceSlug))];
  return {
    type,
    types,
    availability,
    followed,
    sources,
    end,
    changeSets,
    request: followed.length === 0 ? undefined : { updateType: typeValue, endTagId },
    previewRequest,
    sourceName: spaceSlugs.join(', '),
    carried,
    problems,
  };
}
