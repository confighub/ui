# Component view (agents-first guide)

> Read this before touching the Component view and its field sheet. It is written for an
> AI agent editing this code cold. It is rule-dense on purpose. Paths and identifiers are real and
> verified against the tree; grep them.

## What it is

The **Component view** (route `/components`, lazy-loaded at `src/App.tsx`) lets a user
propagate config changes *downstream* through a DAG of related units. A downstream unit is typically
a clone of an **upstream** unit; as the upstream changes, the downstream can **upgrade to** those
changes — per-field or in bulk. The whole interaction is **opt-in, preview-first, and stage-first**:
nothing is ever auto-applied, and changes are queued into a **staged batch** before being committed
in one network call. The UI is a left **app picker**, a center **flow graph** of deployment nodes
(by stage), and a right **side pane** whose centerpiece is a custom **field sheet** — each Unit's
resources, parts and blocks in document order, one value per field, and a tick for each incoming
change. The diff is deliberately **not** a text/Monaco diff;
Monaco only appears in the alternative **Source view**.

Everything lives under **`src/pages/x/apps/`**. There is **no Redux slice** and **no
promotion-specific backend endpoint** — the feature composes generic Unit queries + bulk
patch (`upgrade` / `dry_run`) + bulk apply. Promotion semantics live entirely in `UpstreamUnitID` /
`UpgradeUnit` links and the merge engine.

---

## Read this before working on the component view (hard rules)

These are stated requirements from the people who built the feature, not suggestions. Numbered so
you can cite them in review.

1. **"Upgradable" = has an upstream value AND no local override.** This is the single definition.
   A field the user could not actually change by clicking "Upgrade" is *not* upgradable. (User,
   verbatim: *"upgradeable means if I click the upgrade all they will upgrade. Has upstream value and
   does not have local override."*)
2. **Count upstream-only NEW paths as upgradable.** A path present upstream but absent downstream
   counts. Do **not** re-introduce a `&& downstreamPaths.has(d.path)` guard — that bug undercounted
   new keys.
3. **Upstream removals ARE counted as real upgrades.** A removed path (removal sentinel `newValue`
   of `'-'` *or* `''` — some toolchains normalize a deleted key to empty string; use
   `isRemovalSentinel`, `componentValues.ts`) is a genuine upgrade change and is shown
   **struck-through** in the upgradable view; swallowed `blockedDeleteKeys` (rule 6) count too. The
   **only** paths excluded from "upgradable" are those with a **local override**
   (`variationEntry.fieldDiffs`) — consistent with rule 1. See `countUpgradableBadgeFields`
   (`entryBuilders.ts`), the single predicate behind count/filter/dimming (rule 4).
   *(This supersedes an earlier "don't count deletions as upgradable" stance from before #4570's
   removal-preview work — do not reintroduce it; it would contradict rules 6 and 7.)*
4. **Keep count, filter, and dimming on the SAME predicate.** `hasRealUpgrade` /
   `countUpgradableBadgeFields` and `fieldStates` (all in `entryBuilders.ts`) are the single source
   of truth, so the badge number and the marked fields can never diverge: the badge, the Incoming
   scope and the Stale marks read `fieldStates(unit).incomingKeys`, and "Select all", entering
   Incoming and the commit's upgrade-all test read `selectAllUpgradeKeys` (its `selectableKeys`
   and the whole-resource changes the Unit can take). All of them key a change by its stage key (`fieldDiffKey`: `key ?? path`),
   never by its bare path.
   Divergence here is a recurring, user-caught bug.
5. **Kick the user off the Incoming scope when a node has nothing upgradable.** Don't strand them on
   an empty scope. Guard the auto-switch on **`dryRunSettled`**, not `!isDryRunLoading`
   (`ComponentSidePane.tsx`) — at a node switch `isDryRunLoading` is briefly `false` before
   the new dry-run starts. Note: entering Incoming ticks, for each Unit as its dry run lands,
   every change "Select all" would tick (a `stageAll` action with `selectAllUpgradeKeys`); leaving
   it drops the upgrade ticks only (`clearUpgradeOnly`). Edits and keeps stay.
6. **Surface a swallowed upstream key-deletion as an opt-in upgrade.** This is the essence of #4570.
   When upstream deleted a key but the child locally modified it, the merge silently keeps the key
   (see Terminology → Key-deletion). Show it with the held shield mark and a shield tick the user
   can untick or tick.
7. **Never apply an upstream key-deletion silently.** It goes through the same opt-in accept path as
   any value change.
8. **Manual inline edits STAGE (deferred) — never write immediately.** Clicking a value opens an
   inline editor; saving goes through `onStageEdit`, NOT `onSetFieldValue` / `onDeleteFieldValue`.
   Those immediate-write handlers must never be called by an inline edit. The staged edit is
   committed as part of the next batch commit (Upgrade button).
9. **Staged manual edits are STICKY across a scope switch.** Leaving Incoming drops only the
   upgrade ticks (`clearUpgradeOnly`). Manual edits and Keep on merge changes survive scope
   switches and remounts, because `ComponentSidePane` holds the staging store
   (`spec-sheet/staging/useUnitStagingStore.ts`) above every field view. Only Discard
   (`discardAll`), a successful write (`committed` for values, `protectionCommitted` for keeps) or
   a node switch (`reset`) clears them.
10. **Manual edit wins over upstream upgrade in the committed payload.** If a user manually edits a
    path that also has an upstream upgrade, the manual edit value is written — the upgrade for that
    path is absorbed.
11. **Do NOT add a review-then-confirm dialog before the Upgrade button commits.** `PromotionCommitSummaryDialog`
    was built and then explicitly removed in #4619; the Upgrade button commits directly via
    `handleConfirmCommit`. Adding a review step back is a rejected pattern (see Rejected approaches).
    The one exception is the guard dialog every guarded write uses (`useGuardedWrite`): it appears
    only when a ticked change would write a field a guard keeps (rule 18), and asks about those
    guards, not about the whole commit.
12. **Mirror the field sheet's interaction model in Source view.** (User, of the tree it replaced:
    *"copy how the pills and buttons work in the treeview."*) Ticks, accept and revert, not a
    separate paradigm.
13. **The field sheet is the DEFAULT view (the Fields button); Source view is the opt-in alternative.**
    There is no tree view: the sheet (`spec-sheet/`) draws All, Incoming, Changes, Local overrides,
    Kept on merge and a ChangeSet read-only. Do not flip the default.
14. **Design before implementation for UX changes.** Mock in HTML, get sign-off, then build. (User,
    verbatim: *"No no no no no. I just want the design for it. undo that."*) Do not jump from a design
    request to writing the feature.
15. **The Incoming scope shows each incoming field with a tick and one line with what comes in**
    (`spec-sheet/IncomingField.tsx`): a Stale arrow and the upstream value, a plus for a key only
    upstream has, "deleted upstream" for a deletion, a shield tick for a blocked deletion or a
    guarded key. It never shows a compare grid. The tree's pill-group inline-diff CSS is gone with the tree.
16. **Do not build an `UpgradeEntry` before its dry-run Diff lands** (`buildUpgradeEntries`,
    `entryBuilders.ts`). An entry with no Diff offers nothing to upgrade, and one built from
    anything else risks flagging *every* field as removed (`-` sentinel) → a transient
    "everything removed" preview. See Gotchas → phantom deletions.
