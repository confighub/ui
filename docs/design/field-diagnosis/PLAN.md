---
title: "feat: Field diagnosis in the Component side pane (production build of the approved spike)"
type: feat
status: active
date: 2026-11-19
origin: docs/design/field-diagnosis/BRIEF.md
---

# Field diagnosis: production build plan

**Target repo:** ConfigHub UI, branch `field-diagnosis` (base `origin/main` v0.11.10).
**Inputs:** `docs/design/field-diagnosis/BRIEF.md` (goal, jobs, states), `docs/design/field-diagnosis/ARCHITECTURE.md` (approach B, cache, §13 decisions), the spike commits marked `SPIKE` (last: `951538b`), `docs/design/field-diagnosis/final/design-handoff.md` (the visual contract), `docs/dev/components.md`, `docs/dev/links.md`.

---

## Overview

The spike shows field details and a merged row hover card in the Component side pane. The owner approved how it runs now. This plan turns it into production code in seven slices (S0–S6). Each slice can ship alone and has its own tests.

The production code:

- replaces `InspectPanel` with the new details (no `fd` flag),
- replaces the old row hover card with the merged card,
- keeps the navigation state in the Component view URL (`unit`, `field`, `fres`, `tab`, `gate`),
- makes every reference a real `<a href>`,
- reads data only as ARCHITECTURE §6–§7 says (whole-unit blame for the open unit, path API for the details, nothing new on hover).

---

## Problem frame

A user must see why a field has its value, who set it, and what a change does (BRIEF §1–§2). The spike proves the UI and the navigation. But the spike:

- runs behind sticky `?fd=1` / `fdstate` / `fdview` / `fdbare` flags and a dev state switch,
- calls `navigate()` from deep components, which breaks the rule "`AppsComponentLayout` is the only component that touches `useSearchParams`" (`components.md`, "The URL is the sole source of truth"),
- uses a module-level focus store, DOM queries by test id, and two `useGetSpaceQuery` calls per link to find "in view",
- finds gates on a field with a text heuristic and reads the unit on every hover,
- has inert buttons (Apply, Dismiss, Remove, Edit, Discard, Restore),
- imports from `pages/*` inside `src/components/field-diagnosis/`, against ARCHITECTURE §4,
- has fixture-only data for Variants and prose in "Used by".

---

## Requirements trace

Owner-approved behaviour (from the spike as it runs now):

- R1. The details open in the Component side pane where `InspectPanel` was. Order: value (hero) → set-by row (user · time · reason) → chain strip (Space → Space → this Unit) only when the value came from upstream → "needs you" lines only when something waits or blocks, with one primary action (`Upstream wants 7 · held by Override` [Apply] [Dismiss ▾]) → guard rows (`Override · edits ✓ merges ✗` [Remove]) → on-demand links `Variants · History · Used by`.
- R2. No prose. Short tokens, at most one chip style, one contained button, no headers for small sections, meanings in tooltips.
- R3. Row hover shows ONE card: the existing "Edit this value" card, extended with the set-by row, at most one attention line (linked tokens), a guard line only when the keep/let-merges action does not already say it, and a "Details" link. The unit-level "Functions: …" line is removed.
- R4. Every reference is a real `<a href>`:
  - Units, Spaces, chain hops: in-view jump when the target is in the Component, else `unitConfigHref`.
  - Triggers and gates: the Gates tab with that gate open, else `/validation/:triggerId`.
  - Links (needs/provides): the provider unit's field, in view.
  - Revisions: `unitRevisionHref`. Change orders: `changeOrderPath`.
  - "Upstream wants 7": the upstream unit's field and its revision.
  - Users: plain text with a peek.
  - Reference peeks (unit, trigger, revision, link, guard) use the app's HoverCard / InfoPeek.
- R5. Navigation state is in the Component view URL: `unit`, `field`, `fres` (and `tab=gates` + `gate`). A jump PUSHES. Opening or closing the details REPLACES. On every URL change the pane selects the Space, expands the unit and its folders down to the field, scrolls the row below the sticky unit header, and opens the details. A Space change by graph click or picker clears `unit`/`field`/`fres`. Back/Forward restore the scroll and the hand-expanded units per history entry (sessionStorage, keyed by the router key). A unit card that a jump opened closes on Back.
- R6. Data: whole-unit blame for the open unit; each `BlameField` maps to its tree key with `resolveConflictPath`. The details use `useGetUnitPathQuery` by `Ref`. The row card reads only the cached blame.

Team-lead decisions for production:

