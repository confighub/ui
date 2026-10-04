// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Cross-entity cache invalidation for the generated API.
 *
 * The RTK Query client is generated from the OpenAPI spec, and every operation
 * there carries exactly one OpenAPI tag: its own entity name (see
 * `internal/openapispec/endpoint_builder.go`, `op.WithTags(tagName)`). The
 * codegen turns that single tag into both `providesTags` and `invalidatesTags`,
 * so a generated mutation can only ever invalidate the entity it is named
 * after. It has no way to say that it also changed something else.
 *
 * Real writes are not that tidy. Applying a Unit writes a Revision, a
 * UnitAction and a QueuedOperation. Publishing a Release writes onto Revisions.
 * Deleting a Space recursively deletes eleven other entity types. Without the
 * additions below, six tag types — Revision, UnitEvent, QueuedOperation,
 * Mutation, UnitAction and BridgeWorkerStatus — are provided by queries but
 * named by no mutation at all, which means nothing in the application can
 * refetch them.
 *
 * This file supplies the missing edges as source, so the codegen stays
 * untouched: `applyInvalidationMap` merges them into the generated definitions
 * after injection. Entries are additive — the generated self-tag is always
 * retained, and only extra tags are listed here.
 *
 * The map is exhaustive by construction: `invalidationMap.test.ts` fails when a
 * mutation endpoint exists that is named in neither `EXTRA_INVALIDATIONS` nor
 * `SELF_TAG_IS_SUFFICIENT`, so a newly generated endpoint cannot silently
 * inherit an incomplete graph.
 *
 * See docs/design/ui-liveness.md.
 */
import type { addTagTypes } from '@confighub/rtk-query';
import { confighubApi } from '@confighub/rtk-query';

export type TagType = (typeof addTagTypes)[number];

/**
 * The slice of a generated mutation definition this file mutates. The codegen
 * always emits `invalidatesTags` as a plain array, never the callback form.
 */
type MutationDefinition = { invalidatesTags?: TagType[] };

/**
 * Everything a Space owns, in the order `SpaceCore.Delete` cascades through it
 * (internal/views/space_core.go). A recursive Space delete removes all of these,
 * so any cached list of them is stale the moment it returns.
 */
const SPACE_CONTENTS: TagType[] = [
  'Unit',
  'Trigger',
  'Invocation',
  'Target',
  'BridgeWorker',
  'Release',
  'ChangeSet',
  'Tag',
  'View',
  'Filter',
  'Attribute',
  'Revision',
  'Link',
];

/**
 * Authoring a Unit's config — create, update, patch, import, protection.
 *
 * Every one of these produces a Revision, and a patch that runs functions
 * records Mutations against it. `change_set_id` on the write associates the new
 * revision with a ChangeSet, so an open change-set view is stale too.
 */
const UNIT_WRITE: TagType[] = ['Revision', 'Mutation', 'ChangeSet'];

/**
 * Acting on a Unit against its Target — apply, destroy, refresh, cancel.
 *
 * These enqueue a QueuedOperation for a bridge worker rather than doing the
 * work inline, and record a UnitAction (`Unit.HeadUnitActionNum`) and a
 * UnitEvent. The Revision moves when the worker reports back.
 *
 * Note what this does NOT fix: the mutation returns when the operation is
 * queued, so invalidating here refetches the in-flight state, not the result.
 * Settling is phase 2's job — see docs/design/ui-liveness.md.
 */
const UNIT_ACTION: TagType[] = [
  'Revision',
  'UnitEvent',
  'UnitAction',
  'QueuedOperation',
  'Mutation',
];

/**
 * Deleting a Unit additionally drops the Links that reference it, and with them
 * the upstream/downstream relationships other Units display.
 */
const UNIT_DELETE: TagType[] = [...UNIT_WRITE, 'Link', 'UnitEvent', 'UnitAction'];

/**
 * A Link establishes a Unit's upstream, which changes what those Units report
 * (`UpstreamUnitID`, `UpstreamRevisionNum`) and can clone a Revision.
 */
const LINK_WRITE: TagType[] = ['Unit', 'Revision'];

/**
 * Targets are referenced by Units (`Unit.TargetID`) and served by BridgeWorkers.
 * Deleting a BridgeWorker takes its Targets with it
 * (`TargetCore.DeleteTargetsForBridgeWorker`), which in turn strands Units.
 */
const TARGET_WRITE: TagType[] = ['Unit'];
const BRIDGE_WORKER_WRITE: TagType[] = ['Target', 'Unit', 'BridgeWorkerStatus'];

/**
 * Publishing a Release stamps the release onto each member Revision and its tag
 * (`ReleaseCore.addReleaseToRevision`), and emits a `release.published` event.
 * The live status a deployment reports is the Release's own, so the generated
 * self-tag already covers it.
 */
const RELEASE_WRITE: TagType[] = ['Revision', 'Tag', 'Unit'];

