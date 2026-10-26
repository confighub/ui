# Comparing Units (View explorer)

> Read this before you change row selection or compare mode in the View explorer. The code is in
> `src/pages/x/view-explorer/`. All paths below are relative to that folder, unless they start
> with `src/`. The grid is the Components compare surface (`src/pages/x/apps/compare/`), so also
> read the compare section of [`components.md`](components.md).

## What the user can do

- **Select.** A Units view in the Table layout has a checkbox track before the first column. Click
  a checkbox to pick a row. ⇧-click picks a range. ⌘/Ctrl-click picks one row. `x` picks the
  focused row, or the row open in the drawer. The header checkbox picks every shown row.
- **Compare.** The selection bar in the toolbar shows Clear (✕), "N of M selected", a primary button and Functions.
  With 2 to 5 rows, the button is **Compare**. With more than 5, it is **Compare first 5**. With
  1 row, it is **Compare with…**, which opens the picker with that row in slot A. The drawer of a
  Unit also has **Compare with…**. `c` does the same as the button.
- **Compare mode.** The comparison fills the results area. It has a header (title, crumb, Copy
  link, **Back to table**), the slots A–E, and the grid.
- **Rail.** On the left is the rail: the rows of the view, as names only. It uses the same
  filters, sort and groups as the table. Its group folds are its own. A click on a Unit adds it to
  the next empty slot, or removes it from its slot. A window narrower than 1100px has no rail.
- **Slots.** One card per Unit. ✕ clears a slot, and the slots after it move left. ⇄ swaps A and
  B. Drag a card onto another card, or onto a grid column head, to swap the two. A click on a card
  opens the picker to replace that Unit. After the last card, the empty slot opens the picker to
  add one, and shows the Unit that the picker suggests first.
- **Picker.** A search field over a list of Units. With no text, it suggests Units. With text, it
  searches every Unit that the page has loaded.
- **Back.** Back, Esc, or the removal of the last Unit ends compare mode. The table comes back with
  the same scroll, folded groups, selection, open row and drawer.

Compare mode is read-only. Nothing in it changes a Unit.

## Functions panel

The app's Functions panel (the invoker, `src/components/right-sidebar/RightSidebar.tsx`) runs a
function on the Units in the `selectedUnits` slice. On this page, that list is the selection.

- **Where.** `state/InvokerSelectionSync.tsx`, which `RowSelectionProvider` mounts. It writes the
  picked rows of the active tab, in table order, to the slice. It writes an empty list while
  nothing is picked, and in a view with no selection (Spaces, Resources, Board, Matrix). With an
  empty slice, the layout gives the panel no Units, and the panel shows its own list. That list is
  empty ("0 units") until its user adds a Unit with its + button. When the page unmounts, the sync
  empties the slice. It does not touch `invocationInitiativeId`.
- **Compare mode** does not change the list. It is the table's selection, not the slots.
- **Two-way.** A Unit taken out in the panel (×) is unpicked in the table. That is also true of the
  last Unit: rows that a filter hides stay picked, and come back with the filter. "Deselect all" in
  the panel clears the selection, hidden rows included, as Clear does. Both leave the slice empty,
  so the layout's "deselect all" dispatches `removeAllSelectedUnits`, which sets `removedAll`
  (`src/state/slices/selectedUnits.ts`). Every `setSelectedUnits` sets it back to false, so the
  other pages that write the slice are unchanged. The panel cannot add to the slice today (the
  layout gives it no `onAddUnit`). If it does, a Unit put in is picked when the table shows it;
  else the explorer writes its own list back. The rules are `panelChange` and `applyPanelChange`
  (`model/selection.ts`).
- **No loop.** The sync keeps `inSlice`: the list the slice holds, as far as the page knows. A slice
  equal to it is the page's own write, and is not applied back. A change from the panel is applied
  once. Then the selection equals the panel's list, or the explorer writes it once more. One change
  on either side makes at most two writes.
