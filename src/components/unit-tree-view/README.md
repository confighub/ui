# Unit Tree View Component

A tree/flow visualization component for displaying unit relationships and dependencies in ConfigHub.

## Overview

The Unit Tree View provides an interactive, visual representation of how units relate to each other through either clone relationships (configuration inheritance) or link relationships (dependencies). This mirrors the functionality of the `cub unit tree` CLI command.

## Components

### UnitTreeView
Main component that renders the tree visualization using React Flow.

**Props:**
- `units: ExtendedUnitRead[]` - Array of units to visualize
- `edgeType: 'clone' | 'link'` - Type of relationships to display
- `nodeType: 'unit' | 'space'` - How to display nodes (by unit name or space name)

### UnitTreeControls
Control panel for toggling between different view modes.

**Props:**
- `edgeType: 'clone' | 'link'` - Current edge type
- `nodeType: 'unit' | 'space'` - Current node display type
- `onEdgeTypeChange: (type: EdgeType) => void` - Handler for edge type changes
- `onNodeTypeChange: (type: NodeDisplayType) => void` - Handler for node type changes

### UnitTreeNode
Custom node component for displaying unit information in the tree.

Displays:
- Unit/space name (based on nodeType)
- Status indicators (unapplied changes, upgrade needed, gated)
- Color-coded status icons

## Features

### Edge Types

**Clone** (default)
- Shows configuration inheritance via `UpstreamUnit` relationships
- Blue edges
- Displays how units inherit configuration from parent units

**Link**
- Shows dependency relationships between units
- Green animated edges
- Displays producer-consumer relationships

### Node Display Types

**Unit** (default)
- Shows unit names as primary nodes
- Space names displayed as secondary information

**Space**
- Shows space names as primary nodes
- Unit names displayed as secondary information
- Useful for cross-space analysis

### Visual Features

- Interactive drag-and-drop for repositioning nodes
- Zoom and pan controls
- Mini-map for navigation in large trees
- Color-coded status indicators
- Automatic tree layout

## Usage in UnitListPage

Users can toggle between list view and tree view using the toggle button in the header.

```tsx
<UnitTreeControls
  edgeType={treeEdgeType}
  nodeType={treeNodeType}
  onEdgeTypeChange={setTreeEdgeType}
  onNodeTypeChange={setTreeNodeType}
/>
<UnitTreeView
  units={units}
  edgeType={treeEdgeType}
  nodeType={treeNodeType}
/>
```

## Relationship to CLI

This component implements similar logic to the `cub unit tree` command:

```bash
# Clone tree (default)
cub unit tree

# Link tree
cub unit tree --edge link

# Space-based view
cub unit tree --node space

# Clone tree across all spaces
cub unit tree --space "*"
```

## Dependencies

- `reactflow` - Core tree/flow visualization library
- `@mui/material` - UI components and styling
- `@mui/icons-material` - Status icons

## Implementation Details

### Clone Tree Building
1. Creates a map of all units by UnitID
2. Establishes parent-child relationships based on `UpstreamUnitID`
3. Identifies root nodes (units without upstream units or with upstream units not in dataset)

### Link Tree Building
1. Fetches all links where units appear as either FromUnit or ToUnit
2. Builds parent-child relationships where FromUnit is parent, ToUnit is child
3. Identifies root nodes (units with no incoming links)

### Layout Algorithm
- Simple tree layout with configurable spacing
- Nodes positioned based on tree hierarchy
- Automatic fit-to-view on initial render and when data changes
