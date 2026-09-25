# Bulk Restore Modal

A simple modal for restoring selected units to named revision states, designed to work with any unit selection regardless of changeset or tag associations.

## Overview

The `BulkRestoreModal` provides a clean interface for bulk restore operations where selected units may:
- Be associated with different changesets
- Not be in any changeset
- Have different tags or no tags
- Have varying revision histories

The modal focuses on special revision states that are meaningful in the context of each individual unit.

## Restore Options

All options use radio button cards with hover effects, matching the style of `RestoreChangesModal`.

### 1. **Last Applied Revision** (Default)
**Restore String:** `LastReleasedRevisionNum`

Rollback to the most recently published revision (last known good state).

**Use Cases:**
- Quick rollback after a bad release
- Return to the last stable state
- Undo unpublished local changes

### 2. **Head Revision**
**Restore String:** `HeadRevisionNum`

Restore to the current head revision (latest change).

**Use Cases:**
- Fast-forward to latest changes
- Sync to most recent state
- Update to current version

## UI Design

The modal uses the same visual style as `RestoreChangesModal`:
- **HoverCard** components for each option
- Radio buttons with descriptive labels
- Hover effects on selection cards
- Consistent spacing and typography
- Rounded dialog with custom shadow

## API

Uses `useBulkPatchUnitsMutation` with the `restore` parameter set to the selected special revision string.

The restore operation is applied to all selected units individually, with each unit restoring to its own named revision state.

## Error Handling

- Integrated with `useBulkApiErrorMessage` hook
- Shows errors in an ErrorList component
- Disables actions during submission

## Differences from RestoreChangesModal

| Feature | BulkRestoreModal | RestoreChangesModal |
|---------|------------------|---------------------|
| **Target Use Case** | Any unit selection | Specific changeset context |
| **Restore Options** | Special revisions only | ChangeSet/Tag + rebase workflows |
| **Visual Style** | HoverCard radio buttons | HoverCard radio buttons |
| **Complexity** | Simple (2 options) | Complex (multiple workflows) |
| **Default** | LastReleasedRevisionNum | Simple restore before changeset |
| **Context** | Per-unit revision states | Changeset-specific operations |

## When to Use

**Use BulkRestoreModal when:**
- Performing quick rollbacks on any selection of units
- Need to restore to the last published state
- Working with units that span multiple changesets or have no changeset association
- Want a simple, focused restore workflow

**Use RestoreChangesModal when:**
- Working within a specific changeset context
- Need to restore to changeset start/end tags
- Want rebase workflows (simple, rebase, selective)
- Undoing specific changeset changes
