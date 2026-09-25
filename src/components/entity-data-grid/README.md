# EntityDataGrid with Search Highlighting

This directory contains the `EntityDataGrid` component and utilities for highlighting search matches in grid cells.

## Features

- **Automatic Search Highlighting**: All text-based columns automatically highlight text that matches the quick filter search
- **Zero Configuration**: Works out of the box without any additional setup
- **Smart Detection**: Automatically skips columns with custom rendering or non-text types
- **Customizable**: Manual control available when needed

## How It Works

Search highlighting works in two ways:

1. **Automatic for simple columns**: Columns without custom `renderCell` automatically get `HighlightedCell` applied
2. **Manual for custom columns**: Columns with custom rendering (tooltips, links, etc.) use `HighlightedCell` directly in their `renderCell` function

This ensures ALL text-based columns have search highlighting, regardless of their complexity!

## Usage

### Basic Usage (Automatic)

Simply define your columns as normal. Highlighting is automatic:

```tsx
import { EntityDataGrid } from '@/components/entity-data-grid';
import { GridColDef } from '@mui/x-data-grid';

const columns: GridColDef[] = [
  {
    field: 'name',
    headerName: 'Name',
    minWidth: 150,
    // No renderCell needed - highlighting is automatic!
  },
  {
    field: 'description',
    headerName: 'Description',
    minWidth: 200,
    // No renderCell needed - highlighting is automatic!
  },
];

// Use EntityDataGrid as normal
<EntityDataGrid rows={rows} columns={columns} />
```

### Manual Control with HighlightedCell

If you have a custom `renderCell` but still want highlighting, use `HighlightedCell`:

```tsx
import { HighlightedCell } from '@/components/entity-data-grid';
import { Tooltip } from '@mui/material';
import { Ellipses } from '@/components/styled';

const columns: GridColDef[] = [
  {
    field: 'slug',
    headerName: 'Slug',
    renderCell: (params) => (
      <Tooltip title={params.value} arrow>
        <Ellipses variant='body1'>
          <HighlightedCell value={params.value} />
        </Ellipses>
      </Tooltip>
    ),
  },
];
```

### Advanced: Custom Highlighting Logic

If you need custom highlighting behavior, use the `useQuickFilter` hook and `highlightText` utility:

```tsx
import { useQuickFilter, highlightText } from '@/components/entity-data-grid';

const CustomCell = ({ value }: { value: string }) => {
  const filterValue = useQuickFilter();

  return (
    <div style={{ fontWeight: 'bold', color: 'blue' }}>
      {highlightText(value, filterValue)}
    </div>
  );
};

const columns: GridColDef[] = [
  {
    field: 'name',
    headerName: 'Name',
    renderCell: (params) => <CustomCell value={params.value} />,
  },
];
```

## API

### HighlightedCell

Component that automatically highlights text matching the current quick filter.

**Props:**
- `value: string | number | null | undefined` - The text value to display and potentially highlight

### useQuickFilter

Hook that returns the current quick filter search value from the DataGrid.

**Returns:** `string` - The current filter text

### highlightText

Utility function to highlight matching text in a string.

**Parameters:**
- `text: string` - The text to search within
- `query: string` - The search query to highlight

**Returns:** `React.ReactNode` - JSX with highlighted portions

## Styling

The highlighted text uses a yellow background color with semi-transparency:
- Background: `rgba(255, 235, 59, 0.5)`
- Font weight: `600`

You can customize the highlighting by wrapping the `HighlightedCell` with your own styled components or by using the `highlightText` utility directly with custom styling.
