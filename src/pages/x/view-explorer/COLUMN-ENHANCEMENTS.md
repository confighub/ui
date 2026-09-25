# View Explorer — Column Enhancement Ideas

Analysis of column-level intelligence from the existing UnitList page (`src/pages/unit-list/`)
that could be brought into the View Explorer table. Captured for future consideration.

## Current State

The View Explorer's `UnitTable` renders all columns as plain text via `getCellValue()`.
The UnitList page has 45+ columns with rich rendering. Below are the most impactful
enhancements to consider.

---

## 1. NavLinks on Key Fields

Make identity columns clickable links instead of plain text.

| Column | Link Target |
|--------|-------------|
| Slug | `/units/{SpaceID}/{UnitID}` |
| Space | `/spaces/{SpaceID}` |
| Target | `/targets` or inline edit |
| ChangeSetSlug | changeset detail |
| UpstreamUnitSlug | upstream unit detail |

**Effort:** Low — use existing `NavLink` component (`src/components/nav-link/NavLink.tsx`).
Need to pass `ExtendedUnitRead` data into cell rendering instead of pre-flattened strings.

---

## 2. Color-Coded Status Chips

Add semantic color to status columns using MUI `Chip` components.

**SyncStatus** (existing utility: `getSyncStatusColor` in `src/utility/string-functions.ts`):
- Synced → green (success)
- OutOfSync → orange (warning)
- Progressing → blue (info)
- NotLive → gray (default)

**UnitStatus** (existing utility: `getStatusColor`):
- Ready → green (success)
- Other → blue (info)

**ActionResult** (existing utility: `getActionResultColor`):
- ApplyCompleted/DestroyCompleted/ImportCompleted → green
- ApplyFailed/DestroyFailed/RefreshFailed → red
- RefreshAndDrifted → orange

**Effort:** Medium — need to add SyncStatus/UnitStatus/ActionResult as available columns
in `ALL_UNIT_COLUMNS` and extend `getCellValue` or create a richer cell renderer.

---

## 3. Relative Date Formatting

Show "2 hours ago" instead of "3/1/2026" for timestamp columns.

The existing `DateTimeCell` (`src/components/data-grid/cells/DateTimeCell.tsx`) is coupled
to MUI X DataGrid, but the core logic is just:

```typescript
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

// relative: dayjs(dateValue).fromNow()    → "2 hours ago"
// absolute: dayjs(dateValue).format('YYYY-MM-DD HH:mm:ss')
```

**Effort:** Low — dayjs is already a dependency. Just format in `getCellValue` or a cell
renderer. Could add a toggle (relative/absolute) via localStorage like the existing impl.

---

## 4. Computed Status Columns

Derived columns that highlight units needing attention:

**UnappliedChanges** — `"Yes"` if `HeadRevisionNum > LastReleasedRevisionNum` AND unit has a target.
**UpgradeNeeded** — `"Yes"` if upstream unit has a newer revision than `UpstreamRevisionNum`.

Both rendered as colored Yes/No chips (green/red).

The UnitList also has an **attention badge** system for grouped rows showing
"X of Y units need attention" when any unit has unapplied changes, needs upgrade,
or has validation errors.

**Effort:** Medium — logic exists in `createUnitListRow()` in
`src/components/unit-data-grid/utils/data-grid-helpers.ts`. Would need to be adapted
since the explorer doesn't use the same row model.

---

## 5. Gate Aggregation

ValidationErrors/DestroyGates/DeleteGates columns show:
- Count of active gates as a red error chip
- Tooltip listing gate names
- In grouped rows: aggregated across all units in the group

**Effort:** Medium-High — gate data is available on `ExtendedUnitRead.Unit.ValidationErrors` etc.

---

## Key Reusable Files

- Color utilities: `src/utility/string-functions.ts` (getStatusColor, getSyncStatusColor, getActionResultColor)
- NavLink component: `src/components/nav-link/NavLink.tsx`
- Column definitions reference: `src/components/unit-data-grid/hooks/useLabelColumnManager.tsx`
- Row data transformation: `src/components/unit-data-grid/utils/data-grid-helpers.ts`
- DateTimeCell logic: `src/components/data-grid/cells/DateTimeCell.tsx`

## Recommendation

Start with **NavLinks** (highest usability impact, lowest effort) and **relative dates**
(low effort, nice polish). Status chips and computed columns can follow as a second pass.
