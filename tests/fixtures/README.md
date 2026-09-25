# Entity Grid Testing System

This directory contains fixtures for testing entity grids using Playwright. All entity grids (Targets, Triggers, Workers, Spaces, Units) now extend from a common `EntityGridFixture` base class.

## Architecture

```
EntityGridFixture (Base class)
    ↓ extends
TargetListPage, WorkerListPage, etc. (Entity-specific pages)
```

## EntityGridFixture

The base fixture provides common operations for all entity grids:

### Row Selection
- `selectRow(name)` - Select a row by name
- `selectRows(names)` - Select multiple rows
- `deselectRow(name)` - Deselect a row
- `selectAllRows()` - Select all rows via header checkbox
- `deselectAllRows()` - Deselect all rows
- `getSelectedRowCount()` - Get number of selected rows

### Row Operations
- `getRowByName(name)` - Get a row locator by name
- `getRowByCellValue(column, value)` - Get a row by any cell value
- `getRowCount()` - Get total number of rows (0 when the list is empty)
- `rowExists(name)` - Check if a row exists

### Column Management
- `openColumnsPanel()` - Open the grouped columns panel
- `searchColumns(term)` - Search for columns
- `toggleColumn(name)` - Toggle column visibility
- `showColumn(name)` - Make a column visible
- `hideColumn(name)` - Hide a column
- `getVisibleColumns()` - Get list of visible column names
- `sortByColumn(name)` - Sort by a column

### Cell Operations
- `getCellValue(rowName, columnName)` - Get text from a cell
- `clickCell(rowName, columnName)` - Click on a cell

### Grid State
- `waitForGridReady()` - Wait for the grid *or* the empty state to render
- `isEmpty()` - Check if the list shows no rows (either empty state)
- `getPaginationInfo()` - Get pagination text (throws when the list is empty)

### Filtering & Search
- `quickFilter(term)` - Use the quick filter search (throws when the list is empty)
- `clearQuickFilter()` - Clear quick filter

### Empty Lists

A list has two distinct empty states, and the fixture treats them differently:

- **Genuinely empty** (the unfiltered dataset has no rows): `EntityDataGrid` does
  not mount the grid at all. There is no `[role="grid"]`, toolbar, column header
  or pagination footer — only a container with
  `data-testid="entity-grid-empty-state"`.
- **Filtered/searched to zero rows**: the grid stays mounted with its full chrome
  and shows the no-rows overlay, so the filters can still be cleared.

In the genuinely empty case the methods that depend on grid chrome behave as
follows:

| Method | Behavior |
| --- | --- |
| `waitForGridReady()` | Resolves once the empty state renders (does not wait for a grid that will never mount) |
| `getRowCount()` | Returns `0` |
| `getVisibleColumns()` | Returns `[]` |
| `isEmpty()` | Returns `true` |
| `getPaginationInfo()` | Throws — there is no pagination footer to read |
| `quickFilter(term)` | Throws — there is no toolbar search box to type into |

The rule of thumb: methods that ask a question about the data answer it (`0`,
`[]`, `true`); methods that drive or read grid chrome that no longer exists throw
with a message naming the empty state as the reason.

### Pagination
- `goToNextPage()` - Navigate to next page
- `goToPreviousPage()` - Navigate to previous page
- `changePageSize(size)` - Change rows per page (25, 50, 100, 250)

## Usage Example

### Basic Usage

```typescript
import { EntityGridFixture } from './entity-grid-fixture';

const grid = new EntityGridFixture(page);

// Select rows
await grid.selectRow('my-target');
await grid.selectRows(['target-1', 'target-2']);

// Work with columns
await grid.openColumnsPanel();
await grid.toggleColumn('CreatedAt');
await grid.hideColumn('UpdatedAt');

// Get data
const rowCount = await grid.getRowCount();
const selectedCount = await grid.getSelectedRowCount();
```

### Extending for Entity-Specific Pages