17. **Source-view edits use an explicit Save button** — never auto-save / blur-to-save.
18. **Surface a change a guard holds back as an opt-in upgrade, counted but never ticked for the
    user.** The dry run withholds it (a `Guarded` conflict), so it is in no field diff; without
    this it is simply missing from Incoming, and the Variant reads as up to date. It is a row of
    `UpgradeEntry.guardedKeys` (`guardedKeysOf`), shown in Incoming with the shield tick a blocked
    deletion also gets (`HeldCheck`, `IncomingField.tsx`), its hover naming the guard. It counts in
    Incoming, since a clearance lands it (the user's call, over rule 1), but "Select all" and the
    auto-stage leave it out (it is not in `fieldStates`'s `selectableKeys`, which
    `selectAllUpgradeKeys` reads): ticking it is choosing to clear a guard. A ticked one makes the commit
    a data write, and a data write to a guarded Unit goes through the guard dialog
    (`handleCommitStaged`); the wholesale upgrade, chosen only when none is ticked, never asks. A
    row the guards still withheld comes back in `withheldKeys` and is not marked done. Applying a
    conflict an earlier upgrade left stays on the Blame tab.

---

## Terminology

| Term | Precise meaning |
|---|---|
| **Promotion** | Propagating config changes downstream along `UpstreamUnitID` Space→Space edges. The view = flow graph + side pane. |
| **Deployment (node)** | `ComponentDeployment`; identity is **`Space.SpaceID`**. `type:'Deployment'` if the Space has a release Target (`Space.ReleaseTargetID`), else `'Base'`; the Targets of its Units do not decide it. `displayName = Space.Labels.Variant ?? slug`. |
| **Stage** | Depth in the upstream DAG. `Stage {label:'Stage N', depth, deploymentIds}`. |
| **Upgrade** | Merging the upstream HEAD revision into a downstream unit. Backend: `upgrade=true` → `mergeUnits` → `SourceTypeUpgradeUnit`. "Upgradable" unit = `UpstreamRevisionNum < upstream.HeadRevisionNum`. |
| **Release** | Publishing a Space's Units to its Target. "Unreleased" = `LastReleasedRevisionNum < HeadRevisionNum`. |
| **Override / local override** | The child's locally-changed value at a path; it supersedes the upstream value and *blocks* that path from being "upgradable". |
| **Kept on merge** | A path with an Override guard (`Override=Upstream` on a Unit with an upstream Unit, `Override=External` on one without) on itself, an ancestor, or its resource, in the Unit's `PathAnnotations` — a merge must not overwrite it. Committed via `SetUnitGuard` (`SourceTypeSetGuard`), a **separate revision** from any value write. Read ladder: `protectedPaths.ts`'s `buildProtectedPathLookup` (`overrideGuardAt`: exact path → ancestors → resource → `false`). A field kept by an enclosing guard cannot be let go on its own: removing a guard at the field would remove nothing. Toggled per value by the `Keep on merge` / `Let merges update this` action of its hover card (`spec-sheet/FieldActions.tsx`), or per block by `Keep this block on merge` (`spec-sheet/BlockActions.tsx`); staged the same way as everything else (`StagingState.protection`, below) before commit. Array-indexed paths (`spec.containers.0.image`) are excluded from both read and write — `MutationSources` keys array elements associatively (`ResolvedPath`, e.g. `spec.containers.?name=nginx;@0.image`) and there is no parser in `src` to translate the positional notation of these paths into it, so guessing would risk silently mismatching the merge engine's own lookup. |
| **Field sheet** | The field view of the side pane: resources, parts and blocks in the order of the stored document, every field one value. NOT a text diff and not a tree. `spec-sheet/SpecSheet.tsx` (model: `spec-sheet/specSheetModel.ts`). |
| **Source view** | Monaco editor of the full raw decoded `unit.Data` (`ComponentSourceSection.tsx`). Opt-in alternative to the field sheet (shipped #4538). |
| **Units filter** | In the view menu of the filter row (`ComponentToolbar.tsx`), in every view; a dot on the menu button shows a filter that is not the default: **Releasable** (the default) lists the units a Release of their Space publishes, by the server's `Unit.Releasable`; **All units** lists every unit; **Include hidden** adds the units with a `HiddenReason`, such as the ConfigHub/YAML units behind entities. `PaneUnitScope` and `includeHiddenUnits` live in `AppComponentView`, so they survive a node switch, and filter `mergedUnits`, so the counts and the lone-unit rule follow them. Hidden units are read only when asked for, only in the selected Spaces (`include_hidden=*`, `HiddenReason != ''`), and go into `unitsByDeployment` alone, never into `allUnits`: the graph, its counts and the upgrade machinery do not see them. |
| **Overview** | Each unit's resources in the friendly view the resource explorer, View explorer and Unit Resources tab show (`ComponentOverviewSection.tsx` → `ResourceOverview`). Read-only and not searchable: the search box is cleared and disabled, and the filter tabs and Scope row are hidden. Kubernetes, and the other configuration `overviewAvailability.ts` names (the installer's record, an AppConfig/YAML `InstallerRecord`); other configuration falls back to the Source view, as the Resources tab does. `viewMode: PaneViewMode` (`'diff' \| 'overview' \| 'source'`, `ComponentToolbar.tsx`). |
| **Staged change** | A pending change queued for batch commit: a tick for an upgrade, or a manual edit made in a value's editor. Held per Unit in the staging store (`spec-sheet/staging/stagingReducer.ts`). A staged **protection** change (Keep on merge) is a DIFFERENT kind of pending change: it is not a value change, and commits through a different endpoint. |
| **`StagingState.protection`** | `Map<stageKey, boolean>` (`spec-sheet/staging/stagingReducer.ts`) — the Keep on merge state the user picked for a path, staged (not written) until commit. Keyed by stage key, as the staged edits are. Deliberately separate from the value changes (`upgrades`, `edits`): a Keep on merge change is never a value change, so it never adds to the "N staged" count; the footer counts it as keeps (`stagedCounts`). `setProtection` deletes the entry when the target equals the path's current *committed* state — `Keep on merge` then `Let merges update this` on the same unmodified field is a true no-op, and a block's keep skips the fields already kept, so keeping a block of 6 where 4 already are stages exactly 2. Sticky across `clearUpgradeOnly` and a value write (`committed`); cleared only by `discardAll`, a successful guard write (`protectionCommitted`) or a node switch. |
| **Staging actions** | `StagingAction` (`spec-sheet/staging/stagingReducer.ts`). The side pane dispatches each one for one Unit to its staging store; no field view holds staged state, so a remount loses none. `stageEdit` (`add` marks a key the Unit does not hold), `stageRemove`, `unstageEdit`, `stageUpgrade` (one tick), `stageAll` (entering Incoming, or "Select all"), `clearUpgradeOnly` (leaving Incoming), `setProtection`, `stopKeepingAll` (the Kept on merge scope's `Stop keeping N keys`), `discardAll` (Discard), and, after a write, `committed` (values) and `protectionCommitted` (keeps). The footer's `Keep both on merge` and `Undo keep` (`keepStagedEdits` / `undoKeepStagedEdits`, `ComponentSidePane.tsx`) dispatch `setProtection` for each staged edit. |
| **StagedCommitPayload** | `{kind:'upgrade-all'}` or `{kind:'patch-data'; data: string}`, the merged Unit data `onCommitStaged` receives. Defined in `spec-sheet/staging/types.ts`; built by `buildSheetCommit` (`spec-sheet/staging/commitPayload.ts`). |
| **Colour system** | Each staged value takes the ground and mark of its change type from `COMPARE_STAGED_TOKENS` (`compare/rowTypeTokens.ts`): edit gold, remove red with a strike, add green. A Stale mark is purple, Unreleased changes blue, a kept value a lock. No left-hand bar. |
| **Ticks** | The Incoming scope's per-field staging control (`spec-sheet/IncomingField.tsx`, test id `incoming-tick-<testKey>`). Ticked = staged for the next commit; a click dispatches `stageUpgrade`. A blocked deletion or a guarded key has the shield tick (`HeldCheck`, `data-held="true"`), whose hover says why. A whole-resource change has one tick on its resource head (`WholeResourceTick`, `incoming-tick-res-<id>`). A manual edit has no tick: staging the value the Unit holds, `Undo remove`, or Discard takes it back. |
| **Inline diff** | `getInlineDiffPair` (`inlineDiff.ts`: token-LCS via `tokenizeForDiff`, cached, a whole-value swap over 2000 characters) marks the changed *tokens* (whole words/numbers), not individual characters. The sheet draws the new side with `InlineDiffSegments` (`ValuePill.tsx`): what an Incoming field becomes in the upgrade hue (`IncomingField.tsx`), a staged edit in the edit hue (`FieldValue.tsx`). |
| **Preview / upgrade-preview active** | `showUpgradePreview` (`ComponentSidePane.tsx`) puts the `pane-upgrade-preview` class on the pane while Incoming or ChangeSet is open or the footer Upgrade button is hovered. While the button is hovered, the unit rows the upgrade does not change are dimmed (`unit-unchanged`). |
| **Variation** | A field that intentionally differs between upstream HEAD and the post-upgrade downstream (env overrides, e.g. namespace). `VariationEntry`. |
| **Filter tabs** | `Incoming·N` (purple, upgradable), `All`, and — only on a node with a ChangeSet — `ChangeSet·N`. `filterMode: PaneFilterMode` (`'incoming' \| 'all' \| 'changeset'`, `ComponentToolbar.tsx`). Entering Incoming auto-stages all upgradable picks; leaving clears them. The ChangeSet filter is read-only and greys out Upgrade, as All does. |
| **Inspect panel** | Click a field path → revision history (incoming value, source attribution, sibling-variant values across deployments). `spec-sheet/SheetInspect.tsx`: the field name and full path, the Revisions in which its value changed (with the value), and its value in every Variant. Opened by the Inspect action of a value. |
| **Treeview node** | `DiffTreeNode {key, type:'folder'\|'leaf', children, diff, context}`. `context:true` = a dimmed surrounding row shown for context. |
| **Key-deletion (swallowed / blocked)** | Upstream issued a `Delete` mutation. **Case 1**: child never modified the key → deletion passes through as a normal upgrade (`newValue` = `-`). **Case 2**: child locally modified the key → `SubtractMutations` drops the upstream Delete (`ConflictReasonSubtracted`) and the key persists, *silently swallowed*. #4570 makes Case 2 an opt-in upgrade. |
| **upstream-only path** | Present upstream, absent downstream: an incoming key the sheet does not draw. In Incoming, `withIncomingAdditions` (`spec-sheet/incomingAdditions.ts`) adds it as an atom with `added: true` in the document its key names: an element of a list in the block that draws the list, any other key in an "Added upstream" part at the end of its resource. `IncomingField` draws it with a circled plus. |
| **Stage key** | `docStageKey(scope, path)` (`diffTree.ts`): a document's id, U+0001, then the dot-index path; the bare path in a single-document unit. Staging, the upgrade diffs, the counts and the narrowing all key on it, so a path two documents share is two rows. |
| **Whole-resource change** | `WholeResourceChange`: a resource the upgrade adds or deletes as a whole. In Incoming it is a head-only resource (`withIncomingAdditions`) with one tick on its head (`WholeResourceTick`), counted as one change, never staged field by field. While the Unit has a blocked deletion to accept, none is offered and the tick is disabled (`availableWholeResourceChanges`, `entryBuilders.ts`). It goes in only with the wholesale upgrade (`upgrade-all`): `buildSheetCommit` drops it from any other batch, so leaving any change out or staging an edit leaves it out. |
| **Sync with upstream** | The override-row action tooltip verb (was "Force the upstream value" — renamed in #4619). |
| **`field-staged-<testKey>`** | The mark after a staged value (`StagedMark`, `spec-sheet/StateMark.tsx`). Its accessible name is "Staged edit", "Staged removal" or "Staged add". A staged Keep on merge change has no staged mark; it shows as the kept mark. Use these marks in Playwright tests to assert the change type; don't rely on colour alone. The compare grid's cells carry `data-change-type` and `data-protected` instead (`compare/CompareCell.tsx`). |
| **`field-kept-<testKey>`** | The lock after a value (`KeptMark`) that is kept on merge in EFFECT: the staged Keep on merge change, if any, else the committed guard. Its accessible name is "Keep on merge staged" or "Kept on merge". Independent of the staged mark: an edited value that is kept shows both at once (see "Locking (protection)" below). |

---

## Architecture & file map

Route `/components` → `AppsComponentPage`. Component tree:

```
AppsComponentPage              page entry; useListSpacesQuery({summary}) + useListAllTargetsQuery
└─ AppsComponentLayout         2-pane resizable; ?app=<name> URL; selectedDeploymentIds: Set<string>
   ├─ AppNavigationTree        left: Component leaves, grouped by Owner (by default)
   └─ AppComponentView         CORE orchestrator (units, entries, all handlers)
      ├─ ComponentFlowGraph    center: reactflow DAG of deployment nodes by stage
      │  └─ DeploymentFlowNode  one node per Space; per-unit upgrade/apply badges
      └─ ComponentSidePane     right detail pane (slides in); holds the per-Unit staging store
         ├─ SpecSheet                the field sheet of one Unit (scopes, search, hover card, inline edits)
         ├─ ComponentOverviewSection Overview (friendly view per resource, read-only)
         ├─ ComponentSourceSection   Source view (Monaco, editable)
         └─ SheetInspect             field history + every Variant's value
```

### UI (path → responsibility)

| Path (`src/pages/x/apps/`) | Responsibility |
|---|---|
| `AppsComponentPage.tsx` | Page entry; top-level spaces/targets queries; header actions. |
| `AppsComponentLayout.tsx` | 2-pane resizable layout; keeps the Spaces whose Component (`Space.ComponentID`) has loaded; builds the tree items; `?app=` URL; lifts `selectedDeploymentIds`. |
| `AppNavigationTree.tsx` | Left Component picker: one leaf per Component, grouped by the Component's owner by default. |
| `AppComponentView.tsx` | **Core orchestrator.** Fetches units, computes entries, owns upgrade/dry-run/`onCommitStaged` handlers, renders the graph + side pane, or the Dashboard (`displayMode`), plus the `FlowViewControl` overlay either way. |
| `flow-graph/ComponentFlowGraph.tsx` | `reactflow` DAG by stage; fit-to-view; click selects a deployment. No view-mode/Dashboard knowledge — that's `AppComponentView`'s. |
| `flow-graph/FlowViewControl.tsx` | Graph / Dashboard segmented control. |
| `flow-graph/DeploymentFlowNode.tsx` | One node per deployment/Space. Exports `NodeUnitSummary {slug, upgrading, applyStatus:'gated'\|'pending'\|null, gates, warnings}`. A unit with validation errors is `gated` whether or not it has a Target or unreleased changes, as the Components list's Blocking Gates counts it; the Gated and Warnings peeks name each unit's gates. |
| `flow-graph/flowLayout.ts` | Stage-based node positioning. Exports `NODE_WIDTH`/`NODE_HEIGHT`/`STAGE_GAP`. |
| `ComponentSidePane.tsx` | The drawer chrome: the title row (`PaneChrome.tsx`: name, one button per tag kind, Compare, Create variant, Close) and the tabs row (Settings is a tab), which go away on a scroll down of the list and come back on a scroll up; the filter row (`ComponentToolbar.tsx`: scope chips, search, one view menu for Sheet/Code/Stacked and the Units filter), which stays; per-unit rows, footer Upgrade/Release/Discard buttons (Apply removed from the build — the "unapplied changes" diff/gate display remains); the per-Unit staging store (`useUnitStagingStore`), the Incoming auto-ticks, and the commit (`handleConfirmCommit`); merges entries into `MergedUnit[]`. |
| `ReadmePane.tsx` / `readme.ts` | The Readme tab, right of Releases: the Markdown of the Space's `README.md` Unit (AppConfig/Text, which `cub variant upload` makes of a bundle's README.md), frontmatter stripped, via `react-markdown` + `remark-gfm`. Only web and mail links are links; relative links and images name files in the source repository and render as text. The tab bar shows when a Space has a release target or a README. |
| `spec-sheet/` | **The field sheet.** `specSheetModel.ts` (pure model: resources, parts, blocks and atoms, each atom keyed by its stage key), `SpecSheet.tsx` (one Unit: the scopes All, Incoming, Changes, Local overrides and Kept on merge, search on the model, the hover card `SheetPeek.tsx` with the value's actions `FieldActions.tsx`, and Inspect), `Part.tsx`, `shapes/` (one renderer per kind of block, picked by `shapes/registry.ts`), `FieldValue.tsx`, `IncomingField.tsx`, `incomingAdditions.ts`, `staging/` (below). |
| `spec-sheet/staging/` | The per-Unit staging store. `stagingReducer.ts`: `StagingState` (upgrades ticked, manual edits, adds, Keep on merge changes), `StagingAction`, `commitPlan` (an edit wins over the upgrade of its key, rule 10), `stagedCounts` and `footerVerb`. `useUnitStagingStore.ts`: one state per Unit, held by `ComponentSidePane` above every field view, so a scope switch or a remount loses nothing; dropped on a node switch (`reset`). `commitPayload.ts`: `buildSheetCommit`, a Unit's write from its staged state. `protectionPayload.ts`: `buildProtectionEdits`, the staged Keep on merge changes as the `ResourceGuards[]` that `SetUnitGuard` takes. `types.ts`: `StagedCommitPayload`, `StagedCommitResult`, `STAGED_DELETE_SENTINEL`. |
| `spec-sheet/FieldEditor.tsx`, `spec-sheet/editors/validate.ts` | The inline editor a click on a value opens, in the value's place. `editorKindOf` picks the kind from the path and the value (image, quantity, integer, boolean, line, multiline); an image edits only its image tag (`imagePrefixOf`). `validateValue` keeps an invalid value open, red, with a short error and a disabled check. Check or Enter stages; X or Esc cancels; a click away keeps the draft. |
| `spec-sheet/kubeDefaults.ts` | Quiet Kubernetes defaults. `kubeDefaultOf` gives a field's fixed Kubernetes default; `quietDefaultsOf` says which values are quiet: they hold the default and nothing happened to them (no open editor; not staged, kept, Stale, Unreleased or incoming; not set back to the default by this Unit in a resource that comes from upstream). A quiet default is not drawn on its line: one that belongs to a value (an image's pull policy, a port's protocol, a probe's timings) is in that value's hover card, and the rest fold into one line per section. Nothing is quiet during a search. Pure. |
| `ComponentSourceSection.tsx` | Source view: Monaco `CodeEditor` of decoded Data; editable w/ Save/Discard bar when `onSaveData` provided. |
| `ComponentOverviewSection.tsx` | Overview: the unit's Resources (`useUnitResources`, refetched when the unit's Data changes), sorted by kind and name, each opening to `ResourceOverview`. A lone resource opens; several wait for a click. Lazy-loaded. |
| `useResourceCounts.ts` | Resources per Space, from one `GET /resource` narrowed to `SpaceID`, for the deployment selectors' `N units · M resources` line. |
| `spec-sheet/AddKeyEditor.tsx` | The key and value editor at the end of a block, opened by the block's `Add a key` (`BlockActions.tsx`): a new key on a map block (labels, annotations, ConfigMap data), or a new env var on a container's Env block. The key follows `validateKey` from `componentKeyUtils.ts` and must not be in the block yet; an env var's name must not be in the list yet. Check or Enter stages an add (`stageEdit` with `add`; an env var is its name and value, staged as one add); X or Esc cancels. The new key shows in its block before it is written (`withStagedAdds`). |
| `spec-sheet/SheetInspect.tsx` | Field-history inspector (`useListExtendedRevisionsQuery`) + the value in every Variant (`variantValues.ts`). |
| `configDiffFieldDiffs.ts` | `fieldDiffsFromConfigDiff(diff, treeData, {treeSide, findElementsByMergeKey?})`: a server `ConfigDiff` as keyed `FieldDiff`s and `WholeResourceChange`s, each keyed as the tree keys the row; `addedResourceLeafRows`; `resolveConflictPath`. Covered by `tests/component-config-diff-entries.pure.spec.ts`. |
| `entryBuilders.ts` | Pure builders: `textFieldDiffs` (the rows of a Unit the tree reads as text, from its own leaves), `buildPaths`, `buildUpgradeEntries` (from the dry run's Diff, through `fieldDiffsFromConfigDiff`; blocked deletes through `blockedDeleteKey`), the counters (`fieldDiffKey`, `countUpgradableBadgeFields`, `hasRealUpgrade`, `countLogicalChanges`), `buildAllApplyEntries` (still needed for the side pane's unapplied-changes/gate display; its `fieldDiffs`, which only the toolbar search reads, come from the server's bulk `/unit_diff` from `LastReleasedRevisionNum` to head), `buildVariationEntries` (from the server's variation diffs, `VariationDiffs`). |
| `useVariationDiffs.ts` | The variation reads: per downstream Unit, `POST /diff` from the upstream's head to the Unit's head, and, for a Unit with a dry run, from the upstream's head to the dry run's configuration (inline). Heads are named by Revision number, so the reads are untagged. A few at a time; a Unit's last answer stands in while its next read is in flight. |
| `componentData.ts` | `buildComponentData(spaces, units, …)` → `{deployments, stages}`; parent/child edges from `UpstreamUnitID`; label consts `Component`/`Owner`/`Variant`; `arrowKey`. |
| `componentKeyUtils.ts` | **Dot-index path helpers**: `validateKey`, `isArrayIndexSegment`, `isArrayElementPath`, `pathContainsArrayIndex`. Fixes dormant bracket-vs-dot-index bugs — use these, don't write ad-hoc regex. |
| `configParser.ts` | `parseUnitData` (base64 → JSON/YAML/multi-YAML/INI/Properties/line-fallback → flat `Map<path,value>`), `flattenObject`, `setValueAtPath`/`deleteValueAtPath`, `mapPathsToLines`. |
| `protectedPaths.ts` | `buildProtectedPathLookup(pathAnnotations, fieldPathMeta)` — the read-side "is this path kept on merge" lookup (its Override guard: exact path → ancestors → resource → `false`), mirroring the server's `GuardsForPath`. Array-indexed paths always answer `false` (no `ResolvedPath` translator in `src` — see Terminology → Protected). |
| `diffTree.ts` | `DiffTreeNode` build/collapse/context/key-injection; `formatTimeAgo`. |
| `componentTypes.ts` | All TS interfaces (below). |
| `componentValues.ts` | `ABSENT='—'`, `NO_VALUE_LABEL='no value'`, `isRemovalSentinel`, `isEmptyValue`. |
| `componentTheme.ts` / `diffStyles.ts` | Design tokens + styled rows/pills/badges. |
| `useColumnResize.ts`, `diffConstants.ts` | Minor helpers. |
| `compare/DeploymentSelectors.tsx` | The N-way compare's selector row: slot A is the open deployment, every slot (including A) has the same clear (X) and picker once there are 2+. |
| `compare/CompareCollapsible.tsx` | The "Compare" header that folds the selector row away, on both the Configuration tab (`DeploymentSelectors`) and the Releases tab (`ReleaseSelectors`). The folded state is a view preference kept in localStorage, one key per tab, not in the URL. |
| `compare/ComponentCompareSection.tsx` | The compare surface itself: filter strip, per-document-group grid + hoisted image rows, staged-edit footer. |
| `compare/CompareGrid.tsx` | N columns of one document's fields; only the key column freezes. Column heads are drag sources/targets when mounted with a `dndScope`. |
| `compare/CompareCell.tsx` | One value in one column: `same`/`differs`/`absent`/`unknown`/`no-document`. |
| `compare/CompareImageRows.tsx` | Container images, hoisted above the grid; the row-level image-change class and meter (no per-line reference column any more). |
| `compare/CompareFilterStrip.tsx` | Differing/All fields segments — one definition of "differing", no rule to pick. |
| `compare/CompareColumnDnd.tsx` | The drag layer: swaps two columns, driven by one shared `<style>` element (skeleton, drop highlight, FLIP) rather than React state. See "Compare: dragging a column" below. |
| `compare/deploymentCompareModel.ts` | `buildCompareResult`/`rowDiffers`/`filterRows` — the pure N-column comparison model. |
| `compare/identityPaths.ts`, `compare/compareTree.ts`, `compare/compareTracks.ts`, `compare/compareEditing.ts`, `compare/unanswerable.ts`, `compare/slotLetter.ts`, `compare/containerImagePaths.ts`, `compare/rowTypeTokens.ts`, `compare/absentPill.ts` | Supporting pure logic and shared styling for the compare surface. |
| `compare/compareLayout.ts`, `compare/compareVocabulary.ts` | Contexts for a second page that mounts the surface (the View explorer): `CompareLayout` (`PANE_LAYOUT` / `PAGE_LAYOUT`) and `CompareVocabulary` (`deployment` / `Unit`). The defaults are this page's. See "Compare: also mounted by the View explorer" below. |

**The URL is the sole source of truth for selection — there is no localStorage
fallback.** `AppsComponentLayout` is the ONLY component that touches `useSearchParams`; it derives
node selection from the URL during render and passes it DOWN to `AppComponentView` as controlled
props with setter callbacks (`selectedDeploymentIds`/`onSelectedDeploymentIdsChange`). Every write
goes through ONE helper, `updateParams(patch)`, doing a single `setSearchParams(prev => next, {
replace: true })` call — one atomic write per gesture, so the whole view collapses to zero pushed
history entries beyond the page's own initial navigation (a reader can click through a dozen nodes
and still leave with one `goBack()`). **Param contract:** the graph carries `space=<SpaceID>`
(single-valued — a click always selects at most one node). The `mode`, `changeOrder`, `stage` and
`rolloutSpace` params of the retired rollout mode are ignored on an older link.

