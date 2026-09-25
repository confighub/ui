# Component view (agents-first guide)

> Read this before touching the Component view / component-treeview feature. It is written for an
> AI agent editing this code cold. It is rule-dense on purpose. Paths and identifiers are real and
> verified against the tree; grep them.

## What it is

The **Component view** (route `/components`, lazy-loaded at `ui/src/App.tsx`) lets a user
propagate config changes *downstream* through a DAG of related units. A downstream unit is typically
a clone of an **upstream** unit; as the upstream changes, the downstream can **upgrade to** those
changes — per-field or in bulk. The whole interaction is **opt-in, preview-first, and stage-first**:
nothing is ever auto-applied, and changes are queued into a **staged batch** before being committed
in one network call. The UI is a left **app picker**, a center **flow graph** of deployment nodes
(by stage), and a right **side pane** whose centerpiece is a custom **value treeview** — one row
per config key with colored state checkboxes. The diff is deliberately **not** a text/Monaco diff;
Monaco only appears in the alternative **Source view**.

Everything lives under **`ui/src/pages/x/apps/`**. There is **no Redux slice** and **no
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
   **struck-through** in the upgradable view; swallowed `blockedDeletePaths` (rule 6) count too. The
   **only** paths excluded from "upgradable" are those with a **local override**
   (`variationEntry.fieldDiffs`) — consistent with rule 1. See `countUpgradableBadgeFields`
   (`ComponentSidePane.tsx:82`), the single predicate behind count/filter/dimming (rule 4).
   *(This supersedes an earlier "don't count deletions as upgradable" stance from before #4570's
   removal-preview work — do not reintroduce it; it would contradict rules 6 and 7.)*
4. **Keep count, filter, and dimming on the SAME predicate.** `hasRealUpgrade` /
   `countUpgradableBadgeFields` (`ComponentSidePane.tsx:82-105`) are the single source of truth so the
   badge number and the dimmed rows can never diverge. Divergence here is a recurring,
   user-caught bug.
5. **Kick the user off the Upgradable tab when a node has nothing upgradable.** Don't strand them on
   an empty tab. Guard the auto-switch on **`dryRunSettled`**, not `!isDryRunLoading`
   (`ComponentSidePane.tsx`) — at a node switch `isDryRunLoading` is briefly `false` before
   the new dry-run starts. Note: entering the Upgradable tab auto-stages all upgradable paths
   (`stageAllSignal` bumps); leaving it clears upgrade-only staged picks (`clearStagedSignal` bumps).
6. **Surface a swallowed upstream key-deletion as an opt-in upgrade.** This is the essence of #4570.
   When upstream deleted a key but the child locally modified it, the merge silently keeps the key
   (see Terminology → Key-deletion). Show it as a *blocked / lock* upgrade checkbox the user can
   accept.
7. **Never apply an upstream key-deletion silently.** It goes through the same opt-in accept path as
   any value change.
8. **Manual inline edits STAGE (deferred) — never write immediately.** Clicking a value opens an
   inline editor; saving goes through `onStageEdit`, NOT `onSetFieldValue` / `onDeleteFieldValue`.
   Those immediate-write handlers must never be called by an inline edit. The staged edit is
   committed as part of the next batch commit (Upgrade button).
9. **Staged manual edits are STICKY across `clearStagedSignal`.** Leaving the Upgradable tab only
   discards upgrade-only staged picks. Manual edits survive tab switches and can only be cleared by
   `discardAllSignal` (explicit Discard) or `commitStagedSignal` (commit).
10. **Manual edit wins over upstream upgrade in the committed payload.** If a user manually edits a
    path that also has an upstream upgrade, the manual edit value is written — the upgrade for that
    path is absorbed.
11. **Do NOT add a review-then-confirm dialog before the Upgrade button commits.** `PromotionCommitSummaryDialog`
    was built and then explicitly removed in #4619; the Upgrade button commits directly via
    `handleConfirmCommit`. Adding a review step back is a rejected pattern (see Rejected approaches).
12. **Mirror the treeview's interaction model in Source view.** (User: *"copy how the pills and
    buttons work in the treeview."*) Pills + accept/revert, not a separate paradigm.
13. **Treeview is the DEFAULT view; Source view is the opt-in alternative.** Do not flip the default.
14. **Design before implementation for UX changes.** Mock in HTML, get sign-off, then build. (User,
    verbatim: *"No no no no no. I just want the design for it. undo that."*) Do not jump from a design
    request to writing the feature.
15. **Do not touch the pill-group inline-diff hover CSS** (`.pill-group :has(.upgrade-pill:hover) …`
    in `ComponentValuesSection.tsx`). It is load-bearing for superimposition and treated as a no-touch
    invariant.
16. **Do not build an `UpgradeEntry` before its dry-run lands** (`entryBuilders.ts:118`). Absent
    dry-run data flags *every* field as removed (`-` sentinel) → a transient "everything removed"
    preview. See Gotchas → phantom deletions.
17. **Source-view edits use an explicit Save button** — never auto-save / blur-to-save.

---

## Terminology

