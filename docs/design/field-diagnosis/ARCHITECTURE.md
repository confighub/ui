# Field Diagnosis: data architecture

> **Note, 2026-11-20: what the production build changed** (branch `field-diagnosis`, PLAN.md U0 to U6).
> - **View model.** `explainField` returns the spike's `FieldView` (tokens, meanings in tooltips and
>   peeks), not §5's `FieldDiagnosis`: no `hints`, `Sentence`, `chips` or `needsDetails` prose (R2).
>   It adds `state` and `stale` from §5.
> - **No hover prefetch.** §7.2's peek and §7.3's hover-intent prefetch are not built. The row hover
>   card reads the cached whole-unit blame only and makes no request.
> - **Gates exact only.** A gate shows on a field only from the field's own `Validation` (per-path
>   data). There is no text heuristic and no "Unit gates" line: the Unit's other gates are in the
>   pane's Gates tab (team-lead decision on D3).
> - **Positional paths (§13 Q1).** The server addresses an array element by its merge keys where the
>   array has them and the element carries them, else by its index (`ports.0.containerPort` is
>   addressable). `positionalToMergeKeyPath` follows that; the caller passes the merge keys.
> - **Freshness (§7.5).** The validation freshness refetch is a follow-up: the pane's polled Unit has
>   no `HeadRevisionNum`. Every write's `Unit` invalidation refetches the open Unit's blame.
> - **Staged edits and jumps.** A jump to another Space opens a new tab while changes are staged
>   (decision (b)); a Space switch unmounts the values sections that hold them.

## 1. Intent

Any screen can show "why does this field have this value, who set it, and what happens if I change it" for any field. The caller gives only a field address. It never learns which API call fed the answer.

## 2. Decisions taken (not reopened)

- **Two levels, one view model.** The peek is fed by `GetUnitBlame` (whole unit) or by `GetUnitPath`. The details always use `GetUnitPath`.
- **Two adapters, one pure `explainField(...)`.** Both `<FieldPeek>` and `<FieldDetails>` read its output.
- **Callers pass** `FieldAddress` plus an optional `pendingValue`.
- **Edit hint is static**, derived from guards, links and triggers. A real dry run starts only when the user starts an edit, through `useGuardedWrite`.
- **Guards only.** There is no protection. `override-guard.ts` and `clearance-functions.ts` are the vocabulary.

## 3. Facts verified in code that shape the design

- **API wiring.** There is one `confighubApi` (`js-sdk/.../baseApi.ts`, reducerPath `confighubApi`). Generated `getUnitBlame` and `getUnitPath` both have `providesTags: ["Unit"]`, with no id.
- **Invalidation today.** `src/state/liveness/invalidationMap.ts` adds `UNIT_WRITE` (Revision, Mutation, ChangeSet, Resource) to `updateUnit`, `patchUnit`, `bulkPatchUnits`, `setUnitGuard` and `resolveUnitConflicts`. `FUNCTION_INVOKE` covers function invoke. `RELEASE_WRITE` and `LINK_WRITE` include `Unit`. The generated self-tag `Unit` is kept.
  - So every real write already invalidates `Unit`, and so every blame and path entry.
  - The upgrade dry run (`previewUnitUpgrade`, `upgradePreviewApi.ts`) has no tags, so previews do not refetch blame.
- **`keepUnusedDataFor` is endpoint-level, not a hook option.** `useComponentSpaces.ts:154` says so. `changeOrderImageDiffApi.ts:165` uses 30. The default is 60 s.
- **Cache key split that must be fixed.** `BlameTable.tsx:397` calls `useGetUnitBlameQuery({spaceId, unitId, flags, includeComments})`. With `includeComments: false`, the serialized key differs from `{spaceId, unitId}`. `BlamePathDrawer.tsx:334` sends `history` as an explicit boolean and `resource: field.ResourceName`. Today the same field can therefore sit in several cache entries. RTK drops `undefined` and keeps `false` in the key. This is RTK behaviour, not re-checked in the installed version **[inferred]**.
- **Array paths do not match.** `BlameField.Path` uses merge keys (`containers.?name=nginx.image`). The Component tree uses positions (`containers.0.image`). `protectedPaths.ts:20-30` says there is no translator in `src`, and it excludes array paths on purpose. Paths with no array segment are identical strings.
- **Default clearance.** `DEFAULT_CLEARANCE = [{Key:'Override', Operator:'Exists'}]`. `guardsNotClearedByDefault()` returns the guards a person's edit would be withheld by. This is the source of the edit hint.
- **Cost of blame.** `blame-api.md`: whole-unit blame is "far heavier than a Unit" and `limit` is capped at 50. `GetUnitPath` has no bulk form. `history=true` is the most expensive read.
- **`InspectPanel` history is costly.** It lists every Revision and downloads each Revision's data (`useRevisionDataMap`), then parses it. `GetUnitPath(history=true)` replaces this.
- **Prior art.** `src/pages/x/apps/gates/gateBlameApi.ts` and `gateOrigin.ts` already read flag-filtered blame in the Component pane. They are partial sources.
- **Test style.** Pure specs are `tests/*.pure.spec.ts` and import `test`/`expect` from `@playwright/test` (see `tests/blame-fields.pure.spec.ts`).