/**
 * Invoking a function against a Unit rewrites that Unit's config. The generated
 * tag is `Function` — the entity the endpoint is filed under — which is the one
 * thing an invocation does not change.
 */
const FUNCTION_INVOKE: TagType[] = ['Unit', 'Revision', 'Mutation', 'UnitEvent'];

/**
 * The `Extended*` list endpoints expand related entities inline, and the
 * codegen tags them by their own entity only.
 *
 * `ExtendedRevision` (internal/models/revision.go) carries full `User`,
 * `ChangeSet` and `Tag` objects alongside the Revision, but
 * `listExtendedRevisions` provides just `Revision`. The unit-detail revisions
 * grid renders those expansions directly — its TAGS and EDITED BY columns are
 * Tag and User data served under the `Revision` tag. So a write to Tag staled
 * the grid that displays it.
 *
 * These constants carry the inverse: writing entity X must invalidate the tag
 * of every Extended type that embeds X.
 *
 * Two expansions are deliberately NOT propagated. Every Extended type embeds
 * `ExtendedSpaceBase`, hence Space and Organization, so honouring those would
 * make any Space write invalidate the entire cache — including
 * `listAllUnits`, which the store notes can run to tens of MB. Space and
 * Organization writes are rare and their expanded fields are identity
 * (slug/name), so the staleness is cosmetic and bounded. Revisit if a Space
 * field starts driving a decision the way `Revision.Releases` does.
 */
const TAG_EXPANDED_INTO: TagType[] = ['Revision', 'Release', 'ChangeSet'];
const CHANGESET_EXPANDED_INTO: TagType[] = ['Revision', 'Tag'];

/**
 * Extra tags to invalidate, beyond each mutation's own generated tag.
 */
export const EXTRA_INVALIDATIONS: Record<string, TagType[]> = {
  // ── Unit authoring ────────────────────────────────────────────────────────
  createUnit: UNIT_WRITE,
  updateUnit: UNIT_WRITE,
  patchUnit: UNIT_WRITE,
  setUnitProtection: UNIT_WRITE,
  bulkCreateUnits: UNIT_WRITE,
  bulkPatchUnits: UNIT_WRITE,
  deleteUnit: UNIT_DELETE,
  bulkDeleteUnits: UNIT_DELETE,

  // Tagging a Unit pins a Revision, so revision views show the new tag.
  bulkTagUnits: ['Revision', 'Tag'],

  // ── Unit actions ──────────────────────────────────────────────────────────
  bulkCancelUnits: UNIT_ACTION,

  // ── Links ─────────────────────────────────────────────────────────────────
  createLink: LINK_WRITE,
  updateLink: LINK_WRITE,
  patchLink: LINK_WRITE,
  deleteLink: LINK_WRITE,
  bulkCreateLinks: LINK_WRITE,
  bulkPatchLinks: LINK_WRITE,
  bulkDeleteLinks: LINK_WRITE,

  // ── Targets ───────────────────────────────────────────────────────────────
  createTarget: TARGET_WRITE,
  updateTarget: TARGET_WRITE,
  patchTarget: TARGET_WRITE,
  deleteTarget: TARGET_WRITE,
  bulkPatchTargets: TARGET_WRITE,
  bulkDeleteTargets: TARGET_WRITE,

  // ── Bridge workers ────────────────────────────────────────────────────────
  createBridgeWorker: BRIDGE_WORKER_WRITE,
  updateBridgeWorker: BRIDGE_WORKER_WRITE,
  patchBridgeWorker: BRIDGE_WORKER_WRITE,
  deleteBridgeWorker: BRIDGE_WORKER_WRITE,
  bulkPatchBridgeWorkers: BRIDGE_WORKER_WRITE,
  bulkDeleteBridgeWorkers: BRIDGE_WORKER_WRITE,

  // A worker reporting an action result settles a queued operation. This is the
  // completion the UI is waiting for on a function invocation.
  userCreateActionResult: ['Unit', 'Revision', 'QueuedOperation', 'UnitAction', 'UnitEvent'],

  // ── Releases ──────────────────────────────────────────────────────────────
  publishRelease: RELEASE_WRITE,
  withdrawRelease: RELEASE_WRITE,
  deleteRelease: RELEASE_WRITE,

  // ── Functions ─────────────────────────────────────────────────────────────
  invokeFunctions: FUNCTION_INVOKE,
  invokeFunctionsOnOrg: FUNCTION_INVOKE,

  // ── Spaces ────────────────────────────────────────────────────────────────
  // Deleting a Space is recursive. Updating one touches no other entity: a
  // Release records the Target it was published for, so a Space's release
  // Target no longer materializes anything onto a worker.
  deleteSpace: SPACE_CONTENTS,
  bulkDeleteSpaces: SPACE_CONTENTS,
  updateSpace: [],
  patchSpace: [],
  bulkPatchSpaces: ['BridgeWorker'],

  // ── Triggers ──────────────────────────────────────────────────────────────
  // Triggers gate applies, so a Unit's ValidationErrors change with them.
  createTrigger: ['Unit'],
  updateTrigger: ['Unit'],
  patchTrigger: ['Unit'],
  deleteTrigger: ['Unit'],
  bulkCreateTriggers: ['Unit'],
  bulkPatchTriggers: ['Unit'],
  bulkDeleteTriggers: ['Unit'],

  // ── Tags and change sets (expanded into other entities' Extended rows) ──
  // ExtendedRevision embeds Tag and ChangeSet; ExtendedRelease and
  // ExtendedChangeSet embed Tag; ExtendedTag embeds ChangeSet.
  createTag: TAG_EXPANDED_INTO,
  updateTag: TAG_EXPANDED_INTO,
  patchTag: TAG_EXPANDED_INTO,
  deleteTag: TAG_EXPANDED_INTO,
  bulkCreateTags: TAG_EXPANDED_INTO,
  bulkPatchTags: TAG_EXPANDED_INTO,
  bulkDeleteTags: TAG_EXPANDED_INTO,
  createChangeSet: CHANGESET_EXPANDED_INTO,
  updateChangeSet: CHANGESET_EXPANDED_INTO,
  patchChangeSet: CHANGESET_EXPANDED_INTO,
  deleteChangeSet: CHANGESET_EXPANDED_INTO,
  bulkCreateChangeSets: CHANGESET_EXPANDED_INTO,
  bulkPatchChangeSets: CHANGESET_EXPANDED_INTO,
  bulkDeleteChangeSets: CHANGESET_EXPANDED_INTO,

  // ── Organization membership ───────────────────────────────────────────────
  createOrganizationMember: ['User', 'UserInfo'],
  deleteOrganizationMember: ['User', 'UserInfo'],
  createOrganization: ['UserInfo'],
  updateOrganization: ['UserInfo'],
  deleteOrganization: ['UserInfo'],
};