- **Open.** The **Functions** button in the selection bar dispatches `requestInvokerOpen`
  (`src/state/slices/invokerRequest.ts`). It counts on `openSeq`, not on `seq`, which the Trigger
  request's save panel keys on, so a plain open never brings back a Trigger request. The layout
  opens the panel. `f` toggles the panel on every page. The panel listens for it, not the explorer,
  so `F` is in the `?` map as a listed key only (`IN_CONTEXT`, `shortcuts/ShortcutMap.tsx`).
- **Keys.** The page's key listener ignores plain keys and Esc pressed in the panel
  (`isFunctionsPanelKey`, `keys/usePageShortcuts.ts`). It finds the panel by its marker,
  `FUNCTIONS_PANEL_SELECTOR` (`src/components/right-sidebar/appPanel.ts`), not by a test id. Esc in
  a field of the panel does not clear the selection, and `x` or `c` there do not change the view.
  ⌘ shortcuts are still the page's there: ⌘S saves the view, and the browser's "Save Page As" does
  not open.
- **Toolchain.** The panel takes the ToolchainType of its first Unit in table order, as it does on
  the Units page: its function list starts filtered to it, and the request names it. With more than
  one ToolchainType picked, a chosen function shows "Runs on N of M units" and dims the others.

## The toolbar while rows are picked

`results/Toolbar.tsx`, `table/SelectionBar.tsx`, `tabs/SaveActions.tsx`, `results/compact.ts`.

- While one row or more is picked, the selection bar takes the left side of the toolbar. The layout
  picker and the entity menu are not drawn, and the row count is part of the bar: ✕ (Clear,
  "Clear selection · Esc"), "N of M selected", Compare, Functions. Save stays at the right end. To
  change the layout, use `t`, `b` or `m`. To change the entity, clear the selection, or go to Board
  or Matrix first.
- `SelectionBar` is always the toolbar's first child, so its live region is never remounted.
- The toolbar is a size container (`vxbar`), because the filter column and the Functions panel take
  room beside it. Under 600px (`COMPACT`), the selection's buttons and the layout picker show icons
  only, and the row count is "M/M" (its `title` is "M of M units"). Under 440px (`NARROW`), the
  selection's count is "N of M". Under 760px (`SAVE_COMPACT`), the save actions show icons only.
  Each icon button keeps its name in an `aria-label` and says it in a tooltip.
- Nothing is hidden, and the toolbar never wraps, so the table under it does not move. The short
  texts are drawn by CSS (`::after`, or a hidden "selected"), so an element's text stays the same.

## Where state lives

| State | Home | Why |
|---|---|---|
| Row selection, per tab | `state/RowSelectionProvider.tsx`, as React state (`Map<tabId, RowSelection>`) | It changes on each click. It is not a draft and is not undone. In the reducer, each click would re-render every reader of the explorer context. |
| Compare ids, per tab | Reducer: `ExplorerState.compare` (`model/types.ts`), changed by the `setCompare` action | It belongs to a tab and goes into the URL. It must clear when its tab closes or stops listing Units. It is not part of `work`, so it never makes a draft or an undo step. |
| Picker request, focus to give back | `compare/CompareController.tsx` | UI state that the reducer has no place for. |
| Rail folds | `compare/CompareRail.tsx` | They do not need to match the table folds. |

**Selection.** What counts is the stored set intersected with the shown rows (`effective`,
`model/selection.ts`). A row that a filter hides does not count, and comes back when the filter
goes. A row that left the universe (deleted, or not visible) is dropped on the next change. While
the rows load, nothing is dropped. The slot letters of the picked rows follow table order
(`orderedRowIds`, `model/table-order.ts`). The drawer's ↑/↓ uses the same order.

**The "All units" fork.** The first edit of "All units" moves the view into a new temporary tab.
That is still the view where the user picked the rows, so the selection and the comparison follow
it to the fork:

- Selection: `RowSelectionProvider` reads `editTargetTabId(state)` (`model/reducer.ts`). That is
  the id the next edit forks to. A move from "All units" to that id is the fork, so the provider
  copies the selection during render. No frame shows the fork with nothing picked.
- Compare ids: `reconcileCompare` (`model/compare.ts`) runs after every reducer step. It copies the
  ids to the fork. It also drops the ids of a tab that closed, or that no longer lists Units.

