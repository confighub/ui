// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The "create a ChangeOrder" draft's data layer, exercised without a page: the URL and the
// defaults it leaves to the last ChangeOrder and the policy; the change cards grouped from the
// base's Revisions; where each Unit's change starts and ends; the upgrade dry run read into the
// detail view's `PromotionPreview`; the outlier chips; and the "N of M same" count over stages
// built by the detail view's own classifier. Fixtures follow the payments scenario.
import type {
  ConfigDiff,
  MutationConflict,
  PathChange,
  PathSegment,
  UnitCreateOrUpdateResponseRead,
  UnitDiff,
} from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { COMPLETE_STAGE_ID } from '../src/pages/change-orders/changeOrderCompleteStep';
import type { HistoryPerson } from '../src/pages/change-orders/changeOrderHistory';
import { carriedResourceKeysOf } from '../src/pages/change-orders/changeOrderOutcome';
import {
  DRAFT_SAME_CHANGE_MS,
  type DraftBaseUnit,
  type DraftRevision,
  type DraftVariantUnit,
  authoredDescription,
  buildChangeCards,
  cardInclusion,
  cardSummaryOf,
  cardsAffectedBy,
  carriesNothing,
  changeSetsOfRevisions,
  deriveUnitRanges,
  deriveUnitStarts,
  foreignUpstreamSpaceIds,
  listedStartOf,
  rangeRevisionsWheres,
  startRevisionsWheres,
  suggestedEnd,
  validEnds,
} from '../src/pages/change-orders/draft/draftChangeCards';
import {
  DRAFT_STAGE_WORDS,
  type ResolveDraftDecisionsInput,
  applyDraftAddressPatch,
  draftCreateRequest,
  draftHref,
  draftStageIdOf,
  draftStageParamOf,
  nameProblems,
  outsideEveryStageProblem,
  parseDraftAddress,
  resolveDraftDecisions,
  suggestDraftDescription,
  suggestDraftName,
  withDescriptionSuggestion,
} from '../src/pages/change-orders/draft/draftDecisions';
import { DRAFT_PLACE_OF_ROW } from '../src/pages/change-orders/draft/draftFocus';
import { dryRunSentence, factSlotLabel } from '../src/pages/change-orders/draft/draftPageModel';
import {
  type DraftPreviewUnit,
  assembleDraftPreview,
  lastFieldOf,
  orderStageMembers,
  outlierText,
  readUpgradePreview,
} from '../src/pages/change-orders/draft/draftPreview';
import { retryFailedReads } from '../src/pages/change-orders/draft/draftRetry';
import {
  defaultUpdateType,
  linkedSpacesOf,
  updateTypeAvailability,
} from '../src/pages/change-orders/draft/draftUpdateTypes';
import type {
  DraftPastChangeOrder,
  DraftRow,
  DraftVariant,
  DraftWorkflow,
} from '../src/pages/change-orders/draft/draftTypes';
import {
  isRefusal,
  reconcileRanges,
  refusalRow,
  skippedUnitsOf,
} from '../src/pages/change-orders/draft/draftValidation';
import type { DraftPreview } from '../src/pages/change-orders/draft/useDraftPreview';
import { imageChangesFromUnitDiffs } from '../src/pages/change-orders/imageChange';
import {
  resourceIdentityJoinKeysOf,
  resourceIdentityKeyOf,
  serverDiffGroupParts,
} from '../src/pages/x/apps/change-order/changeOrderChanges';
import { SOURCE_STAGE_ID } from '../src/pages/x/apps/change-order/changeOrderStages';
import { upgradePreviewWheres } from '../src/pages/x/apps/upgradePreviewApi';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const person = (name: string): HistoryPerson => ({
  key: name,
  kind: 'person',
  name,
  isYou: false,
  colorSeed: name,
});

const revision = (
  unitId: string,
  revisionNum: number,
  at: string,
  userId: string,
  description: string,
  changeSetId?: string,
  tagIds: string[] = [],
): DraftRevision => ({
  revisionId: `${unitId}#${revisionNum}`,
  unitId,
  revisionNum,
  createdAt: at,
  userId,
  description,
  changeSetId,
  tagIds,
});

const BASE_UNITS: DraftBaseUnit[] = [
  { unitId: 'api', slug: 'payments-api', headRevisionNum: 8 },
  { unitId: 'config', slug: 'payments-config', headRevisionNum: 3 },
  { unitId: 'worker', slug: 'payments-worker', headRevisionNum: 3 },
  { unitId: 'hpa', slug: 'payments-api-hpa', headRevisionNum: 3 },
  { unitId: 'service', slug: 'payments-api-service', headRevisionNum: 2 },
];
const SLUGS = new Map(BASE_UNITS.map((unit) => [unit.unitId, unit.slug]));
const VARIANTS = [
  'dev',
  'stg-eu',
  'stg-us',
  'eu-west',
  'eu-central',
  'us-east',
  'us-west',
  'apac',
];

/** Every variant holds every base Unit at the scenario's start, except apac, which lacks the worker. */
function variantUnits(): DraftVariantUnit[] {
  const starts: Record<string, number> = { api: 4, config: 2, worker: 2, hpa: 2, service: 2 };
  return VARIANTS.flatMap((spaceId) =>
    BASE_UNITS.filter((unit) => !(spaceId === 'apac' && unit.unitId === 'worker')).map(
      (unit) => ({
        unitId: `${spaceId}/${unit.unitId}`,
        slug: unit.slug,
        spaceId,
        upstreamUnitId: unit.unitId,
        upstreamRevisionNum: starts[unit.unitId],
      }),
    ),
  );
}

const CS = 'release-1.15';
const END_TAG = 'release-1.15-end';
/** The six changes, seven Revisions, as the base holds them (the descriptions as the server writes them). */
const REVISIONS: DraftRevision[] = [
  revision(
    'api',
    3,
    '2026-10-09T09:30:01+01:00',
    'charlie',
    'checksum/config from payments-config',
  ),
  revision(
    'api',
    5,
    '2026-10-13T10:02:00+01:00',
    'ci-bot',
    'api image tag 1.14.2 -> 1.15.0 (release pipeline)| Functions: set-container-image',
    CS,
  ),
  revision(
    'api',
    6,
    '2026-10-13T15:40:00+01:00',
    'charlie',
    'envoy v1.30.1 -> v1.30.4 (CVE patch)| Functions: set-container-image',
    CS,
  ),
  revision(
    'config',
    3,
    '2026-10-14T09:15:00+01:00',
    'yuran',
    'Enable 3DS2 and raise RETRY_LIMIT to 5| Functions: yq-i',
    CS,
    [END_TAG],
  ),
  revision(
    'api',
    7,
    '2026-10-14T11:30:00+01:00',
    'brian',
    'api memory limit 512Mi -> 768Mi (OOMs under 3DS2 load)',
    CS,
  ),
  revision(
    'worker',
    3,
    '2026-10-15T08:47:00+01:00',
    'ci-bot',
    'worker + migrate image tag 1.14.2 -> 1.15.0',
    CS,
    [END_TAG],
  ),
  revision(
    'api',
    8,
    '2026-10-15T08:47:05+01:00',
    'ci-bot',
    'worker + migrate image tag 1.14.2 -> 1.15.0',
    CS,
    [END_TAG],
  ),
  revision(
    'hpa',
    3,
    '2026-10-16T13:55:00+01:00',
    'jesper',
    'HPA maxReplicas 10 -> 20 (WIP: load-test sizing)',
  ),
].map((r) => ({ ...r, description: authoredDescription(r.description) }));

/** The ChangeSet as the Revision read expands it. */
const CHANGE_SET_ENTRIES = REVISIONS.filter((r) => r.changeSetId === CS).map((r) => ({
  Revision: {
    RevisionID: r.revisionId,
    UnitID: r.unitId,
    RevisionNum: r.revisionNum,
    ChangeSetID: CS,
  },
  ChangeSet: {
    Slug: 'release-1.15',
    ChangeSetID: CS,
    State: 'Closed',
    EndTagID: END_TAG,
    Description: 'payments 1.15',
  },
}));

const ALL_IN_SCOPE = [...VARIANTS];

