# The row panel of a Unit (View explorer)

> Read this before you change the panel that opens beside the table when a Unit row is clicked.
> The code is in `src/pages/x/view-explorer/`. Paths below are relative to that folder, unless
> they start with `src/`. Row selection, compare mode and the hold are in
> [`view-explorer-compare.md`](view-explorer-compare.md).

## What it shows

A Unit row opens on **Summary** (default) and **Resources (N)**. Space and Resource rows keep
their own tabs. Summary has three parts:

- **The verdict.** One headline in a status colour, a detail sentence, the causes and the facts,
  each on its own line with a fix link, and one primary button.
- **Other actions.** A list; each item says what it does and its key. A disabled item stays
  focusable and says why.
- **The group.** The counts of the Unit's group, in the words of the table's Status column, and
  the next Unit that needs attention.

The panel is 480px wide (`ROW_PANEL_WIDTH`, `results/ResultsPane.tsx`).

## Layers

| Layer | Files | Rule |
|---|---|---|
| Pure model | `unit-panel/attention.ts`, `conflicts.ts`, `verdict.ts`, `group-context.ts`, `keys.ts`, `gate-check.ts`, `links.ts`, `upgrade-preview.ts` | No React, no MUI. Tested without a browser. |
| Text and colour | `unit-panel/copy.ts`, `tones.ts` | Every string and every tone. |
| Hooks | `unit-panel/useUnitPanel.ts`, `useUnitPanelData.ts`, `useGateChecks.ts`, `useSettledId.ts` | Build the model (`view/types.ts`, `UnitPanelModel`). |
| Views | `unit-panel/view/*` | Draw the model only. |

A new look changes `view/*`, `copy.ts` and `tones.ts`, and nothing else.

## State

- **The open row** is kept by id in `ResultsPane` (`OpenedRow`). Each render reads the row from
  `universe.rows` by that id, so the panel follows a refetch after an upgrade or a restore. The
  row as it was opened stands in only when the id has left the rows; the panel then says the Unit
  no longer exists and offers nothing to run.
- **The tab** is kept while the panel moves from row to row, and goes back to Summary on close.
- **Settling.** `useSettledId` gives the open id once the panel has stayed on it for 150 ms. Until
  then the panel reads nothing new, so holding `j` reads nothing for the rows it passes. A Unit
  read before shows its verdict at once from the cache, and so does the Release its Space runs.
- **The dialog** (`PanelDialog`, `view/types.ts`) belongs to the Unit it was opened on. A move to
  another row closes it.
- **The live region** says "`<slug>`, k of N. `<headline>`" once per row the panel settles on. It
  waits for the read, and for a new answer when the cache holds an error from an earlier visit.

## Data and cache keys

The panel reads for the open Unit only, never for other rows.

| Read | Arguments (the cache key) | When | Tag |
|---|---|---|---|
| The rows (`useUniverseRows`) | `listAllUnits`, with `ValidationErrors` in the select | Always | `Unit` |
| The Unit | `getUnit {spaceId, unitId, include: 'TargetID,SpaceID,UpstreamUnitID,UpstreamSpaceID,UnitEventID'}` | Settled | `Unit` |
| Author of the head revision | `listExtendedRevisions {spaceId, unitId, where: 'RevisionNum = <head>', include: 'UserID'}` | Settled, with revisions to release | `Revision` |
| The Space's Component | `getSpace {spaceId, select: 'ComponentID', include: 'ComponentID'}` | Settled, the Space has a Component, revisions to release | `Space` |
| The Release's live status | `useRunningReleases([{spaceId, releaseTargetId}])` (`src/pages/x/apps/`) | Settled, the Space has a release Target | `Release` |
| The unreleased diff | `getUnitDiff {spaceId, unitId, from: <released>, to: <head>}` | The diff dialog is open | `Unit` |
| The upgrade preview | `getUnitUpgradePreview {spaceIds: [spaceId], upstreamUnitIds: [upstreamUnitId], include: 'Diff', basis: '<unitId>:<upstreamRev>:<upstreamHead>'}` (`src/pages/x/apps/upgradePreviewApi.ts`) | The preview dialog is open | none |
| A gate check | `checkUnitGate` mutation (`queries/gateCheckApi.ts`) | On click | invalidates none |

- The preview is a dry run (`PATCH /unit?upgrade=true&dry_run=true`) and writes nothing. It covers
  every Unit of the Space with the same upstream; `previewEntry` picks this Unit's entry. `basis`
  is not sent: it keys the cache on the revisions, so a new upstream revision or an upgrade asks
  again.
