// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import FilterListOffIcon from '@mui/icons-material/FilterListOff';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export interface IFilteredEmptyStateProps {
  entityName: string;
  onClearFilters: () => void;
}

export const FilteredEmptyState = ({
  entityName,
  onClearFilters,
}: IFilteredEmptyStateProps) => {
  return (
    <Box
      display='flex'
      flexDirection='column'
      justifyContent='center'
      alignItems='center'
      textAlign='center'
      gap={1}
    >
      <FilterListOffIcon
        sx={{ fontSize: 48, color: 'text.secondary' }}
      />
      <Typography variant='h6'>
        No matching {entityName}
      </Typography>
      <Typography variant='body2' color='text.secondary'>
        Try adjusting your filters or clear them to see all {entityName}.
      </Typography>
      <Button
        variant='outlined'
        color='primary'
        size='small'
        startIcon={<FilterListOffIcon />}
        onClick={onClearFilters}
      >
        Clear all filters
      </Button>
    </Box>
  );
};