## 4. Module map

New folder `src/components/field-diagnosis/`. It follows `components/guarded-write/`: pure `.ts` next to hooks and components. It must not import from `pages/*`.

| File | Contents |
|---|---|
| `fieldAddress.ts` | `FieldAddress`, `fieldAddressKey()`, `pathArg()`, `blameArg()` (canonical RTK args) |
| `fieldDiagnosis.types.ts` | `FieldFacts`, `FieldDiagnosis`, `Chip`, `Sentence`, `Section`, `FieldAction` |
| `adapters.ts` | `factsFromBlame(field, ctx)`, `factsFromPath(report, ctx)`, `blameIndex(fields)` |
| `explainField.ts` | Pure `explainField(facts, ctx)`. No React and no RTK |
| `fieldDiagnosisApi.ts` | `selectCachedBlame`, `selectCachedPath`, and the freshness helper |
| `useUnitBlameLoader.ts` | Screen-level whole-unit blame load, with the size gate |
| `useFieldPeek.ts`, `useFieldDetails.ts` | Hooks that return `FieldDiagnosis` plus load state |
| `useFieldPeekIntent.ts` | Hover-intent prefetch |
| `FieldPeek.tsx`, `FieldDetails.tsx` | Views over `FieldDiagnosis` |
| `parts/` | `ChangeCard`, `ReviewThreadSection`, `ConfigCommentsSection`, `HistorySection` (extracted) |

Moved, with a re-export so existing imports and `tests/blame-fields.pure.spec.ts` keep working:

- `src/utility/blame-flags.ts` receives `BLAME_FLAGS`, `blameFlagMeta`, `validationSummary`, `conflictDismissalText`, `originUnitLabel` and `resourceLabel` from `blameFields.ts`.
- `BlameFlagChip.tsx` moves into `field-diagnosis/parts/` and keeps a re-export in the old place.

Left alone:

- The request builders in `blameFields.ts` (`guardSetRequest`, `overrideGuardRequest`, `conflictSelectors`, `setValueRequest`, `blameActionApplies`). The details' actions call them with `report.Field`, which is a `BlameField` without a Chain.
- `BlameTable` row logic, `gateBlameApi.ts`, `searchGuardedFieldsChunked` and `chunkedQueriesApi.ts`.

## 5. Types (sketch)

