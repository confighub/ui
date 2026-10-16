# Entity Grid Testing System

This directory contains fixtures for testing entity grids using Playwright. All entity grids (Targets, Triggers, Spaces, Units) now extend from a common `EntityGridFixture` base class.

## Architecture

```
EntityGridFixture (Base class)
    ↓ extends
TargetListPage, UnitListPage, etc. (Entity-specific pages)
```

## EntityGridFixture

The base fixture provides common operations for all entity grids:

### Row Selection
- `selectRow(name)` - Select a row by name

### Row Operations
- `getRowByName(name)` - Get a row locator by name
- `getRowByCellValue(column, value)` - Get a row by any cell value

### Grid State
- `waitForGridReady()` - Wait for the grid *or* the empty state to render

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
| `quickFilter(term)` | Throws — there is no toolbar search box to type into |

Methods that drive or read grid chrome that no longer exists throw with a
message naming the empty state as the reason.

## Usage Example

### Basic Usage

```typescript
import { EntityGridFixture } from './entity-grid-fixture';

const grid = new EntityGridFixture(page);

// Select rows
await grid.selectRow('my-target');
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
├── unit-list-page.ts               # Extends EntityGridFixture
├── space-list-page.ts              # Extends EntityGridFixture
└── README.md                       # This file
```