```typescript
import { EntityGridFixture } from './entity-grid-fixture';

export class TargetListPage extends EntityGridFixture {
  constructor(public readonly page: Page) {
    super(page); // Initialize base grid fixture
    // Add entity-specific locators
  }

  // Entity-specific methods
  async addTarget(name: string) {
    // Implementation
  }

  // Can override base methods if needed
  async getRowByName(name: string) {
    // Custom implementation with auto-filtering
    const row = this.page.getByRole('row', { name }).first();
    if (!await row.isVisible({ timeout: 1000 })) {
      await this.filterTargets(`Slug='${name}'`);
    }
    return row;
  }
}
```

### Using in Tests

```typescript
test('should select and delete target', async ({ page }) => {
  const targetPage = new TargetListPage(page);
  await targetPage.goto();

  // Use inherited grid methods
  await targetPage.selectRow('my-target');
  await targetPage.selectRow('another-target');

  expect(await targetPage.getSelectedRowCount()).toBe(2);

  // Use entity-specific methods
  await targetPage.deleteTarget('my-target');
});
```

## Migration Guide

To migrate existing page fixtures to use EntityGridFixture:

1. **Import and extend EntityGridFixture**
   ```typescript
   import { EntityGridFixture } from './entity-grid-fixture';

   export class MyPage extends EntityGridFixture {
   ```

2. **Update constructor**
   ```typescript
   constructor(public readonly page: Page) {
     super(page); // Call parent constructor
     // Your existing locators
   }
   ```

3. **Remove duplicate methods**
   - Delete custom implementations of `selectRow`, `getRowByName`, etc.
   - Keep entity-specific overrides if you need custom behavior

4. **Update method names if needed**
   - `checkUnitByNameInTable()` → Use `selectRow()` instead
   - Custom row finding logic → Override `getRowByName()` if needed

## Benefits

✅ **Consistency** - All grids use the same interaction patterns
✅ **Less code** - Shared functionality is inherited, not duplicated
✅ **Maintainability** - Fix bugs once in the base class
✅ **Type safety** - TypeScript ensures proper usage
✅ **Discoverability** - IDE autocomplete shows all available methods
✅ **Flexibility** - Can override methods for entity-specific behavior

## File Structure

```
tests/fixtures/
├── entity-grid-fixture.ts          # Base class for all grids
├── target-list-page.ts             # Extends EntityGridFixture
├── worker-list-page.ts             # Extends EntityGridFixture
├── unit-list-page.ts               # Extends EntityGridFixture
├── space-list-page.ts              # Extends EntityGridFixture
└── README.md                       # This file
```

## Testing Column Groups

All entity grids now support grouped columns. Test them like this:

```typescript
test('should toggle columns in grouped panel', async ({ page }) => {
  const grid = new TargetListPage(page);

  // Open the columns panel
  await grid.openColumnsPanel();

  // Search for columns
  await grid.searchColumns('Created');

  // Toggle specific columns
  await grid.toggleColumn('CreatedAt');
  await grid.hideColumn('UpdatedAt');

  // Verify visible columns
  const visibleCols = await grid.getVisibleColumns();
  expect(visibleCols).toContain('Name');
  expect(visibleCols).not.toContain('UpdatedAt');
});
```

## Testing Dynamic Columns (Labels, Values)

```typescript
test('should show dynamic label columns', async ({ page }) => {
  const grid = new TargetListPage(page);

  // Create item with labels
  await grid.addTarget({
    name: 'test-target',
    labels: { env: 'prod', team: 'platform' }
  });

  // Open columns panel
  await grid.openColumnsPanel();

  // Look for Labels group
  await page.getByText('Labels').click();

  // Toggle label columns
  await grid.showColumn('Labels.env');
  await grid.showColumn('Labels.team');

  // Verify they appear in the grid
  const cols = await grid.getVisibleColumns();
  expect(cols).toContain('Labels.env');
  expect(cols).toContain('Labels.team');
});
```