| Term | Precise meaning |
|---|---|
| **Promotion** | Propagating config changes downstream along `UpstreamUnitID` Space→Space edges. The view = flow graph + side pane. |
| **Deployment (node)** | `ComponentDeployment`; identity is **`Space.SpaceID`**. `type:'Deployment'` if the Space has a Target, else `'Base'`. `displayName = Space.Labels.Variant ?? slug`. |
| **Stage** | Depth in the upstream DAG. `Stage {label:'Stage N', depth, deploymentIds}`. |
| **Upgrade** | Merging the upstream HEAD revision into a downstream unit. Backend: `upgrade=true` → `mergeUnits` → `SourceTypeUpgradeUnit`. "Upgradable" unit = `UpstreamRevisionNum < upstream.HeadRevisionNum`. |
| **Release** | Publishing a Space's Units to its Target. "Unreleased" = `LastReleasedRevisionNum < HeadRevisionNum`. |
| **Override / local override** | The child's locally-changed value at a path; it supersedes the upstream value and *blocks* that path from being "upgradable". |
| **Protected / Kept on merge** | A path whose `MutationSources.PathMutationMap[path].Protected` is `true` (or inherited from the closest protected ancestor, or the resource-level default) — a merge from upstream must not overwrite it. Committed via the `SetUnitProtection` endpoint (`SourceTypeSetProtection`), a **separate revision** from any value write. Read ladder: `protectedPaths.ts`'s `buildProtectedPathLookup` (exact path → ancestor → resource-level default → `false`). Toggled per-row via the leaf/folder kebab (`Keep on merge` / `Let merges update this`); staged the same way as everything else (`stagedProtection`, below) before commit. Array-indexed paths (`spec.containers.0.image`) are excluded from both read and write — `MutationSources` keys array elements associatively (`ResolvedPath`, e.g. `spec.containers.?name=nginx;@0.image`) and there is no parser in `ui/src` to translate the tree's positional notation into it, so guessing would risk silently mismatching the merge engine's own lookup. |
| **Value treeview** | The default diff UI: field-level tree, one row per dot-path key, with colored state checkboxes. NOT a text diff. `ComponentValuesSection.tsx`. |
| **Source view** | Monaco editor of the full raw decoded `unit.Data` (`ComponentSourceSection.tsx`). Opt-in alternative to the treeview (shipped #4538). |
| **Staged change** | A pending change queued for batch commit. A checkbox for an upgrade OR a manual inline edit. Type: `StagedChange {path, type: StagedChangeType, before, after}` (`ComponentValuesSection.tsx`). A staged **protection** change (`stagedProtection`, below) is a DIFFERENT kind of pending change — it never joins this set, and commits through a different endpoint. |
| **`stagedProtection`** | `Map<stageKey, boolean>` — the target `Protected` value the user picked for a path via the kebab, staged (not written) until commit. Keyed the same document-scoped way as `stagedEditedValues`. Deliberately separate from `stagedPaths`: a protection change is never a value change, so it never adds to the "N staged" count. Collapses to a no-op (deleted from the map) when the target equals the path's current *committed* protection — clicking `Keep on merge` then `Let merges update this` on the same unmodified row is a true no-op, and "protect 6 where 4 already are" stages exactly 2. Sticky across `clearStagedSignal`; cleared only by `discardAllSignal` or a successful protection commit. |
| **Staging signals** | Integer props on `ComponentValuesSection` that bump to trigger actions without re-mounting: `stageAllSignal` (stage all upgradable), `clearStagedSignal` (clear upgrade-only staged, leave Upgradable tab), `discardAllSignal` (clear everything, explicit Discard), `commitStagedSignal` (fire batch commit — protection first, see "Locking (protection)" below), `keepStagedEditsSignal` (stage a protect for every staged-edited-but-not-yet-kept path — the bar's `Keep both on merge`), `undoKeepStagedEditsSignal` (undo exactly that), `stopKeepingAllSignal` (stage an unprotect for every currently-kept path — the Scope chip's flattened-view `Stop keeping N keys`). |
| **StagedCommitPayload** | `{kind:'patch-data'; data: string}` — the base64-encoded merged unit Data blob `onCommitStaged` receives to PATCH. Exported from `ComponentValuesSection.tsx`. |
| **Colour system** | Cohesive per-change-type hue applied to the checkbox fill, left-edge accent bar, and row tint: **upgrade = purple** (`#7c3aed`), **manual edit = yellow** (`#ca8a04`), **delete = red** (`#dc2626`), **add = green** (`#16a34a`). Tokens in `ComponentValuesSection.tsx` (top of file). |
| **Checkboxes / UpgradeCheckbox** | Per-row staging control. Checked = staged for next commit. Unchecking an upgrade unstages it; unchecking a manual edit discards it (`onRevertEdit`). All change types use the SAME checkbox shape; colour differentiates. |
| **Inline diff / superimposition** | `computeInlineDiff` (token-LCS via `tokenizeForDiff`) overlays the proposed value onto the current; changed *tokens* (whole words/numbers) are highlighted, not individual characters. Driven by CSS `.pill-group :has(.upgrade-pill:hover) …` — **rule 15, do not touch.** |
| **Preview / upgrade-preview active** | Globally dims unchanged rows and shows the proposed values for all upgradable rows. Active when the Upgradable tab is open or the footer Upgrade button is hovered. |
| **Variation** | A field that intentionally differs between upstream HEAD and the post-upgrade downstream (env overrides, e.g. namespace). `VariationEntry`. |
| **Filter tabs** | Two segments: `Incoming·N` (purple, upgradable) and `All`. `filterMode: 'incoming' \| 'all'` in `ComponentSidePane.tsx`. Entering Incoming auto-stages all upgradable picks; leaving clears them. |
| **Inspect panel** | Click a field path → revision history (incoming value, source attribution, sibling-variant values across deployments). `InspectPanel.tsx`. Access via the **kebab menu** (inspect magnifier is no longer on hover). |
| **Treeview node** | `DiffTreeNode {key, type:'folder'\|'leaf', children, diff, context}`. `context:true` = a dimmed surrounding row shown for context. |
| **Key-deletion (swallowed / blocked)** | Upstream issued a `Delete` mutation. **Case 1**: child never modified the key → deletion passes through as a normal upgrade (`newValue` = `-`). **Case 2**: child locally modified the key → `SubtractMutations` drops the upstream Delete (`ConflictReasonSubtracted`) and the key persists, *silently swallowed*. #4570 makes Case 2 an opt-in upgrade. |
| **upstream-only path** | Present upstream, absent downstream; unioned in via `unionUpstreamOnlyPaths`, rendered with absent value `—` and a `+` prefix. |
| **Sync with upstream** | The override-row action tooltip verb (was "Force the upstream value" — renamed in #4619). |
| **`data-change-type`** | Attribute on `[data-testid="component-leaf-row"]` set to `'upgrade' \| 'edit' \| 'delete' \| 'add' \| 'protect' \| 'none'`. `'protect'` is the LOWEST-precedence type (`upgrade > edit > delete > add > protect`) — a row with only a staged protection change and nothing else. Use this in Playwright tests to assert change type; don't rely on visual-only CSS. |
| **`data-protected`** | Attribute on `[data-testid="component-leaf-row"]`, `'true' \| 'false'` — the row's EFFECTIVE kept state (staged protection change, if any, else the committed baseline). Independent of `data-change-type`: editing an already-kept value shows `data-change-type="edit"` and `data-protected="true"` at once — the rail and the border are driven by two different signals on purpose (see "Locking (protection)" below). |

---

## Architecture & file map

Route `/components` → `AppsComponentPage`. Component tree:

```
AppsComponentPage              page entry; useListSpacesQuery({summary}) + useListAllTargetsQuery
└─ AppsComponentLayout         2-pane resizable; ?app=<name> URL; selectedDeploymentIds: Set<string>
   ├─ AppNavigationTree        left: apps (Component label) grouped by Owner
   └─ AppComponentView         CORE orchestrator (units, entries, all handlers)
      ├─ ComponentFlowGraph    center: reactflow DAG of deployment nodes by stage
      │  └─ DeploymentFlowNode  one node per Space; per-unit upgrade/apply badges
      └─ ComponentSidePane     right detail pane (slides in)
         ├─ ComponentValuesSection   the value TREEVIEW (staging, inline-diff, manual edits)
         ├─ ComponentSourceSection   Source view (Monaco, editable)
         └─ InspectPanel             field history + sibling variants
```

### UI (path → responsibility)

| Path (`ui/src/pages/x/apps/`) | Responsibility |
|---|---|
| `AppsComponentPage.tsx` | Page entry; top-level spaces/targets queries; breadcrumb header. |
| `AppsComponentLayout.tsx` | 2-pane resizable layout; filters spaces to those with a `Component` label; `?app=` URL; lifts `selectedDeploymentIds`. |
| `AppNavigationTree.tsx` | Left app/component picker, grouped by `Owner` label. |
| `AppComponentView.tsx` | **Core orchestrator.** Fetches units, computes entries, owns upgrade/dry-run/`onCommitStaged` handlers, renders graph + side pane. |
| `flow-graph/ComponentFlowGraph.tsx` | `reactflow` DAG by stage; fit-to-view; click selects a deployment. |
| `flow-graph/DeploymentFlowNode.tsx` | One node per deployment/Space. Exports `NodeUnitSummary {slug, upgrading, applyStatus:'gated'\|'pending'\|null}`. |
| `flow-graph/flowLayout.ts` | Stage-based node positioning. Exports `NODE_WIDTH`/`NODE_HEIGHT`/`STAGE_GAP`. |
| `ComponentSidePane.tsx` | View toggle (Tree/Source), filter tabs, per-unit rows, footer Upgrade/Release/Discard buttons (Apply removed from the build — the "unapplied changes" diff/gate display remains); staging signal state (`stageAllSignal`, `clearStagedSignal`, `discardAllSignal`, `commitStagedSignal`); merges entries into `MergedUnit[]`. |
| `ComponentValuesSection.tsx` | **The treeview.** Staging model (checkboxes, signal props); inline editor (`onStageEdit`); per-change-type colour system; token-LCS inline diff; `nodeRowPropsAreEqual` memo. Exports `StagedChange`, `StagedChangeType`, `StagedCommitPayload`. |
| `ComponentSourceSection.tsx` | Source view: Monaco `CodeEditor` of decoded Data; editable w/ Save/Discard bar when `onSaveData` provided. |
| `ComponentKeyComposer.tsx` | Inline new-key composer row; uses `validateKey` from `componentKeyUtils.ts`. |
| `InspectPanel.tsx` | Field-history inspector (`useListExtendedRevisionsQuery`) + sibling variants across deployments. |
| `entryBuilders.ts` | Pure builders: `computeFieldDiffs`, `buildPaths`, `unionUpstreamOnlyPaths`, `buildUpgradeEntries`, `buildAllApplyEntries` (still needed for the side pane's unapplied-changes/gate display), `buildVariationEntries`, `countLogicalChanges`. |
| `componentData.ts` | `buildComponentData(spaces, units, …)` → `{deployments, stages}`; parent/child edges from `UpstreamUnitID`; label consts `Component`/`Owner`/`Variant`; `arrowKey`. |
| `componentKeyUtils.ts` | **Dot-index path helpers**: `validateKey`, `isArrayIndexSegment`, `isArrayElementPath`, `pathContainsArrayIndex`. Fixes dormant bracket-vs-dot-index bugs — use these, don't write ad-hoc regex. |
| `configParser.ts` | `parseUnitData` (base64 → JSON/YAML/multi-YAML/INI/Properties/line-fallback → flat `Map<path,value>`), `flattenObject`, `setValueAtPath`/`deleteValueAtPath`, `mapPathsToLines`. |
| `protectedPaths.ts` | `buildProtectedPathLookup(mutationSources, fieldPathMeta)` — the read-side "is this path protected" lookup (exact `PathMutationMap` entry → closest ancestor → resource-level default → `false`), mirroring the server's own `previousPathProtection` walk. Array-indexed paths always answer `false` (no `ResolvedPath` translator in `ui/src` — see Terminology → Protected). |
| `diffTree.ts` | `DiffTreeNode` build/collapse/context/key-injection; `formatTimeAgo`. |
| `componentTypes.ts` | All TS interfaces (below). |
| `componentValues.ts` | `ABSENT='—'`, `NO_VALUE_LABEL='no value'`, `isRemovalSentinel`, `isEmptyValue`. |
| `componentTheme.ts` / `diffStyles.ts` | Design tokens + styled rows/pills/badges. |
| `useColumnResize.ts`, `diffConstants.ts` | Minor helpers. |
| `compare/DeploymentSelectors.tsx` | The N-way compare's selector row: slot A is the open deployment, every slot (including A) has the same clear (X) and picker once there are 2+. |
| `compare/ComponentCompareSection.tsx` | The compare surface itself: filter strip, per-document-group grid + hoisted image rows, staged-edit footer. |
| `compare/CompareGrid.tsx` | N columns of one document's fields; only the key column freezes. Column heads are drag sources/targets when mounted with a `dndScope`. |
| `compare/CompareCell.tsx` | One value in one column: `same`/`differs`/`absent`/`unknown`/`no-document`. |
| `compare/CompareImageRows.tsx` | Container images, hoisted above the grid; the row-level image-change class and meter (no per-line reference column any more). |
| `compare/CompareFilterStrip.tsx` | Differing/All fields segments — one definition of "differing", no rule to pick. |
| `compare/CompareColumnDnd.tsx` | The drag layer: swaps two columns, driven by one shared `<style>` element (skeleton, drop highlight, FLIP) rather than React state. See "Compare: dragging a column" below. |
| `compare/deploymentCompareModel.ts` | `buildCompareResult`/`rowDiffers`/`filterRows` — the pure N-column comparison model. |
| `compare/identityPaths.ts`, `compare/compareTree.ts`, `compare/compareTracks.ts`, `compare/compareEditing.ts`, `compare/unanswerable.ts`, `compare/slotLetter.ts`, `compare/containerImagePaths.ts`, `compare/rowTypeTokens.ts` | Supporting pure logic and shared styling for the compare surface. |

**The URL is the sole source of truth for selection — there is no localStorage
fallback.** `AppsComponentLayout` is the ONLY component that touches `useSearchParams`; it derives
node selection and the three rollout ids from the URL during render and passes them
DOWN to `AppComponentView` as controlled props with setter callbacks (the same idiom the file
already uses for `selectedDeploymentIds`/`onSelectedDeploymentIdsChange`). Every write goes through
ONE helper, `updateParams(patch)`, doing a single `setSearchParams(prev => next, { replace: true })`
call — one atomic write per gesture, so the whole view collapses to zero pushed history entries
beyond the page's own initial navigation (a reader can click through a dozen nodes and still leave
with one `goBack()`). The only effects that write back are convergent normalisers — they fire only
when a param disagrees with the derived truth (e.g. a resolved-but-unlinked rollout ChangeOrder id
getting written into `?changeOrder=`) — never a state→URL mirroring effect for ordinary user
gestures. **Param contract:** the graph carries `space=<SpaceID>` (single-valued — a click always
selects at most one node). Rollout carries `changeOrder`, `stage`, `rolloutSpace`. A `mode` param on
an older link is ignored. An id that fails to resolve (a stale
`?stage=`/`?rolloutSpace=`) is deleted from the URL rather than left dangling.

**Rollout mode** is a different kind of thing from the graph view: it follows ONE ChangeOrder through a promotion sequence rather than arranging the graph.
Code lives in `ui/src/pages/x/apps/rollout/`, with the graph pieces in `flow-graph/rolloutLayout.ts`,
`RolloutLaneNode.tsx` and `RolloutStrip.tsx`. Playwright coverage: `ui/tests/rollout-mode.spec.ts`.

**The rollout pane mounts `ComponentValuesSection` directly — the SAME tree auto mode renders —
not a separate one.** `RolloutSidePane.tsx` renders `ChangeOrderLine` (collapsed identity) →
`RolloutGateList` (promotion-precondition gates, reused verbatim) → a thin per-unit
`RolloutUnitHeader` + `ComponentValuesSection` mounted `readOnly`, one per real unit across every
Space of the *selected* stage (there is no accordion — the pane's whole subject is one stage,
chosen in the graph; the graph is the cross-stage view) → the footer. The ChangeOrder feeds the
tree as a synthetic `UpgradeEntry`/`VariationEntry` built by `rolloutMergedUnits.ts`, the one new
derivation this reuse needed — everything else (`rolloutStages`, `rolloutGates`, `rolloutChanges`,
`rolloutOverrides`, `useRolloutBaseline`, `useRolloutData`) is untouched pure logic feeding it.
`ComponentSidePane.tsx` is never opened, and neither it nor `ComponentValuesSection.tsx` gains any
rollout knowledge — reuse is a data adapter into a shared component, not a shared pane. An earlier
version of the pane (deleted) was a bespoke accordion (`RolloutStepper.tsx`) over its own diff tree
(`RolloutChangeTree.tsx`, wrapping `TreeDiffSection`) — do not resurrect that shape; see Rejected
approaches for why the obvious alternative (forking `ComponentSidePane`) was also rejected.

**`readOnly` on `ComponentValuesSection` had to be completed, not just used.** It existed
(added for an earlier task) but three of its guarded sites were still staging-derived rather than
entry-derived, so mounting it read-only silently reintroduced problems this view already has rules
against: every row would classify as unchanged (rule-16-adjacent — a real incoming change with no
visible tint or accent), the Upgradable auto-stage effect had no `readOnly` guard at all (a
"read-only" mount that secretly staged), and the folder kebab's destructive actions stayed reachable
because the caller happened not to wire handlers rather than because the mode forbade them. Fixed at
four sites, each keyed off `readOnly` itself (`rowChangeType`, `isUnchangedField`, the Upgradable
auto-stage effect, `hasFolderEditHandlers`) — each fix is correct for any read-only caller, not a
rollout-specific branch, and none of it touches rule 15's hover CSS. The pane also has to set the
`pane-upgrade-preview` class itself, unconditionally (auto mode only sets it on Upgrade-button hover
or the Incoming tab, which rollout has neither of) — without it, `isUnchangedField` being correct is
inert, since nothing dims.

The rules that are easy to get wrong, all of them learned the hard way:

- **Stage order comes from the governing ChangeWorkflow Unit, not a label.** Its `spec.stages`
  array declares the sequence directly, in array order — fetched via the Unit's provenance
  annotation and pinned to the revision recorded at ChangeOrder creation, so a later edit to the
  workflow does not reorder a rollout already in flight. Each stage's `whereSpace` expression is
  resolved server-side to find its member Spaces; there is no client-side label to derive order
  from any more. `cub variant promote`'s `validateStageEntryGates` is the CLI-side twin this UI's
  `rolloutGates.ts` mirrors.
- **Gates are a client-side port of that CLI function**, reusing its wording verbatim so a user
  refused here and refused by `cub` is told the same thing. There is no gate entity in the backend.
  If the two ever disagree, the CLI is right.
- **`ResolvedSpaceIDs` absent ≠ nothing promoted.** `setChangeOrderPropagation` swallows derivation
  failures by design and returns 200 with the fields missing. The discriminator is that the set
  always contains the ChangeOrder's own Space; if it does not, report progress as *unavailable*
  rather than as zero (`deriveProgress`).
- **Read-only is structural.** Dragging, connecting, selection and edge interaction are off at the
  reactflow props, and variant creation is severed at the shared `onComposerOpen` callback rather
  than at each of its three entry points (knob, `V` key, connect-end on empty canvas). Verify it by
  PERFORMING gestures — counting absent controls cannot find a gesture outcome.
- **Values, never counts.** The treeview reads real configuration data on both sides (a dry-run for
  a pending stage, the Revisions carrying the ChangeOrder for a promoted one). Resolution is a claim
  about Link pointers and can legitimately disagree with the bytes.
- **A local override is divergence from UPSTREAM, not from the incoming payload**, and the upstream
  baseline is per Space — the source *before* the change for a Space that has not taken it, the
  source *as it is now* for one that has. Comparing against the incoming payload reports every
  carried path as an override; comparing every Space against the pre-change state does the same for
  already-promoted ones. Both mistakes have been made here, and the second is worse than useless:
  it told a Space whose pinned image was about to be replaced that the promote would not touch it.
- **An override the promotion is about to overwrite is not a blocked override — it is an incoming
  change.** The tree's own override machinery (rule 1: overridden ⇒ not upgradable) has no concept of
  "overridden, but overwritten anyway"; feeding it every local divergence from the baseline, including
  paths the ChangeOrder itself writes, makes it tell the user "your value is protected" about a value
  about to change. Filter the synthetic `VariationEntry` to paths the incoming change does NOT touch
  before it ever reaches the tree.
- **Per-unit, not per-stage, for anything the tree renders.** A stage can hold several Spaces, and a
  promote's two-call sequence (clone, then upgrade) can leave a fan-out stage with some Spaces written
  and others not. A stage-level "written"/"promoted" flag marks the un-written ones as written too —
  provenance (and anything else the tree needs) has to travel with the real unit, not the stage.

**Modifier-click compares.** Shift or Cmd/Ctrl + click on a node adds it to, or takes it out of,
the side pane's comparison and does NOT toggle the side pane (`handleNodeClick` checks
`event.shiftKey/metaKey/ctrlKey` first). Nodes are neither draggable nor selectable at the reactflow
props (`nodesDraggable={false}`, `elementsSelectable={false}`). `deleteKeyCode={null}` is set
explicitly — reactflow defaults to Backspace deleting selected nodes/edges from local state, which
has no place here (a node is a real deployment, not something a keypress should remove).

### State / data layer

- **No Redux slice.** Local React state + RTK Query (hooks from `@confighub/rtk-query`).
- **Queries:** `useListSpacesQuery({summary:true})`, `useListAllTargetsQuery`, `useListAllUnitsQuery`,
  `useListExtendedRevisionsQuery` (InspectPanel).
- **Mutations:** `useBulkPatchUnitsMutation` (used 3×: real upgrade via `onCommitStaged`, dry-run
  preview, field/data PATCH). Apply removed from the build — no `useBulkApplyUnitsMutation` here.
- **Units query is hand-narrowed** (`AppComponentView.tsx`): `select=UnitID,Slug,SpaceID,TargetID,
  UpstreamUnitID,UpstreamRevisionNum,HeadRevisionNum,LastReleasedRevisionNum,ValidationErrors,ToolchainType,
  Data`, `where = SpaceID IN (...)`. Uses **`currentData`, not `data`** to avoid rendering new spaces
  against stale units. Adding a field the UI reads means editing that select string.
- **Polling:** 2s interval while gates are pending; `refetchOnFocus`.
- **Dry-run merge preview:** selecting a node fires `dryRunPatch({upgrade:true, dryRun:true, where:
  UnitID IN(...)})`. Results → `dryRunData: Map<unitId, base64Data>` and `dryRunConflicts:
  Map<unitId, MutationConflict[]>`. `dryRunPendingIds` gates skeletons; `dryRunSettled` distinguishes
  "not finished" vs "zero upgradable".
- **Staging signals flow:** `ComponentSidePane` owns four `useState` counters it bumps into
  `ComponentValuesSection` as props: `stageAllSignal` (entering Upgradable tab or "Select all"),
  `clearStagedSignal` (leaving Upgradable tab), `discardAllSignal` (Discard button), and
  `commitStagedSignal` (Upgrade button). `ComponentValuesSection` detects each bump via refs
  and acts. `onStagedCountChange` / `onStagedChangesChange` bubble staged state back up to the side
  pane for the footer chip count and tooltip summary.

### Core types (`componentTypes.ts`)

`ComponentDeployment` (node) · `Stage` · `FieldDiff {path, oldValue, newValue}` ·
`UpgradeEntry` (incl. `blockedDeletePaths?` and `allPaths`) · `ApplyEntry` /
`ApplyEntryWithGates {isGated, gateKeys}` · `VariationEntry` · **`MergedUnit`** (the unified per-unit
row carrying optional `upgradeEntry` / `applyEntry` / `variationEntry` + `validationErrors`).

Exported from `ComponentValuesSection.tsx`: `StagedChange`, `StagedChangeType`, `StagedCommitPayload`.

### Backend (path → responsibility)

No endpoint is promotion-specific; the view composes generic Unit + bulk-patch + bulk-apply.

| Path | Responsibility |
|---|---|
| `internal/views/unit.go:491` | Declares `upgrade` query param. |
| `internal/views/unit_update.go:59,663` | Parses `upgrade`; when set → `SourceTypeUpgradeUnit`, finds the unit's one `UpgradeUnit` link, calls `mergeUnits` (`:707`) merging upstream HEAD via the link's `WhereMutation`, appends `mergeConflicts` to response `Conflicts`, bumps `UpstreamRevisionNum`. |
| `internal/views/unit_core.go:1728` | `WhereMutationIsUpgradable = Revision.Source IN ('CloneUnit','UpgradeUnit','MergeUnits')`; `CreateUpgradeLink`, `WhereMutationForUpgradeLink`. |
| `internal/views/function_execution.go:559` | Parses `dry_run`; when true, data is computed/returned but not persisted. |
| `internal/views/routes.go:505` | `bulkUnit.POST("/apply", …BulkApplyUnits)`; bulk patch via `PluggableHandleBulkPatchRequest`. |
| `internal/views/resolve_processor.go:333/521/604` | Auto-update path: `MergeUnits`/`UpgradeUnit` links with `AutoUpdate` re-merge on resolve. |
| `internal/views/link.go:851/865` | `UpgradeUnit` link rules: only ONE outgoing per unit; `WhereMutation` only for Merge/Upgrade; Bindings must be empty. |
| `public/core/function/api/mutations.go:119` | `MutationConflict {Reason, Resource, Path, Source, Target, UnitID}`. `ConflictReason` enum (`:92`): **`Subtracted`** (the swallowed-delete case), `DeleteShadowed`, `ProtectedPath`, `UnresolvedPath`. Conflicts are **advisory**: patched output is already correct. |
| `public/core/configkit/yamlkit/mutations.go` | Merge engine: `SubtractMutations`, `PatchMutations`. |

### Known gaps / intent vs. reality

- **#4570 fix layer.** The swallowed-deletion (Case 2) fix is **frontend classification**, not a
  merge-engine change. `entryBuilders.ts` filters the dry-run `dryRunConflicts` for
  `Reason==='Subtracted' && Source.MutationType==='Delete'` and populates
  `UpgradeEntry.blockedDeletePaths`. **#4570 contained no backend changes at all** — it touched only
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

## How key interactions work

- **Selecting a deployment node** (`ComponentFlowGraph` click) sets the selected unit(s), fires the
  dry-run preview, and switches to the Upgradable tab (if the node has upgradable units). Tab entry
  bumps `stageAllSignal` → all upgradable rows auto-stage (checkboxes checked). Side pane slides in.
- **Treeview rendering** (`ComponentValuesSection`): builds `upgradeFieldDiffs` / `variationFieldDiffs`
  maps and a `DiffTreeNode` tree from each `MergedUnit`'s entries. Folder chains collapse; `context`
  rows around a diff are dimmed. Each leaf row gets a `data-change-type` attribute reflecting its
  staged state.
- **Unit row expansion** (`isUnitExpandedInPane`): unit rows start **collapsed** in every view and on
  every tab. The pane opens a row unasked only when it already knows there is something to read
  inside it — a unit with a pending upgrade while the Incoming tab is showing, a unit the user
  just upgraded (`recentlyUpgradedUnitIds`), a unit matched by an active scope filter
  (`local-overrides` → any `variationEntry`; `local-only` → a non-empty `localOnlyPaths`, since
  picking that filter is itself the request to see those rows), a unit whose diff/path CONTENT (not
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
- **Inline diff (superimposition)**: `computeInlineDiff` (token-LCS, `tokenizeForDiff`) overlays the
  proposed value onto the current; changed *whole tokens* highlight in change-type colour. Driven by
  CSS `.pill-group :has(.upgrade-pill:hover) …` — **rule 15, do not touch.** The Upgradable tab and
  Upgrade-button hover both activate `showUpgradePreview`, which dims unchanged rows globally.
- **Staging an upgrade**: checking a row's `UpgradeCheckbox` adds its path(s) to the staged set;
  unchecking removes them. "Select all" bumps `stageAllSignal` (stages all at once). "Discard" bumps
  `discardAllSignal` (clears everything). Leaving the Upgradable tab bumps `clearStagedSignal` (clears
  upgrade-only picks; manual edits survive — rule 9).
- **Manual inline edits**: clicking a value's `.current-pill` opens an inline `InputBase`; on blur
  the `handleSave` → `onStageEdit` path stages the edit (does NOT call `onSetFieldValue`). The row
  turns amber (edit colour). An upgradable row stays click-to-edit (rule 8). A staged edit opens the
  editor seeded with the staged (proposed) value, not the underlying current value.
- **Committing**: the footer Upgrade button calls `handleConfirmCommit` → bumps `commitStagedSignal`
  → each `ComponentValuesSection` instance builds a `StagedCommitPayload {kind:'patch-data', data}`
  from its staged set (manual edits applied on top of upstream value) and calls `onCommitStaged`.
  `AppComponentView` wires `onCommitStaged` to a `bulkPatch` call. No review dialog. The committed
  rows stay visible post-refetch via `committedDiffs` (cleared on explicit Discard, not on
  `clearStagedSignal`).
- **Opt-in upgrades (swallowed key-deletions)**: `blockedDeletePaths` render as *blocked / lock*
  checkboxes (with a lock-shake animation when Upgrade button is hovered). Checking them goes through
  the normal staging path. Origin: `entryBuilders.ts` reading dry-run Conflicts.
- **Source view** (`ComponentSourceSection`): Monaco editor of decoded Data; editable with an explicit
  **Save** button (rule 17). Switching to Source does not expand anything on its own — rows follow
  the same collapse-by-default rule as the treeview. Intended to carry the same staging model as the
  treeview (rule 12).
- **Inspect panel**: via the **kebab menu** on a field row (the on-hover magnifier was removed in
  #4619). Opens `InspectPanel` — revision history with author avatars/relative time and
  sibling-variant values (same field across the column's other deployments).
- **Apply removed from the build.** There is no Apply button/action anymore — the footer's deploy-verb
  slot is Upgrade (Configuration tab) or Release (Releases tab) only. The "unapplied changes" diff/gate
  display (`allApplyEntries`/`buildAllApplyEntries`, `ApplyEntryWithGates`) is unrelated to the removed
  button and still powers gate chips, revision labels, and staged-field counts elsewhere in the panel.
- **Locking (protection)**: a leaf/folder kebab item (`Keep on merge` / `Let merges update this`;
  folder: `Keep group & N keys on merge`, protect-only — the reverse lives only on the Scope chip's
  flattened view, see below) stages a `stagedProtection` entry (see Terminology). The value pill's
  border firms from dashed to SOLID when a path is effectively kept (`kept` prop on `CurrentPill`) —
  solid REPLACES dashed, never composes with it — and a protection-only staged row gets the lowest-
  precedence `'protect'` rail (`ROW_TYPE_TOKENS.protect`, `componentTheme.accent`). **Commit is TWO
  calls, protection first**: `ComponentValuesSection`'s commit-signal effect calls `onCommitProtection`
  (→ `SetUnitProtection`, its own revision, `SourceTypeSetProtection`) BEFORE building/sending the value
  `StagedCommitPayload`; if the protection write fails, the value write is never attempted; if the
  protection write succeeds and the SUBSEQUENT value write fails, the protection write is **not** rolled
  back (over-protected is the safe direction to fail in). A folder's "Keep group" writes N individual
  leaf entries via `collectLeafPaths`, never one ancestor-path write — an ancestor write would silently
  fail to protect a leaf that already carries its own exact `PathMutationMap` entry (the normal case for
  anything ever edited/overridden). `MutationSources` (the read-side data) is fetched lazily via
  `onRequestProtectionData`, only when a kebab is actually opened for a unit that hasn't been fetched yet
  (or the Scope chip's own count needs it) — never unconditionally; unfetched/unknown reads as
  **unprotected** (`isProtected` defaults to `() => false`), so the worst-case failure mode is a
  redundant (no-op) protect, never a silent unprotect. The bar (footer) discloses staged protection
  SEPARATELY from the value-staged count (card 8's rule: never `2 staged · 2 locks`) — see
  `barKeepState` in `ComponentSidePane.tsx` for the five derived states (edits-none-kept /
  edits-all-kept / pure-scope-uniform / pure-scope-mixed / values-and-scope) and their lead
  text/button labels (`Keep both on merge`, `Undo keep`, `Keep N keys`, `Update N keys`). The Scope
  chip's own bulk-unprotect (`Stop keeping N keys`) lives in its flattened `scopeFilter === 'kept-on-merge'`
  view's footer — it STAGES (via `stopKeepingAllSignal`), it does not write directly; the normal bar's
  `Update N keys` button (now showing, since something is staged) performs the actual commit.

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
- **Touching the pill-group `:has(.upgrade-pill:hover)` CSS** (rule 15).
- **Phantom deletions** — treating a no-data dry-run as mass deletions. Guard: rule 16.
- **Bracket notation in path handling** (`env[0]`). Canonical runtime format is dot-index
  (`env.0.name`). Use helpers from `componentKeyUtils.ts` — don't write ad-hoc bracket regexes.
- **A third `mode` prop on `ComponentSidePane` for rollout.** Considered when redesigning the rollout
  pane to reuse the treeview. Rejected: the pane owns the Configuration/Releases tabs, all four
  staging signals, release publish/withdraw, the Space settings sheet, the heavy-unit gate, the
  source-view toggle and the inspect panel — a third mode means threading "but not in rollout"
  through all of it, and every thread is a live regression path into the mode people use all day.
  Measured the alternative (extracting the per-unit section into a shared child) too: ~30 props after
  generous bundling, all four staging signals among them, ~18 of 30 belonging to subsystems rollout
  has no use for — a "shared" child two-thirds of whose surface one caller ignores is not shared.
  Reuse landed one level down instead: mount `ComponentValuesSection` itself, read-only, fed by a data
  adapter (`rolloutMergedUnits.ts`). `ComponentSidePane.tsx` is not opened by this reuse at all.
- **An inline right-hand-slot toggle for protection** (a per-row ambient switch next to the value,
  mirroring the upgrade checkbox's position). Built and rejected by the lock-interaction design track:
  it collides with the upgrade checkbox at the pane's 460px width, and a switch that waits for a button
  (i.e. doesn't write until commit) lies about itself — a toggle control implies immediate effect. Use
  the kebab menu item instead (`Keep on merge` / `Let merges update this`).
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
  MergedUnit.spaceId` is relied on for sibling-variant matching in `ComponentValuesSection`.
- **`clearStagedSignal` ≠ `discardAllSignal`.** `clearStagedSignal` only clears upgrade-only staged
  picks (manual edits are sticky). `discardAllSignal` clears everything. Bumping `clearStagedSignal`
  when you mean a full discard leaves stale manual edits staged — a silent data-corruption risk.
- **Phantom deletions.** If a dry-run returns no data for a unit, every current path naively diffs as
  a deletion. Guard: don't build an `UpgradeEntry` until its dry-run lands (rule 16,
  `entryBuilders.ts:118`); never treat a no-data dry-run as mass deletions.
- **`dryRunSettled` vs `!isDryRunLoading`.** Only `dryRunSettled` may gate the auto-switch off the
  Upgradable tab; at a node switch `isDryRunLoading` is momentarily `false`.
- **StrictMode double-render trap** (`AppComponentView.tsx`): `prevAppNameRef` is updated in a
  post-commit effect (not during render) so `isAppSwitch` stays correct. It drives `Slide timeout={0}`
  so the side pane vanishes instantly on app switch — otherwise it steals layout width and the graph
  mis-fits its zoom.
- **`currentData` not `data`** on the units query — avoids rendering new spaces against stale units.
- **RTK merge-patch+json needs a pre-stringified body** → the repeated `// @ts-expect-error` +
  `JSON.stringify({})` on patch calls is deliberate.
- **`nodeRowPropsAreEqual` is load-bearing** (`ComponentValuesSection.tsx`). A naive
  Set-by-reference comparator re-renders every tree row on each stage/unstage.
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
  derived progress fields simply absent** — so rollout mode renders a promotion that has never
  moved, with nothing failing. The ports, the correct start command, and a binary capability check
  are documented once, in `ui/tests/rollout-mode.testplan.md` §8.2b; that copy is canonical and this
  is only a pointer to it.

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
