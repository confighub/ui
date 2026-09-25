// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useRef, useState } from 'react';

import SearchIcon from '@mui/icons-material/Search';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  GridColumnVisibilityModel,
  GridColumnsPanelProps,
  useGridApiContext,
  useGridSelector,
  gridColumnDefinitionsSelector,
  gridColumnVisibilityModelSelector,
} from '@mui/x-data-grid';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { Stack } from '@mui/system';

import { ColumnGroup, DynamicGroupConfig } from './column-groups-types';

export interface GroupedColumnsPanelProps extends GridColumnsPanelProps {
  /** Static column groups configuration */
  columnGroups?: ColumnGroup[];
  /** Dynamic groups configuration (optional) */
  dynamicGroups?: DynamicGroupConfig[];
}

export const GroupedColumnsPanel = ({
  columnGroups = [],
  dynamicGroups = [],
}: GroupedColumnsPanelProps) => {
  const apiRef = useGridApiContext();
  const columnDefinitions = useGridSelector(apiRef, gridColumnDefinitionsSelector);
  const columnVisibilityModel = useGridSelector(apiRef, gridColumnVisibilityModelSelector);

  // Track search query
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when panel opens
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Track which tree items are expanded using TreeView's expandedItems
  const [expandedItems, setExpandedItems] = useState<string[]>(() => {
    // Start with all groups expanded
    const allGroupIds = columnGroups.map((group) => group.header);
    const dynamicGroupIds = dynamicGroups.map((group) => group.name);
    return [...allGroupIds, ...dynamicGroupIds];
  });

  // Auto-expand all groups when searching
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    if (value.trim()) {
      // Expand all groups when user is searching
      handleExpandAll();
    }
  };

  // Get all column definitions for dynamic groups
  const dynamicGroupColumns = useMemo(() => {
    const result = new Map<string, typeof columnDefinitions>();
    dynamicGroups.forEach((group) => {
      const columns = columnDefinitions.filter((col) => col.field.startsWith(group.columnPrefix));
      result.set(group.name, columns);
    });
    return result;
  }, [columnDefinitions, dynamicGroups]);

  const handleToggleColumn = (field: string) => {
    const isCurrentlyVisible = columnVisibilityModel[field] !== false;
    const newModel: GridColumnVisibilityModel = { ...columnVisibilityModel };

    newModel[field] = !isCurrentlyVisible;

    apiRef.current.setColumnVisibilityModel(newModel);
  };

  const handleToggleAll = (columns: string[], show: boolean) => {
    const newModel: GridColumnVisibilityModel = { ...columnVisibilityModel };
    columns.forEach((field) => {
      if (show) {
        delete newModel[field];
      } else {
        newModel[field] = false;
      }
    });
    apiRef.current.setColumnVisibilityModel(newModel);
  };

  const handleExpandAll = () => {
    const allGroupIds = columnGroups.map((group) => group.header);
    const dynamicGroupIds = dynamicGroups.map((group) => group.name);
    setExpandedItems([...allGroupIds, ...dynamicGroupIds]);
  };

  const handleCollapseAll = () => {
    setExpandedItems([]);
  };

  /**
   * Format field names for human-readable display
   * 1. Removes dynamic column prefixes (Labels., Values., etc.)
   * 2. Handles acronyms by preserving grouping (WorkerID -> Worker ID)
   * 3. Converts camelCase to space-separated words (bridgeWorker -> bridge Worker)
   */
  const formatFieldName = (field: string): string => {
    // Check all dynamic group prefixes first
    for (const group of dynamicGroups) {
      if (field.startsWith(group.columnPrefix)) {
        return field.replace(group.columnPrefix, '');
      }
    }

    // Convert camelCase to Title Case with spaces
    // Handle acronyms by not adding space between consecutive capitals
    return field
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // Handle acronyms followed by word (e.g., "WorkerID" -> "Worker ID")
      .replace(/([a-z\d])([A-Z])/g, '$1 $2') // Handle normal camelCase (e.g., "bridgeWorker" -> "bridge Worker")
      .trim();
  };

  // Filter groups and columns based on search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return columnGroups;
    }

    const query = searchQuery.toLowerCase();
    return columnGroups
      .map((group) => ({
        ...group,
        columns: group.columns.filter((col) =>
          formatFieldName(col).toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.columns.length > 0);
  }, [searchQuery, columnGroups]);

  // Filter dynamic group columns based on search
  const filteredDynamicGroupColumns = useMemo(() => {
    const result = new Map<string, typeof columnDefinitions>();

    dynamicGroups.forEach((group) => {
      const columns = dynamicGroupColumns.get(group.name) || [];
      if (!searchQuery.trim()) {
        result.set(group.name, columns);
        return;
      }

      const query = searchQuery.toLowerCase();
      const filtered = columns.filter((col) =>
        formatFieldName(col.field).toLowerCase().includes(query),
      );
      result.set(group.name, filtered);
    });

    return result;
  }, [searchQuery, dynamicGroupColumns, dynamicGroups]);

  // Check if all groups are currently expanded
  const allGroupIds = useMemo(() => {
    const staticGroups = filteredGroups.map((group) => group.header);
    const dynamicGroupIds: string[] = [];
    dynamicGroups.forEach((group) => {
      const columns = filteredDynamicGroupColumns.get(group.name) || [];
      if (columns.length > 0) {
        dynamicGroupIds.push(group.name);
      }
    });
    return [...staticGroups, ...dynamicGroupIds];
  }, [filteredGroups, filteredDynamicGroupColumns, dynamicGroups]);

  const allExpanded = useMemo(() => {
    return allGroupIds.length > 0 && allGroupIds.every((id) => expandedItems.includes(id));
  }, [expandedItems, allGroupIds]);

  const handleToggleExpandCollapse = () => {
    if (allExpanded) {
      handleCollapseAll();
    } else {
      handleExpandAll();
    }
  };

  // Check if all columns in a group are visible
  const isGroupVisible = (columns: string[]): boolean => {
    return columns.every((col) => columnVisibilityModel[col] !== false);
  };

  // Check if some but not all columns in a group are visible
  const isGroupIndeterminate = (columns: string[]): boolean => {
    const visibleCount = columns.filter((col) => columnVisibilityModel[col] !== false).length;
    return visibleCount > 0 && visibleCount < columns.length;
  };

  // Calculate total column stats
  const totalColumns = useMemo(() => {
    const staticColumns = columnGroups.reduce((sum, group) => sum + group.columns.length, 0);
    let dynamicColumnsCount = 0;
    dynamicGroupColumns.forEach((columns) => {
      dynamicColumnsCount += columns.length;
    });
    return staticColumns + dynamicColumnsCount;
  }, [columnGroups, dynamicGroupColumns]);

  const visibleColumns = useMemo(() => {
    let count = 0;
    columnGroups.forEach((group) => {
      count += group.columns.filter((col) => columnVisibilityModel[col] !== false).length;
    });
    dynamicGroupColumns.forEach((columns) => {
      count += columns.filter((col) => columnVisibilityModel[col.field] !== false).length;
    });
    return count;
  }, [columnVisibilityModel, columnGroups, dynamicGroupColumns]);

  // Calculate search match count
  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    let count = filteredGroups.reduce((sum, group) => sum + group.columns.length, 0);
    filteredDynamicGroupColumns.forEach((columns) => {
      count += columns.length;
    });
    return count;
  }, [searchQuery, filteredGroups, filteredDynamicGroupColumns]);

  return (
    <Box
      sx={{
        p: 1.5,
        width: 320,
        maxHeight: 600,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header with column count */}
      <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontSize: '0.9375rem', fontWeight: 600 }}>
          Show Columns
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip
            label={`${visibleColumns} of ${totalColumns}`}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.6875rem',
              fontWeight: 500,
            }}
          />
        </Box>
      </Box>

      {/* Search input */}
      <Stack direction={'row'} spacing={0.5} sx={{ alignItems: 'center', pb: 1 }}>
        <TextField
          size="small"
          placeholder="Search columns..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          inputRef={searchInputRef}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },

          }}
          sx={{ flex: 1 }}
        />

        <Tooltip title={allExpanded ? 'Collapse All' : 'Expand All'} arrow>
          <IconButton
            size="small"
            data-testid={allExpanded ? 'collapse-all' : 'expand-all'}
            onClick={handleToggleExpandCollapse}
            sx={{
              color: 'primary.main',
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            }}
          >
            {allExpanded ? <UnfoldLessIcon fontSize="small" /> : <UnfoldMoreIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Search results count */}
      {searchQuery.trim() && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          {matchCount === 0 ? 'No columns found' : `${matchCount} column${matchCount === 1 ? '' : 's'} found`}
        </Typography>
      )}

      <Divider sx={{ mb: 1.5 }} />

      {/* TreeView with column groups */}
      <Box sx={{ overflowY: 'auto', flex: 1 }}>
        {matchCount === 0 && searchQuery.trim() ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No columns match your search
          </Typography>
        ) : (
          <SimpleTreeView
            expandedItems={expandedItems}
            onExpandedItemsChange={(_event, itemIds) => setExpandedItems(itemIds)}
            sx={{
              '& .MuiTreeItem-content': {
                padding: '2px 4px 2px 0',
                borderRadius: 1,
                minHeight: '32px',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
                '&.Mui-selected': {
                  backgroundColor: 'transparent',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                },
              },
              '& .MuiTreeItem-iconContainer': {
                width: '20px',
                marginRight: '4px',
                '& svg': {
                  fontSize: '1.25rem',
                },
              },
              '& .MuiTreeItem-group': {
                marginLeft: 0,
                paddingLeft: '36px',
              },
            }}
          >
            {filteredGroups.map((group) => {
              const groupVisible = isGroupVisible(group.columns);
              const groupIndeterminate = isGroupIndeterminate(group.columns);

              return (
                <TreeItem
                  key={group.header}
                  itemId={group.header}
                  onKeyDown={(e) => {
                    if (e.code === 'Space') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleToggleAll(group.columns, !groupVisible);
                    }
                  }}
                  label={
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleAll(group.columns, !groupVisible);
                      }}
                    >
                      <Checkbox
                        checked={groupVisible}
                        indeterminate={groupIndeterminate}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleAll(group.columns, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        sx={{
                          p: 0.5,
                          mr: 0.5,
                          '& .MuiSvgIcon-root': {
                            fontSize: '1.25rem'
                          }
                        }}
                      />
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.8125rem',
                          color: 'text.primary',
                          flex: 1,
                          userSelect: 'none',
                        }}
                      >
                        {group.header}
                      </Typography>
                    </Box>
                  }
                >
                  {group.columns.map((field) => (
                    <TreeItem
                      key={`${group.header}-${field}`}
                      itemId={`${group.header}-${field}`}
                      onKeyDown={(e) => {
                        if (e.code === 'Space') {
                          e.preventDefault();
                          e.stopPropagation();
                          handleToggleColumn(field);
                        }
                      }}
                      label={
                        <Box sx={{ pl: 2 }}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={columnVisibilityModel[field] !== false}
                                onChange={() => handleToggleColumn(field)}
                                onClick={(e) => e.stopPropagation()}
                                sx={{
                                  p: 0.5,
                                  '& .MuiSvgIcon-root': {
                                    fontSize: '1.25rem'
                                  }
                                }}
                              />
                            }
                            label={formatFieldName(field)}
                            sx={{
                              width: '100%',
                              ml: 0,
                              mr: 0,
                              '& .MuiFormControlLabel-label': {
                                fontSize: '0.8125rem',
                              },
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Box>
                      }
                    />
                  ))}
                </TreeItem>
              );
            })}

            {/* Dynamic columns (Labels.*, Values.*, Parameters.*, etc.) */}
            {dynamicGroups.map((dynamicGroup) => {
              const groupColumns = filteredDynamicGroupColumns.get(dynamicGroup.name) || [];
              if (groupColumns.length === 0) return null;

              return (
                <TreeItem
                  key={dynamicGroup.name}
                  itemId={dynamicGroup.name}
                  onKeyDown={(e) => {
                    if (e.code === 'Space') {
                      e.preventDefault();
                      e.stopPropagation();
                      const fields = groupColumns.map((col) => col.field);
                      handleToggleAll(fields, !isGroupVisible(fields));
                    }
                  }}
                  label={
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const fields = groupColumns.map((col) => col.field);
                        handleToggleAll(fields, !isGroupVisible(fields));
                      }}
                    >
                      <Checkbox
                        checked={isGroupVisible(groupColumns.map((col) => col.field))}
                        indeterminate={isGroupIndeterminate(groupColumns.map((col) => col.field))}
                        onChange={(e) => {
                          e.stopPropagation();
                          const fields = groupColumns.map((col) => col.field);
                          handleToggleAll(fields, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        sx={{
                          p: 0.5,
                          mr: 0.5,
                          '& .MuiSvgIcon-root': {
                            fontSize: '1.25rem',
                          },
                        }}
                      />
                      <Typography
                        variant='subtitle2'
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.8125rem',
                          color: 'text.primary',
                          flex: 1,
                          userSelect: 'none',
                        }}
                      >
                        {dynamicGroup.name}
                      </Typography>
                    </Box>
                  }
                >
                  {groupColumns.map((col) => (
                    <TreeItem
                      key={col.field}
                      itemId={col.field}
                      onKeyDown={(e) => {
                        if (e.code === 'Space') {
                          e.preventDefault();
                          e.stopPropagation();
                          handleToggleColumn(col.field);
                        }
                      }}
                      label={
                        <Box sx={{ pl: 2 }}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={columnVisibilityModel[col.field] !== false}
                                onChange={() => handleToggleColumn(col.field)}
                                onClick={(e) => e.stopPropagation()}
                                sx={{
                                  p: 0.5,
                                  '& .MuiSvgIcon-root': {
                                    fontSize: '1.25rem',
                                  },
                                }}
                              />
                            }
                            label={formatFieldName(col.field)}
                            sx={{
                              width: '100%',
                              ml: 0,
                              mr: 0,
                              '& .MuiFormControlLabel-label': {
                                fontSize: '0.8125rem',
                              },
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Box>
                      }
                    />
                  ))}
                </TreeItem>
              );
            })}
          </SimpleTreeView>
        )}
      </Box>
    </Box>
  );
};