- The gate check runs the gate's Trigger with `StopOnError: false` and no
  `UpdateValidationResults`. It stores nothing, so it must not refetch the rows.
- The Release reach ("Release `<Space>` (N Units)") is counted from the rows already loaded: the
  Units of the Space on its release Target with revisions to release. The rows refetch after a
  write, so the count follows.
- A `getSpace` that answers without a Component (the row's id is out of date) counts as "not a
  Component", so the verdict does not wait for it.

## The verdict

`buildVerdict` (`unit-panel/verdict.ts`) is a pure function of the row (`RowFacts`), the read
(`FetchedDetails`), the gate checks and the place in the view. Causes come in this order: withheld
conflicts, a failed last action, failing gates, gates being checked, unmet needs, unreleased
revisions, an upstream that is ahead. Kept conflicts (`ProtectedPath`, `Subtracted`), an earlier
failure, gate warnings and the Release's live status are facts, never causes. `awaiting/triggers`
means "being checked", never "fails".

**Headline, first match:**

| Condition | Headline | Tone |
|---|---|---|
| The read is loading and the row shows no cause | Checking… | muted |
| Withheld conflicts | Needs a decision: N changes were not applied | blocked (red) |
| The last action failed on the head (or names no revision) | Last action failed on rev H; the detail is its message | blocked (red) |
| A gate fails | Blocked: rev H cannot release (with revisions to release), else A gate fails on rev H (N gates fail on rev H) | gated (amber) |
| Gates are being checked | Checking gates on rev H | info |
| Needs are not met | Needs from upstream are not met | attention (amber) |
| Revisions to release | Ready to release: rev H is not released | attention (amber) |
| Upstream is ahead | Upgrade available: upstream is at rev U | upgrade (purple) |
| No Target | Not targeted: no Release includes this Unit | muted |
| The read failed | Could not confirm: details did not load | muted |
| Otherwise | Nothing to do: rev H is released | ok (green) |

**Primary.** Until the read is ready it is a disabled "Checking…"; after a read that failed, a
disabled "Unavailable"; a gone Unit has none. Then the primary is the action of the first cause,
so it always answers the headline; the other causes' actions stay among the other actions:

| First cause | Primary |
|---|---|
| Withheld conflicts | Review conflicts |
| A failed last action | See events |
| A failing gate | Check again (a gate with a known Trigger), else Edit at `<path>` |
| Gates being checked | none |
| Unmet needs | Open Links |
| Revisions to release | Release `<Space>` (N Units), when the Space can release from here; else none |
| Upstream ahead | Preview upgrade |
| No cause | Go to `<next Unit>`, when one needs attention |

Status never uses the brand colour; orange marks only the primary, the fix links, the active tab
and the section markers.

## Actions and their confirm steps

No action writes without a confirm. Links open the Unit page in a new browser tab, with the way
back to this view (`explorer=`).

| Action | What it does | Writes |
|---|---|---|
| Review conflicts, See events, Edit config (`e`), Open Links, Restore a revision… | Link to the Unit page (`tab=2`, `tab=0`, `tab=1`, Links, `tab=2`) | No |
| Release `<Space>` | Link to the Components view (`/components?app=&space=`), which releases | No |
| Check again | The gate check above, result inline on the gate's line | No |
| See diff | `DiffDialog`, read only | No |
| Preview upgrade, Upgrade (`u`) | `UpgradePreviewDialog`: this Unit's diff and the dry run's conflicts. Footer: **Close**, **Upgrade…**. **Upgrade…** is on only once the dry run answered for this Unit without an error; else it is off, with the reason beside it (waiting, could not be read, did not cover this Unit, would fail). If the row's upstream moves while it is open, it is off with "The upstream changed; preview again" and **Preview again** (`upgradeBlock`, `isStalePreview`) | No |
| Upgrade… (in the preview) | Closes the preview and opens `BulkUpgradeModal` (`src/pages/unit-list/components/modals/bulk-upgrade-modal/`) with `unitsToEdit=[row.Unit]` | Only on its **Upgrade**: `PATCH /unit?upgrade=true&where=UnitID IN (…)` |
| Restore rev N (`r`), when head > released > 0 | `BulkRestoreModal` (`…/bulk-restore-modal/`), Last Released by default | Only on its **Restore**: `PATCH /unit?restore=…` |
| Run a Function (`f`) | Picks the open Unit, then opens the Functions panel (never closes it) | No |

After a confirmed write, `bulkPatchUnits` invalidates `Unit` (`src/state/liveness/invalidationMap.ts`),
so the rows and the Unit's read refetch, and the verdict follows. The panel then takes focus,
since the link or button that opened the confirm may be gone. It takes it in an effect, which runs
after MUI's effect cleanup gives focus back to the opener; a frame can run before that cleanup.

## Keys

The panel's keys act only while focus is in the panel (`unit-panel/keys.ts`, handled in
`ResultsPane`'s `onKeyDown`). They do nothing in text entry, with ⌘, Ctrl or Alt, or while a
dialog or menu is open.

| Key | Action |
|---|---|
| `j` `k`, `↓` `↑` | Next and previous row in table order. The table shows and unfolds the row. |
| `⇧J` `⇧K` | Next and previous Unit that needs attention, across groups, wrapping. `n` is "New temporary view", so it is not used. |
| `↵` | Runs the primary, only when the panel itself has focus and Summary is shown. |
| `u` | Opens the upgrade preview. |
| `e` | Edit config. The panel takes `e` while it has focus, so a picked cell's Exclude does not run. |
| `r` | Restore rev N, or Restore a revision…. |
| `f` | Run a Function: picks the open Unit and opens the Functions panel, never closes it. The panel stops the key, so the page's own `f` (a toggle) does not also run. Where Run a Function is off, `f` does nothing. |
| `Esc` | Closes the panel; focus goes to the row the panel shows now. |

The `?` map lists them, each labelled "while the row panel has focus" (`shortcuts/ShortcutMap.tsx`).

**Dialogs.** The panel's dialogs (`view/UnitPanelDialogs.tsx`) are portalled out of the panel, but
React still sends their keys to the panel's `onKeyDown`. The panel ignores any key whose target is
not in its own DOM, so `j` in a dialog does not move the row. Esc closes the dialog first (MUI),
and MUI gives focus back to what opened it. The page's `f` listens on the document, so the dialogs
stop `f` from reaching it. The dialogs are mounted on every tab, so a key from Resources shows its
dialog too.

## The hold

In compare mode the panel is inside `HoldWhileHidden` and gets no Unit (`useUnitPanel` is given
`row: null`). Nothing in the panel registers a shortcut, a slot or an Esc layer: its keys are in
`ResultsPane`'s `onKeyDown`, and its dialogs are plain MUI dialogs. The hold keeps that handler as
it was when compare mode began, so it reads compare mode from a ref and ignores every key then. Showing the open row in the table
is the table's own prop (`reveal`, `table/ExplorerTable.tsx`), set only by keys and the panel's
buttons.

## File map

| File | Purpose |
|---|---|
| `results/ResultsPane.tsx` | The open row by id, the table order, the panel's keys, focus on close. |
| `components/EntityDetailDrawer/EntityDetailDrawer.tsx` | The tabs; mounts `UnitSummary`, `KeysFooter` and `UnitPanelDialogs` for a Unit. |
| `unit-panel/attention.ts` | `RowFacts`, the class of a row, failing gates. |
| `unit-panel/verdict.ts` | `buildVerdict`: causes, facts, headline, primary, other actions. |
| `unit-panel/group-context.ts` | Group counts and `nextProblemIndex`. |
| `unit-panel/useUnitPanelData.ts` | The reads of the open Unit. |
| `unit-panel/useUnitPanel.ts` | The model, the actions and the dialog state. |
| `unit-panel/upgrade-preview.ts` | The preview's request, its cache key and this Unit's entry. |
| `unit-panel/view/UnitPanelDialogs.tsx` | The diff, the preview, and the upgrade and restore confirms. |
| `unit-panel/view/diff-layout.ts` | The dialogs' diff columns (path, before, after) and resource names. |
| `queries/gateCheckApi.ts` | The gate check, with no invalidation. |

## Tests

- `tests/view-explorer-unit-panel.pure.spec.ts`: every headline and primary rule, causes, facts,
  the other actions, copy, group counts, keys, the upgrade preview's request and entry.
- `tests/view-explorer-gate-check.pure.spec.ts`: the gate check's body and result.
- `tests/view-explorer-unit-panel.spec.ts`: against a seeded server
  (`tests/fixtures/view-explorer-panel-seed.ts`, Units in each state, an upstream clone, a gate).
  The tests that write (upgrade, restore) come last in the file, because they change the seed.
  It also holds `j` through 5,000 served rows within `LONG_TASK_BUDGET_MS`.