**Slot changes.** Every change to the slots goes through the functions in `model/compare.ts`
(`addSlot`, `fillNextSlot`, `removeSlot`, `swapFirstTwo`, `reorderSlots`, `replaceSlot`). Thus a
Unit is never in two slots, and there are never more than `MAX_COMPARE_SLOTS` (5). `withCompare`
applies the same rules in the reducer.

**The URL.** `?compare=<UnitID>,<UnitID>,…`, slot A first (`COMPARE_PARAM`).

- `buildInitialState` (`state/initial.ts`) reads it once. `decodeCompareParam` counts what it
  cannot use (not a UnitID, a duplicate, past slot E). `compareLinkNotice` tells the user.
- The one URL effect in `state/ExplorerProvider.tsx` writes it, through `tabLinkParams`
  (`state/context.ts`). `tabLink` and `useCopyLink` (`tabs/useCopyLink.ts`) use the same function.
- **Do not add a second `setSearchParams` effect.** React Router gives each `setSearchParams` the
  URL of the render. Two effects in one commit write over each other, and one change is lost.
  Add a new parameter to `tabLinkParams` instead.

## Hide, do not unmount

`results/ResultsPane.tsx` keeps the toolbar, the table and the drawer mounted in compare mode.
They are in `vx-results-layout`, with `HIDDEN_STYLE` (`position: absolute; inset: 0;
visibility: hidden; pointer-events: none`) and `aria-hidden`. `CompareView` is drawn beside them in
the same box.

Do not use `display: none`. It resets the scroll position, and the `ResizeObserver` and the
virtualizer then measure every column as 0 wide.

**`HoldWhileHidden`** (`results/HoldWhileHidden.tsx`) wraps the hidden part. While `hold` is true,
it gives its children the explorer and results context values of the moment the hold began, and
the same children element. React then skips the hidden table when the comparison changes. When the
hold ends, the children get the current values and catch up in one render. Rules for what goes
inside:

1. Only the explorer and results values are held. A child that reads another context (row
   selection, compare, the Redux store) still re-renders, and sees held values beside current
   ones. It can show what it reads. It must not act on the mix.
2. Nothing held can change the view. The change would be unseen and would make a draft. In
   development, a dispatch from inside the hold is reported with `console.error`.
3. Nothing held can own a shortcut, a slot or an Esc layer, because a held one keeps stale values.
   Put these in the providers above (`RowSelectionProvider`, `CompareController`) or in
   `CompareView`.

Also while comparing:

- The layout keys `t`, `b` and `m`, and undo (⌘Z), do nothing (`ViewExplorerPage.tsx`). They
  would change the hidden view.
- Compare mode and the picker close an open cell popover and peek first (the `closeCellPopover`
  and `closePeek` slots, `state/slots.ts`). Their keys (`o`, `e`, `g`) would change the hidden view.

**Focus.** `start` remembers what had focus (a row, the Compare button). When compare mode ends,
focus goes back to it. If it is gone (for example, a link opened compare mode), focus goes to the
row of the Unit that was in slot A, else to the first row.

## Esc

The Esc stack is in `keys/usePageShortcuts.ts`. Esc closes the last layer that opened. An MUI
modal closes itself first, and the page layers wait (`isModalOpen`). The order is:

1. **Picker.** It is an MUI `Popover`, so it closes first. In `start` mode, the comparison that it
   was building is dropped.
2. **Compare mode.** `CompareView` registers `useEscLayer(true, exit)`.
3. **Selection.** `RowSelectionProvider` registers a layer that clears the selection. It is off
   while the tab compares. A tab switch or an undo can bring back picked rows in the same commit
   that opens compare mode. Then the selection layer would register after the compare layer, and
   Esc would clear the selection first.

The drawer handles its own Esc in its `onKeyDown`, and stops it there.

## Keys

