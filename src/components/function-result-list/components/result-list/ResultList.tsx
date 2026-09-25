// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useState } from 'react';

import { Ellipses, TruncatedTooltip } from '@/components/styled';
import { FunctionResultItem } from '@/types';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const SIDEBAR_WIDTH = 400;

export interface IResultListProps {
  items: FunctionResultItem[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  title?: string;
  /** Callback fired when checkbox selection changes, receives array of selected unit IDs */
  onSelectionChange?: (selectedUnitIds: string[]) => void;
  /** Unit IDs to be pre-selected when the component mounts */
  defaultSelectedUnitIds?: string[];
}

export const ResultList = ({
  items,
  selectedIndex,
  onSelectIndex,
  title,
  onSelectionChange,
  defaultSelectedUnitIds,
}: IResultListProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(defaultSelectedUnitIds ?? []),
  );

  const handleCheckboxToggle = useCallback(
    (itemId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      setSelectedIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(itemId)) {
          newSet.delete(itemId);
        } else {
          newSet.add(itemId);
        }
        if (onSelectionChange) {
          onSelectionChange(Array.from(newSet));
        }
        return newSet;
      });
    },
    [onSelectionChange],
  );

  const handleSelectAll = useCallback(() => {
    const allIds = items.map((item) => item.id).filter((id): id is string => !!id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

    if (allSelected) {
      setSelectedIds(new Set());
      if (onSelectionChange) {
        onSelectionChange([]);
      }
    } else {
      const newSet = new Set(allIds);
      setSelectedIds(newSet);
      if (onSelectionChange) {
        onSelectionChange(allIds);
      }
    }
  }, [items, selectedIds, onSelectionChange]);

  const allIds = items.map((item) => item.id).filter((id): id is string => !!id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = allIds.some((id) => selectedIds.has(id));

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        borderRight: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      {title && (
        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
          <Stack direction='row' alignItems='center' justifyContent='space-between'>
            <Typography variant='subtitle1' fontWeight='medium'>
              {title}
            </Typography>
            {onSelectionChange && (
              <Checkbox
                data-testid='select-all-units-checkbox'
                size='small'
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onChange={handleSelectAll}
                sx={{ p: 0 }}
              />
            )}
          </Stack>
        </Box>
      )}
      <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
        {items.map((item, index) => {
          const isActive = selectedIndex === index;
          const itemId = item?.id || index.toString();
          const isChecked = selectedIds.has(itemId);

          return (
            <ListItem
              key={itemId}
              sx={{
                backgroundColor: isActive ? 'action.selected' : 'transparent',
                borderLeft: '3px solid',
                borderLeftColor: isActive ? 'primary.main' : 'transparent',
              }}
              secondaryAction={
                onSelectionChange && (
                  <Checkbox
                    data-testid={`select-unit-checkbox-${itemId}`}
                    edge='end'
                    onClick={(e) => handleCheckboxToggle(itemId, e)}
                    checked={isChecked}
                    size='small'
                  />
                )
              }
            >
              <ListItemButton
                onClick={() => onSelectIndex(index)}
                dense
                sx={{ py: 0.5, px: 1 }}
              >
                <ListItemText
                  primary={
                    <Stack direction='column' spacing={0.25}>
                      <TruncatedTooltip title={item?.name ?? ''}>
                        <Ellipses variant='body2' fontWeight={isActive ? 600 : 400}>
                          {item?.name}
                        </Ellipses>
                      </TruncatedTooltip>
                      <Stack direction='row' spacing={0.5} alignItems='center'>
                        <TruncatedTooltip title={item?.spaceName ?? ''}>
                          <Ellipses variant='caption' color='text.secondary'>
                            {item?.spaceName}
                          </Ellipses>
                        </TruncatedTooltip>
                      </Stack>
                    </Stack>
                  }
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
};