- D1. No `fd` flag. The new details replace `InspectPanel`; the merged card replaces the old hover card. Delete `InspectPanel.tsx`, its `useRevisionDataMap` history, the `siblingVariants` plumbing, and all spike-only code (fixtures, dev state switch, `fd`/`fdstate`/`fdview`/`fdbare`). Move useful fixtures into `tests/`.
- D2. `unit`, `field`, `fres` (and `tab`, `gate`) are permanent, documented params in `ViewParamsPatch` (`appTypes.ts`).
- D3. Gates on a field come only from exact per-path data (`BlameField.Validation`, which the server builds from `FailedAttributes`). The text heuristic goes. Unit-level failing gates show as one quiet details line, `Unit gates: N failing`, linked to the Gates tab. They are not in the row card. So hover does not read the unit.
- D4. The revision of a withheld change comes from the unit's `UpstreamRevisionNum`, because `MutationConflict` has no revision. A code comment says so.
- D5. Update `docs/dev/links.md` rule 3 for side-pane field-diagnosis links: in place, Back works, cmd-click opens a new tab.
- D6. Do not refactor `BlamePathDrawer` or the Blame tab. Only share the cache key (ARCHITECTURE §7.1 canonical args, incl. `BlameTable`'s `includeComments || undefined`).
- D7. Respect ARCHITECTURE caching: no whole-unit blame for heavy units (`unitSizeGuard.ts`); use the path API for them. Add the validation freshness refetch if simple; else a follow-up.
- D8. Repo patterns, full types, no `console.log`.

**Origin states (BRIEF §6) used as the test matrix — "the 6 states" of the spike:** `s1-plain`, `s2-inherited` (3 hops), `s5-override` (Override + withheld change), `s6-requirement` (requirement guard + failing gate), `s8-pending` (unsaved edit over s2), `s12-many` (several needs at once). Edge states added: absent, deleted, resource row, loading, error, heavy unit, array path, unkeyed array element.

**Tester checks (from the spike rounds):** T1 jumps prod → staging → base → Back → Back → Forward; T2 reload on deep URLs; T3 hrefs; T4 hand-opened unit cards kept; T5 jump-opened unit cards closed on Back; T6 scroll restore; T7 graph click clears the params.

---

## Scope boundaries

- Only the Component side pane. The unit Config tab, Blame table, diff views and change sets come later (BRIEF §1). The pure model and the views must still not depend on the pane.
- No refactor of `BlamePathDrawer`, `BlameTable` row logic, `gateBlameApi.ts`, `chunkedQueriesApi.ts` (D6, ARCHITECTURE §4).
- No hover-intent prefetch of `/path` from the row card (R6: the card reads cached blame only). ARCHITECTURE §7.3 is not built now.
- No wide-drawer layout. The narrow pane is the only host now.
- No change to the staging model (`components.md` rules 8–10), the pill-group hover CSS (rule 15), or generated RTK mutations and tags.
- No server change.

### Deferred to follow-up work

- Per-unit cache tags: not needed (ARCHITECTURE §7.5).
- `BLAME_FOLLOW_UPSTREAM` cost measurement on a real large unit (ARCHITECTURE Q2): before the first release, outside this branch's code.
- Validation freshness refetch, if S1 shows it is not simple (see U1).
- Field diagnosis in the Blame tab (thin `Drawer` around `<FieldDetails>`): a later plan.

---

## Context and research

### Spike code (reference only; read it with `git show 951538b:<path>`)

| Spike file | Fate |
|---|---|
| `src/components/field-diagnosis/fieldViewModel.ts` | **Rewrite** as `explainField.ts` + `fieldDiagnosis.types.ts`. Keep the `FieldView` shape (it is what the approved UI draws). Throw away `SPIKE_STATES` imports, `spikeStateLabel`, the `Variants` fixture field, the `as unknown as` casts, the local `ago()` and `reasonOf()` regex. |
| `src/components/field-diagnosis/useFieldDiagnosis.ts` | **Rewrite**. `blameIndex` (WeakMap by blame object + yaml) moves to the pane glue (it needs `resolveConflictPath`). Path args go through `pathArg()`. |
| `FieldDetails.tsx`, `FieldPeek.tsx` (`ToneIcon`, `WhoLine`) | **Keep layout, rewrite wiring.** Keep the order, spacing and tokens. Replace the `links` render-prop bag with a typed `FieldRefLink` + resolver context. Wire the inert buttons. `FieldPeek` (the separate peek) is **thrown away**: R3 merges it into the row card. |
| `SpikePeekRows.tsx` | **Rewrite** as `FieldRowCardRows.tsx` in the pane glue. Keep the row style (the card's tokens), the "guard line only when keep/let does not say it" rule, the one-attention-line rule. Throw away `splitDescription` (use `authoredDescription`) and `useUnitGates` on hover. |
| `spikeFocus.ts` | **Rewrite.** The param names and `fres` encoding (`Type|Name`) stay. `useSpikeGo` / `navigate()` and the module-level focus store go. URL writes go through `AppsComponentLayout.updateParams`. |
| `spikeScroll.ts` | **Rewrite** as `paneHistoryMemory.ts` (pure, LRU-capped, storage-safe) + a hook. Throw away the DOM search for the scroller by test id (use a ref). |
| `spikeReveal.ts` | **Rewrite** with a row ref and `scroll-margin-top` equal to the measured sticky header. Throw away `elementsFromPoint`. |
| `spikeLinks.tsx` | **Rewrite** as `FieldRefLink.tsx` (views) + `componentFieldLinks.ts` (pane resolver). Keep the href choices and the conflict-source rule. Throw away `useInView` (two space queries) and the custom `PeekCard`. |
| `spikeGates.tsx` | **Throw away** `useUnitGates` and `gateNeedsFor` (text heuristic, D3). Keep only the idea of the gate link (now from `BlameValidation.TriggerID`). |
| `FieldDiagnosisSpike.tsx`, `spikeFlag.ts`, `spikeFixtures.ts` | **Delete.** The six fixture states move to `tests/fixtures/field-diagnosis/states.ts` (typed as `UnitPathReport`). |
| SPIKE edits in `ComponentValuesSection.tsx`, `ComponentSidePane.tsx`, `AppsComponentLayout.tsx`, `GatesPane.tsx` | **Remove in S0, re-add as production code in S2–S5.** |

### Existing code to reuse

- URL: `src/pages/x/apps/appTypes.ts` (`ViewParamsPatch`, `applyViewParamsPatch`, `selectComponentHref` as the href pattern), `AppsComponentLayout.tsx` (`updateParams(patch, { push })`), `src/utility/live-search-params.ts`.
- Tab focus: `ComponentSidePane` already has `tabFocus` (`{ id, tab, nonce }`) and `initialTab` from `?tab=gates`. Use them for `tab=gates`; do not add a new tab effect.
- Tree: `resolveConflictPath` (`configDiffFieldDiffs.ts`), `stageKeyPath`, `prefixIndex.shouldAutoExpand` in `NodeRow`, `forcedExpandedGroups` / `collapsedGroups` in `ComponentSidePane`, `materializedUnitIds` + `isHeavyUnitData` (`unitSizeGuard.ts`).
- Identity paths for array rows: `src/pages/x/apps/compare/identityPaths.ts` (`indexUnitByIdentity`, `resolveIdentityPath`).
- Guards and writes: `src/utility/override-guard.ts`, `src/utility/clearance-functions.ts`, `src/components/guarded-write/useGuardedWrite.tsx`, `GuardedChangesDialog`, request builders in `src/pages/unit-detail/components/blame/blameFields.ts` (`guardSetRequest`, `conflictSelectors`, `setValueRequest`, `blameActionApplies`).
- Hrefs: `unitConfigHref`, `unitRevisionHref`, `unitLinksHref` (`src/pages/unit-detail/unitDetailHrefs.ts`), `changeOrderPath` (`src/pages/change-orders/changeOrderAddress.ts`).
- Peeks: `src/components/info-peek/InfoPeek.tsx` (`InfoPeekCard`, `InfoPeekTooltip`, `INFO_PEEK_TOOLTIP_SX`), `src/components/hover-card/HoverCard.tsx`.
- Text: `authoredDescription` (`src/pages/change-orders/draft/draftChangeCards.ts`), `formatRelative` (`src/utility/date-format.ts`).
- Errors: `describeQueryError` / `getApiErrorMessage` (`src/utility/error-functions.ts`). The repo has no logger module. Errors go to the UI through these helpers. No `console.*` in new code; storage failures are caught and ignored with a comment (as `useGridPersistence` does).
- Chunked search for Variants: `fetchChunks` + `BY_ID_CHUNK_SIZE` (`chunkedQueriesApi.ts`), pattern `searchGuardedFieldsChunked` (ARCHITECTURE §7.7).

### Test setup (verified)

- Pure specs: `tests/*.pure.spec.ts`, `test`/`expect` from `@playwright/test`, no `page`. Run without a server through `playwright.pure.config.ts`. Example: `tests/blame-fields.pure.spec.ts`.
- Browser specs: a **real ConfigHub server**. `playwright.config.ts` has `globalSetup: ./global.setup.ts`, which signs in (`TEST_USER`/`TEST_PASSWORD`, or `cub auth browser-session`) against `TEST_BASE_URL` and writes `authentication.json`. Specs seed their own data through `hubApi` (`tests/fixtures/test.ts`) or `ApiHelper` (`tests/fixtures/api-helper.ts`) and delete it in `afterAll`. `page.route` is used only to count or stub single requests (e.g. `tests/change-order-history.spec.ts`). Follow this: seed real Spaces/units, and use `page.route` only to count `/blame`, `/path` and unit GETs.
- Seeding patterns to copy: upstream unit + Override-style guard + guarded conflict in `tests/blame-apply-guarded-conflict.spec.ts` (the `settled()` poll on `awaiting/triggers`); Component + Space in `tests/component-deeplink.spec.ts`; Trigger with a validating function in `tests/gate-details.spec.ts`.
- Real path reports for fixtures: `docs/design/field-diagnosis/spike/real/*.json`.

### Lint and types

- `package.json` has `lint` (`eslint .`) and `build` (`tsc -b && vite build`). There is no `typecheck` script; run `npx tsc -b`.

---

## Key technical decisions

1. **S0 removes the spike from `src/` first.** One commit restores `src/` to `origin/main` (the spike stays in history at `951538b` and in this folder's docs). Then each slice adds production code. Reason: no half-flagged state, the PR diff against `main` shows only production code, and every slice ships on a clean base.
2. **Two layers, no `pages/*` import in `src/components/field-diagnosis/`** (ARCHITECTURE §4).
   - `src/components/field-diagnosis/`: types, pure `explainField`, adapters, cache args, the views, `FieldRefLink`, the link-resolver and actions *interfaces*.
   - `src/pages/x/apps/field-diagnosis/`: the Component pane glue — blame index (needs `resolveConflictPath`), URL focus, history memory, reveal, the link resolver (needs `unitConfigHref` etc.), the actions (need `blameFields.ts` builders), the row card rows.
   This keeps the views reusable for the Blame tab later.
3. **Keep the spike's `FieldView` shape, not ARCHITECTURE §5's `FieldDiagnosis`.** The no-prose decision (R2) removed `hints`/`Sentence`/`needsDetails` prose. `FieldView` holds tokens and tooltip meanings. ARCHITECTURE §8 rules stay the source for *what* each token means. Add `state` (`loading|error|ready|absent|deleted|resource`) and `stale` from §5.
4. **One URL writer.** `AppsComponentLayout` derives `focus = { unit, field, fres, tab, gate, key }` from `useSearchParams` + `useLocation().key` and gives it down with `go(patch, { push })` and `hrefFor(patch)` through a `ComponentFocusContext`. No other component calls `navigate` or `useSearchParams` (components.md). Jumps call `updateParams(patch, { push: true })`; open/close call it with replace.
5. **Space change clears the focus inside the same write.** `updateParams` drops `unit`/`field`/`fres`/`gate` (and `tab=gates`) when `patch.space` differs from the live `space` AND the patch does not set `unit` itself. A jump sets `space` and `unit` together, so it keeps them. One atomic write (components.md: two writes do not compose).
6. **One per-entry memory covers T4, T5 and T6.** For each router key, save `{ scrollTop, forced[], collapsed[] }` in sessionStorage (LRU cap 50 entries). On POP, restore it after the node-switch reset. A unit that a jump opened is not in the previous entry's saved state, so Back closes it (T5); a hand-opened unit is in it, so it stays (T4). This replaces the spike's separate jump stack (`fdJumps`), which was lost on reload. A deep URL with no saved entry opens the URL's unit only (T2).
7. **Folder expansion uses a per-pane store, not a module global.** `ComponentValuesSection` creates one small focus store (stable reference in context); each `NodeRow` subscribes with `useSyncExternalStore` and a selector that returns one boolean ("the focus path is under me"). Only the rows on the path re-render.
8. **"In view" = the Space is one of the Component's deployments.** The pane already has the deployment list; it puts the Space-id set into the link-resolver context. No `getSpace` calls.
9. **Gate token links use `BlameValidation.TriggerID`** (schema has it). In view: `tab=gates&gate=<triggerId>` (push). Else `/validation/:triggerId`. No unit read for gates on hover (D3).
10. **Withheld change revision = `Unit.UpstreamRevisionNum`** when the conflict's `UnitID` is the unit's `UpstreamUnitID`; else no revision link. Code comment cites D4. The unit is read in the details only (it is usually cached by the pane).
11. **Cache keys (ARCHITECTURE §7.1, Q1b).** `blameArg(s,u) = {spaceId, unitId}`; `pathArg(addr, {history})` sets `history: history || undefined`, `resource: name || undefined`. `BlameTable` sends `includeComments: includeComments || undefined`. `BlamePathDrawer` is not changed (D6).
12. **History is on demand.** The details first read `pathArg(…)` without history. The History link reads the same arg with `history: true`. (The spike always sent `history: true`, the most expensive read.)
13. **Heavy units.** `useUnitBlameIndex` skips whole-unit blame when `isHeavyUnitData(unit.data)`. A materialized heavy unit still draws rows; its details call `/path` with the merge-key path from `positionalToMergeKeyPath` (ARCHITECTURE §13 Q1 fallback 2). An unkeyed array element shows the value only and no history (§13 Q1 fallback 3). Its row card shows no set-by row (no cached blame) and keeps the Details link.
14. **Actions.** Override `Remove` and "Keep on merge" stay the existing *staged* toggle (`onToggleProtection`), so the pane's commit rules hold. `Edit` opens the row's inline editor (staged, rule 8). `Discard` removes that row's staged edit. `Restore` (History) stages the old value as an edit. `Apply`/`Dismiss` of a withheld change and `Remove` of a non-Override guard write now through `useGuardedWrite` + `GuardedChangesDialog`, as the Blame tab does. See owner question Q3.
15. **Variants** use ARCHITECTURE §7.7: `SearchUnitBlame` with `UnitID IN (...)` of the same-slug units in the Component, chunked, `upstream: false`, matched by `Ref`, loaded only when the user opens Variants. Injected in `fieldDiagnosisApi.ts`.
16. **Used by** shows `Field.Provided[]` as Link tokens (each a Link ref), or `—`. No prose. Downstream units are not in the data (BRIEF §3).

---

## Open questions

### Resolved during planning

- Do Playwright specs use mocks? No. They use a real server and seed data; `page.route` only counts or stubs single calls.
- Does a gate need a unit read for its trigger id? No. `BlameValidation.TriggerID` exists.
- Does the server accept positional paths? No (ARCHITECTURE §13 Q1). Use blame `Ref` or the translator.
- Does `false` share the RTK key with `undefined`? No (§13 Q1b). Normalize to `undefined`.

### Deferred to implementation

- The exact sticky-header measurement for `scroll-margin-top` (one ref on the unit card header is expected).
- Whether `formatRelative` (dayjs `fromNow`) gives the approved short tokens (`7m ago`, `3d ago`). If not, keep a small pure `shortAgo()` in the module, with tests.
- Whether the pane's polled unit carries `HeadRevisionNum` + validation keys for the freshness stamp (D7). If yes, add `useUnitBlameFreshness` in U1. If no, list it as a follow-up.
- Which validating function returns `FailedAttributes` for a path in the E2E seed (state 6). `vet-celexpr` returns Details only, so it gives no per-path gate. If no function fits, the E2E covers only `Unit gates: 1 failing`, and the per-path gate line is covered by the pure spec with the `s6` fixture.
- Whether staged edits survive an in-view jump to another Space and Back (checked by a test in U3).

### Owner questions (only the owner can answer)

- **Q1.** `InspectPanel` showed the incoming upgrade value (source, revision) and the "differs from upstream" variation entry. The approved spike does not. Drop them (the row's upgrade pill and checkbox already show the incoming value), or add one needs line, e.g. `Upstream has 9 · rev 14`?
- **Q2.** A link that leaves the page (unit page, `/validation`, revision, ChangeOrder) while the pane holds staged edits: same tab (new rule 3, the staged edits are lost) or a new tab only in that case?
- **Q3.** Apply / Dismiss of a withheld change and Remove of a requirement guard: write now with the guard confirmation (as the Blame tab does — the plan's default), or stage them with the pane's next commit (as Keep on merge is)?

---

## High-level technical design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Module map

```
src/components/field-diagnosis/            (no pages/* imports)
  fieldDiagnosis.types.ts   FieldView, FieldNeed, FieldGuard, ChainHop, FieldRef, FieldFacts
  fieldArgs.ts              blameArg(), pathArg(), fieldFocusKey()
  adapters.ts               factsFromBlame(field), factsFromPath(report)
  explainField.ts           explainField(facts, ctx) -> FieldView   (pure, total)
  positionalPath.ts         positionalToMergeKeyPath(doc, path)     (pure)
  fieldDiagnosisApi.ts      injectEndpoints: searchFieldVariants (chunked)
  fieldLinks.ts             FieldRef union, FieldLinkResolver, FieldActions interfaces + contexts
  FieldRefLink.tsx          <a href> + InfoPeek for any FieldRef
  FieldDetails.tsx          hero, set-by, chain, needs, guards, unit-gates line, more
  FieldSetByLine.tsx  FieldNeeds.tsx  FieldGuards.tsx  FieldMore.tsx  ToneIcon.tsx

src/pages/x/apps/field-diagnosis/          (Component pane glue)
  componentFocus.ts         parse/write focus params, focusPatch(), fres codec (pure)
  ComponentFocusContext.tsx provider in AppsComponentLayout: focus, go, hrefFor
  paneHistoryMemory.ts      per-router-key {scrollTop, forced, collapsed}, LRU (pure + storage)
  usePaneHistoryMemory.ts   save on change / restore on POP
  useUnitBlameIndex.ts      whole-unit blame (size gate) -> Map<stageKey, BlameField>
  useFieldFocusStore.ts     per-pane focus path store for folder expansion
  useFieldReveal.ts         scroll row below sticky header
  componentFieldLinks.ts    FieldLinkResolver for the pane (in view? jump : href)
  useFieldActions.ts        FieldActions for the pane (staged toggles, guarded writes)
  ComponentFieldDetails.tsx mounts FieldDetails with data + resolver + actions
  FieldRowCardRows.tsx      the merged hover card's extra rows
```

### URL state per gesture

| Gesture | Patch | History |
|---|---|---|
| Open details (row click, card "Details") | `unit, field, fres` | replace |
| Close details | `field: null, fres: null` | replace |
| Jump to a field in another unit/Space (chain hop, upstream, Link provider) | `space, unit, field, fres, tab: null, gate: null` | push |
| Gate token in view | `tab: gates, gate: <triggerId>, field: null, fres: null` | push |
| Graph node click / Space picker | `space` → layout also clears `unit, field, fres, gate, tab` | replace (as today) |
| Back / Forward | — | POP: pane reacts to focus; memory restores scroll + cards |

```mermaid
sequenceDiagram
  participant Link as FieldRefLink
  participant Ctx as ComponentFocusContext
  participant Layout as AppsComponentLayout.updateParams
  participant Pane as ComponentSidePane
  participant Sec as ComponentValuesSection
  Link->>Ctx: plain click: go(patch, push)
  Ctx->>Layout: one setSearchParams(prev => next, {replace:false})
  Layout-->>Pane: focus (from URL) + location.key
  Pane->>Pane: select Space; force-expand focus.unit; restore memory on POP
  Pane-->>Sec: focus
  Sec->>Sec: resolveConflictPath(field,fres) -> stageKey; set inspect; focus store -> folders open
  Sec->>Sec: useFieldReveal(row) after paint
```

---

## Implementation units

Size key: XS ≤ 0.5 day, S ≈ 1 day, M ≈ 2 days, L ≈ 3–4 days.

### Verification commands (all slices)

- Types: `npx tsc -b`
- Lint: `npm run lint` (must add no new warning in touched files)
- Pure specs, no server: `npx playwright test -c playwright.pure.config.ts tests/field-`
- Browser specs, real server: `TEST_BASE_URL=<your own UI dev server> npx playwright test <specs>` (needs `.env` with `TEST_USER`/`TEST_PASSWORD`, or a `cub` context; `global.setup.ts` signs in). Each agent uses its own dev server port; never 5173, 5174, 3001 or 3050.
- Visual: screenshots in the spec of each visual slice, then the `design-verify` skill against `docs/design/field-diagnosis/final/design-handoff.md`.

---

- [ ] U0. **Remove the spike from `src/`** — size XS

**Goal:** Start from `main` behaviour on this branch, with the design docs kept.

**Requirements:** D1.

**Dependencies:** None.

**Files:**
- Delete: `src/components/field-diagnosis/` (all 13 spike files)
- Restore to `origin/main`: `src/pages/x/apps/ComponentValuesSection.tsx`, `ComponentSidePane.tsx`, `AppsComponentLayout.tsx`, `gates/GatesPane.tsx`
- Keep: everything under `docs/design/field-diagnosis/`

**Approach:** One commit, message names `951538b` as the spike reference. `git diff origin/main -- src` must be empty after it.

**Test expectation:** none — returns `src/` to `main`.

**Verification:** `npx tsc -b`, `npm run lint`, and `tests/component-deeplink.spec.ts` pass as on `main`.

**Definition of done:** No `SPIKE` or `fieldDiagnosisSpikeOn` string in `src/`.

---

- [ ] U1. **View model, data layer, pure tests** — size M

**Goal:** All logic that does not draw: types, cache args, adapters, `explainField`, the blame index, the path translator, the shared cache key.

**Requirements:** R2 (tokens + meanings), R6, D3, D4 (types side), D6, D7, D8.

**Dependencies:** U0.

**Files:**
- Create: `src/components/field-diagnosis/fieldDiagnosis.types.ts`, `fieldArgs.ts`, `adapters.ts`, `explainField.ts`, `positionalPath.ts`
- Create: `src/pages/x/apps/field-diagnosis/useUnitBlameIndex.ts` (hook + an exported pure `buildBlameIndex(fields, treeData)`)
- Modify: `src/pages/unit-detail/components/blame/BlameTable.tsx` (`includeComments: includeComments || undefined` only)
- Optional (if the deferred check passes): `src/pages/x/apps/field-diagnosis/useUnitBlameFreshness.ts`
- Create: `tests/fixtures/field-diagnosis/states.ts` (the six spike states, typed as `UnitPathReport`; the `s6` gate given a `TriggerID`; the `Variants` field removed), `tests/fixtures/field-diagnosis/blame.ts` (matching `BlameField`s with `Chain`)
- Test: `tests/field-explain.pure.spec.ts`, `tests/field-adapters.pure.spec.ts`, `tests/field-blame-index.pure.spec.ts`, `tests/field-args.pure.spec.ts`, `tests/field-positional-path.pure.spec.ts`

**Spike code:** keep the `FieldView` / `FieldNeed` / `FieldGuard` / `ChainHop` shapes and the rules in `viewFromReport` (needs order block → wait → warn; chain only when the origin is in another unit; Link resolve hop vs upgrade hop; guard `edits/merges` marks). Rewrite: typed input (`FieldFacts`) instead of `ReportLike` casts; `reasonOf` → `authoredDescription` (move it to `src/utility/` with a re-export, since components must not import pages); `person()` keeps "automation" for no user. Throw away: `fieldView(id)`, `spikeStateLabel`, `SPIKE_STATE_IDS`, gate text from `gateNeedsFor`, any `Variants` input.

**Approach:**
- `explainField` adds `state`, `stale`, `unitGates?: { failing: number }` (input from the details' unit read, not from blame), and `needs` only from `Validation` (non-warning = block, warning = warn), `Findings` (block), `Conflicts` (wait). Each need carries a `FieldRef` list for its tokens (unit, revision, trigger, link) so views never build hrefs.
- `buildBlameIndex` keys by `resolveConflictPath({Resource, Path}, treeData)`; cached in a `WeakMap` keyed by the blame `Fields` array, then by the tree data string.
- `useUnitBlameIndex({ spaceId, unitId, data, open })`: subscribes `getUnitBlame(blameArg)` only when the unit card is open and `!isHeavyUnitData(data)` (ARCHITECTURE Q4: only the open unit).

**Execution note:** test-first. Write the five pure specs from the fixtures, then the code.

**Test scenarios:**
- `field-explain.pure.spec.ts` — one case per state:
  - s1-plain → value `7`, set-by `admin · <ago> · reason`, no chain, no needs, no guards.
  - s2-inherited → chain `fd-base → fd-staging → this Unit` (3 hops, oldest first), set-by names the base user.
  - s5-override → one `wait` need `Upstream wants 7 · held by Override`; guard `Override edits ✓ merges ✗`; need carries a source unit ref.
  - s6-requirement → guard `RunAsRoot edits ✗ merges ✗`; one `block` need from `Validation` with `TriggerID`; with `unitGates.failing = 2` the view has the unit-gates token.
  - s8-pending → `pending` set, rest equal to s2.
  - s12-many → needs sorted block, wait, warn; warnings never primary.
  - Edge: absent → `state: absent`, no actions; deleted → `state: deleted`; resource row (empty `Path`) → `state: resource`; `ctx.loading` → `loading`; `ctx.error` → `error` (error wins over loading).
  - Edge: a Validation entry with no `Issues` and no `Path` still makes one need; a Description that is only `Functions: …` gives no reason token.
  - Edge: no `When` → time token `—`.
- `field-adapters.pure.spec.ts` — parity: the same field from `factsFromBlame` and `factsFromPath` gives the same value, set-by, chain, needs, guards (history and review only from path).
- `field-blame-index.pure.spec.ts` — scalar path maps 1:1; `containers.?name=web.image` maps to `containers.0.image`; two documents with the same path map by resource; a pattern path maps to nothing; the same input object returns the same Map (cache hit).
- `field-args.pure.spec.ts` — `pathArg` with `history: false` and `undefined` serialize equal with RTK's `defaultSerializeQueryArgs`; `ref` beats `path`; `blameArg` has exactly two keys; `BlameTable`'s arg with `includeComments: false` serializes equal to `blameArg`.
- `field-positional-path.pure.spec.ts` — `containers.0.image` with a named element → `containers.?name=api.image`; nested arrays; an unkeyed element → `undefined`; a path with no array segment is unchanged. Use the examples from ARCHITECTURE §13 Q1.

**Verification:** types, lint, pure specs green; `tests/blame-fields.pure.spec.ts` and `tests/blame-*.spec.ts` still green (BlameTable key change).

**Definition of done:** No React in `explainField.ts`/`adapters.ts`/`fieldArgs.ts`/`positionalPath.ts`; no `any`, no `as unknown as`; no `pages/*` import under `src/components/field-diagnosis/`.

---

- [ ] U2. **Details replace `InspectPanel`** — size L (two commits: 2a read-only + Edit/Keep/Discard/History; 2b needs actions, guard Remove, Variants, Used by)

**Goal:** A click on a field path or value opens the new details in place of `InspectPanel`. All buttons work. `InspectPanel` is gone.

**Requirements:** R1, R2, R6, D1, D3, D4, D7, Q1–Q3 defaults.

**Dependencies:** U1.

**Files:**
- Create: `src/components/field-diagnosis/FieldDetails.tsx`, `FieldSetByLine.tsx`, `FieldNeeds.tsx`, `FieldGuards.tsx`, `FieldMore.tsx`, `ToneIcon.tsx`, `fieldLinks.ts` (interfaces + contexts; a plain-text fallback resolver), `fieldDiagnosisApi.ts` (Variants search)
- Create: `src/pages/x/apps/field-diagnosis/ComponentFieldDetails.tsx`, `useFieldActions.ts`
- Modify: `src/pages/x/apps/ComponentValuesSection.tsx` — mount `ComponentFieldDetails` where `InspectPanel` was; value click opens details (rewrite of the spike's `onClickCapture`: skip inputs, buttons, checkboxes and the pill group); remove `siblingVariants`, the `InspectPanel` import and its upgrade/variation/protect props
- Delete: `src/pages/x/apps/InspectPanel.tsx` (the `useRevisionDataMap` hook stays; other files use it)
- Modify: comment mentions of `InspectPanel` in `componentValues.ts`, `configParser.ts`, `ReleaseDiffPanel.tsx`
- Test: `tests/field-details-view.pure.spec.ts` (the action-availability rules as a pure function), `tests/component-field-details.spec.ts`, `tests/fixtures/field-diagnosis/seed.ts` (shared E2E seed, used by U3–U5 too)

**Spike code:** keep `FieldDetails` layout, sizes, `long` value rule, `Mark`, `Dot`, the more-links toggle. Rewrite: buttons get handlers from `FieldActions`; references render through `FieldRefLink` with the plain-text resolver (real links come in U4); the History list reads `history: true` on demand; Variants from `searchFieldVariants`; Used by from `Field.Provided`. Throw away: the prose "No Link reads this field…", the `links` render-prop bag, `NeedAction`'s `link.props` spread.

**Approach:**
- `ComponentFieldDetails` reads: row's `BlameField` from `useUnitBlameIndex` (for `Ref`), then `useGetUnitPathQuery(pathArg)`; heavy or no blame → `pathArg` with `positionalToMergeKeyPath`; unkeyed element → value only. It reads the unit (`useGetUnitQuery`, usually cached) for `UpstreamRevisionNum` (D4) and the failing-gate count (D3 line).
- Loading: skeleton in the hero's place. Error: one token line from `describeQueryError`. Stale: dim, never blank.
- `useFieldActions`: see decision 14. Each write shows `GuardedChangesDialog` when guards need confirmation. Success → RTK invalidation (already `Unit`) refreshes blame and path.
- Width: the pane's 280–360 px; long values wrap (`wordBreak: break-all`).

**Execution note:** test-first for the pure availability rules; write the E2E spec with the seed before wiring the pane.

**Test scenarios:**
- `field-details-view.pure.spec.ts`: absent or deleted → Edit, Apply, Restore disabled with a tooltip token; resource row → no Edit; Restore hidden for the current value; first need's action is the only contained button (R2).
- `component-field-details.spec.ts` (seed: Component with Spaces `base`, `staging`, `prod`; unit `web` in each, prod ← staging ← base; base `spec.replicas` set by a person with a reason; prod Override guard + base change 7 withheld; prod requirement guard `RunAsRoot=LegacyImage` + a failing gate):
  - Happy: click `spec.replicas` value in prod → `fd-details` shows value hero, set-by, chain `base → staging → this Unit`, needs line `Upstream wants 7 · held by Override`, guard row; no element with id or text of the old `InspectPanel`.
  - Happy: Apply → guarded write → needs line goes, value becomes 7. Dismiss → line goes, value stays.
  - Happy: Override Remove → row shows the staged keep-on-merge change (same as the kebab item); commit writes the guard change.
  - Happy: Edit → inline editor opens on the row; Discard on a pending edit clears it (s8).
  - Happy: History → one `/path?…history=true` request; list shows values; Restore stages the old value.
  - Happy: Variants → one chunked search; prod/staging/base values listed, current one marked.
  - Edge: unit gates line `Unit gates: N failing` shows when the unit has failing gates that name no path.
  - Edge: a materialized heavy unit → no `/blame` request for it; details still open through `/path`.
  - Integration: opening details sends exactly one `/path` request (count with `page.route`); closing and reopening sends none (cache).
  - Visual: screenshots of the six states in the narrow pane.
- Regression: `tests/component-staging-narrow.spec.ts`, `component-guarded-upgrade.spec.ts`, `component-lock-interaction.spec.ts`, `component-upgrade-config-diff.spec.ts`, `component-variation-config-diff.spec.ts` stay green (they touch rows near the old panel).

**Verification:** types, lint, pure, the specs above; `design-verify` on the details states.

**Definition of done:** `InspectPanel.tsx` deleted; `rg InspectPanel src` finds nothing; no inert button; screenshots match the handoff contract.

---

- [ ] U3. **URL state, navigation and Back** — size L

**Goal:** The details and unit cards follow the URL. Jumps push, open/close replace, Back/Forward restore everything.

**Requirements:** R5, D2.

**Dependencies:** U2.

**Files:**
- Modify: `src/pages/x/apps/appTypes.ts` — add documented `unit`, `field`, `fres`, `tab` (`'gates' | null`), `gate` to `ViewParamsPatch`
- Modify: `src/pages/x/apps/AppsComponentLayout.tsx` — derive focus; provide `ComponentFocusContext`; `updateParams` clears focus params on a Space change (decision 5)
- Create: `src/pages/x/apps/field-diagnosis/componentFocus.ts`, `ComponentFocusContext.tsx`, `paneHistoryMemory.ts`, `usePaneHistoryMemory.ts`, `useFieldFocusStore.ts`, `useFieldReveal.ts`
- Modify: `src/pages/x/apps/ComponentSidePane.tsx` — on focus change: force-expand `focus.unit`; on POP: restore memory after the node-switch reset; `tab=gates` drives the existing `tabFocus`
- Modify: `src/pages/x/apps/ComponentValuesSection.tsx` — focus → `resolveConflictPath` → inspect path + focus store; `NodeRow` subscribes for folder expansion; open/close write `unit/field/fres` (replace)
- Modify: `src/pages/x/apps/gates/GatesPane.tsx` — open the gate from `focus.gate` (`e:<triggerId>` key)
- Test: `tests/field-focus-url.pure.spec.ts`, `tests/field-history-memory.pure.spec.ts`, `tests/component-field-navigation.spec.ts`

**Spike code:** keep the param names, the `fres` codec (`Type|Name`, empty parts allowed), the order "restore after the node-switch reset", "with a field in the URL the reveal wins over the saved scroll", and the gates-tab return on Back. Rewrite: `useSpikeFocus`/`useSpikeGo` → context from the layout; `setSpikeFocusPath` module global → per-pane store; `fdJumps` stack → per-entry memory (decision 6); storage → LRU + try/catch. Throw away: `fieldDiagnosisSpikeOn()` checks, `window.location` reads in render, the DOM search for the scroller.

**Approach:**
- `componentFocus.ts` (pure): `readFocus(params)`, `focusPatch(target)`, `componentFocusHref(search, patch)` (built like `selectComponentHref`), `spaceChangeClears(live, patch)`.
- Pane order on a URL change: (1) layout selects `space` (as today), (2) side pane force-expands `unit`, (3) values section resolves the field and opens the details, (4) folder store opens ancestors, (5) `useFieldReveal` scrolls after the row exists (`requestAnimationFrame` retry, max ~30 frames, as the spike).
- `docs/dev/components.md` "URL is the sole source of truth": add that diagnosis jumps are the second deliberate push (with opening a Component).

**Execution note:** test-first for both pure specs; then the E2E spec, red, then wire.

**Test scenarios:**
- `field-focus-url.pure.spec.ts`: `fres` round-trip with `|` in neither, one, both parts; Space change without `unit` clears `unit/field/fres/gate/tab`; Space change with `unit` (jump) keeps them; `space` unchanged keeps them; href keeps `app`, `viewID`, `group`, `filter*`.
- `field-history-memory.pure.spec.ts`: save/read per key; LRU drops the oldest at 51; blocked or full storage → no throw, `undefined` read; corrupt JSON → empty.
- `component-field-navigation.spec.ts` (same seed):
  - T1: open prod `spec.replicas`; click chain hop `staging` (push) → staging selected, unit open, row revealed, details open; click hop `base` → same in base; Back → staging with details; Back → prod with details; Forward → staging. Assert URL params at each step and `history.length` growth = 2.
  - T2: reload on `?app=…&space=<prod>&unit=<web>&field=spec.replicas&fres=apps/v1/Deployment|…` → details open, row visible below the sticky header. Also reload with `tab=gates&gate=<triggerId>` → Gates tab, gate open.
  - T4: open unit `api` by hand in prod; jump to base; Back → `api` still open.
  - T5: in prod, the `web` card is closed and details are open on a field of unit `api`; a Link-provider token jumps to `web` in the same Space, which opens the `web` card; Back → the `web` card is closed again and `api`'s details are open. Also across Spaces: after T1's Back steps, no card that a jump opened is still open.
  - T6: scroll the pane to a mid point with no field open; jump; Back → scrollTop within 2 px of the saved value.
  - T7: with `unit/field/fres` in the URL, click another graph node → params gone, and `history.length` unchanged (replace); the same with the Space picker.
  - Open/close details → `history.length` unchanged (replace). Existing `tests/component-deeplink.spec.ts` stays green (zero extra pushes for selections).
  - Edge: a deep URL whose `field` does not resolve (deleted path) → unit opens, no details, no error.
  - Edge: a staged edit in prod survives a jump to staging and Back (records the answer to the deferred question; if it fails, stop and ask the owner with Q2).

**Verification:** types, lint, pure, `component-field-navigation.spec.ts`, `component-deeplink.spec.ts`, `component-nav-grouping.spec.ts`, `component-graph-fold.spec.ts`.

**Definition of done:** Only `AppsComponentLayout` touches `useSearchParams`; no `navigate()` in the new code; T1, T2, T4–T7 green.

---

- [ ] U4. **Links and reference peeks** — size M

**Goal:** Every reference in the details is a real `<a href>` with the right target, and each kind has its peek.

**Requirements:** R4, D4, D5.

**Dependencies:** U3.

**Files:**
- Create: `src/components/field-diagnosis/FieldRefLink.tsx` (anchor + `InfoPeekTooltip`; peek bodies for unit, trigger/gate, revision, link, guard; user = text + peek)
- Create: `src/pages/x/apps/field-diagnosis/componentFieldLinks.ts` (the pane's `FieldLinkResolver`)
- Modify: `ComponentFieldDetails.tsx` (provide the resolver), `fieldLinks.ts` (if the `FieldRef` union needs a kind)
- Modify: `docs/dev/links.md` rule 3 (D5)
- Test: `tests/field-links.pure.spec.ts`, `tests/component-field-links.spec.ts`

**Spike code:** keep every href choice from `spikeLinks.tsx`/`spikeGates.tsx` (`UnitLink`, `LinkRef`, `ConflictText`, `GateText`, set-by revision and ChangeOrder links) and the modified-click rule. Rewrite: in-view from the deployment Space-id set; gate target from `TriggerID`; peeks through `InfoPeekCard`. Throw away: `PeekCard`, `useInView`, the `UpstreamUnitID`-else-`HeadRevisionNum` fallback (D4: no revision link when the source is not the upstream).

**Approach:** The resolver is pure over `(ref, { inViewSpaceIds, focusHref })` → `{ href, jump?: patch }`. `FieldRefLink` renders `<Link component={RouterLink}>` with `href`; a plain unmodified left click with `jump` calls `go(jump, { push: true })` and prevents default; other clicks are the browser's (links.md rule 4). Peek bodies mount only when open, so a closed peek costs nothing.

**Test scenarios:**
- `field-links.pure.spec.ts`: unit ref in view → focus href with `space, unit, field, fres` + jump patch; out of view → `unitConfigHref`; gate in view → `tab=gates&gate=<id>`; out of view → `/validation/<id>`; Link provider (`resource-name` attribute) → provider unit, `metadata.name`, `fres=<Type>|`; revision → `unitRevisionHref`; ChangeOrder `space/slug` → `changeOrderPath`; withheld change with source = upstream → `UpstreamRevisionNum` revision; source ≠ upstream → no revision href; user → no href.
- `component-field-links.spec.ts`: every `a` inside `fd-details` has a non-empty `href` (T3); cmd-click a chain hop → a new page opens (`context.waitForEvent('page')`) and the first page's URL is unchanged; hover a hop → unit peek with Space · Unit · value; hover the gate token → gate peek; click the gate token → Gates tab with the gate open; Back → configuration tab with the details.

**Verification:** types, lint, pure, `component-field-links.spec.ts`, U3's navigation spec still green.

**Definition of done:** No `onClick` navigation without an `href`; links.md rule 3 updated and its example matches the code.

---

- [ ] U5. **Merged row hover card** — size S

**Goal:** One hover card per row: the existing "Edit this value" card plus set-by, at most one attention line, a guard line only when needed, and Details.

**Requirements:** R3, R6, D3.

**Dependencies:** U4 (links in the attention line), U2.

**Files:**
- Create: `src/pages/x/apps/field-diagnosis/FieldRowCardRows.tsx` (+ a pure `rowCardLines(view, { keepShown })` in the same folder)
- Modify: `src/pages/x/apps/ComponentValuesSection.tsx` — the `ActionTooltipContent` `status` drops the `headRevisionDescription` (Functions) fallback; add the rows above "Keep on merge"
- Test: `tests/field-row-card.pure.spec.ts`, `tests/component-field-row-card.spec.ts`

**Spike code:** keep `ROW` styling from `componentTheme`, the 196–248 px width, `pointerEvents: auto` on rows with links, the one-attention rule (block, else wait; warnings left to the details), the Override-line suppression. Rewrite: Details is a `<a href>` with the focus href and an in-place replace (it opens, it does not jump). Throw away: `useUnitGates`, `gateNeedsFor`, `splitDescription`, the reason fallback from the head revision.

**Test scenarios:**
- `field-row-card.pure.spec.ts`: s1 → set-by only + Details; s5 with keep shown → attention line, no Override guard line; s5 without keep (array row) → Override guard line; s6 → attention = gate block; s12 → one attention line only (block first); no line contains `Functions:`; staged edit status (`staged manual edit`) still wins over set-by.
- `component-field-row-card.spec.ts`: hover a prod row with blame cached → card shows "Edit this value", set-by, attention, Details; `page.route` counts zero `/path` and zero `GET /unit/<id>` requests during the hover; click Details → details open, URL `field` set by replace; a heavy materialized unit's row card has no set-by row and no `/blame` request.

**Verification:** types, lint, pure, the spec, and `component-staging-narrow.spec.ts` / `component-lock-interaction.spec.ts` (hover card neighbours).

**Definition of done:** One card per row; no request on hover beyond what the pane already made.

---

- [ ] U6. **Cleanup and docs** — size S

**Goal:** No dead code, docs say what the code does.

**Requirements:** D1, D2, D5, D8.

**Dependencies:** U5.

**Files:**
- Modify: `docs/dev/components.md` — table rows and file map (lines naming `InspectPanel`), the URL section (new params, the jump push), a short "Field diagnosis" section (module layers, data rules, the per-entry memory)
- Modify: `docs/design/field-diagnosis/ARCHITECTURE.md` — a dated note at the top: what production changed from §5/§8 (FieldView, no prose, no hover prefetch, gates exact only)
- Modify: `docs/dev/links.md` if U4 left any example
- Check and remove: unused exports, `protectedPaths.ts` lookups only `InspectPanel` used, unused props on `NodeRow` (`deployments`/`unitsByDeployment` if only `siblingVariants` read them)
- Test: none new; full regression run

**Approach:** `rg "SPIKE|fdspike|fieldDiagnosisSpikeOn|InspectPanel|siblingVariants|useSpike"` over `src/` and `tests/` returns nothing. sessionStorage keys are `componentView.history.*` (not `fdspike.*`).

**Test expectation:** none new — full suite is the check.

**Verification:** `npx tsc -b`, `npm run lint`, all pure specs, all `tests/component-*.spec.ts` and `tests/blame-*.spec.ts`; final `design-verify` pass over the six states (details + row card) against the handoff contract.

**Definition of done:** Clean grep; docs match the code; the PR shows production code only.

---

## Slice dependency and size

| Slice | Unit | Depends on | Size |
|---|---|---|---|
| S0 | U0 Remove spike from `src/` | — | XS |
| S1 | U1 View model + data layer + pure tests | U0 | M |
| S2 | U2 Details replace `InspectPanel` (2a, 2b) | U1 | L |
| S3 | U3 URL state + navigation + Back | U2 | L |
| S4 | U4 Links + reference peeks | U3 | M |
| S5 | U5 Merged row hover card | U2, U4 | S |
| S6 | U6 Cleanup + docs | U5 | S |

Total: about 12–14 working days for one builder. S1 can start while the owner answers Q1–Q3; Q3 blocks only S2b, Q2 only S4.

---

## System-wide impact

- **Interaction graph:** `AppsComponentLayout.updateParams` (every graph and picker write), `ComponentSidePane` expansion state and `tabFocus`, `NodeRow` (all rows), `GatesPane` open key, `BlameTable` cache key.
- **Error propagation:** query errors show as one token line in the details (`describeQueryError`); guarded-write errors use the existing dialog and toast paths; storage errors are ignored.
- **State lifecycle:** per-entry memory grows per navigation (LRU cap); staged edits must survive jumps (tested in U3); RTK `Unit` invalidation refetches the open unit's blame after every write (accepted, ARCHITECTURE §7.5).
- **API surface parity:** `BlamePathDrawer` keeps its own arg (D6); a later plan moves it to `pathArg`.
- **Unchanged invariants:** selections stay replace-only (`component-deeplink.spec.ts`); staging rules 8–10; pill-group CSS; generated mutations and tags.

---

## Risks and dependencies

| Risk | Mitigation |
|---|---|
| Removing the gate text heuristic hides gates that report no path (`vet-celexpr` gives Details only), so a failing field shows no per-field gate. | The `Unit gates: N failing` details line (D3). Say this in the PR so the owner is not surprised. |
| Ordering of effects on POP: the node-switch reset can run after the memory restore and wipe it. | Restore in an effect declared after the reset (spike-proven order); T4/T5 E2E guard it. |
| A jump to another Space drops staged edits. | U3 test; if it fails, stop and use the Q2 answer. |
| Whole-unit blame with `upstream=true` is slow on big units. | Size gate; only the open unit; `BLAME_FOLLOW_UPSTREAM` constant; measurement is a follow-up. |
| Array rows on heavy units need the translator; unkeyed elements have no server path. | `positionalToMergeKeyPath` with tests; value-only details for unkeyed elements. |
| `ComponentValuesSection.tsx` (4.3k lines) and `ComponentSidePane.tsx` (3.4k lines) are hot files; merges with `main` conflict. | Keep edits in these files thin (mount + subscribe); logic lives in `field-diagnosis/` glue. Rebase on `main` before each slice. |
| E2E state 6 needs a validating function with `FailedAttributes`. | Deferred check in U2; fallback coverage by the pure `s6` fixture. |
| Reveal under the sticky header depends on layout. | `scroll-margin-top` from a measured header ref; screenshot in T2. |

---

## Documentation and operational notes

- `docs/dev/links.md` rule 3 (U4), `docs/dev/components.md` (U3, U6), dated note in `ARCHITECTURE.md` (U6).
- No flag, no migration. Rollout is the merge. Revert = revert the merge.

---

## Sources and references

- Origin: `docs/design/field-diagnosis/BRIEF.md`; data: `docs/design/field-diagnosis/ARCHITECTURE.md` (§7.1, §7.5, §7.6, §7.7, §13)
- Visual contract: `docs/design/field-diagnosis/final/design-handoff.md`
- Spike: commits `6452a9d` … `951538b`; real reports `docs/design/field-diagnosis/spike/real/`; verify screenshots `docs/design/field-diagnosis/spike/verify/`
- Rules: `docs/dev/components.md` (URL source of truth, rules 8–10, 15), `docs/dev/links.md`
- Tests to copy: `tests/blame-fields.pure.spec.ts`, `tests/blame-apply-guarded-conflict.spec.ts`, `tests/component-deeplink.spec.ts`, `tests/gate-details.spec.ts`