| Key | Where | What it does |
|---|---|---|
| `x` | Units Table | Picks the focused row, or the row open in the drawer (`RowSelectionProvider`). |
| `f` | Every page | Opens or closes the Functions panel, which lists the picked Units. The panel handles it. With focus in the row panel, `f` is the panel's Run a Function instead: it picks the open Unit and opens the panel, never closes it ([`view-explorer-row-panel.md`](view-explorer-row-panel.md)). |
| `c` | Units view | In compare mode: opens the picker for the next empty slot (nothing when all 5 are full). Focus in the drawer: opens the picker with the drawer's Unit in A. 2 or more rows picked: compares them (the first 5). 1 row picked: opens the picker with it in A. Else, with a row open in the drawer: opens the picker with it in A. (`CompareController`) |
| ⇧-click | Units Table row or checkbox | Picks or unpicks a range. Every row in it takes the new state of the clicked row. The anchor stays, so a second ⇧-click resizes the same range. ⇧-click on a value (`data-vx-value`) keeps its cell-popover meaning. |
| ⌘/Ctrl-click | Units Table row | Picks or unpicks the row. In Board and Matrix, and in tables of Spaces or Resources, it still opens the row's page. |
| ⌘/Ctrl+Enter | Focused Units Table row | Opens the Unit page. This replaces ⌘-click there. |
| ↑/↓, Home, End | Picker | Move the highlight across the sections. Focus stays in the field. |
| ↵ | Picker | Takes the highlighted Unit and closes. In `start` mode, it opens compare mode. |
| ⇧↵ | Picker | Takes the highlighted Unit and stays open for the next slot. The field shows that slot's letter. The picker closes when slot E is full. In `start` mode, compare mode opens only on ↵ or when E is full. |

`c` and `x` are in the in-app `?` map, because they register through `useRegisterShortcut`.

## The picker's data

The picker makes no request. Everything comes from the universe: every Unit that the viewer can
see, with its Space, Target and upstream Unit (`queries/useUniverseRows.ts`).

- **Suggestions** (`buildPickerSections`, `compare/suggest.ts`), for the base Unit (slot A, or the
  Unit to replace). Each Unit shows once, in the first section that holds it:
  1. **Same slug in other Spaces**: how Components pairs Units.
  2. **Upstream**: the Unit that `UpstreamUnitID` names, with how many revisions it is ahead
     (`upstreamAhead`). It shows here even when it has the same slug.
  3. **In this group**: the other rows of the innermost table group that holds the base
     (`innermostGroup`, over the shown rows).
- **Search** (`searchUnits`): every Unit in the universe whose slug, Space, Target or display name
  holds every word of the query, ignoring case. An exact slug ranks first, then the base's slug,
  then Space and slug. The picker lists the first `SEARCH_LIMIT` (100) and says the total. The
  sorted index is built once per universe array (`WeakMap`).
- The query is deferred (`useDeferredValue`, `compare/usePickerSections.ts`). If ↵ comes before
  the list catches up, the picker takes from `sectionsFor(text now)`, never from the old list.
- A Unit already in a slot shows its letter and cannot be taken again. When replacing a slot,
  taking it swaps the two slots.
- The empty slot and the one-Unit state suggest the first free option of the same sections
  (`usePickerSuggestions`, `suggestForEmptySlot`), so they agree with the picker.

## Reading the Units

`compare/useCompareUnits.ts` turns the ids into the grid's input.

- It looks up each UnitID in the universe, not in the shown rows. A filter never takes a Unit out
  of a slot.
- Each slot has its own cached read (`useDownloadUnitDataQuery`). Adding a Unit reads only that
  Unit. A swap or a drag reads nothing, because the cache is per Unit, not per set.
- There are five fixed hook calls (`r0`…`r4`), one per slot. If you change `MAX_COMPARE_SLOTS`,
  change these calls too.
- Each column has a `letter` (its slot) and a two-line `heading` (slug, then Space).
  `columnLabels` (`compare/columns.ts`) names a column by what tells the Units apart.

## Units that cannot be read