```ts
export interface FieldAddress {
  spaceId: string; unitId: string;
  ref?: string;                       // preferred: stable across revisions and variants
  path?: string;                      // fallback when no ref is known
  resource?: { type?: string; name?: string };  // needed when path is not unique
}
export interface PendingValue { value: string | null /* null = delete */; kind: 'staged' | 'unsaved' }

/** What an adapter hands to explainField. Same shape from both sources. */
export interface FieldFacts {
  source: 'blame' | 'path';
  completeness: 'field' | 'full';     // blame = field, path = full
  partial?: boolean;                  // came from a flags-filtered blame: chips only
  field: BlameField;                  // path report: report.Field (no Chain)
  firstHop?: BlameOrigin;             // blame: Chain[0]; path: Changes[0].Origin
  lastHop?: BlameOrigin;              // blame: Chain.at(-1); path: Changes.at(-1).Origin
  hops?: BlamePathChange[];           // path only
  history?: BlamePathChange[];        // path, history=true only
  comments?: BlameConfigComments; reviewThread?: BlameReviewThread; reviewThreads?: number;
  release?: { state?: string; message?: string };
  dismissals?: BlameConflictDismissal[];  // path: whole report list, covers ancestors and resource
  names?: Record<string, string>;
}
export interface ExplainContext {
  upstreamUnitId?: string;            // picks Override=Upstream or External (overrideGuardValue)
  loading?: 'peek' | 'details' | 'history';
  error?: unknown;
}

export interface FieldDiagnosis {
  address: FieldAddress;
  state: 'loading' | 'error' | 'ready' | 'absent' | 'deleted' | 'resource';
  completeness: 'field' | 'full';
  valueLine: { text: string; kind: 'value' | 'absent' | 'deleted' | 'resource' | 'none' };
  pending?: { value: string | null; vsSaved: string | undefined };
  setBy?: { text: string; who?: string; when?: string; unit?: string; revisionNum?: number; inThisUnit?: boolean; viaUpgrade?: boolean };
  chips: Chip[];                      // {code,label,meaning,color,attention,count?}
  hints: Sentence[];                  // 'edit' | 'merge' | 'block' hints, plain words
  sections: Section[];                // conflicts | blocks | guards | chain | review | comments | release | history
  actions: FieldAction[];             // only for completeness 'full'
  needsDetails?: string;              // peek text: "Open details: 2 conflicts, 1 failed check"
}
```

## 6. Data flow

```
Screen (many fields)                           Field row
  useUnitBlameLoader(unit, heavy?) ──┐           │ hover (150 ms intent)
        │ subscribes getUnitBlame     │           ▼
        ▼                             │      useFieldPeek(address, pending)
  RTK cache: getUnitBlame{spaceId,unitId} ◄───── selectCachedBlame (no fetch)
                                      │           │ hit: factsFromBlame ─────────────┐
                                      │           │ miss: usePrefetch/subscribe      │
                                      │           ▼   getUnitPath{field=ref|path}    │
                                      │      factsFromPath ──────────────────────────┤
                                      │                                              ▼
                                      │                                   explainField(facts, ctx)
click ► useFieldDetails(address): getUnitPath (always) ───────────────────► FieldDiagnosis
        history on demand: same query with history:true                       ├─ <FieldPeek>
                                                                              └─ <FieldDetails>
```

## 7. Caching, prefetch, invalidation

**7.1 One canonical arg per endpoint.** `blameArg(spaceId, unitId)` returns exactly `{spaceId, unitId}`. `pathArg(address)` returns `{spaceId, unitId, field: ref ?? path, resource: resourceName | undefined, history: history || undefined}`.

- Both are used by the new hooks and by `BlamePathDrawer` after extraction.
- `BlameTable` changes `includeComments` to `includeComments || undefined`. That way its unfiltered query and the loader share one entry.
- Entries with `flags` or `path` filters (needs-attention, the gates) are never read as a whole-unit source.

**7.2 Peek with no latency.** `useFieldPeek` reads with `confighubApi.endpoints.getUnitBlame.select(blameArg)(state)`.

- This does not subscribe and does not fetch. Memoize the selector per arg with `useMemo`, and call `useSelector` on it.
- A hit goes through `blameIndex(fields)` (cached in a `WeakMap` keyed by the fields array). `byRef` is used first. Then `byPath` uses key `type\0name\0path`, which is exact string equality, so array rows normally miss.
- A miss, or an array path, falls back to `GetUnitPath` through `useGetUnitPathQuery` with `skip` until the peek opens. Its `Field.Ref` is then used for later calls **[inferred]**: the server accepts a positional path in `field`. `UnitConflictSelector` allows positions, but I did not find the same statement for `GetUnitPath`. See open question 1.
- An entry can be removed after an invalidation when no one subscribes. A hit in `select()` can also be stale while a refetch runs. `FieldDiagnosis` exposes `stale` so the UI can dim, never blank.

**7.3 Hover-intent prefetch.** `useFieldPeekIntent` starts a 150 ms timer on `pointerenter`. On `pointerleave` it cancels the timer; a fetch already in flight is not cancelled, because it may still be useful.