**A ChangeOrder's promotion is not drawn on this graph.** The graph's rollout mode was retired: the
ChangeOrders console and detail page (`/change-orders`, `src/pages/change-orders/`) tell that story,
reading the pure logic in `src/pages/x/apps/change-order/`. The rules that logic learned the hard
way still hold there:

- **Stage order comes from the governing ChangeWorkflow Unit, not a label.** Its `spec.stages`
  array declares the sequence directly, in array order — fetched via the Unit's provenance
  annotation and pinned to the revision recorded at ChangeOrder creation, so a later edit to the
  workflow does not reorder a rollout already in flight. Each stage's `whereSpace` expression is
  resolved server-side to find its member Spaces.
- **`ResolvedSpaceIDs` absent ≠ nothing promoted.** `setChangeOrderPropagation` swallows derivation
  failures by design and returns 200 with the fields missing. The discriminator is that the set
  always contains the ChangeOrder's own Space; if it does not, report progress as *unavailable*
  rather than as zero.
- **Values, never counts.** A diff reads real configuration data on both sides. Resolution is a
  claim about Link pointers and can legitimately disagree with the bytes.
- **A local override is divergence from UPSTREAM, not from the incoming payload**, and the upstream
  baseline is per Space — the source *before* the change for a Space that has not taken it, the
  source *as it is now* for one that has.
- **Per-unit, not per-stage.** A stage can hold several Spaces, and a promote's two-call sequence
  (clone, then upgrade) can leave a fan-out stage with some Spaces written and others not, so
  provenance travels with the real unit, not the stage.

`SpecSheet`'s `readOnly` hides the ticks of its Incoming scope, and only those. The sheet offers
its editor and the value actions only when it has `onStageEdit`; without it the sheet is
read-only. So a read-only caller passes `readOnly` and no `onStageEdit`, as the ChangeSet filter
does.

### ChangeSets on the graph

A unit is in a ChangeSet while `Unit.ChangeSetID` is set. Closing the ChangeSet clears it, so a
unit read after the close names its ChangeSet only through `HeadRevision.ChangeSetID` — until
something else changes the unit. `changeSets.ts` reads both (`unitChangeSet`): the graph shows a
ChangeSet that is **open** on a unit, or **closed on the head** (nothing changed since), and nothing
older. Both fields are in `UNITS_QUERY_SELECT`; the ChangeSets themselves (slug, State,
Description) come from one `GET /change_set?where=ChangeSetID IN (...)` in `AppComponentView`, and
land on `ComponentDeployment.changeSets`.

- **Node.** `DeploymentFlowNode` draws a `ChangeSet` chip (progress tone while open, neutral once
  closed). The face carries no slug — slugs are too long for it — only a count when there are
  several; the peek names each ChangeSet with the first line of its Description. Clicking it opens
  the Configuration tab on the ChangeSet filter (the `'changeset'` value of the open-tab request). A Deployment with a ChangeSet earns a card when the graph folds — the
  `changeSet` condition, last in `CARD_SEVERITY` (`fold/deploymentCondition.ts`) — so a stack never
  hides which Deployment the work is on.