| Case | What happens |
|---|---|
| A UnitID is not in the universe (deleted, or not visible) | After the universe loads, `CompareView` removes all such ids in one change, with one warning toast. While the universe loads, or when it failed, nothing is removed. |
| The universe could not be loaded | An error with Retry. The comparison shows the Units as they were last read. |
| A Unit's configuration could not be read | The Unit is left out of the grid (`unread`), with an error and Retry. The other columns keep their slot letters, so B is still B when A is left out. |
| A Unit has no configuration | Its column shows the `empty-unit` state. |
| Fewer than 2 Units can be read | No grid. With 1 Unit: "Pick a second Unit to compare with …", with the suggested Unit and **Choose another Unit…**. The page never shows a verdict ("0 differences") over the Units that are left. |
| The Units have different slugs | A warning: only matching documents line up. It does not block. |
| The base of an open picker leaves the universe | A toast, and the picker closes. |
| A link names entries it cannot use | `compareLinkNotice` says what was left out, and why. |

## Reuse of the Components compare surface

`CompareView` mounts `ComponentCompareSection` with `showUnitHeader={false}`, inside
`CompareVocabulary` (`UNIT_VOCABULARY`) and `CompareLayout` (`PAGE_LAYOUT`). `CompareColumnDnd`
wraps the slots and the grid, so a slot and a column head swap together. It passes no
`onCommitStaged`, so the grid is read-only. A change in `src/pages/x/apps/compare/` changes this
page too. See the compare section of [`components.md`](components.md).

## File map

| Path | Responsibility |
|---|---|
| `compare/CompareController.tsx` | Starts, changes and ends compare mode. Owns `c`, focus return, toasts, and the picker request. |
| `compare/compare-context.ts` | `CompareValue`, `PickerRequest` (`start` / `add` / `replace`) and `useCompare`. |
| `compare/CompareView.tsx` | The compare surface: header, rail, slots, grid, the error and one-Unit states, its Esc layer, and the removal of unresolved Units. |
| `compare/CompareRail.tsx` | The rail: the view's rows as names, virtualized, with a roving tabindex. |
| `compare/UnitSlots.tsx` | Slots A–E: clear, swap, drag, replace, and the empty slot with its suggestion. |
| `compare/UnitPicker.tsx` | The picker: a combobox in a `Popover`, with ↵ and ⇧↵. |
| `compare/usePickerSections.ts` | What the picker lists: suggestions, or the search results, and the load state. |
| `compare/suggest.ts` | Pure: `buildPickerSections`, `searchUnits`, `innermostGroup`, `suggestForEmptySlot`, `upstreamAhead`. |
| `compare/useCompareUnits.ts` | The per-slot reads, and the grid's input. |
| `compare/columns.ts` | Pure: `columnLabels`, `slugsDiffer`, `slotMeta`. |
| `compare/unit-row.ts` | `idOf`, the UnitID of a Unit row, shared by the compare files. |
| `model/compare.ts` | Pure: the `?compare=` codec, the slot operations, `withCompare`, `reconcileCompare`, `compareLinkNotice`. |
| `model/selection.ts` | Pure: `RowSelection` and its operations, `compareSet`, `slotLetters`. |
| `model/table-order.ts` | Pure: the Table's row order with no group folded (`orderedRows`, `orderedRowIds`). |
| `state/RowSelectionProvider.tsx` | The selection per tab, `x`, the selection's Esc layer, and the fork copy. |
| `state/InvokerSelectionSync.tsx` | The selection as the Functions panel's list of Units, both ways. |
| `state/selection-context.ts` | `RowSelectionValue` and `useRowSelection`. |
| `table/SelectionBar.tsx` | Clear, "N of M selected", Compare / Compare first 5 / Compare with…, and Functions, with a live region. |
| `results/compact.ts` | The toolbar's container widths, and the buttons that become icons below them. |
| `results/HoldWhileHidden.tsx` | Holds the hidden layout's context values while comparing. |

## Tests

- Pure (no server): `view-explorer-selection.pure.spec.ts`, `view-explorer-compare.pure.spec.ts`,
  `view-explorer-compare-state.pure.spec.ts`. Run them with
  `npx playwright test -c playwright.pure.config.ts` from `ui/`.
- Browser (a live server and a test user): `view-explorer-selection.spec.ts`,
  `view-explorer-compare.spec.ts`, `view-explorer-compare-picker.spec.ts`,
  `view-explorer-table.spec.ts`, `view-explorer-invoker-selection.spec.ts`.
- After a change in `src/pages/x/apps/compare/`, also run the `component-compare-*` specs.