function scenario() {
  const starts = deriveUnitStarts(BASE_UNITS, variantUnits(), ALL_IN_SCOPE);
  const cards = buildChangeCards(REVISIONS, starts, SLUGS);
  const changeSets = changeSetsOfRevisions(CHANGE_SET_ENTRIES, cards);
  return { starts, cards, changeSets };
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

test.describe('change cards', () => {
  test('the scenario is six changes, oldest first, from what the variants have taken', () => {
    const { cards } = scenario();
    expect(cards.map((card) => card.userId)).toEqual([
      'ci-bot',
      'charlie',
      'yuran',
      'brian',
      'ci-bot',
      'jesper',
    ]);
    // Revision 3 of payments-api is before its start (4): the variants have taken it.
    expect(cards.flatMap((card) => card.revisions.map((r) => r.revisionId))).not.toContain(
      'api#3',
    );
    // One change made by one pipeline in two Units, five seconds apart, is one card.
    expect(cards[4].revisions.map((r) => r.unitSlug)).toEqual([
      'payments-worker',
      'payments-api',
    ]);
  });

  test("the description is the author's words, without the server's functions suffix", () => {
    expect(authoredDescription('api image tag 1.15.0| Functions: set-container-image')).toBe(
      'api image tag 1.15.0',
    );
    expect(authoredDescription(undefined)).toBe('');
  });

  test('a change joins the card before it only for the same author, ChangeSet and description, close in time, in another Unit', () => {
    // A variant that holds none of the Units: each starts at its first Revision.
    const starts = deriveUnitStarts(BASE_UNITS, [], ['dev']);
    const at = (seconds: number) =>
      new Date(Date.UTC(2026, 9, 15, 7, 47, 0) + seconds * 1000).toISOString();
    const late = DRAFT_SAME_CHANGE_MS / 1000 + 1;
    const cards = buildChangeCards(
      [
        revision('worker', 2, at(0), 'ci-bot', 'bump', CS),
        revision('api', 2, at(5), 'ci-bot', 'bump', CS),
        revision('api', 3, at(6), 'ci-bot', 'bump', CS), // the same Unit again: its own change
        revision('config', 2, at(7), 'yuran', 'bump', CS), // another author
        revision('hpa', 2, at(8), 'yuran', 'bump'), // outside the ChangeSet
        revision('service', 2, at(8 + late), 'yuran', 'bump'), // too long after
      ],
      starts,
      SLUGS,
    );
    expect(cards.map((card) => card.revisions.map((r) => r.revisionId))).toEqual([
      ['worker#2', 'api#2'],
      ['api#3'],
      ['config#2'],
      ['hpa#2'],
      ['service#2'],
    ]);
  });

  test('the ChangeSet brackets the first five cards, and is the suggested end until it is the end', () => {
    const { cards, changeSets } = scenario();
    expect(changeSets).toHaveLength(1);
    expect(changeSets[0]).toMatchObject({
      slug: 'release-1.15',
      closed: true,
      endTagId: END_TAG,
    });
    expect(changeSets[0].cardIds).toEqual(cards.slice(0, 5).map((card) => card.cardId));
    const ends = validEnds(changeSets, cards);
    expect(ends.map((end) => (end.kind === 'head' ? 'head' : end.changeSet.slug))).toEqual([
      'head',
      'release-1.15',
    ]);
    expect(suggestedEnd({ kind: 'head' }, ends, cards)).toEqual({
      kind: 'changeSet',
      changeSet: changeSets[0],
    });
    expect(
      suggestedEnd({ kind: 'tag', tagId: END_TAG, changeSet: changeSets[0] }, ends, cards),
    ).toEqual({ kind: 'head' });
  });

  test('an open ChangeSet is no end', () => {
    const { cards } = scenario();
    const open = changeSetsOfRevisions(
      CHANGE_SET_ENTRIES.map((entry) => ({
        ...entry,
        ChangeSet: { ...entry.ChangeSet, State: 'Open', EndTagID: undefined },
      })),
      cards,
    );
    expect(open[0].closed).toBe(false);
    expect(validEnds(open, cards)).toEqual([{ kind: 'head' }]);
  });
});

// ---------------------------------------------------------------------------
// Starts and ranges
// ---------------------------------------------------------------------------

test.describe('where each Unit starts and ends', () => {
  test('the start is what the variants in scope have taken; a Unit one lacks is cloned into it', () => {
    const { starts } = scenario();
    const worker = starts.find((s) => s.unitId === 'worker');
    expect(worker).toMatchObject({ start: 2, missingSpaceIds: ['apac'], disagreement: [] });
    expect(starts.find((s) => s.unitId === 'api')?.start).toBe(4);
  });

  test('variants that disagree are reported, never averaged', () => {
    const units = variantUnits().map((u) =>
      u.unitId === 'us-west/api' ? { ...u, upstreamRevisionNum: 6 } : u,
    );
    const api = deriveUnitStarts(BASE_UNITS, units, ALL_IN_SCOPE).find(
      (s) => s.unitId === 'api',
    );
    expect(api?.start).toBeUndefined();
    expect(api?.disagreement.map((d) => d.revisionNum)).toEqual([4, 4, 4, 4, 4, 4, 4, 6]);
    // Leaving the outlier out is the fix the server names.
    const narrowed = deriveUnitStarts(
      BASE_UNITS,
      units,
      ALL_IN_SCOPE.filter((s) => s !== 'us-west'),
    );
    expect(narrowed.find((s) => s.unitId === 'api')?.start).toBe(4);
  });

  test('a Unit no variant in scope holds starts at its first Revision', () => {
    expect(deriveUnitStarts(BASE_UNITS, [], ['dev'])[0]).toMatchObject({
      start: 1,
      missingSpaceIds: ['dev'],
      undetermined: false,
    });
  });

  test("with no variant in scope the start is undetermined: never the base's beginning", () => {
    const starts = deriveUnitStarts(BASE_UNITS, variantUnits(), []);
    expect(starts.every((s) => s.undetermined && s.start === undefined)).toBe(true);
    expect(starts.every((s) => s.disagreement.length === 0)).toBe(true);
    expect(starts.map(listedStartOf)).toEqual(starts.map(() => undefined));
    // Nothing is read, nothing is listed, and every range is "could not establish".
    expect(startRevisionsWheres(starts)).toEqual([]);
    expect(rangeRevisionsWheres('base', starts, new Map())).toEqual([]);
    expect(buildChangeCards(REVISIONS, starts, SLUGS)).toEqual([]);
    const ranges = deriveUnitRanges({
      starts,
      revisions: REVISIONS,
      startRevisions: new Map(),
      end: { kind: 'head' },
      updateType: 'UpgradeUnit',
    });
    expect(new Set(ranges.map((r) => r.carry))).toEqual(new Set(['unknown']));
    expect(carriesNothing(ranges)).toBe(false);
  });

  test('a scope whose every variant takes the change from another Space is undetermined too', () => {
    const units = variantUnits()
      .filter((u) => u.spaceId === 'apac')
      .map((u) => ({ ...u, upstreamUnitId: `eu-west/${u.upstreamUnitId}` }));
    const foreign = foreignUpstreamSpaceIds(BASE_UNITS, units, ['apac']);
    const starts = deriveUnitStarts(BASE_UNITS, units, ['apac'], foreign);
    expect(starts.every((s) => s.undetermined)).toBe(true);
    // One ordinary variant beside it is enough to say where each Unit starts.
    const mixed = deriveUnitStarts(BASE_UNITS, variantUnits(), ['apac', 'dev'], foreign);
    expect(mixed.some((s) => s.undetermined)).toBe(false);
  });

  test('the start Revisions are read in one request; a disagreeing Unit by the earliest any variant took', () => {
    const { starts } = scenario();
    expect(startRevisionsWheres(starts)).toEqual([
      "UnitID IN ('api', 'config', 'worker', 'hpa', 'service') AND RevisionNum IN (2, 4)",
    ]);
    const units = variantUnits().map((u) =>
      u.unitId === 'us-west/api' ? { ...u, upstreamRevisionNum: 6 } : u,
    );
    const disagreeing = deriveUnitStarts(BASE_UNITS, units, ALL_IN_SCOPE);
    expect(startRevisionsWheres(disagreeing)[0]).toContain('RevisionNum IN (2, 4)');
  });

  test('a never-cloned Unit is read on its own, not by pulling every read back to its creation', () => {
    const base = [
      ...BASE_UNITS,
      { unitId: 'cron', slug: 'payments-cron', headRevisionNum: 4 },
    ];
    const starts = deriveUnitStarts(base, variantUnits(), ALL_IN_SCOPE);
    expect(starts.find((s) => s.unitId === 'cron')).toMatchObject({
      start: 1,
      holderSpaceIds: [],
    });
    const startRevisions = new Map([
      ['api', revision('api', 4, '2026-10-09T09:30:07+01:00', 'charlie', '')],
      ['config', revision('config', 2, '2026-10-09T09:30:00+01:00', 'charlie', '')],
      ['worker', revision('worker', 2, '2026-10-09T09:30:14+01:00', 'charlie', '')],
      ['hpa', revision('hpa', 2, '2026-10-09T09:30:01+01:00', 'charlie', '')],
      ['cron', revision('cron', 1, '2020-01-01T00:00:00Z', 'charlie', '')],
    ]);
    expect(rangeRevisionsWheres('base', starts, startRevisions)).toEqual([
      "SpaceID = 'base' AND CreatedAt >= '2026-10-09T09:30:00+01:00'",
      "UnitID IN ('cron')",
    ]);
  });

  test('a variant that takes the change from another Space is not short of anything', () => {
    // prod-apac's Units follow prod-eu-west's, not the base's.
    const units = variantUnits()
      .filter((u) => u.spaceId !== 'apac')
      .concat([
        {
          unitId: 'apac/api',
          slug: 'payments-api',
          spaceId: 'apac',
          upstreamUnitId: 'eu-west/api',
          upstreamRevisionNum: 4,
        },
      ]);
    const foreign = foreignUpstreamSpaceIds(BASE_UNITS, units, ALL_IN_SCOPE);
    expect([...foreign]).toEqual(['apac']);
    const starts = deriveUnitStarts(BASE_UNITS, units, ALL_IN_SCOPE, foreign);
    expect(starts.every((start) => !start.missingSpaceIds.includes('apac'))).toBe(true);
  });

  test('ending at the ChangeSet leaves the HPA out (not marked) and the Service as taken', () => {
    const { starts, cards, changeSets } = scenario();
    const ranges = deriveUnitRanges({
      starts,
      revisions: REVISIONS,
      startRevisions: new Map(),
      end: { kind: 'tag', tagId: END_TAG, changeSet: changeSets[0] },
      updateType: 'UpgradeUnit',
    });
    const carry = Object.fromEntries(ranges.map((r) => [r.slug, [r.carry, r.end]]));
    expect(carry).toEqual({
      'payments-api': ['carries', 8],
      'payments-config': ['carries', 3],
      'payments-worker': ['carries', 3],
      'payments-api-hpa': ['notMarked', undefined],
      'payments-api-service': ['taken', 2],
    });
    expect(ranges.find((r) => r.unitId === 'worker')?.cloneSpaceIds).toEqual(['apac']);
    const byUnit = new Map(ranges.map((r) => [r.unitId, r]));
    expect(cards.map((card) => cardInclusion(card, byUnit))).toEqual([
      'all',
      'all',
      'all',
      'all',
      'all',
      'none',
    ]);
    // The server's answer for the same end agrees, so nothing is reported.
    const agreed = reconcileRanges(ranges, [
      { unitId: 'hpa', reason: 'NotMarked' },
      { unitId: 'service', reason: 'AlreadyTaken' },
    ]);
    expect([agreed.passedOver, agreed.carried]).toEqual([[], []]);
    expect(agreed.ranges).toEqual(ranges);
  });

  test('variants past the end Tag on a Unit: taken past the end, not "not marked"', () => {
    const { starts, changeSets } = scenario();
    const ranges = deriveUnitRanges({
      starts,
      revisions: REVISIONS,
      startRevisions: new Map(),
      end: { kind: 'tag', tagId: END_TAG, changeSet: changeSets[0] },
      // The Tag sits on the HPA's Revision 1, before the Revision 2 its variants have taken.
      endTagRevisions: [
        revision('hpa', 1, '2026-10-09T09:30:00+01:00', 'charlie', '', undefined, [END_TAG]),
      ],
      updateType: 'UpgradeUnit',
    });
    expect(ranges.find((r) => r.unitId === 'hpa')).toMatchObject({
      carry: 'takenPastEnd',
      end: undefined,
    });
  });

  test('cards are "unknown" while no range is known, or where a Unit\'s range is', () => {
    const { starts, cards } = scenario();
    expect(cardInclusion(cards[0], new Map())).toBe('unknown');
    const merge = deriveUnitRanges({
      starts,
      revisions: REVISIONS,
      startRevisions: new Map(),
      end: { kind: 'head' },
      updateType: 'MergeUnits',
    });
    expect(merge.every((r) => r.carry === 'unknown')).toBe(true);
    const byUnit = new Map(merge.map((r) => [r.unitId, r]));
    expect(
      cards
        .map((card) => cardInclusion(card, byUnit))
        .every((inclusion) => inclusion === 'unknown'),
    ).toBe(true);
  });

  test('ending at the head carries the HPA too', () => {
    const { starts, cards } = scenario();
    const ranges = deriveUnitRanges({
      starts,
      revisions: REVISIONS,
      startRevisions: new Map(),
      end: { kind: 'head' },
      updateType: 'UpgradeUnit',
    });
    expect(ranges.find((r) => r.unitId === 'hpa')).toMatchObject({ carry: 'carries', end: 3 });
    const byUnit = new Map(ranges.map((r) => [r.unitId, r]));
    expect(cards.every((card) => cardInclusion(card, byUnit) === 'all')).toBe(true);
  });

  test("the server's SkippedUnits win, and each direction of a disagreement is reported apart", () => {
    const { starts } = scenario();
    const ranges = deriveUnitRanges({
      starts,
      revisions: REVISIONS,
      startRevisions: new Map(),
      end: { kind: 'head' },
      updateType: 'UpgradeUnit',
    });
    // The server passes over the api (worked out here as carried) and carries the Service
    // (worked out here as taken).
    const reconciled = reconcileRanges(ranges, [
      { unitId: 'api', reason: 'TakenPastEnd' },
      { unitId: 'hpa', reason: 'SomethingNew' },
    ]);
    expect(reconciled.passedOver).toEqual(['payments-api', 'payments-api-hpa']);
    expect(reconciled.carried).toEqual(['payments-api-service']);
    const carry = Object.fromEntries(reconciled.ranges.map((r) => [r.slug, r.carry]));
    expect(carry).toMatchObject({
      'payments-api': 'takenPastEnd',
      'payments-api-hpa': 'skipped',
      'payments-api-service': 'unknown',
      'payments-config': 'carries',
    });
  });

  test('MergeUnits ranges are unknown until the server says every Unit is passed over', () => {
    const { starts } = scenario();
    const ranges = deriveUnitRanges({
      starts,
      revisions: REVISIONS,
      startRevisions: new Map(),
      end: { kind: 'head' },
      updateType: 'MergeUnits',
    });
    expect(carriesNothing(ranges)).toBe(false);
    const reconciled = reconcileRanges(
      ranges,
      ranges.map((r) => ({ unitId: r.unitId, reason: 'FollowedByOtherLinks' })),
    );
    expect(reconciled.passedOver).toEqual([]);
    expect(reconciled.carried).toEqual([]);
    expect(new Set(reconciled.ranges.map((r) => r.carry))).toEqual(
      new Set(['followedByOtherLinks']),
    );
    expect(carriesNothing(reconciled.ranges)).toBe(true);
    expect(carriesNothing([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Card summaries
// ---------------------------------------------------------------------------

const field = (name: string): PathSegment => ({ Field: name, FromIndex: -1, ToIndex: -1 });
const keyed = (name: string, index = 0): PathSegment => ({
  FromIndex: index,
  ToIndex: index,
  MergeKeys: [{ Key: 'name', Value: name }],
});
const podSpec = [field('spec'), field('template'), field('spec')];

function containerChange(
  list: string,
  container: string,
  leaf: string[],
  from: string,
  to: string,
): PathChange {
  return {
    ChangeType: 'Update',
    Path: `spec.template.spec.${list}.?name=${container};@0.${leaf.join('.')}`,
    DisplayPath: `spec.template.spec.${list}.?name=${container}.${leaf.join('.')}`,
    Segments: [...podSpec, field(list), keyed(container), ...leaf.map(field)],
    FromValue: from,
    ToValue: to,
  };
}
const dataChange = (key: string, from: string, to: string): PathChange => ({
  ChangeType: 'Update',
  Path: `data.${key}`,
  DisplayPath: `data.${key}`,
  Segments: [field('data'), field(key)],
  FromValue: from,
  ToValue: to,
});
function unitDiff(
  unitId: string,
  type: string,
  name: string,
  changes: PathChange[],
): UnitDiff {
  return {
    UnitID: unitId,
    FromRevisionNum: 1,
    ToRevisionNum: 2,
    Diff: {
      Resources: [
        {
          ChangeType: 'Update',
          Resource: {
            ResourceType: type,
            ResourceName: `payments/${name}`,
            ResourceNameWithoutScope: name,
          },
          Changes: changes,
        },
      ],
    },
  };
}
const text = (summary: ReturnType<typeof cardSummaryOf>) =>
  summary.parts.map((p) => (p.mono ? `\`${p.text}\`` : p.text)).join(' ');

test.describe('card summaries', () => {
  test('an image tag move names its containers and the tag', () => {
    const summary = cardSummaryOf(
      [
        unitDiff('worker', 'apps/v1/Deployment', 'payments-worker', [
          containerChange(
            'containers',
            'worker',
            ['image'],
            'ghcr.io/acme/payments-worker:1.14.2',
            'ghcr.io/acme/payments-worker:1.15.0',
          ),
        ]),
        unitDiff('api', 'apps/v1/Deployment', 'payments-api', [
          containerChange(
            'initContainers',
            'migrate',
            ['image'],
            'ghcr.io/acme/payments-migrate:1.14.2',
            'ghcr.io/acme/payments-migrate:1.15.0',
          ),
        ]),
      ],
      false,
    );
    expect(summary.status).toBe('resolved');
    expect(text(summary)).toBe('`worker` `migrate` → `1.15.0`');
  });

  test('another field names its container, its last field and the value it takes', () => {
    const memory = cardSummaryOf(
      [
        unitDiff('api', 'apps/v1/Deployment', 'payments-api', [
          containerChange(
            'containers',
            'api',
            ['resources', 'limits', 'memory'],
            '512Mi',
            '768Mi',
          ),
        ]),
      ],
      false,
    );
    expect(text(memory)).toBe('`api` `memory` `768Mi`');
    const config = cardSummaryOf(
      [
        unitDiff('config', 'v1/ConfigMap', 'payments-config', [
          dataChange('FEATURE_3DS2', 'false', 'true'),
          dataChange('RETRY_LIMIT', '3', '5'),
        ]),
      ],
      false,
    );
    expect(text(config)).toBe('`FEATURE_3DS2` `true` · `RETRY_LIMIT` `5`');
  });

  test('nothing is said before the diffs land, and a failed diff is not "no change"', () => {
    expect(cardSummaryOf(undefined, false)).toEqual({ status: 'loading', parts: [] });
    expect(cardSummaryOf(undefined, true)).toEqual({ status: 'failed', parts: [] });
    expect(cardSummaryOf([{ UnitID: 'api', Error: { Message: 'gone' } }], false).status).toBe(
      'failed',
    );
  });
});

// ---------------------------------------------------------------------------
// The upgrade dry run, read
// ---------------------------------------------------------------------------

const deployment = (namespace: string, name = 'payments-api') =>
  `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${name}\n  namespace: ${namespace}\nspec:\n  replicas: 3\n`;
const configMap = (namespace: string, retry: string) =>
  `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: payments-config\n  namespace: ${namespace}\ndata:\n  RETRY_LIMIT: "${retry}"\n`;

const apiDiff = (withMemory: boolean): ConfigDiff => ({
  Resources: [
    {
      ChangeType: 'Update',
      Resource: {
        ResourceType: 'apps/v1/Deployment',
        ResourceName: 'payments/payments-api',
        ResourceNameWithoutScope: 'payments-api',
      },
      Changes: [
        containerChange(
          'containers',
          'api',
          ['image'],
          'ghcr.io/acme/payments-api:1.14.2',
          'ghcr.io/acme/payments-api:1.15.0',
        ),
        ...(withMemory
          ? [
              containerChange(
                'containers',
                'api',
                ['resources', 'limits', 'memory'],
                '512Mi',
                '768Mi',
              ),
            ]
          : []),
      ],
    },
  ],
});
const configDiff = (withRetry: boolean): ConfigDiff => ({
  Resources: [
    {
      ChangeType: 'Update',
      Resource: {
        ResourceType: 'v1/ConfigMap',
        ResourceName: 'payments/payments-config',
        ResourceNameWithoutScope: 'payments-config',
      },
      Changes: [
        dataChange('FEATURE_3DS2', 'false', 'true'),
        ...(withRetry ? [dataChange('RETRY_LIMIT', '3', '5')] : []),
      ],
    },
  ],
});
const protectedConflict = (
  path: string,
  kept: string,
  incoming: string,
  name: string,
  type: string,
): MutationConflict => ({
  Reason: 'ProtectedPath',
  Path: path,
  Resource: {
    ResourceType: type,
    ResourceName: `payments/${name}`,
    ResourceNameWithoutScope: name,
  },
  Source: { MutationType: 'Update', Value: `${incoming}\n` },
  Target: { MutationType: 'Update', Protected: true, Value: `${kept}\n` },
});
const MEMORY_PATH = 'spec.template.spec.containers.?name=api;@0.resources.limits.memory';

/** One variant Unit's answer from both dry runs. */
function answer(
  unitId: string,
  spaceId: string,
  data: string,
  diff: ConfigDiff,
  conflicts: MutationConflict[] = [],
) {
  const unit = { UnitID: unitId, SpaceID: spaceId, Slug: unitId.split('/')[1] };
  const replayed: UnitCreateOrUpdateResponseRead = {
    Unit: unit as UnitCreateOrUpdateResponseRead['Unit'],
    ConfigData: data,
    Conflicts: conflicts,
    Diff: { Resources: [] },
  };
  const squashed: UnitCreateOrUpdateResponseRead = {
    Unit: unit as UnitCreateOrUpdateResponseRead['Unit'],
    ConfigData: data,
    Conflicts: conflicts,
    Diff: diff,
  };
  return { replayed, squashed };
}

test.describe('readUpgradePreview', () => {
  test("the data is the replay's and the diff the squash's, where the two land on the same configuration", () => {
    const one = answer('dev/api', 'dev', deployment('dev'), apiDiff(true));
    const preview = readUpgradePreview([one.replayed], [one.squashed]);
    expect(preview.dataByUnitId.get('dev/api')).toBe(deployment('dev'));
    expect(preview.diffByUnitId.get('dev/api')).toEqual(apiDiff(true));
    expect(preview.undeterminedUnitIds.size).toBe(0);
  });

  test('where they land differently, or either failed, the Unit is undetermined, never unchanged', () => {
    const differ = answer('dev/api', 'dev', deployment('dev'), apiDiff(true));
    const failed = answer('stg/api', 'stg', deployment('stg'), apiDiff(true));
    const preview = readUpgradePreview(
      [differ.replayed, { ...failed.replayed, Error: { Message: 'merge failed' } }],
      [
        { ...differ.squashed, ConfigData: deployment('dev').replace('3', '4') },
        failed.squashed,
      ],
    );
    expect([...preview.undeterminedUnitIds].sort()).toEqual(['dev/api', 'stg/api']);
    expect(preview.dataByUnitId.size).toBe(0);
    expect(preview.unchangedUnitIds.size).toBe(0);
  });

  test('a withheld value is kept as the server reported it: the field, its container, what stays, what the base writes', () => {
    const usWest = answer('us-west/api', 'us-west', deployment('us-west'), apiDiff(false), [
      protectedConflict(MEMORY_PATH, '1Gi', '768Mi', 'payments-api', 'apps/v1/Deployment'),
      { Reason: 'ExclusiveCleared', Path: 'metadata.labels.x' },
    ]);
    const preview = readUpgradePreview([usWest.replayed], [usWest.squashed]);
    expect(preview.keptByUnitId.get('us-west/api')).toEqual([
      {
        unitId: 'us-west/api',
        resourceName: 'payments-api',
        resourceType: 'apps/v1/Deployment',
        path: MEMORY_PATH,
        field: 'memory',
        container: 'api',
        value: '1Gi',
        incoming: '768Mi',
        reason: 'ProtectedPath',
      },
    ]);
    // Both conflicts reach the stage tree; only the blocking one is a kept value.
    expect(preview.conflictsByUnitId.get('us-west/api')?.map((c) => c.blocks)).toEqual([
      true,
      false,
    ]);
  });

  test('the last field of a server path skips associative segments', () => {
    expect(lastFieldOf(MEMORY_PATH)).toBe('memory');
    expect(lastFieldOf('data.RETRY_LIMIT')).toBe('RETRY_LIMIT');
    expect(lastFieldOf('spec.list.?name=a.b;@2.value')).toBe('value');
  });
});

// ---------------------------------------------------------------------------
// Stages, outliers, totals
// ---------------------------------------------------------------------------

/** The payments dry runs for the release-1.15 range: api, config and worker carried; HPA not. */
function paymentsFixture() {
  const { starts, changeSets } = scenario();
  const ranges = deriveUnitRanges({
    starts,
    revisions: REVISIONS,
    startRevisions: new Map(),
    end: { kind: 'tag', tagId: END_TAG, changeSet: changeSets[0] },
    updateType: 'UpgradeUnit',
  });
  const replayed: UnitCreateOrUpdateResponseRead[] = [];
  const squashed: UnitCreateOrUpdateResponseRead[] = [];
  const units: DraftPreviewUnit[] = [];
  for (const spaceId of VARIANTS) {
    const api = answer(
      `${spaceId}/api`,
      spaceId,
      deployment(spaceId),
      apiDiff(spaceId !== 'us-west'),
      spaceId === 'us-west'
        ? [
            protectedConflict(
              MEMORY_PATH,
              '1Gi',
              '768Mi',
              'payments-api',
              'apps/v1/Deployment',
            ),
          ]
        : [],
    );
    const config = answer(
      `${spaceId}/config`,
      spaceId,
      configMap(spaceId, spaceId === 'apac' ? '4' : '5'),
      configDiff(spaceId !== 'apac'),
      spaceId === 'apac'
        ? [
            protectedConflict(
              'data.RETRY_LIMIT',
              '"4"',
              '"5"',
              'payments-config',
              'v1/ConfigMap',
            ),
          ]
        : [],
    );
    replayed.push(api.replayed, config.replayed);
    squashed.push(api.squashed, config.squashed);
    units.push(
      {
        unitId: `${spaceId}/api`,
        slug: 'payments-api',
        spaceId,
        upstreamUnitId: 'api',
        data: deployment(spaceId),
      },
      {
        unitId: `${spaceId}/config`,
        slug: 'payments-config',
        spaceId,
        upstreamUnitId: 'config',
        data: configMap(spaceId, spaceId === 'apac' ? '4' : '3'),
      },
      {
        unitId: `${spaceId}/hpa`,
        slug: 'payments-api-hpa',
        spaceId,
        upstreamUnitId: 'hpa',
        data: deployment(spaceId, 'payments-api-hpa'),
      },
    );
    if (spaceId !== 'apac') {
      const worker = answer(
        `${spaceId}/worker`,
        spaceId,
        deployment(spaceId, 'payments-worker'),
        apiDiff(false),
      );
      replayed.push(worker.replayed);
      squashed.push(worker.squashed);
      units.push({
        unitId: `${spaceId}/worker`,
        slug: 'payments-worker',
        spaceId,
        upstreamUnitId: 'worker',
        data: deployment(spaceId, 'payments-worker'),
      });
    }
  }
  // What the change carries at the source, as useDraftSourceDiff builds it.
  const sourceGroups = [
    { unitId: 'api', data: deployment('payments'), diff: apiDiff(true) },
    { unitId: 'config', data: configMap('payments', '5'), diff: configDiff(true) },
    {
      unitId: 'worker',
      data: deployment('payments', 'payments-worker'),
      diff: apiDiff(false),
    },
  ].map((g) => ({
    unitId: g.unitId,
    resourceName: g.unitId,
    resourceIdentity: resourceIdentityKeyOf(g.data),
    resourceIdentityJoinKeys: resourceIdentityJoinKeysOf(g.data),
    ...serverDiffGroupParts(g.diff, g.data, g.data),
    written: true,
    determinable: true,
  }));
  return {
    ranges,
    replayed,
    squashed,
    units,
    carriedResourceKeys: carriedResourceKeysOf(sourceGroups),
    nameBySpaceId: new Map(
      VARIANTS.map((v) => [v, `prod-${v}`.replace(/^prod-(dev|stg-..)$/, '$1')]),
    ),
  };
}

function paymentsPreview(inputOrder: string[]) {
  const stages = [
    { stageId: 'dev', spaceIds: ['dev'] },
    { stageId: 'staging', spaceIds: ['stg-eu', 'stg-us'] },
    { stageId: 'prod', spaceIds: inputOrder },
  ];
  return assembleDraftPreview({ stages, inScopeSpaceIds: ALL_IN_SCOPE, ...paymentsFixture() });
}

test.describe('the preview over stages', () => {
  test('6 of 8 same: dev and staging take it as the base wrote it, prod has two outliers', () => {
    const preview = paymentsPreview(['eu-west', 'eu-central', 'us-east', 'us-west', 'apac']);
    expect(preview.totals).toMatchObject({
      variants: 8,
      same: 6,
      differs: 2,
      adds: 0,
      unknown: 0,
      unstagedSpaceIds: [],
    });
    const prod = preview.stages.find((s) => s.stageId === 'prod');
    expect(prod?.outcome.groups.map((g) => [g.kind, g.spaceIds])).toEqual([
      ['differs', ['us-west', 'apac']],
      ['same', ['eu-west', 'eu-central', 'us-east']],
    ]);
  });

  test('an outlier listed first is not the canonical variant: the others still read "same"', () => {
    const preview = paymentsPreview(['us-west', 'apac', 'eu-west', 'eu-central', 'us-east']);
    const prod = preview.stages.find((s) => s.stageId === 'prod');
    expect(prod?.spaceIds[0]).toBe('eu-west');
    expect(prod?.outcome.groups.find((g) => g.kind === 'same')?.spaceIds).toEqual([
      'eu-west',
      'eu-central',
      'us-east',
    ]);
    expect(preview.totals?.same).toBe(6);
  });

  test('outliers are absolute: a kept value, and a resource the variant does not have yet', () => {
    const preview = paymentsPreview(['eu-west', 'eu-central', 'us-east', 'us-west', 'apac']);
    expect(preview.outliers.map((o) => [o.spaceId, o.text])).toEqual([
      ['us-west', 'memory stays 1Gi'],
      ['apac', 'adds payments-worker · keeps RETRY_LIMIT "4"'],
    ]);
  });

  test('a variant nobody could read is unknown, never same', () => {
    const preview = paymentsPreview(['eu-west', 'eu-central', 'us-east', 'us-west', 'apac']);
    expect(preview.undeterminedSpaceIds).toEqual([]);
    const { starts, changeSets } = scenario();
    const ranges = deriveUnitRanges({
      starts,
      revisions: REVISIONS,
      startRevisions: new Map(),
      end: { kind: 'tag', tagId: END_TAG, changeSet: changeSets[0] },
      updateType: 'UpgradeUnit',
    });
    const unread = assembleDraftPreview({
      stages: [{ stageId: 'dev', spaceIds: ['dev'] }],
      inScopeSpaceIds: ['dev'],
      nameBySpaceId: new Map([['dev', 'dev']]),
      units: [
        {
          unitId: 'dev/api',
          slug: 'payments-api',
          spaceId: 'dev',
          upstreamUnitId: 'api',
          data: deployment('dev'),
        },
      ],
      ranges,
      replayed: [],
      squashed: [],
      carriedResourceKeys: null,
    });
    expect(unread.undeterminedSpaceIds).toEqual(['dev']);
    expect(unread.totals).toMatchObject({ same: 0, unknown: 1 });
  });

  test('orderStageMembers puts plain variants first, then outliers, then the unreadable', () => {
    expect(orderStageMembers(['a', 'b', 'c', 'd'], new Set(['a']), new Set(['b']))).toEqual([
      'c',
      'd',
      'a',
      'b',
    ]);
  });

  test('chip words: one kept value is a fact about the field; several facts are what the variant does', () => {
    const kept = {
      kind: 'kept' as const,
      unitId: 'u',
      resourceName: 'r',
      resourceType: 't',
      path: 'spec.maxReplicas',
      field: 'maxReplicas',
      container: undefined,
      value: '30',
      incoming: '20',
      reason: 'ProtectedPath',
    };
    expect(outlierText([kept])).toBe('maxReplicas stays 30');
    expect(
      outlierText([{ kind: 'adds', baseUnitId: 'w', slug: 'payments-worker' }, kept]),
    ).toBe('adds payments-worker · keeps maxReplicas 30');
    // Without the value the server kept, only the field is named; nothing is filled in.
    const unvalued = { ...kept, value: undefined };
    expect(outlierText([unvalued])).toBe('keeps maxReplicas');
    expect(
      outlierText([{ kind: 'adds', baseUnitId: 'w', slug: 'payments-worker' }, unvalued]),
    ).toBe('adds payments-worker · keeps maxReplicas');
  });

  test('a stage none of whose members holds a carried resource reads "adds", not "same"', () => {
    const preview = assembleDraftPreview({
      stages: [{ stageId: 'prod', spaceIds: ['apac'] }],
      inScopeSpaceIds: ['apac'],
      ...paymentsFixture(),
    });
    // A lone variant, short of payments-worker: nothing in the stage holds the resource, so no
    // matrix row says so; the clone does.
    expect(preview.stages[0].outcome.groups.map((g) => [g.kind, g.spaceIds])).toEqual([
      ['adds', ['apac']],
    ]);
    const fixture = paymentsFixture();
    const cloneOnly = assembleDraftPreview({
      stages: [{ stageId: 'prod', spaceIds: ['apac'] }],
      inScopeSpaceIds: ['apac'],
      ...fixture,
      // Without its kept RETRY_LIMIT, apac's only difference is the resource it lacks.
      replayed: fixture.replayed.map((item) =>
        item.Unit?.UnitID === 'apac/config' ? { ...item, Conflicts: [] } : item,
      ),
      squashed: fixture.squashed.map((item) =>
        item.Unit?.UnitID === 'apac/config'
          ? { ...item, Conflicts: [], Diff: configDiff(true) }
          : item,
      ),
    });
    expect(
      cloneOnly.stages[0].outcome.groups.map((g) => [
        g.kind,
        g.spaceIds,
        g.representativeSpaceId,
      ]),
    ).toEqual([['adds', ['apac'], 'apac']]);
    expect(cloneOnly.totals).toMatchObject({ same: 0, adds: 1 });
    expect(cloneOnly.outliers.map((o) => o.text)).toEqual(['adds payments-worker']);
  });

  test('two variants that both lack a carried resource are raised together', () => {
    const fixture = paymentsFixture();
    const noWorker = (id: string | undefined) =>
      id !== undefined && /^(eu-west|us-east)\/worker$/.test(id);
    const ranges = fixture.ranges.map((r) =>
      r.unitId === 'worker' ? { ...r, cloneSpaceIds: ['eu-west', 'us-east'] } : r,
    );
    const preview = assembleDraftPreview({
      stages: [{ stageId: 'prod', spaceIds: ['eu-west', 'us-east'] }],
      inScopeSpaceIds: ['eu-west', 'us-east'],
      ...fixture,
      ranges,
      units: fixture.units.filter((u) => !noWorker(u.unitId)),
      replayed: fixture.replayed.filter((i) => !noWorker(i.Unit?.UnitID)),
      squashed: fixture.squashed.filter((i) => !noWorker(i.Unit?.UnitID)),
    });
    expect(preview.stages[0].outcome.groups.map((g) => [g.kind, g.spaceIds])).toEqual([
      ['adds', ['eu-west', 'us-east']],
    ]);
  });

  test('a variant taking the change from another Space: could not establish, and no "adds" chip', () => {
    const fixture = paymentsFixture();
    const units = fixture.units.map((u) =>
      u.spaceId === 'apac' ? { ...u, upstreamUnitId: `eu-west/${u.upstreamUnitId}` } : u,
    );
    const ranges = fixture.ranges.map((r) => ({
      ...r,
      cloneSpaceIds: r.cloneSpaceIds.filter((id) => id !== 'apac'),
    }));
    const preview = assembleDraftPreview({
      stages: [
        { stageId: 'prod', spaceIds: ['eu-west', 'eu-central', 'us-east', 'us-west', 'apac'] },
      ],
      inScopeSpaceIds: ALL_IN_SCOPE,
      ...fixture,
      units,
      ranges,
      foreignSpaceIds: new Set(['apac']),
    });
    expect(preview.undeterminedSpaceIds).toEqual(['apac']);
    expect(preview.outliers.map((o) => o.spaceId)).toEqual(['us-west']);
    const prod = preview.stages[0];
    expect(prod.outcome.groups.find((g) => g.kind === 'unknown')?.spaceIds).toEqual(['apac']);
  });

  test('a change that carries nothing has no "N of N same"', () => {
    const fixture = paymentsFixture();
    const preview = assembleDraftPreview({
      stages: [{ stageId: 'dev', spaceIds: ['dev'] }],
      inScopeSpaceIds: ['dev'],
      ...fixture,
      ranges: fixture.ranges.map((r) => ({
        ...r,
        carry: 'taken' as const,
        cloneSpaceIds: [],
      })),
      replayed: [],
      squashed: [],
    });
    expect(preview.nothingToCarry).toBe(true);
    expect(preview.totals).toBeUndefined();
  });

  test('a variant on no stage of the path is in no count, no outlier and no stage', () => {
    const stages = [
      { stageId: 'dev', spaceIds: ['dev'] },
      { stageId: 'staging', spaceIds: ['stg-eu', 'stg-us'] },
      { stageId: 'prod', spaceIds: ['eu-west', 'eu-central', 'us-east', 'us-west'] },
    ];
    const preview = assembleDraftPreview({
      stages,
      inScopeSpaceIds: ALL_IN_SCOPE,
      ...paymentsFixture(),
    });
    expect(preview.outsideStageSpaceIds).toEqual(['apac']);
    expect(preview.totals).toMatchObject({
      variants: 7,
      same: 6,
      differs: 1,
      unstagedSpaceIds: ['apac'],
    });
    expect(preview.outliers.map((o) => o.spaceId)).toEqual(['us-west']);
    expect(preview.undeterminedSpaceIds).toEqual([]);
  });

  test('no variant in scope has no "0 of 0 same"', () => {
    const fixture = paymentsFixture();
    const preview = assembleDraftPreview({
      stages: [{ stageId: 'dev', spaceIds: [] }],
      inScopeSpaceIds: [],
      ...fixture,
      replayed: [],
      squashed: [],
    });
    expect(preview.nothingToCarry).toBe(false);
    expect(preview.totals).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The address and the decisions
// ---------------------------------------------------------------------------

const MAIN_LINE: DraftWorkflow = {
  workflowId: 'wf-main',
  slug: 'main-line',
  name: 'main-line',
  stageNames: ['dev', 'staging', 'prod'],
  stages: [],
  spec: {},
};
const HOTFIX: DraftWorkflow = {
  workflowId: 'wf-hotfix',
  slug: 'hotfix',
  name: 'hotfix',
  stageNames: ['staging', 'prod'],
  stages: [],
  spec: {},
};
const VARIANT_LIST: DraftVariant[] = VARIANTS.map((spaceId) => ({
  spaceId,
  slug: `payments-${spaceId}`,
  name: spaceId,
  stage: undefined,
  region: undefined,
}));
const LAST: DraftPastChangeOrder = {
  changeOrderId: 'co-1',
  slug: 'payments-2026-10-09',
  description: '1.14.2 + envoy 1.30.1',
  updateType: 'UpgradeUnit',
  workflowId: 'wf-main',
  inScopeSpaceIds: [...VARIANTS],
  adoptedEndTagId: undefined,
  state: 'Released',
  createdAt: '2026-10-09T09:41:00+01:00',
  author: person('Brian'),
  changeOrder: { Slug: 'payments-2026-10-09' },
};

function decide(search: string, overrides: Partial<ResolveDraftDecisionsInput> = {}) {
  return resolveDraftDecisions({
    address: parseDraftAddress(new URLSearchParams(search)),
    componentSlug: 'payments',
    baseSpaceSlug: 'payments-base',
    pastChangeOrders: [LAST],
    variants: VARIANT_LIST,
    workflows: [HOTFIX, MAIN_LINE],
    policy: { allowedWorkflowIds: ['wf-main', 'wf-hotfix'], required: true },
    today: '2026-10-18',
    ...overrides,
  });
}

test.describe('the draft address', () => {
  test('reads slugs, keeps a cleared name as decided, and an empty out as "every variant"', () => {
    expect(
      parseDraftAddress(
        new URLSearchParams('space=payments-base&end=release-1.15&name=&out=&stage=prod'),
      ),
    ).toEqual({
      space: 'payments-base',
      end: 'release-1.15',
      stage: 'prod',
      name: '',
      out: [],
    });
  });

  test('a link to a draft carries slugs only', () => {
    expect(draftHref({ space: 'payments-base' })).toBe(
      '/change-orders/new?space=payments-base',
    );
    expect(draftHref({ space: 'payments-base', from: 'payments-2026-10-09' })).toBe(
      '/change-orders/new?space=payments-base&from=payments-2026-10-09',
    );
  });

  test('a patch writes in a fixed order, removes what is set to null, and keeps parameters it does not own', () => {
    const next = applyDraftAddressPatch(
      new URLSearchParams('space=payments-base&x=1&name=a'),
      { out: ['payments-prod-apac'], name: null, end: 'release-1.15' },
    );
    expect(next.toString()).toBe(
      'x=1&space=payments-base&end=release-1.15&out=payments-prod-apac',
    );
  });
});

test.describe('the decisions', () => {
  test('re-aiming the last ChangeOrder: its workflow, scope and update type, a new dated name', () => {
    const decisions = decide('space=payments-base');
    expect(decisions.template).toEqual({ kind: 'changeOrder', changeOrder: LAST });
    expect(decisions.name).toMatchObject({
      value: 'payments-2026-10-18',
      last: 'payments-2026-10-09',
      differsFromLast: true,
    });
    expect(decisions.workflow).toMatchObject({
      value: { kind: 'workflow', workflow: MAIN_LINE },
      last: { kind: 'workflow', workflow: MAIN_LINE },
      differsFromLast: false,
    });
    expect(decisions.scope).toMatchObject({
      value: VARIANTS,
      last: VARIANTS,
      differsFromLast: false,
    });
    expect(decisions.updateType).toMatchObject({ value: 'UpgradeUnit', last: 'UpgradeUnit', differsFromLast: false });
    expect(decisions.end.value).toEqual({ kind: 'head' });
    expect(decisions.problems).toEqual([]);
  });

  test('leaving a variant out differs from last time, and the rest stay as last time', () => {
    const decisions = decide('space=payments-base&out=payments-apac');
    expect(decisions.scope).toMatchObject({ last: VARIANTS, differsFromLast: true });
    expect(decisions.workflow.differsFromLast).toBe(false);
    expect(decisions.updateType.differsFromLast).toBe(false);
    expect(decisions.scope.value).not.toContain('apac');
    expect(decisions.leftOut).toEqual(['payments-apac']);
  });

  test("the last workflow, when the policy no longer allows it, gives way to the policy's only one", () => {
    const decisions = decide('space=payments-base', {
      workflows: [HOTFIX],
      policy: { allowedWorkflowIds: ['wf-hotfix'], required: true },
    });
    // Last time's workflow is not one this draft can go back to: there is nothing to compare.
    expect(decisions.workflow).toMatchObject({
      value: { kind: 'workflow', workflow: HOTFIX },
      last: undefined,
      differsFromLast: false,
    });
  });

  test('the policy names no default: with several allowed and no last ChangeOrder, Create waits for a pick', () => {
    const decisions = decide('space=payments-base&from=-');
    expect(decisions.template).toEqual({ kind: 'policy' });
    expect(decisions.workflow.value).toEqual({ kind: 'unset' });
    expect(decisions.problems.map((p) => [p.row, p.code])).toEqual([
      ['path', 'workflow-unset'],
    ]);
    expect(draftCreateRequest({ decisions, endTagId: null })).toBeUndefined();
  });

  test('an empty scope is a problem, and no request is made with it, even with no variants at all', () => {
    const none = decide(
      'space=payments-base&out=' + VARIANT_LIST.map((v) => v.slug).join(','),
    );
    expect(none.problems.map((p) => p.code)).toContain('scope-empty');
    expect(draftCreateRequest({ decisions: none, endTagId: null })).toBeUndefined();
    const lonely = decide('space=payments-base&from=-&wf=main-line', { variants: [] });
    expect(lonely.problems.map((p) => p.code)).toContain('scope-empty');
    expect(draftCreateRequest({ decisions: lonely, endTagId: null })).toBeUndefined();
  });

  test('an aborted ChangeOrder is no default template, though it can be named', () => {
    const aborted = {
      ...LAST,
      slug: 'payments-2026-10-12',
      state: 'Aborted',
      changeOrder: { Slug: 'payments-2026-10-12', AbortedReason: 'bad build' },
    };
    const decisions = decide('space=payments-base', { pastChangeOrders: [aborted, LAST] });
    expect(decisions.template).toEqual({ kind: 'changeOrder', changeOrder: LAST });
    const named = decide('space=payments-base&from=payments-2026-10-12', {
      pastChangeOrders: [aborted, LAST],
    });
    expect(named.template).toEqual({ kind: 'changeOrder', changeOrder: aborted });
  });

  test('a workflow the policy does not allow is named as not allowed', () => {
    const decisions = decide('space=payments-base&wf=yolo');
    expect(decisions.problems.map((p) => [p.row, p.code, p.message])).toEqual([
      ['path', 'workflow-not-allowed', 'yolo is not allowed here'],
    ]);
  });

  test('a URL value that names nothing is a problem with its one-click way out', () => {
    const fixes = (search: string) =>
      decide(search).problems.map((p) => [p.code, p.blocks, p.fix?.label, p.fix?.patch]);
    expect(fixes('space=payments-base&from=nope')).toContainEqual([
      'template-not-found',
      false,
      'Use the last ChangeOrder',
      { from: null },
    ]);
    expect(fixes('space=payments-base&wf=nope')).toEqual([
      ['workflow-not-allowed', true, 'Default workflow', { wf: null }],
    ]);
    expect(fixes('space=payments-base&out=payments-apac,nope')).toEqual([
      ['variant-not-found', false, 'Forget nope', { out: ['payments-apac'] }],
    ]);
    expect(fixes('space=payments-base&update=Nope')).toEqual([
      ['update-type-unknown', false, 'Default update type', { update: null }],
    ]);
    expect(fixes('space=payments-base&stage=qa')).toEqual([
      ['stage-not-found', false, 'Default stage', { stage: null }],
    ]);
    expect(decide('space=payments-base&stage=qa').stage).toBeUndefined();
  });

  test('the URL names the source node and the Complete step in words, never their ids', () => {
    const stages = ['dev', 'staging', 'prod'];
    expect(decide('space=payments-base&stage=prod').stage).toBe('prod');
    expect(decide('space=payments-base&stage=source').stage).toBe(SOURCE_STAGE_ID);
    expect(decide('space=payments-base&stage=complete').stage).toBe(COMPLETE_STAGE_ID);
    // A link written with the ids still opens the node.
    expect(draftStageIdOf(COMPLETE_STAGE_ID, stages)).toBe(COMPLETE_STAGE_ID);
    expect(draftStageParamOf(SOURCE_STAGE_ID, stages)).toBe(DRAFT_STAGE_WORDS.source);
    expect(draftStageParamOf(COMPLETE_STAGE_ID, stages)).toBe(DRAFT_STAGE_WORDS.complete);
    expect(draftStageParamOf('prod', stages)).toBe('prod');
    // A workflow stage called "complete" keeps the word; the Complete step keeps its id.
    const odd = ['build', 'complete'];
    expect(draftStageIdOf('complete', odd)).toBe('complete');
    expect(draftStageParamOf(COMPLETE_STAGE_ID, odd)).toBe(COMPLETE_STAGE_ID);
    expect(draftStageIdOf(COMPLETE_STAGE_ID, odd)).toBe(COMPLETE_STAGE_ID);
    // Without a workflow the stage card is the scope: there is no node to name.
    expect(
      decide('space=payments-base&wf=-&stage=prod', {
        policy: { allowedWorkflowIds: [], required: false },
      }).stage,
    ).toBeUndefined();
  });

  test('no workflow under a required policy is refused before the server is asked', () => {
    const decisions = decide('space=payments-base&wf=-');
    expect(decisions.problems.map((p) => p.code)).toEqual(['workflow-required']);
  });

  test('a name: the server rule, and unique in the Space', () => {
    expect(
      nameProblems('payments-2026-10-09', new Set(['payments-2026-10-09'])).map((p) => p.code),
    ).toEqual(['name-taken']);
    expect(nameProblems('-bad', new Set()).map((p) => p.code)).toEqual(['name-format']);
    expect(nameProblems('', new Set()).map((p) => p.code)).toEqual(['name-empty']);
    expect(
      suggestDraftName({
        lastSlug: 'payments-2026-10-09',
        stem: 'payments',
        today: '2026-10-09',
        taken: new Set(['payments-2026-10-09']),
      }),
    ).toBe('payments-2026-10-09-2');
    expect(
      suggestDraftName({
        lastSlug: 'release',
        stem: 'payments',
        today: '2026-10-18',
        taken: new Set(),
      }),
    ).toBe('payments-2026-10-18');
  });

  test("the description comes from the image tags the change moves to, in the last one's style", () => {
    const changes = imageChangesFromUnitDiffs([
      unitDiff('api', 'apps/v1/Deployment', 'payments-api', [
        containerChange(
          'containers',
          'api',
          ['image'],
          'ghcr.io/acme/payments-api:1.14.2',
          'ghcr.io/acme/payments-api:1.15.0',
        ),
        containerChange(
          'containers',
          'envoy',
          ['image'],
          'docker.io/envoyproxy/envoy:v1.30.1',
          'docker.io/envoyproxy/envoy:v1.30.4',
        ),
        containerChange(
          'initContainers',
          'migrate',
          ['image'],
          'ghcr.io/acme/payments-migrate:1.14.2',
          'ghcr.io/acme/payments-migrate:1.15.0',
        ),
      ]),
    ]);
    const suggestion = suggestDraftDescription(changes);
    expect(suggestion).toBe('1.15.0 + envoy 1.30.4');
    const address = parseDraftAddress(new URLSearchParams('space=payments-base'));
    const decisions = withDescriptionSuggestion(
      decide('space=payments-base'),
      address,
      suggestion,
    );
    expect(decisions.description).toMatchObject({
      value: '1.15.0 + envoy 1.30.4',
      last: '1.14.2 + envoy 1.30.1',
      differsFromLast: true,
    });
    // A description the URL holds is the reader's, and stays.
    const typed = parseDraftAddress(new URLSearchParams('space=payments-base&desc=hand'));
    expect(
      withDescriptionSuggestion(decide('space=payments-base&desc=hand'), typed, suggestion)
        .description.value,
    ).toBe('hand');
  });

  test('the create request: an explicit scope, the end Tag, the workflow', () => {
    const request = draftCreateRequest({
      decisions: decide('space=payments-base&out=payments-apac'),
      endTagId: END_TAG,
    });
    expect(request).toEqual({
      Slug: 'payments-2026-10-18',
      Description: '',
      UpdateType: 'UpgradeUnit',
      InScopeSpaceIDs: VARIANTS.filter((v) => v !== 'apac'),
      EndTagID: END_TAG,
      ChangeWorkflowID: 'wf-main',
    });
    expect(
      draftCreateRequest({ decisions: decide('space=payments-base'), endTagId: null })
        ?.EndTagID,
    ).toBeUndefined();
  });
});

test.describe('what the page says of the draft', () => {
  test('outside every stage: display names, never a Space id, and Leave out by slug', () => {
    const problem = outsideEveryStageProblem({
      outsideSpaceIds: ['dev', 'not-a-variant'],
      variants: VARIANT_LIST.map((v) => (v.spaceId === 'dev' ? { ...v, name: 'Dev' } : v)),
      workflow: { ...HOTFIX, name: 'Hotfix' },
      leftOut: ['payments-apac'],
    });
    expect(problem).toMatchObject({
      row: 'where',
      code: 'outside-every-stage',
      message: 'Dev outside every stage of Hotfix',
      blocks: false,
      fix: { label: 'Leave out', patch: { out: ['payments-apac', 'payments-dev'] } },
    });
    expect(problem?.message).not.toContain('not-a-variant');
    expect(
      outsideEveryStageProblem({
        outsideSpaceIds: ['not-a-variant'],
        variants: VARIANT_LIST,
        workflow: HOTFIX,
        leftOut: [],
      }),
    ).toBeUndefined();
  });

  test('an end suggestion names the cards it leaves out, or the ones it takes back in', () => {
    const { cards, changeSets } = scenario();
    const withInclusion = cards.map((card, at) => ({
      ...card,
      inclusion: at < 5 ? ('all' as const) : ('none' as const),
    }));
    const release = { kind: 'changeSet' as const, changeSet: changeSets[0] };
    expect(cardsAffectedBy(release, withInclusion).map((c) => c.cardId)).toEqual([
      withInclusion[5].cardId,
    ]);
    expect(cardsAffectedBy({ kind: 'head' }, withInclusion).map((c) => c.cardId)).toEqual([
      withInclusion[5].cardId,
    ]);
    const atHead = withInclusion.map((card) => ({ ...card, inclusion: 'all' as const }));
    expect(cardsAffectedBy({ kind: 'head' }, atHead)).toEqual([]);
  });

  test('the dry run in one sentence: the count, then each outlier by name and outcome', () => {
    const assembly = paymentsPreview(['eu-west', 'eu-central', 'us-east', 'us-west', 'apac']);
    const preview: DraftPreview = {
      ...assembly,
      status: 'resolved',
      reason: undefined,
      retry: () => undefined,
      sequence: undefined,
      clones: [],
      nameBySpaceId: new Map(),
      currentDataByUnitId: new Map(),
    };
    expect(dryRunSentence(preview)).toBe(
      'Dry run: 6 of 8 same, prod-us-west differs, prod-apac differs',
    );
    expect(dryRunSentence({ ...preview, totals: undefined })).toBe('');
  });
});

test.describe('the create dry run, read', () => {
  test("each refusal goes to the row it belongs to, in the server's words", () => {
    expect(refusalRow(409, 'Error on Tag: A Tag with the same value already exists.')).toBe(
      'name',
    );
    expect(refusalRow(400, 'component payments requires a ChangeWorkflow')).toBe('path');
    expect(refusalRow(400, 'ChangeWorkflow 1d29 is not allowed by component payments')).toBe(
      'path',
    );
    expect(
      refusalRow(
        400,
        'unit payments-api: the targets are at different revisions of it (4, 6); upgrade them to the same revision or narrow the spaces the change order is headed for',
      ),
    ).toBe('howMuch');
    expect(
      refusalRow(
        400,
        'the change order is headed for space payments-prod, which it reaches only through payments-staging',
      ),
    ).toBe('where');
    expect(refusalRow(400, 'something nobody planned for')).toBe('create');
  });

  test('only a 4xx is a refusal: a 5xx or a network error says nothing about the draft', () => {
    expect([400, 403, 409].every(isRefusal)).toBe(true);
    expect([500, 502, 'FETCH_ERROR', 'TIMEOUT_ERROR', undefined].some(isRefusal)).toBe(false);
  });

  test('the upgrade preview fits both IN lists inside the query-string budget', () => {
    const spaces = Array.from(
      { length: 255 },
      (_, i) => `space-${String(i).padStart(32, '0')}`,
    );
    const upstream = Array.from(
      { length: 120 },
      (_, i) => `unit-${String(i).padStart(32, '0')}`,
    );
    const wheres = upgradePreviewWheres(spaces, upstream);
    expect(wheres.every((where) => encodeURIComponent(where).length <= 6000)).toBe(true);
    // Every Space × upstream Unit pair once.
    const pairs = new Set<string>();
    for (const where of wheres) {
      const [spacePart, unitPart] = where.split(' AND ');
      for (const space of spacePart.match(/space-\d+/g) ?? []) {
        for (const unit of unitPart.match(/unit-\d+/g) ?? []) pairs.add(`${space}|${unit}`);
      }
    }
    expect(pairs.size).toBe(spaces.length * upstream.length);
    expect(upgradePreviewWheres(['a'], ['b'])).toEqual([
      "SpaceID IN ('a') AND UpstreamUnitID IN ('b')",
    ]);
  });

  test('a retry asks again only the reads that failed, and never a skipped one', () => {
    const asked: string[] = [];
    const read = (name: string, isError: boolean, isUninitialized = false) => ({
      isError,
      isUninitialized,
      refetch: () => asked.push(name),
    });
    expect(
      retryFailedReads([read('ok', false), read('failed', true), read('skipped', true, true)]),
    ).toBe(1);
    expect(asked).toEqual(['failed']);
  });

  test("SkippedUnits in the base's own order", () => {
    expect(
      skippedUnitsOf(
        { Slug: 'x', SkippedUnits: { service: 'AlreadyTaken', hpa: 'NotMarked' } },
        ['hpa', 'service'],
      ),
    ).toEqual([
      { unitId: 'hpa', reason: 'NotMarked' },
      { unitId: 'service', reason: 'AlreadyTaken' },
    ]);
  });
});

test.describe('where the summary card says a problem', () => {
  const placeOf = (problem: { row: DraftRow }) => DRAFT_PLACE_OF_ROW[problem.row];

  test("each problem is said under the part of the card it is about, and a refusal of Create only beside Create", () => {
    const at = (query: string) => decide(query).problems.map((problem) => [problem.code, placeOf(problem)]);
    expect(at('space=payments-base&from=nope')).toContainEqual(['template-not-found', 'title']);
    expect(at('space=payments-base&wf=nope')).toContainEqual(['workflow-not-allowed', 'facts']);
    expect(at('space=payments-base&update=nope')).toContainEqual(['update-type-unknown', 'change']);
    expect(at('space=payments-base&out=nope')).toContainEqual(['variant-not-found', 'outcome']);
    expect(at('space=payments-base&name=')).toContainEqual(['name-empty', 'title']);
    // The server's refusals land beside the decision they refuse; one nobody recognises, beside Create.
    expect(placeOf({ row: refusalRow(400, 'component payments requires a ChangeWorkflow') })).toBe('facts');
    expect(placeOf({ row: refusalRow(409, 'A Tag with the same value already exists.') })).toBe('title');
    expect(placeOf({ row: refusalRow(400, 'Variants have taken different revisions of it') })).toBe('change');
    expect(placeOf({ row: refusalRow(400, 'something nobody planned for') })).toBeUndefined();
  });

  test("a changed fact's name says what it was; an unchanged one, only what it is", () => {
    expect(factSlotLabel('Update type', 'MergeUnits', 'UpgradeUnit')).toBe('Update type: MergeUnits, was UpgradeUnit');
    expect(factSlotLabel('Scope', '2 variants', '3 variants')).toBe('Scope: 2 variants, was 3 variants');
    expect(factSlotLabel('Workflow', 'main-line', undefined)).toBe('Workflow: main-line');
  });
});

test.describe('which update types a draft can propagate by', () => {
  // UpgradeUnit Links (the clones) reach every variant; one MergeUnits Link reaches apac.
  const linked = linkedSpacesOf([
    ...VARIANTS.map((spaceId) => ({ spaceId, updateType: 'UpgradeUnit' })),
    { spaceId: 'apac', updateType: 'MergeUnits' },
    // Not a type a draft propagates by, and a row the select left incomplete: neither counts.
    { spaceId: 'dev', updateType: 'NeedsProvides' },
    { spaceId: undefined, updateType: 'MergeUnits' },
  ]);

  test("MergeUnits is available when one of its Links reaches the scope; UpgradeUnit also when a variant has no Link, as it is cloned into", () => {
    expect(updateTypeAvailability(linked, VARIANTS)).toEqual({ UpgradeUnit: 'available', MergeUnits: 'available' });
    expect(updateTypeAvailability(linked, ['apac'])).toEqual({ UpgradeUnit: 'available', MergeUnits: 'available' });
    expect(updateTypeAvailability(linked, ['dev', 'us-west'])).toEqual({ UpgradeUnit: 'available', MergeUnits: 'unavailable' });
    // apac follows the base by MergeUnits only: nothing there for UpgradeUnit.
    const mergeOnly = linkedSpacesOf([{ spaceId: 'apac', updateType: 'MergeUnits' }]);
    expect(updateTypeAvailability(mergeOnly, ['apac'])).toEqual({ UpgradeUnit: 'unavailable', MergeUnits: 'available' });
    // dev has no Link from the base at all: UpgradeUnit clones the base's Units into it.
    expect(updateTypeAvailability(mergeOnly, ['dev'])).toEqual({ UpgradeUnit: 'available', MergeUnits: 'unavailable' });
    expect(updateTypeAvailability(mergeOnly, ['apac', 'dev'])).toEqual({ UpgradeUnit: 'available', MergeUnits: 'available' });
    expect(updateTypeAvailability(linkedSpacesOf([]), ['dev'])).toEqual({ UpgradeUnit: 'available', MergeUnits: 'unavailable' });
    // No variant in scope: neither.
    expect(updateTypeAvailability(linked, [])).toEqual({ UpgradeUnit: 'unavailable', MergeUnits: 'unavailable' });
  });

  test('while the Links are not known, nothing is claimed of either type', () => {
    expect(updateTypeAvailability(undefined, VARIANTS)).toEqual({ UpgradeUnit: 'unknown', MergeUnits: 'unknown' });
  });

  test("the default is last time's type while its Links reach the scope, else the one whose Links do", () => {
    const both = { UpgradeUnit: 'available', MergeUnits: 'available' } as const;
    const mergeOnly = { UpgradeUnit: 'unavailable', MergeUnits: 'available' } as const;
    const neither = { UpgradeUnit: 'unavailable', MergeUnits: 'unavailable' } as const;
    const unknown = { UpgradeUnit: 'unknown', MergeUnits: 'unknown' } as const;
    expect(defaultUpdateType('MergeUnits', both)).toBe('MergeUnits');
    expect(defaultUpdateType('UpgradeUnit', mergeOnly)).toBe('MergeUnits');
    expect(defaultUpdateType(undefined, mergeOnly)).toBe('MergeUnits');
    expect(defaultUpdateType('MergeUnits', unknown)).toBe('MergeUnits');
    expect(defaultUpdateType('MergeUnits', neither)).toBe('MergeUnits');
    expect(defaultUpdateType(undefined, neither)).toBe('UpgradeUnit');
  });

  test('a type the URL names whose Links reach no variant in scope blocks Create, and the fix takes the one that can', () => {
    const decided = decide('space=payments-base&update=MergeUnits&out=payments-apac', { linkedSpaces: linked });
    expect(decided.updateType.value).toBe('MergeUnits');
    expect(decided.updateTypes).toEqual({ UpgradeUnit: 'available', MergeUnits: 'unavailable' });
    const problem = decided.problems.find((item) => item.code === 'update-type-no-link');
    expect(problem).toMatchObject({ row: 'same', blocks: true, message: 'No MergeUnits Link to these variants' });
    // Last time's UpgradeUnit is the default, so the fix clears the URL's choice.
    expect(problem?.fix).toEqual({ label: 'Use UpgradeUnit', patch: { update: null } });
    // With apac in scope, MergeUnits is a choice like any other.
    expect(decide('space=payments-base&update=MergeUnits', { linkedSpaces: linked }).problems.map((item) => item.code)).not.toContain('update-type-no-link');
    // Nobody knows the Links yet: nothing is said.
    expect(decide('space=payments-base&update=MergeUnits&out=payments-apac').problems.map((item) => item.code)).not.toContain('update-type-no-link');
  });

  test('with no variant in scope neither type is available, and only the scope says so', () => {
    const decided = decide('space=payments-base&update=MergeUnits&out=' + VARIANT_LIST.map((v) => v.slug).join(','), { linkedSpaces: linked });
    expect(decided.updateTypes).toEqual({ UpgradeUnit: 'unavailable', MergeUnits: 'unavailable' });
    expect(decided.problems.map((item) => item.code)).toContain('scope-empty');
    expect(decided.problems.map((item) => item.code)).not.toContain('update-type-no-link');
  });

  test('a variant with no Link from the base keeps UpgradeUnit on offer, as last time had it', () => {
    const mergeOnly = linkedSpacesOf([{ spaceId: 'apac', updateType: 'MergeUnits' }]);
    const decided = decide('space=payments-base&out=payments-apac', { linkedSpaces: mergeOnly });
    expect(decided.updateTypes).toEqual({ UpgradeUnit: 'available', MergeUnits: 'unavailable' });
    expect(decided.updateType.value).toBe('UpgradeUnit');
    expect(decided.problems.map((item) => item.code)).not.toContain('update-type-no-link');
  });
});