/**
 * Mutations whose generated self-tag is the whole truth: they write one entity
 * and nothing else observes the result.
 *
 * Listed explicitly rather than left to fall through, so that the test can tell
 * "we decided this needs nothing" apart from "nobody has looked at this yet".
 */
export const SELF_TAG_IS_SUFFICIENT: readonly string[] = [
  'createSpace',
  'bulkCreateSpaces',
  'createAttribute',
  'updateAttribute',
  'patchAttribute',
  'deleteAttribute',
  'bulkCreateAttributes',
  'bulkPatchAttributes',
  'bulkDeleteAttributes',
  'createFilter',
  'updateFilter',
  'patchFilter',
  'deleteFilter',
  'bulkCreateFilters',
  'bulkPatchFilters',
  'bulkDeleteFilters',
  'createInvocation',
  'updateInvocation',
  'patchInvocation',
  'deleteInvocation',
  'bulkCreateInvocations',
  'bulkPatchInvocations',
  'bulkDeleteInvocations',
  'createView',
  'updateView',
  'patchView',
  'deleteView',
  'bulkCreateViews',
  'bulkPatchViews',
  'bulkDeleteViews',
  'createOAuthClient',
  'deleteOAuthClient',
];

/**
 * Merge {@link EXTRA_INVALIDATIONS} into the generated endpoint definitions.
 *
 * Must run after `injectEndpoints`. RTK Query's `enhanceEndpoints` assigns onto
 * `context.endpointDefinitions[name] || {}` — for an endpoint that has not been
 * injected yet that is a throwaway object, and the enhancement is silently
 * dropped. Importing `confighubApi` from the generated module guarantees the
 * injection has already happened by the time this runs.
 *
 * Enhancement mutates the api in place and returns the same instance, so the
 * hooks the generated module already exported pick this up; nothing needs to
 * import from here to get the behaviour.
 */
export function applyInvalidationMap(): void {
  const endpoints: Record<string, (definition: MutationDefinition | undefined) => void> = {};

  for (const [endpointName, extraTags] of Object.entries(EXTRA_INVALIDATIONS)) {
    // The function form of `enhanceEndpoints` hands over the live generated
    // definition to mutate, which is the only way to read the self-tag the
    // codegen assigned: `api.endpoints[name]` exposes hooks and `initiate` /
    // `select`, not the definition behind them. The object form would replace
    // `invalidatesTags` outright and drop that self-tag.
    endpoints[endpointName] = (definition) => {
      if (!definition) {
        // Renamed or removed by codegen. The test catches this; at runtime,
        // skip rather than crash the app on an unknown endpoint name.
        return;
      }
      // De-duplicate: a few entries name the self-tag too, because the entity
      // an endpoint is filed under is not always the one it changes
      // (userCreateActionResult is tagged BridgeWorker but invalidates Unit).
      definition.invalidatesTags = Array.from(
        new Set([...(definition.invalidatesTags ?? []), ...extraTags]),
      );
    };
  }

  confighubApi.enhanceEndpoints({ endpoints: endpoints as never });
}