- When the peek has no blame hit, the timer calls `usePrefetch('getUnitPath')` with `pathArg`. The default does not force a refetch, so a hit costs nothing.
- When the peek opens, it also prefetches the details arg. The details open already cached. The details arg is the same as the peek fallback arg, so there is one request.
- A prefetched entry has no subscriber and is held for `keepUnusedDataFor` (60 s default) **[inferred from RTK 2 cache lifecycle]**.

**7.4 Time to live.** The default 60 s is enough for path. Do not use the hook option, which does not exist. If a longer value is wanted for blame, inject a separate endpoint as `componentSpacesApi.ts` does. Do not do this now.

**7.5 Invalidation.** No new tag design and no change to generated mutations.

- `getUnitBlame` and `getUnitPath` provide `Unit`. Every writer that matters invalidates `Unit` through `invalidationMap.ts`: edit, `setUnitGuard`, `resolveUnitConflicts`, function invoke, upgrade (bulkPatch), link write, release publish. That is correct and complete.
- Why not per-unit tags: a write that invalidates `{Unit, id}` does not reach entries that provide the plain `Unit` tag. Each writer in the map would then need to change, and a missed one would show stale data. The cost of the coarse tag is small: on invalidation RTK refetches only subscribed entries (the loader's blame), and drops the others.
- **Gap, validation results.** Gates run on the server after a write, and the Component pane polls units every 2 s while gates are pending. The blame entry is not refetched by that poll. Add `useUnitBlameFreshness(unitId, stamp)`, where `stamp` is the polled unit's `HeadRevisionNum` plus its validation signature. It calls `refetch()` on the loader when the stamp changes, and skips the first run **[inferred: needs a check that the unit select carries a validation field]**.
- The upgrade dry run has no tags, so it never refetches blame.

**7.6 Big units.** `useUnitBlameLoader({unit, approxBytes})` decides what to load.

- If `isHeavyUnitData(...)` (1.5 MiB, `unitSizeGuard.ts`) is true, or the screen has no tree: skip whole-unit blame. Peek uses `GetUnitPath` only. Optionally load flag-filtered blame (`flags=Conflict,Guarded,Finding,ValidationError,ValidationWarning,Absent`) for row chips. Adapter output has `partial: true`, so a missing row means "no such flags", never "set by unknown". Peek text for a partial row says "Loading who set it" and falls to path on hover.
- Otherwise load whole-unit blame once per visible unit, with no filters. The existing Component pane already gates the tree on the same byte rule, so no new threshold is invented.
- The server cost of `upstream=true` (the default) is unmeasured. Keep the follow-upstream choice in one constant (`BLAME_FOLLOW_UPSTREAM = true`), because the peek needs the last hop for "set by a person in the base". See open question 2.

**7.7 Other variants, on demand, batched.** Only when the user opens the "Why do variants differ" section.

- Use `SearchUnitBlame` with `where=UnitID IN (...)`, `path` and `resource` narrowing, `upstream: false`, and `limit` 50.
- Chunk with `fetchChunks('UnitID', ids, ..., {maxItems: BY_ID_CHUNK_SIZE})` from `chunkedQueriesApi.ts`. Key by the sorted id set plus the `Ref`.
- Line up by `Ref` (stable across variants). Where a variant renamed a resource, fall back to `ResourceNameWithoutScope`.
- `searchGuardedFieldsChunked` is the pattern to copy. Add the endpoint in the new `fieldDiagnosisApi.ts` through `injectEndpoints`, with `providesTags: ['Unit']`. Do not touch `chunkedQueriesApi.ts`.

## 8. `explainField` mapping

`explainField` is pure and total. It never throws and never reads the cache. Anything not available is simply left out of the output. Plain-word copy is held in one table inside the module.

| Output | Source fields | Rule |
|---|---|---|
| `state` | `ctx.loading`, `ctx.error`, `field.Absent`, `field.Deleted`, `field.Path` | error > loading > absent > deleted > `resource` (empty `Path`) > ready |
| `valueLine` | `field.Value`, `Absent`, `Deleted`, `Path` | Value (YAML, trimmed to one line for the peek). Absent: "The unit does not have this field." Deleted: "A change deleted the field/resource." Resource row: no value |
| `pending` | `pendingValue`, `field.Value` | Shown above the chain as "Your unsaved value" and the saved value. Omitted when equal. Never changes other output except a hint |
| `setBy` | `lastHop.SetBy/User/When/UnitSlug/SpaceSlug/RevisionNum`, `firstHop`, `Flags` | Text from `lastHop.SetBy`, then "by `User`" (`automation` is shown as "automation"), then relative time. `inThisUnit = lastHop.UnitID === field.UnitID` (as `setInThisUnit` does). `viaUpgrade` when `Upgraded` is a flag and `firstHop` is not the last hop |
| `chips` | `field.Flags`, `blameFlagMeta(code)` | One chip per flag, label and meaning from `blameFlagMeta`. Unknown code: plain chip. `Guarded` chip also says the guard count. Chip order puts `attention` flags first |
| chip counts | `Conflicts.length`, `Validation.length`, `Findings.length` | Shown as `Conflict 2`. Peek uses these in `needsDetails` |
| hint: edit | `field.Guards`, `guardsNotClearedByDefault`, `Flags` (`SetByLink`, `SetByTrigger`), `Needed`, `lastHop.Link/Trigger` | See 8.1 |
| hint: merge | `hasOverrideGuard(Guards)`, `InheritedGuards`, `Deleted`, `Conflicts` | Override present: "A merge from upstream leaves your value alone." Deleted and kept: "A merge leaves it deleted." Inherited key: says it travels downstream |
| section: conflicts | `Conflicts[]` (`Reason`, `Source.MutationType/Value`, `Guards`), `Names`, `ConflictDismissals` | One row per conflict with the upstream change and the guards that withheld it (`conflictGuards`). Dismissals through `conflictDismissalText` |
| section: blocks | `Validation[]`, `Findings[]` | Through `validationSummary`; findings as `Reason: Details`. Warning is separate from error |
| section: guards | `Guards`, `InheritedGuards`, `Annotations` | Each as `key=value`, with the one-line meaning for `Override`, `Link`, `Trigger` and any other key, which is shown as "A requirement guard" |
| section: chain | `Changes[]` (`Origin`) | `ChangeCard` per hop. Heading by state: set / deleted / added |
| section: review, comments | `ReviewThread`, `ReviewThreads`, `Names`, `ConfigComments` | Details only |
| section: release | `ReleaseState`, `ReleaseMessage`, flag `Unreleased` | Details only. Peek shows only the `Unreleased` chip |
| section: history | `History[]` (`MutationType`, `Value`, `Origin`) | Only when loaded. Absent field: not offered |
| `actions` | `blameActionApplies`, `Absent`, `Deleted`, `Conflicts`, `Guards`, `ctx` | Details only: apply or dismiss conflicts, set or remove guard, make inherited or local, keep on merge, set value, restore from history. Disabled with a reason when `Absent` or `Deleted` |
| `needsDetails` | counts above | Peek only: names what the details hold that the peek cannot show |

**8.1 Edit hint rules**, in order; the first match wins as the main sentence and the others follow:

1. `SetByLink` or a `Link` guard: "A Link sets this field. Your edit is replaced on the next resolve."
2. `SetByTrigger` or a `Trigger` guard: "A Trigger sets this field. It can write over your edit."
3. Guards that `guardsNotClearedByDefault` returns (for example `RunAsRoot=LegacyImage`): "This guard needs your confirmation before the edit is saved."
4. `Override` only: "An Override guard keeps your value on merge. Your edit clears it by default."
5. `Needed` with no `BoundLink`: "This value is to come from upstream; no Link supplies it."
6. Otherwise no hint.

The hint is derived from state only. It is never a prediction, and it says so when a rule covers only the guards on this field.

**Peek vs details.** Blame has no review thread, no comments, no history, no release state and no dismissals beyond the field's own. Those outputs are empty when `completeness === 'field'`. The peek shows `valueLine`, `setBy`, `chips`, the first hint and `needsDetails`.

**Not in the data, so not shown:** the data type of a field, live value or drift, who or why for a guard (it is only `key=value`), upstream changes not yet merged, and downstream consumers.

## 9. Integration plan: Component side pane first

1. `ComponentValuesSection.tsx` row (`ReviewRow`) gets a `FieldPeekTrigger` wrapper. The address is `{spaceId, unitId, path: fullPath, resource: fieldPathMeta.get(path)?.resource}`.
2. `pendingValue` comes from `stagedEditedValues` (rule 8 and 9 in `components.md`). The staging model is not changed.
3. `ComponentSidePane` or `AppComponentView` mounts `useUnitBlameLoader` for the selected deployment's units (the tree is already gated by `HEAVY_UNIT_BYTES`).
4. Click opens `<FieldDetails>` where `InspectPanel` is mounted now (`ComponentValuesSection.tsx:2147`). Width: `ComponentSidePane` has a `min(280px, 100%)` rule at line 236 and a 360 px cap at line 1207, so layout sections stack in one column and wrap long values. Wide mode (a drawer) lays the chain beside the summary. Layout is the view's job, not the model's.
5. Guards, conflicts and upgrade rows already in the tree (`guardedKeys`, `blockedDeleteKeys`) stay. The peek explains the same rows.

**What `InspectPanel` data maps to:**

| Today | New |
|---|---|
| History timeline from `useListExtendedRevisions` plus every Revision's data | `GetUnitPath(history: true)`, `History[]` |
| Incoming upgrade value, source name, revision, description (`upgrade*` props) | Unchanged data from the dry run; shown as an "Incoming" section next to the chain, built from props by the pane, not by `explainField` |
| `variationEntry` (env difference from upstream) | Stays as a prop until the variants section replaces it (section 7.7) |
| `siblingVariants` | Replaced by the on-demand variants section |
| `isKept`, `canProtect`, `onToggleProtection` | Replaced by `actions` (Override guard through `overrideGuardRequest`, cleared through `useGuardedWrite`) |
| Staged edit | `pendingValue` |

## 10. Reused, extracted, deleted

- **Extract:** `ChangeCard`, `ReviewThreadSection`, `FieldSummary`'s lines (rewritten over `FieldDiagnosis`), `UnitLink`, `commentText`. `BlamePathDrawer` becomes a thin `Drawer` around `<FieldDetails>`.
- **Reuse unchanged:** `override-guard.ts`, `clearance-functions.ts`, `useGuardedWrite`, `GuardedChangesDialog`, `WithheldByGuardsNotice`, `unitSizeGuard.ts`, `chunkedQueriesApi` helpers.
- **Delete after the pane switches:** `InspectPanel.tsx`; its `useRevisionDataMap` use for history; `siblingVariants` and `onInspectPath` plumbing in the section (18 `InspectPanel`/`inspect*` references there); and the protection toggle props. The `protectedPaths.ts` lookup stays while the tree still uses it for row state.
- **Leave alone:** the pill-group hover CSS (rule 15), the staging signals, `BlameTable` behaviour.

## 11. Testing

- `tests/field-explain.pure.spec.ts`: one table-driven case per state of the data matrix (plain; inherited with 3 hops; Link; Trigger; Override plus `Guarded` conflict; requirement guard plus failed gate; deleted; pending over inherited; unreleased plus review thread; loading; error; absent; resource row). Also: same `FieldDiagnosis` core from the blame adapter and the path adapter for the same field (the parity guarantee).
- `tests/field-adapters.pure.spec.ts`: `blameIndex` by ref and by path; `partial` handling; `pathArg` normalisation (`history: false` and `undefined` give one key; ref beats path).
- `tests/field-peek-cache.spec.ts` (Playwright): hovering a field with the unit blame loaded sends no `/path` request; a miss sends exactly one and the click sends no second; an edit through `setUnitGuard` refetches only the loader's blame; the dry-run preview causes no blame refetch. Count requests with `page.route`.
- Screenshots of peek and details in the narrow pane and the wide drawer, for each state (repo rule: visual changes need a screenshot).

## 12. Risks

- **Blame cost.** `upstream=true` on a whole unit is slow on a laptop (`blame-api.md`). The size gate does not bound upstream depth. Mitigation: the one constant, plus `upstream_depth`.
- **Array paths** use the fallback until a translator exists. Heavy use of arrays (containers) means one `GetUnitPath` per hovered row.
- **Coarse invalidation** refetches every subscribed blame after any write to any unit **[inferred; likely small because only the visible units subscribe]**.
- **Stale validation** unless the freshness stamp is added.
- **Guard hints can be wrong** where a guard sits on an ancestor and the nearer key overrides it. The hint uses `field.Guards`, which already includes ancestors and the resource (the nearest wins on the server); a client rule that ignores inheritance would not.

## 13. Decisions and verified answers

### Q1. Positional array paths in `GET .../unit/{u}/path`

**Verified answer: NO.** The server does not accept a positional path such as `spec.template.spec.containers.0.image` and does not resolve it to the merge-key path.

- Handler `GetPath` reads `field` verbatim: `internal/views/unit_blame.go:151` (`GetAndUnescapeQueryParam(c, "field")`), then calls `blame.FindField(fields, field, opts.resource)` at `unit_blame.go:173`.
- `FindField` (`internal/blame/path.go:166`) tries a REF prefix match, then `AuthoredPath(argument)` (`path.go:190`) and compares by string equality or `path+"."` prefix against `f.Path` (`path.go:194-197`). A positional path never equals a merge-key `f.Path`, so it ends in 404 "no field ... in the unit" (`path.go:210`).
- `AuthoredPath` (`internal/blame/blame.go:740`) only strips the `;@N` anchor from a path. It does not convert positions to merge keys. The anchor is kept in the private `storedPath` (`blame.go:152`) and is never sent to the client.
- The one place where the server builds a positional path is `positionalPath` (`internal/blame/validation.go:118`). It is used only to match validation failures. It is not exposed in the API.
- `GetUnitBlame` `path` filter: `parseBlameOptions` reads `path` at `unit_blame.go:43`; `blame.Filter` (`blame.go:766`) uses `strings.Contains(f.Path, pathFilter)`. This is a plain substring match on the merge-key path. A positional path matches nothing.
- UI: no existing translator from a positional path to the server merge-key path. `src/pages/x/apps/compare/identityPaths.ts` has `resolveIdentityPath` and `positionalByIdentityPath`, which map identity paths in its own bracket syntax (`containers[api].image`) to dot-index paths. It does not produce `?name=api`. `src/components/config-diff/configDiffTree.ts:121` only reads `?name=` labels for display. `ArrayElementAliases` does not exist in MutationSources code. `resourceAliasesFromMutationSources` aliases resources, not array elements.

**Consequence for the design.** Array rows cannot use the path fallback with the positional path. A translator is needed. Source of truth, in order:
1. Preferred: take the merge-key path from the whole-unit blame field (`BlameField.path`) that the row belongs to. Match the row to the field by resource plus identity (`identityPaths.ts` `indexUnitByIdentity`), then call `/path` with that `f.path` or its `ref`. Use `ref` when available: REF lookup needs no path syntax.
2. Fallback: a small pure function `positionalToMergeKeyPath(documentIndex, positionalPath)` that reuses `identityPaths.ts` (position to `[key]`) and rewrites `[key]` to `.?key=`-style segments (`containers.?name=api.image`). Add unit tests with the examples in `internal/blame/flags_test.go:120`.
3. When the element has no merge key (positional fallback `[#0]` in identityPaths), the server has no addressable path either (`path.go:210`). Show "no history for unkeyed list element" and do not call the API.

### Q1b. RTK Query cache key for `false` vs `undefined`

The UI lockfile pins `@reduxjs/toolkit` 2.12.0 (`package-lock.json`). The UI worktree has no `node_modules`; the same version 2.12.0 is installed in `/Users/charlieewing/Documents/GitHub/confighub/ui/node_modules/@reduxjs/toolkit` and was read there. `defaultSerializeQueryArgs` (`src/query/defaultSerializeQueryArgs.ts:9-40`) is `endpointName + JSON.stringify(queryArgs)` with sorted keys. `JSON.stringify` drops keys whose value is `undefined`, but keeps `false`. So `{ includeComments: false }` gives key `...({"includeComments":false})` and `{ includeComments: undefined }` gives `...({})`. The two produce DIFFERENT cache entries.

### Q2. Follow upstream in whole-unit blame

Team-lead call: follow upstream (default) so the peek can name the person in the base; keep BLAME_FOLLOW_UPSTREAM as one constant and measure on a real unit before the first release.

### Q3. BlameTable arg

Team-lead call: yes, change to `includeComments || undefined` to share one cache entry. Finding (Q1b): `false` and `undefined` serialize differently in RTK Query 2.12.0, so without this change `BlameTable` (`src/pages/unit-detail/components/blame/BlameTable.tsx:402`) and the field diagnosis would hold two cache entries for the same server answer.

### Q4. Which units load blame

Team-lead call: only the unit whose tree is open (lazy), not every unit of the deployment.