- **Side pane.** The `ChangeSet` filter beside Incoming and All draws what the ChangeSet changed
  in the Incoming view's own style, so there is one diff format in the pane. `useChangeSetEntries`
  builds an upgrade-shaped `ChangeSetEntry` per unit: "current" is the unit before the ChangeSet
  (the Revision before its first Revision in the ChangeSet), "incoming" is the unit now. Its rows
  are the server's diff between the two (`useChangeSetDiffs`), keyed by stage key; a unit created
  in the ChangeSet is diffed from nothing, a unit the tree reads as text is compared as the tree
  reads it (`textFieldDiffs`), and a failed read shows as an error in the unit's header. The pane
  swaps those into its units (`changeSetUnits`) and mounts `SpecSheet` in its Incoming scope with
  `readOnly` and no `onStageEdit`, so nothing stages and Upgrade is disabled. Staged edits are in
  the pane's staging store, not in the sheet, so switching filters loses none (rule 9). A separate server-diff section
  (`ConfigDiffView`) was tried first and rejected: two diff formats in one pane confused.
- **Closing.** On a node with an open ChangeSet, the ChangeSet filter has a Close ChangeSet bar
  (`ChangeSetPaneNotices.tsx`). Closing bulk-patches `ChangeSetID: null` over every unit the
  ChangeSet is open on, in any Space, which is what closes it and lands its end Tag.
- **Downstream of an open ChangeSet.** The server refuses to take a Revision from the middle of an
  open ChangeSet (`CheckSourceChangeSet`), dry runs included. A unit whose upstream is in one it is
  not in itself (`upstreamChangeSetBlocking`) is left out of the upgrade preview and of
  `hasUpgradableUnits`, and its node carries `waitingOnChangeSets`; the pane says what it waits for
  and links to the upstream's ChangeSet filter, instead of reporting a failed preview and offering
  an Upgrade that cannot run.
- **Writes.** A unit a ChangeSet is open on accepts a write only when it names the ChangeSet, so
  every write this view makes passes `openChangeSetIdOf(unitById, unitId)`, and the upgrade preview
  batches its dry runs by ChangeSet.
- **Overview.** `useOpenChangeSets` reads every unit with `ChangeSetID IS NOT NULL` in one request,
  for the "Open ChangeSets" tile and column of `ComponentOverviewMatrix`. Only open ChangeSets count
  there.

**Modifier-click compares.** Shift or Cmd/Ctrl + click on a node adds it to, or takes it out of,
the side pane's comparison and does NOT toggle the side pane (`handleNodeClick` checks
`event.shiftKey/metaKey/ctrlKey` first). Nodes are neither draggable nor selectable at the reactflow
props (`nodesDraggable={false}`, `elementsSelectable={false}`). `deleteKeyCode={null}` is set
explicitly — reactflow defaults to Backspace deleting selected nodes/edges from local state, which
has no place here (a node is a real deployment, not something a keypress should remove).

### State / data layer

- **No Redux slice.** Local React state + RTK Query (hooks from `@confighub/rtk-query`).
- **Queries:** `useListSpacesQuery({summary:true})`, `useListAllTargetsQuery`, `useListAllUnitsQuery`,
  `useListExtendedRevisionsQuery` (SheetInspect).
- **Mutations:** `useBulkPatchUnitsMutation` (the wholesale upgrade via `onCommitStaged`, and
  closing a ChangeSet), `usePreviewUnitUpgradeMutation` (the dry-run preview, `dryRunPatch`),
  `useUploadUnitData` (a merged document, to the Unit's data endpoint) and
  `useSetUnitGuardMutation` (Keep on merge). Apply removed from the build — no
  `useBulkApplyUnitsMutation` here.
- **Units query is hand-narrowed** (`AppComponentView.tsx`): `select` is `UNITS_QUERY_SELECT` (the unit
  metadata, `Releasable` among it, plus the head and last-released Revision ids the
  data and mutation-source reads are keyed by), `where = SpaceID IN (...)`. Uses **`currentData`, not `data`** to avoid rendering new spaces
  against stale units. Adding a field the UI reads means editing that select string (`UNITS_QUERY_SELECT`/
  `UNITS_QUERY_INCLUDE`, shared by every batch below). **Batched** at `ID_BATCH_SIZE` (50) Spaces per
  request (a node graph's Space count is unbounded — it can span every Deployment under a tree node,
  not just one Component's) — the first batch stays this same normal, polling hook call; extra
  batches each mount their OWN normal, subscribed
  `useListAllUnitsQuery` call too (`useBatchedQuery`, `useBatchedQuery.tsx`), not an imperative
  fetch-into-local-state — so a mutation elsewhere that invalidates the Unit tag, and the same 2s
  gate/upgrade poll, reach every batch, not just the first. A second, `UnitID IN (...)`-keyed batched
  query (same mechanism, same select/include) fetches any `UpstreamUnitID` missing from the fetched
  set, merged into `unitById` only (see "Navigation tree" → "Upstream-outside-set lookup"). Both kinds
  of batch surface their own errors through the same error UI as the primary batch's, and the graph's
  loading state waits for every batch (primary, extra, upstream) to settle before painting.
- **Polling:** 2s interval while gates are pending; `refetchOnFocus`.
- **Dry-run merge preview:** selecting a node fires `dryRunPatch({upgrade:true, dryRun:true, where:
  UnitID IN(...), include:'ConfigData,Diff'})`. Results → `dryRunData: Map<unitId, data>` (the
  configuration the upgrade would produce, which the post-upgrade variation read sends inline to
  `POST /diff` to compare with upstream),
  `dryRunDiffs: Map<unitId, ConfigDiff>` (the server's diff from the unit as it is to that
  configuration, which the upgrade entries are drawn from) and `dryRunConflicts: Map<unitId,
  MutationConflict[]>`. Every reset clears all three. `dryRunPendingIds` gates skeletons;
  `dryRunSettled` distinguishes "not finished" vs "zero upgradable".
- **Staging store flow:** `ComponentSidePane` holds one `useUnitStagingStore` for the node: a
  `StagingState` per Unit, changed only by `StagingAction`s (`stagingReducer.ts`). Each `SpecSheet`
  reads its Unit's state (`staging.stateOf`) and dispatches to it; the footer counts
  (`stagedCounts`, `footerVerb`), the leave guard (`useLeaveGuard`) and `handleConfirmCommit`
  read the same store, so nothing bubbles up from the sheets. A node switch calls `reset`.

### Core types (`componentTypes.ts`)

`ComponentDeployment` (node) · `Stage` · `FieldDiff {path, oldValue, newValue, key?, resolvedPath?, kind?}`
(`KeyedFieldDiff` when `key` is set) · `WholeResourceChange {key, wholeResource, resource}` ·
`UpgradeEntry` (incl. `wholeResourceChanges?`, `blockedDeleteKeys?` and `allPaths`) · `ApplyEntry` /
`ApplyEntryWithGates {isGated, gateKeys}` · `VariationEntry` · **`MergedUnit`** (the unified per-unit
row carrying optional `upgradeEntry` / `applyEntry` / `variationEntry` + `validationErrors`,
`validationWarnings` and `validationResults`) · `PaneUnit` (a unit as `unitsByDeployment` lists it).

Exported from `spec-sheet/staging/types.ts`: `StagedCommitPayload`, `StagedCommitResult`,
`STAGED_DELETE_SENTINEL`. From `spec-sheet/staging/stagingReducer.ts`: `StagingState`,
`StagingAction`.

### Backend (what the view depends on)

No endpoint is promotion-specific; the view composes generic Unit + bulk-patch + bulk-apply:

- `PATCH /unit/{id}?upgrade=true` merges the upstream HEAD into the unit through its one `UpgradeUnit` link (the link's `WhereMutation`), records the revision as `SourceTypeUpgradeUnit`, returns any `mergeConflicts` in the response's `Conflicts`, and bumps `UpstreamRevisionNum`.
- A unit is upgradable when its revision source is one of `CloneUnit`, `UpgradeUnit`, `MergeUnits`.
- Function execution honours `dry_run`: the data is computed and returned but not persisted.
- Bulk apply is `POST /unit/apply`; bulk patch goes through the pluggable bulk-patch handler.
- `MergeUnits` / `UpgradeUnit` links with `AutoUpdate` re-merge on resolve.
- `UpgradeUnit` link rules: only one outgoing per unit; `WhereMutation` only on Merge/Upgrade links; Bindings must be empty.
- `MutationConflict {Reason, Resource, Path, Source, Target, UnitID}` and the `ConflictReason` enum (**`Subtracted`**, the swallowed-delete case; `DeleteShadowed`; `ProtectedPath`; `UnresolvedPath`) are in the SDK at `core/function/api/mutations.go`. Conflicts are **advisory**: patched output is already correct.
- The merge engine (`SubtractMutations`, `PatchMutations`) is `core/configkit/yamlkit/mutations.go` in the SDK.

### Known gaps / intent vs. reality

- **#4570 fix layer.** The swallowed-deletion (Case 2) fix is **frontend classification**, not a
  merge-engine change. `entryBuilders.ts` filters the dry-run `dryRunConflicts` for
  `Reason==='Subtracted' && Source.MutationType==='Delete'` and populates
  `UpgradeEntry.blockedDeleteKeys`, each resolved to its row by `resolveConflictPath`. **#4570 contained no backend changes at all** — it touched only
  frontend files. The backend merge still subtracts (output stays correct) and emits the advisory
  Conflicts; the frontend reads them to offer opt-in. Don't go looking for a behavior change in
  `yamlkit`.
- **"N changes" per-row counter** was intentionally *removed* (user: *"Remove the N changes text from
  the unit row."*). Don't reintroduce a per-row change count.
- **`PromotionCommitSummaryDialog` does NOT exist.** It was built and removed in #4619. The Upgrade
  button now calls `handleConfirmCommit` directly with no intermediate dialog. Do not rebuild it.
- The design sessions never captured which Source-view mockup sections actually shipped vs. were only
  mocked. Treat the editable Source view as real (it exists) but the full section layout as unverified.

---

## Navigation tree: grouping, saved views, and node click opens a graph

The left nav (`AppNavigationTree.tsx`) uses the **same grouping system as the Unit list**:
`GroupNavPanel<T>` (`ui/src/components/group-nav/`), generified from its original
`ExtendedUnitRead`-only shape to take a `getValue` getter and an
item array of any type. The Unit list passes no new props and is byte-for-byte
unchanged; Components is the second caller, passing `ComponentNavItem[]`
(`componentIndex.ts`) and the `leaf` prop.

### Tree items are Components

- **Leaves.** Each tree item is one Component ENTITY (`ComponentNavItem`:
  `id`, `slug`, the Component's own `labels`, `owner`, and its `spaces` on
  the page). `buildComponentNavItems` makes one item per Component in
  `useComponentSlugs().componentById`, sorted by Slug, so a Component with
  no variants (no Spaces) is in the tree too. `GroupNavPanel`'s `leaf` prop
  adds each item as its own node one level below the last grouping level
  (at the root when there are no levels), labelled by its Slug, with the
  `component` icon, and the testid `app-tree-item-<slug>`. Group nodes get
  the testid `components-tree-node`.
- **Order.** Leaves sort by Slug. Group nodes sort by name, but the
  `(empty)` node is last at every level: real groups come first. The rule is
  `compareGroupValues` in `components/group-nav/groupOrder.ts`, and every
  group tree uses it (`GroupNavPanel`, so also the Unit list, and the
  Resource Explorer and View Explorer group panels).
- **Levels are properties of the Component, never of a Space.** A level is
  `Labels.Owner` (the owner rule below), any other `Labels.<key>` (the
  Component's own label), or a status roll-up (`UpgradeNeeded`,
  `UnreleasedChanges`, `Gated`: "Yes" when the sum of that summary count
  over the Component's Spaces is above zero, the same sums as
  `buildOverviewData`; `''` until the summary query has loaded). So a
  Component is in exactly one place in the tree. Default levels
  (`COMPONENT_DEFAULT_LEVELS`, no saved view or a view with no GroupBy):
  `['Labels.Owner']`.
- **Level picker.** `COMPONENT_CATALOG` offers the "Status & health" fields
  plus a dynamic "Labels" section: every Component label key on the page,
  and `Owner` always (its value can come from the Spaces), less `Variant`
  (`getComponentLabelKeys`). The count badge of a key is the number of
  Components with a value for it (`getComponentLabelKeyCounts`; for
  `Owner`, the Components whose owner rule gives a value). The Unit-only
  "Space Labels" submenu never appears.

### The Owner rule (`componentOwner.ts`)

The owner of a Component is a property of the Component. `componentOwner`
reads it in this order:

1. The Component's own `Owner` label, if set.
2. Else the `Owner` label that ALL the Component's Spaces carry with the
   same value.
3. Else `""` — shown as `(empty)` in the tree and "Unassigned" elsewhere.
   Spaces that disagree, one Space with no `Owner` label, or no Spaces at
   all give `""`.

There is no data migration: older Components carry the owner only on their
Spaces, and rule 2 reads it. `buildOwnerByComponentId` applies the rule to
every Component (the overview matrix, the flow-graph frames, and the create
dialog's owner list use it). `cub component list`/`get` apply the same rule.
Writes go to the Component only: `cub variant create --owner`,
`cub variant upload --owner`, and the UI create flows (inline and OCI) set
the Component's `Owner` label, and give the new Space no `Owner` label.
`ownerWrite` decides the write: an unset owner is set; the same owner is
written only when the Component has no label of its own; a different owner
is a conflict, and the create stops before it writes anything
(`ownerConflictMessage`). An owner the server would refuse as a label value
(`ownerValueProblem`, the `LABEL_VALUE_PATTERN` and length rule of
`@confighub/api`) also stops the create before any write, for both sources:
an OCI upload creates the variant before the owner is set, so a refusal found
then would leave the variant without its owner. The create dialog shows that
message on the owner field and keeps Continue and Create disabled. When the
owner write fails after the variant exists, the "Owner not set" warning gives
the `cub component update` command to set it later (`ownerSetCommand`), with
the `Owner=<value>` argument quoted for a POSIX shell by the rule `cub` uses
(`shellQuoteArg`, `src/utility/shell-quote.ts`). The tree reads owners only
after every Space has loaded (`isTreeLoading`): an owner read from a part of
a Component's Spaces can be wrong. If the Component list fails to load, the
tree and the detail pane show `QueryErrorState` with Retry, not a skeleton.

### Terms

- **Components view** — a saved `View` (`Filter.From = 'Space'`) carrying the
  `ui.confighub.io/view-kind: components` annotation (`useQueryBuilder`'s
  `viewKind` option, `groupBy-annotation.ts`). The annotation is what keeps
  these views out of any generic Space view picker without a new backend
  `EntityType` — `allViewsForEntity` filters on it, and it defaults to
  "no annotation" so every pre-existing (Unit) caller is unaffected.
- **`COMPONENT_FIELD`** (`'Component'`, `componentGroupFields.ts`) — only
  the icon key of a Component leaf. It is not a grouping level:
  `normalizeComponentLevels` drops it from saved levels. The page's Space
  set (`appSpaces`) is every Space whose Component (`Space.ComponentID`)
  Slug has loaded — a Space with no Component is not on this page. A
  leftover `Component` label on a Space means nothing.
  `componentGroupFields.ts` and `componentIndex.ts` import no React or RTK
  Query code, so `component-nav-fields.pure.spec.ts` can import them in
  Node.
- **Node graph** — the flow graph (`AppComponentView`, the same view that
  renders one Component) opened with every Space of every Component under
  ONE group node (`spacesOfComponents(filterComponentsByGroupPath(...))`).
  **Component graph** (`?app=`) is the graph of all Spaces of one Component.
- **Dashboard** (`?display=dashboard`, `AppComponentView`'s `displayMode` prop,
  `appTypes.ts`'s `ComponentDisplayMode`) — a node graph's alternate view: the
  Overview root's own component (`ComponentOverviewMatrix` — KPI header,
  matrix, activity feed), reused unmodified with the node's own `spaces`
  instead of every Component Space on the page. Named `display`, not
  `view`, so it isn't confused with the page's SAVED views
  (`viewID`/`viewGroupBy`/`viewFilterID`, `type=view`). Selected via a
  top-right Graph/Dashboard segmented control (`FlowViewControl`,
  `flow-graph/FlowViewControl.tsx`), which lives in `AppComponentView`
  (an overlay above whichever content is showing) since Dashboard
  replaces the canvas outright — the control would vanish along with it if
  it lived inside `ComponentFlowGraph` instead. In Graph mode it sits in the
  canvas column (`GraphArea`), NOT over the whole view: the side pane is to
  the right of that column, and an overlay over the full width covered the
  pane's title row and its Settings tab (`component-space-settings.spec.ts`
  clicks it).
  **Sticky across node clicks**: `display=dashboard` is deliberately left
  untouched (not reset) by every node-open URL writer
  (`AppsComponentLayout.handleAppSelect`/`handleNodeOpen`'s `?group=` branch,
  the "New component" create-redirect in `AppsComponentPage.tsx`) — clicking
  a DIFFERENT node while Dashboard is open opens that node's Dashboard too,
  not its graph. Only two things clear it: `FlowViewControl`'s Graph segment
  (an explicit "show me the graph"), and `handleOverviewSelect`
  (Overview breaks the stickiness chain — a node clicked after Overview
  opens its graph, never carrying over a choice from a since-closed, unrelated
  node graph; Overview itself always shows the full dashboard regardless of
  `display`, since it never reads the param at all).
- **Special label icons** (`componentGroupFields.ts`'s `SPECIAL_LABEL_ICONS`)
  — Owner/Stage/Region/Department each get their own icon (picker
  row, breadcrumb chip, tree node) instead of the generic Labels one every
  other label key keeps; a Component leaf (`COMPONENT_FIELD`, not a label)
  gets its own `component` icon directly in `COMPONENT_ICON_MAP`. A small, self-contained
  `label name → icon key` map, re-keyed to `Labels.<key>` for
  `COMPONENT_ICON_MAP`, so a later
  user-facing icon-selector can replace individual entries without touching
  anything else — a fixed default set until then. The new icon keys
  (`component`/`owner`/`stage`/`region`/`department`) live in a separate
  `FieldIconKey` union (`field-icons.tsx`), not `FilterFieldType` itself:
  they're not real filterable field types, and `FilterFieldType` drives
  OTHER exhaustive `Record`s (`operators.ts`'s `FIELD_CONFIGS`/
  `FIELD_DESCRIPTIONS`) that a label-only icon key has nothing to fill in
  for. `getChipIcon` checks its `iconMap` override BEFORE the generic
  `Labels.*` fallback, so a Labels-prefixed field can still resolve to its
  own icon — the Unit list's own `iconMap` has no `Labels.*` entries, so it
  is unaffected either way. `iconMap` reaches every field-icon render site
  (`GroupNavPanel`'s tree, `BreadcrumbChip`, `FieldPickerDropdown`) through a
  chain of prop passes with no default — a `FieldPickerDropdown` mounted
  without it (the "+ Add grouping level" button's own picker in
  `GroupNavBreadcrumb.tsx`, once missing it) silently falls back to
  `getChipIcon`'s own `UNIT_FIELD_TO_ICON_KEY` default and shows the generic
  icon for every row, not an error — check any NEW `FieldPickerDropdown`
  call site actually forwards it.
- **Node click vs. chevron**: clicking a node's row (label/icon/count) opens
  a graph, for a group node and a leaf alike (the URL form is below). The chevron
  (`GroupNavPanel`'s `expansionTrigger='iconContainer'` for Components only)
  only expands/collapses — it never opens anything and never writes the URL.
  The tree pane itself uses `GroupNavPanel`'s `fillContainer` option (also
  Components-only): the page's own wrapper is a `react-resizable-panels`
  `Panel` that already tracks drag width, so the tree stretches to `100%` of
  it instead of sizing off the Unit list's `--group-nav-width` CSS-variable
  mechanism, which nothing on this page ever sets.
  Clicking **Overview** (the tree's `All`-equivalent root) opens the overview
  dashboard, never narrowed by a tree click.
- **`?app=` vs `?group=`** (`resolveNodeGraphTarget`, `componentGroupFields.ts`)
  — decides which URL FORM a node's click writes:
  - A leaf (path one entry longer than `levels`) is one Component: it
    writes `?app=<slug>` and opens the WHOLE Component.
  - A group node that holds EXACTLY ONE Component writes `?app=<slug>` too:
    it holds all of that Component (a Component is in one place only), so
    the click cannot be told apart from a click on the leaf.
  - Any other group node writes `?group=<path>` (the node's value path,
    repeated `group=` params): a graph of every Space of every Component
    under it.

  Every `?app=` deep link, tour, and overview-tile click reads the URL the
  same way, regardless of which node produced it. `selectedApp` comes from
  the Component list (`itemBySlug`), so a Component with no Spaces can be
  open. A `?group=` path one entry longer than `levels` names a leaf, so it
  opens that Component as `?app=<last value>` does
  (`resolveOpenComponentSlug`); the URL is not rewritten. Any other
  `?group=` path that no Component matches (a renamed label, a deleted
  Component) shows the overview, and no node is highlighted.
- **Empty state.** An open graph with no Spaces to draw (`?app=` of a
  Component with no variants, or a `?group=` node whose Components have
  none) shows `NoVariants` (`data-testid='component-no-variants'`,
  `AppsComponentLayout.tsx`): "<slug> has no variants yet" and the
  `cub variant upload --component <slug> --variant base <dir>` hint. While
  the URL opens a Component (`?app=`, or a `?group=` leaf path) and the
  Components have not loaded, the pane shows the graph skeleton instead.
- **The deep-link / highlight rule** (`deriveComponentTreePath`,
  `componentGroupFields.ts`) — with `?app=` set, the tree highlights the
  open Component's leaf: its value at each level, then its Slug. A
  Component is in exactly one place in the tree, so this path is the only
  one. With no Component open, the tree highlights `?group=` (`[]` selects
  Overview) when at least one Component is under it, else nothing. When `?app=` names a Component that is not in the list,
  `deriveComponentTreePath` returns `null` and no node is highlighted (a
  highlighted node that does not drive what is on screen would claim
  something not there). "Not even the Overview root" required widening `GroupNavPanel`'s
  `selectedGroups` prop from `string[]` to `string[] | null` — `[]` still
  means "Overview/All is selected" (the Unit list's only case), `null` means
  nothing is. The Unit list never passes `null`, so this is additive, not a
  behavior change there.
- **Counts.** A group node counts Components (its number of leaves). A
  leaf counts the Component's variants (its Spaces on the page; `0` for a
  Component with no variants). The Overview root counts all Components.
- **No filter button.** The Components page has no `QueryBuilderElement` —
  every Space here is already a Component Deployment, so a generic metadata
  filter didn't answer a question this page's users actually had; narrowing
  happens by clicking the tree instead. A saved Components view therefore
  holds grouping only. The View API still requires a `FilterID`; every new
  view auto-mints a condition-less Filter (`From: 'Space'`, no `Where`) the
  same way an empty in-memory filter state already did before this page had
  its own view-tabs strip — `createFilterForView`'s doc comment covers it.
- **Upstream-outside-set lookup.** A node graph can hold a downstream Space
  without its upstream in the set (e.g. a Component whose base lives in
  another Component) — without this, that Unit would
  read as "not upgradable" and its upgrade diff would be empty: a WRONG
  answer, not a missing one. `AppComponentView` collects `UpstreamUnitID`s
  not already present in the fetched units, batch-fetches them
  (`batchIds`/`ID_BATCH_SIZE`, below), and merges them into `unitById` ONLY
  — never into `allUnits` — so they supply upstream HEAD/revision ids for
  upgrade detection but create no graph node and no edge; the downstream
  node just becomes a root (no incoming arrow).
- **ID batching.** A node graph's `SpaceID IN (...)` units query (and the
  upstream lookup's `UnitID IN (...)` query) is a GET query string with an
  8192-byte server limit, ~39 bytes per quoted UUID. `batchIds` splits IDs
  into `ID_BATCH_SIZE` (50)-sized, deduplicated chunks. The FIRST batch
  stays a normal, cache-backed, polling `useListAllUnitsQuery` call — for
  the common case (one batch) this is byte-for-byte the same query as
  before. Every batch beyond the first (a node graph over 50 Spaces — rare)
  is its OWN normal, subscribed `useListAllUnitsQuery` call too, mounted via
  `useBatchedQuery` (`useBatchedQuery.tsx`) rather than fetched imperatively
  into local state — cache-tag invalidation and the same 2s gate/upgrade
  poll reach every batch, and a batch's own error surfaces through the same
  error UI as the primary batch's, instead of being silently swallowed.
  The Releases chip's `SpaceID IN (...)` query is batched and merged the
  same way (via `useBatchedQuery`, no polling — a stale release chip is
  cosmetic, not correctness-critical). The dry-run preview's
  `UnitID IN (...)` PATCH is ALSO subject to this limit — the generated
  client puts `where` in the request's query params even for a PATCH, not
  the body — so it batches too, via `Promise.allSettled` rather than
  `useBatchedQuery` (a mutation isn't a subscribable query); each batch is
  an independent, self-contained dry run, so one batch failing doesn't drop
  another batch's successful preview.

### File map

| Path | Responsibility |
|---|---|
| `AppNavigationTree.tsx` | Thin wrapper over `GroupNavPanel<ComponentNavItem>` with the `leaf` option (`COMPONENT_LEAF`: id = Slug, count = variants, icon = `COMPONENT_FIELD`). One click handler (`onNodeOpen`) for every node — `GroupNavPanel` itself has no Components knowledge, and neither this file nor `GroupNavPanel` decides `?app=` vs `?group=` (that's `AppsComponentLayout`'s `resolveNodeGraphTarget` call). |
| `componentGroupFields.ts` | Pure Component-side logic: the field catalog (`COMPONENT_CATALOG`), `COMPONENT_DEFAULT_LEVELS`, `normalizeComponentLevels`, `getComponentGroupValue`, `getComponentLabelKeys`/`getComponentLabelKeyCounts`, `filterComponentsByGroupPath`, `spacesOfComponents`, `resolveNodeGraphTarget`, `deriveComponentTreePath`, `batchIds`/`ID_BATCH_SIZE`. Covered by `tests/component-nav-fields.pure.spec.ts`. |
| `componentIndex.ts` | `ComponentNavItem` and `buildComponentNavItems(componentById, appSpaces)`: one tree item per Component, Components with no Spaces included. Pure. |
| `componentOwner.ts` | The Owner rule: `componentOwner`, `buildOwnerByComponentId`, `ownerWrite`, `ownerConflictMessage`, `ownerValueProblem`, `ownerSetCommand`. Pure. Covered by `tests/component-owner.pure.spec.ts`. |
| `AppsComponentLayout.tsx` | Builds the tree items once (`buildComponentNavItems`); derives `levels` (`useGroupByLevels` with `fallbackLevels: COMPONENT_DEFAULT_LEVELS`, then `normalizeComponentLevels`), `selectedGroups`, the open graph's Space set + `graphKey`, the `NoVariants` empty state, and owns the `?group=`/`?app` URL writes (`handleNodeOpen`, `handleAppSelect`). |
| `AppsComponentPage.tsx` | Calls `useQueryBuilder({ entityType: 'Space', viewKind: 'components', defaultColumns: [] })` and renders the `ViewTabs` strip (no filter row) between the page header and the two-pane layout. |
| `AppComponentView.tsx` | The one flow-graph/Dashboard view, driven by a Space SET rather than a Component name: `graphKey` (identity, since a node graph has no one Component name), `componentSpaces` (every Space of a Component on the page, for the variant composer's sibling-name check), and `displayMode` (graph vs. Dashboard). |
| `flow-graph/FlowViewControl.tsx` | The Graph / Dashboard segmented control — a sibling overlay `AppComponentView` renders above whichever content is showing, not part of `ComponentFlowGraph` (which has no Dashboard/view-mode knowledge). |
| `ui/src/components/group-nav/` (shared with the Unit list) | `GroupNavPanel<T>` (generic tree; `expansionTrigger` prop; optional `leaf` prop, `GroupNavLeafOptions<T>`, that adds each item as a leaf under the last group level — without it the Unit list's tree is unchanged), `groupable-fields.ts` (`GroupableFieldCatalog`, `UNIT_CATALOG`), `field-icon.ts` (icon map override). |
| `ui/src/components/query-builder/useQueryBuilder.tsx` | `viewKind` option (view-kind annotation filter + `storageNamespace`), `defaultColumns` option, `clearParamsOnViewSwitch` option (below). |
| `ui/src/components/query-builder/ViewTabs.tsx` | `viewKind`/`defaultColumns`/`defaultGroupBy` props — written into a new view's create/duplicate payload. |

### URL params added, and why Component navigation keeps them

`?viewID`, `?viewGroupBy`, `?group`, and every `?filter*` param survive
clicking a Component or Overview: `handleAppSelect` / `handleOverviewSelect`
/ `AppsComponentPage`'s `onCreated` all write through `AppsComponentLayout`'s
`updateParams`, a functional-updater merge over the CURRENT params — never a
**plain object** passed to `setSearchParams`, which React Router replaces
the ENTIRE query string with, silently dropping the active saved view on
every Component click. `updateParams` accepts `{ push: true }` for the one
deliberately-pushed navigation (opening a different Component) and writes
`group` as repeated params, matching the Unit list's own `?group=`
convention.

**Gotcha: two `setSearchParams` calls in one handler do not compose, and a raw
`window.history` write does not fix it either.** `useGroupByLevels`'s
`handleEditLevels` (shared with the Unit list) writes the new `?viewGroupBy=`
via `setSearchParams`. React Router's data router keeps its own model of the
URL, updated only through its own navigations — a second `setSearchParams`
call in the same handler is a SEPARATE queued navigation whose `prev` is not
guaranteed to reflect the first one's result, and a raw
`window.history.replaceState` call is invisible to the router entirely, so a
later router-driven write can silently overwrite it. Concretely: clearing
`?group=` after a level change has to happen INSIDE the same `setSearchParams`
call as the level write, not via a follow-up call of either kind.
`useGroupByLevels` takes an optional `clearParamsOnEdit: string[]` for exactly
this — the Unit list passes nothing (its tree selection is separate React
state, not derived from the URL, so it never depended on this); Components
passes `['group']`, and `AppsComponentLayout`'s own `clearGroupUrlParams`
callback is a no-op (kept only because `useGroupByLevels`'s interface
requires one).

The same reasoning applies to clearing `?group=` on a saved-view switch, and
here the composing call is *further* away than it looks: an early version
cleared it from an `AppsComponentLayout` effect reacting to `activeView`
(mirroring `UnitListPage.tsx`'s own `lastActiveViewIdRef` pattern). That
effect's `setSearchParams` call comes from a *different* `useSearchParams()`
instance than the one that just switched the view (`useQueryBuilder`'s, inside
`AppsComponentPage`) — React Router does not guarantee the second instance's
`prev` reflects the first one's not-yet-committed result, so the effect's
write could revert the view switch it was reacting to (observed as a
newly-saved view's `?viewID=` vanishing right after creation). The fix is the
same shape as `clearParamsOnEdit`: `useQueryBuilder` takes an optional
`clearParamsOnViewSwitch: string[]`, deleted inside the SAME `setSearchParams`
call that sets `viewId` (in `syncFilterStateToUrl`/`clearFilterStateFromUrl`,
shared by every call site that switches, creates, or clears the active view).
Components passes `['group']`; the Unit list passes nothing.

**The tree is flat and virtualized.** `GroupNavPanel` draws its rows with
`GroupNavTree` (`@tanstack/react-virtual`), not MUI's tree view: only the rows
in view are in the DOM once there are more than 200, so a node's children are
not inside its element. A spec finds a node's children by `aria-level` and
order (`role='treeitem'` rows carry `aria-level`, `aria-setsize` and
`aria-posinset`), and the count badge by the testid `group-nav-node-count`.
With `expansionTrigger='iconContainer'` a chevron click stops at the chevron,
so it never selects the row (never opens a graph). A caller's `getItemProps`
`onClick` runs after the row's own select/toggle.

### No Space filter on this page

The Components page has no `QueryBuilderElement` and no filter row — see
"No filter button" above. `AppsComponentLayout`'s sets (`items`, every
Component, for the tree; `appSpaces` for the overview matrix;
`spacesOfComponents` of the node's Components for a `?group=` node graph;
the Component's own `spaces` for a whole-**Component** graph, `?app=`) are
therefore never narrowed by anything but the tree and URL themselves.

### The owning-Space rule, and its delete effect

A saved Components view's `SpaceID` follows the same rule as the Unit list's:
`activeView?.View?.SpaceID || appSpaces[0]?.Space?.SpaceID || ''` — the first
Space in a Component, in the order the query returns it. This Space is
arbitrary, and if it is later deleted, the saved view goes with it (a plain
Space→View cascade). Accepted, same as the Unit list.

### Fields offered, and saved levels that name Space fields

`COMPONENT_CATALOG` (`componentGroupFields.ts`) offers only properties of the
Component: `Labels.<key>` (dynamic — every Component label key on the page,
plus `Owner` always, less `Variant`), `UpgradeNeeded`, `UnreleasedChanges`,
and `Gated`. A Space property (its Release target, its Variant, any Space
label, its Slug) can differ between the Spaces of one Component, and would
put one Component in several places in the tree, so none is offered.
**Base vs. Deployment** and toolchain are not offered either: the nav tree
has no Units loaded.

Saved views and `?viewGroupBy=` links can still carry levels from the
Space-based tree. `normalizeComponentLevels` reads them on every render; it
does not rewrite the URL or the view (the view changes only when the user
edits its levels):

| Saved level | Read as |
|---|---|
| `Labels.Owner` | Kept. Reads the Owner rule (Component label, else the Owner all Spaces share, else empty). |
| Any other `Labels.<key>` | Kept. Reads the Component's own label `<key>`. |
| `UpgradeNeeded`, `UnreleasedChanges`, `Gated` | Kept. Roll-ups of the Component's Spaces. |
| `Component` | Dropped — the Component is the leaf. |
| `ReleaseTarget` | Dropped — a Space property. |
| `Labels.Variant` | Dropped — names one Space of a Component. |
| Any other key (for example `Space`) | Dropped. |

A level that repeats is kept once, at its first position. The result can be
empty (for example a view grouped only by `Component`): the tree then lists
the Components at the root, with no group above them.

### Storage keys

Components' saved-view tabs and per-tab drafts live under their own
namespace, `${entityType}:${viewKind}` lower-cased
(`useQueryBuilder`'s `storageNamespace`): `confighub:space:components:openViewTabs`
and `confighub:space:components:viewDraft:<id>` — never colliding with a
generic Space view picker's `confighub:space:openViewTabs`, nor with the Unit
list's `confighub:unit:openViewTabs`.

---

## How key interactions work

- **Selecting a deployment node** (`ComponentFlowGraph` click) sets the selected unit(s), fires the
  dry-run preview, and opens on Incoming (if the node has upgradable units). On Incoming, each Unit
  gets a `stageAll` action as its dry run lands, so every change "Select all" would tick is ticked.
  Side pane slides in.
- **Field sheet rendering** (`SpecSheet`): `buildSpecSheet` (`specSheetModel.ts`) reads the Unit's
  data into resources, parts, blocks and atoms, in document order, each atom keyed by its stage
  key. A scope filters the model (`filterSpecSheet`) to its keys: Incoming to
  `fieldStates(unit).incomingKeys` (with `withIncomingAdditions` for what the Unit does not hold),
  Changes to the Unreleased keys, Local overrides to the variation and local-only keys, Kept on
  merge to the kept keys. Search runs on the model, so it finds parts that have not mounted yet.
  Each block draws with the shape `shapes/registry.ts` picks for it. See "Upgrade diffs and stage
  keys" below.
- **Unit row expansion** (`isUnitExpandedInPane`): unit rows start **collapsed** in every view and on
  every tab. The pane opens a row unasked only when it already knows there is something to read
  inside it — a unit with a pending upgrade while the Incoming tab is showing, a unit the user
  just upgraded (`recentlyUpgradedUnitIds`), a unit matched by an active scope filter
  (`local-overrides` → any `variationEntry` field diff or local-only key; `local-only` → a non-empty
  `variationEntry.localOnlyKeys`; `changes` → an `applyEntry` on a unit with a Target;
  `kept-on-merge` → any `liveFieldDiffs`, since picking that filter is itself the request to see
  those rows), a unit whose diff/path CONTENT (not
  just its slug) matched an active search — a slug-only match leaves the row shut, since the name is
  already visible in the header and there's nothing hidden the search was looking for — or the
  selected node has exactly one unit, where a closed row only costs an extra click for nothing.
  Any other row opens on click (`forcedExpandedGroups`), and `collapsedGroups` overrides every rule —
  including a search match — so a click always closes a row again and typing a query never reopens
  one the user shut on purpose. `collapsedGroups` and `forcedExpandedGroups` are both cleared on node
  switch, so a newly selected node opens fully collapsed. Expansion is also what MATERIALIZES a unit
  (decode + parse), so a collapsed unit is uncounted by the field-count chip — which then shows its
  partial "N+" form. That is expected, not a bug. A unit gated as oversized (`isUnitGated`) still only
  shows its placeholder card when opened this way — a search match does not bypass that gate, so a
  hit inside a heavy unit's content isn't visibly confirmed until the user clicks "Render anyway."
- **Inline diff**: `getInlineDiffPair` (token-LCS, `tokenizeForDiff`) marks the changed *whole
  tokens* of a value: what an Incoming field becomes, in the upgrade hue (`IncomingField.tsx`), and
  a staged edit, in the edit hue (`FieldValue.tsx`). Hovering the footer Upgrade button dims the
  unit rows the upgrade does not change (`showUpgradePreview`, `unit-unchanged`).
- **Staging an upgrade**: a tick in Incoming dispatches `stageUpgrade` for its key; the keys of
  one list element added or deleted whole share one tick (`changeKeys`, `SpecSheet.tsx`). "Select
  all" dispatches `stageAll` with `selectAllUpgradeKeys` for every Unit. "Discard" dispatches
  `discardAll` (clears everything); it shows only once the person has changed what entering
  Incoming ticked. Leaving Incoming dispatches `clearUpgradeOnly` (clears the upgrade ticks; manual
  edits and keeps survive — rule 9).
- **Manual inline edits**: a click on a value (or Enter on it, or Edit in its hover card) opens
  `FieldEditor` in the value's place. Check or Enter stages through `onStageEdit` (a `stageEdit`
  action) and does NOT call `onSetFieldValue` (rule 8); staging the value the Unit holds unstages
  the edit. The value then shows its changed tokens in the edit hue and a staged mark. Values are
  editable in every scope but Incoming, so a Stale value is click-to-edit in All. A staged edit
  opens the editor seeded with the staged (proposed) value, not the underlying current value.
  `Remove key` in the hover card stages a removal (`stageRemove`); on a key this person added, it
  takes the add back. New keys: see `spec-sheet/AddKeyEditor.tsx` above.
- **Committing**: the footer button (`Upgrade N`, or `Update N` when an edit or a Keep on merge
  change is staged: `footerVerb`) calls `handleConfirmCommit`. For each Unit, `buildSheetCommit`
  (`staging/commitPayload.ts`) builds the write from the Unit's staged state: `{kind:'upgrade-all'}`
  when no edit is staged, every change "Select all" offers is ticked (whole-resource changes
  included), and every ticked change is in the upgrade's own diff; otherwise one merged document
  (`{kind:'patch-data', data}`), in which a manual edit wins over the upgrade of its key (rule 10).
  A ticked blocked deletion or guarded key therefore makes a merged document. `AppComponentView`'s
  `handleCommitStaged` sends `upgrade-all` as a bulk patch with `upgrade: true`, and `patch-data`
  to the Unit's data endpoint, through the guard dialog when the Unit has guards (rule 18). No
  review dialog (rule 11). A written Unit's staged values go (`committed`); a change the guards
  withheld is still incoming, unticked. A commit that cannot be built writes nothing for that
  Unit and shows its error in the footer; its staged changes stay.
- **Opt-in upgrades (swallowed key-deletions)**: `blockedDeleteKeys` show in Incoming with the
  shield tick (`HeldCheck`, `IncomingField.tsx`); the current value stays, and the hover card says
  "deleted upstream". Ticking one goes through the normal staging path. Unlike a guarded key, it is
  in `selectableKeys`, so entering Incoming and "Select all" tick it. Origin: `entryBuilders.ts`
  reading dry-run Conflicts.
- **Source view** (`ComponentSourceSection`): Monaco editor of decoded Data; editable with an explicit
  **Save** button (rule 17). Switching to Source does not expand anything on its own — rows follow
  the same collapse-by-default rule as the field sheet. Intended to carry the same staging model as
  the field sheet (rule 12).
- **Inspect panel**: via Inspect in a value's hover card (`FieldActions.tsx`). Opens `SheetInspect`
  — revision history with author avatars/relative time and sibling-variant values (same field
  across the column's other deployments).
- **Apply removed from the build.** There is no Apply button/action anymore — the footer's deploy-verb
  slot is Upgrade (Configuration tab) or Release (Releases tab) only. The "unapplied changes" diff/gate
  display (`allApplyEntries`/`buildAllApplyEntries`, `ApplyEntryWithGates`) is unrelated to the removed
  button and still powers gate chips, revision labels, and staged-field counts elsewhere in the panel.
- **Locking (protection)**: `Keep on merge` / `Let merges update this` in a value's hover card
  (`FieldActions.tsx`), or `Keep this block on merge` on a block label (`BlockActions.tsx`,
  keep-only), stages a `setProtection` action (see `StagingState.protection` in Terminology). A
  field inside a list cannot be kept (the action is disabled). The value shows the lock
  (`KeptMark`) while it is kept in effect. A block's keep stages one keep per field of the block
  not yet kept (`keepableAtoms`, `Part.tsx`), never one guard on the block's path, so that each
  field can be let go on its own later: a guard on the ancestor keeps every field under it, and
  none of them could be. **The commit is TWO writes per Unit** (`handleConfirmCommit`):
  `buildProtectionEdits` (`staging/protectionPayload.ts`) turns the staged keeps into the
  `ResourceGuards[]` that `onCommitProtection` sends (→ `SetUnitGuard` with the Override guard, its
  own revision, `SourceTypeSetGuard`). A wholesale upgrade writes the guards first, then the
  values: it is a merge, and a guard written first stops it from overwriting what is kept. Any
  other batch writes the values first, then the guards: a guard written first would withhold the
  values the user chose. When the first write fails, the second is not sent; neither write is
  rolled back when the other fails. The staged keeps stay staged until the guard write succeeds
  (`protectionCommitted`), so a failed guard write can be tried again. The read-side data is the
  Unit's `PathAnnotations`, which arrives with the Units; unknown reads as **not kept**
  (`isProtected` defaults to `() => false`), so the worst-case failure mode is a redundant (no-op)
  Keep on merge, never a silent release. The bar (footer) discloses staged keeps SEPARATELY from
  the value-staged count (card 8's rule: never `2 staged · 2 locks`) — see `barKeepState` in
  `ComponentSidePane.tsx` for its derived states (`none`, `editsUnkept`, `editsKept`,
  `scopeUniform`, `scopeMixed`, `valuesAndScope`) and their lead text/button labels (`Keep both on
  merge`, `Undo keep`, `Keep N keys`, `Update N keys`). The Kept on merge scope's footer has `Stop
  keeping N keys`: it STAGES (a `stopKeepingAll` action per Unit, for the fields each sheet
  reported through `onKeptKeys`), it does not write directly; the normal bar's button then performs
  the actual commit.

- **Compare: N deployments side by side, with no reference column.** `?compare=` adds up to four
  more deployments alongside the open one; `DeploymentSelectors` renders one slot per deployment and
  `ComponentCompareSection`/`CompareGrid` render the grid. There is no baseline any more — slot A is
  simply the deployment the pane happens to be open on, and the URL is the order (`space=` is slot A,
  `compare=` is the rest, comma-joined).
  - **One definition of "differing".** A field differs when the answering columns (not `unknown`,
    not `no-document`) do not all agree — and set-vs-unset counts as disagreement, the same as two
    different values. `rowDiffers` (`deploymentCompareModel.ts`) is the single implementation; there
    is no second "any two disagree" reading to pick between any more, so the filter strip has no rule
    control, only Differing/All.
  - **Cell kinds and colour**, `CompareCellKind`: `same` (muted, agrees with every answering column),
    `differs` (`variation` blue — every cell with a literal on a differing row, not just the
    "different" side of a pair, since there is no reference side), `absent` (red — not set here, where
    another column sets it), `unknown` (this column cannot answer yet), `no-document` (this column's
    unit has no document this row belongs to). `unknown` and `no-document` are never evidence of a
    difference; a row where every OTHER column agrees is not shown just because one column couldn't
    answer.
  - **Only the key (field) column freezes.** Every value column, including slot A, scrolls together —
    there is no reference column left to freeze one FOR, and freezing slot A would draw a blue rail
    around a colour that no longer means "differs from the frozen one".
  - **The drag layer, `CompareColumnDnd.tsx`.** Wraps `DeploymentSelectors` and
    `ComponentCompareSection` together (`ComponentSidePane.tsx`) so a slot and a grid column head can
    swap with each other. It drives the drag's skeleton, the drop-target highlight, and the swap's FLIP
    animation from ONE shared `<style>` element rather than React state or per-cell props — a pane can
    hold a few thousand cells, and nothing here may re-render any of them while the pointer moves.
    Every participating element carries `data-compare-col={deploymentId}` and
    `data-compare-surface={'grid'|'image'|'selectors'}`; the drag layer only ever selects by those
    attributes, never by React refs into the grid. `useCompareColumnDrag(deploymentId, scope)` makes
    one element both a drag source and a drop target; `scope` is `'selectors'` for the row and
    `grid:<unitSlug>:<docKey>` per document group, so a drag can only land on another slot/head in the
    SAME scope — a grid head in one document group can never swap with the selector row or with
    another group's heads. **There is no live sorting.** Dragging a column does not shift its
    neighbours as the pointer crosses them; the drop is a SWAP between the dragged column and whatever
    is under the pointer at drop time, and the FLIP animation is what sells the trade. Keyboard drag
    (Space/Enter to pick up, arrow keys to move, Space/Enter/Tab to drop, Escape to cancel) lives on the
    grid column head, which is focusable when a `dndScope` is given; the selector slot takes only the
    POINTER activator (`{onPointerDown: listeners?.onPointerDown}`), never the full listener set,
    because the slot underneath is already a `<button>` with its own Enter/Space handling for the
    picker, and a keyboard sensor on the wrapper would fight it.
  - **Compare: also mounted by the View explorer.** The View explorer's compare mode
    (`src/pages/x/view-explorer/compare/CompareView.tsx`) mounts `ComponentCompareSection`,
    `CompareGrid` and `CompareColumnDnd` from this folder. A change here changes two pages. The
    explorer opts in through two contexts: `CompareLayout` with `PAGE_LAYOUT` (`compareLayout.ts`)
    and `CompareVocabulary` with `UNIT_VOCABULARY` (`compareVocabulary.ts`). It also passes
    `showUnitHeader={false}`, and a `letter` and a `heading` on each column. The defaults
    (`PANE_LAYOUT`, `DEPLOYMENT_VOCABULARY`, `showUnitHeader` true, no `letter` or `heading`) must
    keep this page exactly as it is. Put a behaviour for the explorer behind one of these, never
    in the default path. After a change, run the `component-compare-*` specs and the
    `view-explorer-compare*` specs. The harness (`tests/fixtures/compare-alignment/harness.tsx`)
    has `unit-noun` panes for the explorer's wording. See
    [`view-explorer-compare.md`](view-explorer-compare.md).

### Upgrade diffs and stage keys

The upgrade rows come from the server. `buildUpgradeEntries` reads the dry run's Diff and turns it
into rows through `fieldDiffsFromConfigDiff(diff, currentData, { treeSide: 'from' })`: the tree
draws the downstream's current data, which is the Diff's From side. The server matched array
elements by merge key, so an env var inserted mid-list is one added element (given an index after
the last one) and the elements after it are not changes; and it matched resources by identity, so
a path two documents share changes only in the document it changed in. The rows are cached on the
Diff object (`upgradeRowsCache`), so a rebuild with the same Diff and data hands back the same
arrays and re-renders no row.

Every upgrade row carries its stage key (`FieldDiff.key`), and the field sheet keys on it
throughout: each atom of the model (`SheetAtom.key`), `fieldStates` (the Incoming keys, the keys
"Select all" ticks, the upstream value of each key), the scopes, the staging store, and
`buildSheetCommit`. A key the Unit does not hold is drawn inside the document its key names, not
in the last one (`withIncomingAdditions`). A value finds its upgrade by its atom's stage key, never
by its bare path.

The variation rows come from the server too. `buildVariationEntries` reads two diffs per
downstream Unit (`useVariationDiffs`): from the upstream's head to the Unit's head
(`liveFieldDiffs`, the value border and the kept-on-merge chip), and, for a Unit with a dry run,
from the upstream's head to the dry run's configuration (`fieldDiffs`, the overrides that keep
an upgrade out, the local-overrides and local-only scopes, and the "Sync with upstream" rows).
Both go through `fieldDiffsFromConfigDiff` with `treeSide: 'to'` against the Unit's current data,
which the tree draws. The live diff's To side is that data. The post-upgrade diff's To side is
what the upgrade would make it, which differs from the tree where the upgrade adds or removes
list elements, so it also takes `findElementsByMergeKey`: an element is found by its merge keys
in the tree, not by its index on the To side. A resource only the Unit has is one local-only row
per leaf (`addedResourceLeafRows`). A Unit with a dry run gets no variation entry, and no upgrade
entry, until both diffs land (`previewPendingIds` in `AppComponentView`): an upgrade count
without its overrides would stage what they keep out. A failed read is that Unit's preview error
(`upgradeError`), or, for a Unit with nothing to upgrade, an error icon in its header
(`variationError`). A Unit the tree reads as text is compared as the tree reads it
(`textFieldDiffs`) and is not read.

A blocked delete is keyed on the row its conflict names (`blockedDeleteKey`, through
`resolveConflictPath`). A conflict whose path names no row of the tree keeps a key of its own
that matches no row: it is counted and staged like any blocked delete, has no row to draw, and
the commit writes nothing for it.

What stays bare, on purpose:

- **Protection** (`isProtected`) is looked up by bare path, from the Unit's `PathAnnotations`
  (`buildProtectedPathLookup`), and written by bare path, grouped by resource
  (`buildProtectionEdits`).

---

## Rejected approaches / anti-patterns

Do not re-propose these — they were explicitly rejected by the people who built the feature.

- **Review-then-confirm dialog before the Upgrade button** (`PromotionCommitSummaryDialog`). Built and
  removed in #4619; the Upgrade button commits staged changes directly. Do not rebuild it (rule 11).
- **Writing manual inline edits immediately** (calling `onSetFieldValue` / `onDeleteFieldValue` from
  the inline editor path). Manual edits must stage (rule 8).
- **Defining "upgradable" as merely "not overridden."** Over-counts — it would include fields the
  upstream never changed, plus phantom no-dry-run entries (rule 16). Use rule 1's full definition.
- **Dropping upstream-only new values from the count** (the `downstreamPaths.has(d.path)` clause).
  That was a bug; new keys must count (rule 2).
- **Excluding upstream removals from the upgradable count** (the pre-#4570 stance). Superseded: a
  removed path is a real upgrade — counted and shown struck-through; only locally-overridden paths are
  excluded (rule 3).
- **Silently swallowing upstream key-deletions** (Case 2 status quo). #4570 converts this to opt-in
  (rules 6/7).
- **A separate per-unit-row "N changes" counter.** Removed; don't add it back.
- **Auto-save / blur-to-save in the Source view.** Rejected; explicit Save button only (rule 17).
- **Jumping from a design request straight to implementation.** Mock → sign-off → build (rule 14).
- **A compare grid in the Incoming scope.** Each incoming field shows its tick and one value, what
  it becomes, in its place (rule 15).
- **Phantom deletions** — treating a no-data dry-run as mass deletions. Guard: rule 16.
- **Bracket notation in path handling** (`env[0]`). Canonical runtime format is dot-index
  (`env.0.name`). Use helpers from `componentKeyUtils.ts` — don't write ad-hoc bracket regexes.
- **A third `mode` prop on `ComponentSidePane`** (considered for the since-retired rollout mode).
  Rejected: the pane owns the Configuration/Releases/Readme tabs, the per-Unit
  staging store, release publish/withdraw, the Space settings sheet, the heavy-unit gate, the
  source-view toggle and the inspect panel — a third mode means threading "but not in rollout"
  through all of it, and every thread is a live regression path into the mode people use all day.
  Measured the alternative (extracting the per-unit section into a shared child) too: ~30 props after
  generous bundling, ~18 of 30 belonging to subsystems rollout has no use for — a "shared" child two-thirds of whose surface one caller ignores is not shared.
  The ChangeOrder pages draw each Unit's server diff with `ConfigDiffView` under
  `ChangeOrderUnitHeader` instead. `ComponentSidePane.tsx` is not opened by them at all.
- **An inline right-hand-slot toggle for protection** (a per-row ambient switch next to the value,
  mirroring the upgrade checkbox's position). Built and rejected by the lock-interaction design track:
  it collides with the upgrade checkbox at the pane's 460px width, and a switch that waits for a button
  (i.e. doesn't write until commit) lies about itself — a toggle control implies immediate effect. Use
  the action in the value's hover card instead (`Keep on merge` / `Let merges update this`).
- **A frozen reference column in the compare grid.** Slot A (and the key column) used to freeze
  together, with blue meaning "differs from the frozen column". Removed along with the baseline
  itself — a colour with no referent is worse than one that scrolls with everything else, so only the
  key column freezes now.
- **Live-sortable compare columns**, where dragging one shifts its neighbours out of the way under the
  pointer. Rejected: that collapses the gap the pointer is over, which makes the drop target a guess.
  The drag is a SWAP between the dragged column and whatever the pointer is over at drop time, sold by
  a FLIP animation, not a live reorder.

---

## Gotchas & invariants

- **Deployment identity is always `Space.SpaceID`.** `ComponentDeployment.deploymentId ===
  MergedUnit.spaceId` is relied on for sibling-variant matching in Inspect's Variants list
  (`variantValues`, `spec-sheet/variantValues.ts`), which marks this Variant by it.
- **`clearUpgradeOnly` ≠ `discardAll`.** `clearUpgradeOnly` only clears the upgrade ticks (manual
  edits and keeps are sticky). `discardAll` clears everything. Dispatching `clearUpgradeOnly`
  when you mean a full discard leaves stale manual edits staged — a silent data-corruption risk.
- **Phantom deletions.** If a dry-run returns no data for a unit, every current path naively diffs as
  a deletion. Guard: don't build an `UpgradeEntry` until its dry-run Diff lands (rule 16,
  `buildUpgradeEntries`); never treat a no-data dry-run as mass deletions.
- **`dryRunSettled` vs `!isDryRunLoading`.** Only `dryRunSettled` may gate the auto-switch off the
  Incoming scope; at a node switch `isDryRunLoading` is momentarily `false`.
- **StrictMode double-render trap** (`AppComponentView.tsx`): `prevGraphKeyRef` is updated in a
  post-commit effect (not during render) so `isGraphSwitch` stays correct. It drives `Slide timeout={0}`
  so the side pane vanishes instantly on a graph switch — otherwise it steals layout width and the
  graph mis-fits its zoom. `graphKey` (not a Component name) is the identity compared, since a node
  graph can span several Components.
- **`currentData` not `data`** on the units query — avoids rendering new spaces against stale units.
- **RTK merge-patch+json needs a pre-stringified body** → the repeated `// @ts-expect-error` +
  `JSON.stringify({})` on patch calls is deliberate.
- **No tooltip and no MUI component per value.** `FieldValue` draws plain elements with class
  names, styled once by the sheet root (`sheetStyles.ts`), and the sheet has one hover card
  (`SheetPeek`, placed by delegated `pointerover` / `focusin`). A Unit of thousands of fields
  depends on this; do not add a per-value MUI component or tooltip.
- **`countLogicalChanges`** counts LOGICAL changes (a wholly-added array element with N leaf paths
  counts as ONE). The badge, footer "Upgrade [N]" chip, and "Select all (N)" all use this; do not
  substitute raw leaf-path counts.
- **Folder collapse resets in-row segment expansion.** Clicking a segment opens the folder. An
  orphaned "expanded" label with hidden values is fixed behavior — don't revert it.
- **`parseUnitData` is heuristic** (JSON → YAML → multi-YAML → INI → Properties → line fallback). Path
  keys use dot-notation with numeric segments for arrays (`env.0.name`), NOT bracket notation.
- **Camel vs snake params.** The UI sends `dryRun` / `upgrade`; the generated client maps to backend
  `dry_run` / `upgrade`. The canonical backend param is `dry_run`.
- **Roots can't be Upgraded.** `canUpgrade` hides the footer Upgrade button.
- **Conflicts are advisory** — the merged output is already correct; they exist to *inform* the UI,
  not to block the merge.

---

## Open questions

- **Verifying against the wrong backend is silent, not loud.** A dev server started without
  `CONFIGHUB_URL` defaults to `:9090`, and a `:9090` whose server
  predates the ChangeOrder progress fields returns **200 with the ChangeOrder's
  derived progress fields simply absent** — so a ChangeOrder page renders a promotion that has
  never moved, with nothing failing. Check which server the dev UI is talking to before trusting
  what it shows.

- **CI does not protect component view e2e.** `playwright.yml` runs
  `npx playwright test --only-changed=origin/${{ github.base_ref }}` (`playwright.yml:305`;
  `base_ref` = `main` for PRs targeting main). Component view work touches only `ui/src/`, so
  **zero** Playwright e2e tests ran while CI stayed green (user: *"it's green because no tests actually
  ran."*). A fix (run the component specs unconditionally on PRs) was proposed but not approved. Treat
  green CI on a component view PR as **not** evidence the e2e suite passed.
- Why one node renders the OLD treeview while siblings render the new value treeview
  (observed at `eshop` us-dev-1) — investigation was interrupted; unresolved.
- Empty nested groups (Variant 02 "add/remove keys"): only feasible via synthetic `DiffTreeNode`s plus
  a `pendingEmptyFolders` component state — flagged as the non-trivial part of structural editing,
  not yet built.
- Which Source-view mockup sections actually ship vs. were only mocked — sign-off not captured.

---

## Provenance

This guide reconciles two sources: a read-only **code map** of the current implementation and a
**session-mining** pass over ~135 Claude Code sessions (anchored to commits #4538 source view, #4549
inline-diff superimposition, #4570 opt-in key-deletions, #4619 staging model + manual edits). Hard
rules quoted as *"user…"* are first-person user statements; everything else is grounded in cited code.
Where intent and code diverged, see *Known gaps / intent vs. reality*.
