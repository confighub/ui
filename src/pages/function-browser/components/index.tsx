// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useMemo } from 'react';

import { FunctionSignature } from '@confighub/rtk-query';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import { ChipProps } from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid2';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { Theme } from '@mui/material/styles';

import {
  FILTER_OPTIONS,
  FilterType,
  ProcessedFunction,
  TOOLCHAIN_FILTER_TYPES,
  ToolchainFilterType,
  VIEW_OPTIONS,
} from '../utils/function-browser-utils';

// Utility function to highlight matching text
const highlightText = (text: string, searchQuery: string) => {
  if (!searchQuery.trim()) return text;

  const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (regex.test(part)) {
      return (
        <Box
          key={index}
          component='span'
          sx={{
            backgroundColor: 'warning.light',
            color: 'warning.contrastText',
            fontWeight: 'bold',
            px: 0.5,
            borderRadius: 0.5,
          }}
        >
          {part}
        </Box>
      );
    }
    return part;
  });
};

export interface FunctionCardProps {
  func: ProcessedFunction;
  resourceTypes: string[];
  searchQuery?: string;
  onViewDetails?: (func: ProcessedFunction) => void;
}

const RESOURCE_TYPE_MAP = {
  AppConfig: 'AppConfig',
  Kubernetes: 'Kubernetes',
} as const;

const PROPERTY_CHIP_CONFIG = {
  Validating: { label: 'Validating', color: 'success' as const },
  Mutating: { label: 'Mutating', color: 'primary' as const },
  Idempotent: { label: 'Idempotent', color: 'info' as const },
} as const;

export const getPimaryPropertyChip = (func: FunctionSignature) => {
  const properties = [];
  let primaryColor = null;

  // Collect all applicable properties in priority order
  if (func.Validating) {
    properties.push(PROPERTY_CHIP_CONFIG.Validating.label);
    if (!primaryColor) primaryColor = PROPERTY_CHIP_CONFIG.Validating.color;
  }
  if (func.Mutating) {
    properties.push(PROPERTY_CHIP_CONFIG.Mutating.label);
    if (!primaryColor) primaryColor = PROPERTY_CHIP_CONFIG.Mutating.color;
  }
  if (func.Idempotent) {
    properties.push(PROPERTY_CHIP_CONFIG.Idempotent.label);
    if (!primaryColor) primaryColor = PROPERTY_CHIP_CONFIG.Idempotent.color;
  }

  // Return original type structure with aggregated label and first property's color
  return properties.length > 0 ? { label: properties.join(' / '), color: primaryColor } : null;
};

export const getResourceTypeLabel = (resourceTypes: string[] = []) => {
  const extractedTypes = resourceTypes
    .map((type) => {
      for (const [key, value] of Object.entries(RESOURCE_TYPE_MAP)) {
        if (type.includes(key)) return value;
      }
      return type;
    })
    .filter((type, index, array) => array.indexOf(type) === index); // Remove duplicates

  return extractedTypes.join('/');
};

const useParameterLabel = (requiredParams: number) => {
  return useMemo(() => {
    const paramText = requiredParams === 1 ? 'param' : 'params';
    return `${requiredParams} required ${paramText}`;
  }, [requiredParams]);
};

export const FunctionHeader = memo(
  ({
    functionName,
    primaryChip,
    searchQuery,
  }: {
    functionName: string;
    primaryChip: { label: string; color: ChipProps['color'] } | null;
    searchQuery?: string;
  }) => (
    <Stack
      spacing={2}
      direction='row'
      sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
    >
      <Typography variant='h6' component='h3' gutterBottom sx={{ fontWeight: 600 }}>
        {searchQuery ? highlightText(functionName, searchQuery) : functionName}
      </Typography>
      {primaryChip && (
        <Chip
          label={primaryChip.label}
          color={primaryChip.color}
          size='small'
          sx={{ flexShrink: 0 }}
        />
      )}
    </Stack>
  ),
);

export const FunctionDescription = memo(
  ({ description, searchQuery }: { description?: string; searchQuery?: string }) => (
    <Typography
      variant='body2'
      color='text.secondary'
      sx={{
        mt: 1,
        mb: 2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        minHeight: '2.5em',
      }}
    >
      {description
        ? searchQuery
          ? highlightText(description, searchQuery)
          : description
        : 'No description available'}
    </Typography>
  ),
);

export const FunctionMetadata = memo(
  ({
    resourceTypeLabel,
    parameterLabel,
  }: {
    resourceTypeLabel: string;
    parameterLabel: string;
  }) => (
    <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
      <Chip
        size='small'
        label={resourceTypeLabel}
        variant='outlined'
        sx={{ fontSize: '0.75rem' }}
      />
      <Chip
        size='small'
        label={parameterLabel}
        variant='outlined'
        sx={{ fontSize: '0.75rem' }}
      />
    </Stack>
  ),
);

// Main component
export const FunctionCard = memo<FunctionCardProps>(
  ({ func, resourceTypes, searchQuery, onViewDetails }) => {
    // Custom hooks
    const primaryChip = getPimaryPropertyChip(func);
    const resourceTypeLabel = getResourceTypeLabel(resourceTypes);
    const parameterLabel = useParameterLabel(func.RequiredParameters ?? 0);

    // Memoized event handler
    const handleViewDetails = useCallback(() => {
      onViewDetails?.(func);
    }, [func, onViewDetails]);

    const handleCardClick = useCallback(() => {
      onViewDetails?.(func);
    }, [func, onViewDetails]);

    // Memoized styles
    const cardStyles = useMemo(
      () => ({
        height: '100%',
        display: 'flex',
        flexDirection: 'column' as const,
        border: '1px solid #ccc',
        boxShadow: 'none',
        backgroundColor: 'white',
        borderRadius: 2,
        p: 1,
        cursor: 'pointer',
        '&:hover': {
          borderColor: (theme: Theme) => theme.palette.primary.main,
          boxShadow: '0px 2px 8px rgba(0,0,0,0.1)',
        },
      }),
      [],
    );

    return (
      <Card
        data-testid={`${func.FunctionName}-card`}
        sx={cardStyles}
        onClick={handleCardClick}
      >
        <CardContent sx={{ p: 1, flexGrow: 1 }}>
          <FunctionHeader
            functionName={func.FunctionName ?? 'Unknown Function'}
            // @ts-expect-error: TODO: Fix type for primaryChip
            primaryChip={primaryChip}
            searchQuery={searchQuery}
          />
          <FunctionDescription description={func.Description} searchQuery={searchQuery} />
        </CardContent>

        <CardActions sx={{ justifyContent: 'space-between', pt: 0 }}>
          <FunctionMetadata
            resourceTypeLabel={resourceTypeLabel}
            parameterLabel={parameterLabel}
          />
          <Button
            startIcon={<ArrowForwardIcon />}
            size='small'
            variant='text'
            onClick={handleViewDetails}
            sx={{ flexShrink: 0, ml: 1 }}
          >
            View Details
          </Button>
        </CardActions>
      </Card>
    );
  },
);
// Filter options for the autocomplete
interface FilterOption {
  label: string;
  value: FilterType;
}

const FILTER_OPTIONS_LIST: FilterOption[] = [
  { label: 'All', value: FILTER_OPTIONS.All },
  { label: 'Non Mutating', value: FILTER_OPTIONS.Non_Mutating },
  { label: 'Mutating', value: FILTER_OPTIONS.Mutating },
  { label: 'Non Validating', value: FILTER_OPTIONS.Non_Validating },
  { label: 'Validating', value: FILTER_OPTIONS.Validating },
];

// Extracted components for better organization
export const FilterAutocomplete = memo(
  ({
    selectedFilter,
    onFilterChange,
  }: {
    selectedFilter: FilterType;
    onFilterChange: (filter: FilterType) => void;
  }) => {
    const selectedOption = FILTER_OPTIONS_LIST.find(
      (option) => option.value === selectedFilter,
    );

    return (
      <Autocomplete
        value={selectedOption ?? FILTER_OPTIONS_LIST[0]}
        onChange={(_, newValue) => {
          if (newValue) {
            onFilterChange(newValue.value);
          }
        }}
        options={FILTER_OPTIONS_LIST}
        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(option, value) => option.value === value.value}
        disableClearable
        size='small'
        sx={{
          '& .MuiInputBase-root': {
            height: '36px',
          },
          minWidth: 200,
        }}
        renderInput={(params) => <TextField {...params} label='Filter' />}
      />
    );
  },
);

export const FunctionStats = memo(
  ({ filteredCount, totalCount }: { filteredCount: number; totalCount: number }) => (
    <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
      Showing {filteredCount} of {totalCount} functions
    </Typography>
  ),
);

export const FunctionViewToggle = memo(
  ({
    selectedView,
    setSelectedView,
  }: {
    selectedView: string;
    setSelectedView: (view: string) => void;
  }) => (
    <ToggleButtonGroup
      size='small'
      orientation='horizontal'
      value={selectedView}
      exclusive
      onChange={(_: React.MouseEvent<HTMLElement>, nextView: string) => {
        setSelectedView(nextView);
      }}
    >
      <ToggleButton data-testid='table-toggle' value={VIEW_OPTIONS.List} aria-label='table'>
        <TableRowsIcon />
      </ToggleButton>
      <ToggleButton data-testid='grid-toggle' value={VIEW_OPTIONS.Grid} aria-label='card'>
        <ViewModuleIcon />
      </ToggleButton>
    </ToggleButtonGroup>
  ),
);

export const EmptyState = memo(() => (
  <Grid size={{ xs: 12 }}>
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <Typography variant='h6' color='text.secondary' gutterBottom>
        No functions found
      </Typography>
      <Typography variant='body2' color='text.secondary'>
        Try adjusting your search or filter criteria
      </Typography>
    </Box>
  </Grid>
));

export const ToolchainTypeSelector = memo<{
  value: ToolchainFilterType;
  onChange: (toolchainType: ToolchainFilterType) => void;
}>(({ value, onChange }) => (
  <FormControl sx={{ minWidth: 240 }} fullWidth size='small'>
    <InputLabel id={`toolchaing-type-select-label`}>Toolchain Type</InputLabel>
    <Select
      labelId={`toolchaing-type-select-label`}
      value={value}
      onChange={(event: SelectChangeEvent<string>) => {
        onChange(event.target.value as ToolchainFilterType);
      }}
      input={<OutlinedInput label={'Toolchain Type'} />}
      size='small'
      sx={{
        height: '36px',
      }}
      renderValue={(selected) => TOOLCHAIN_FILTER_TYPES?.find((type) => type === selected)}
    >
      {TOOLCHAIN_FILTER_TYPES?.map((type) => (
        <MenuItem key={type} value={type}>
          <Checkbox checked={value === type} />
          <ListItemText primary={type} />
        </MenuItem>
      ))}
    </Select>
  </FormControl>
));

const LoadingState = memo(() => (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
    <CircularProgress />
  </Box>
));

// Updated FunctionGrid component
export const FunctionGrid = memo(
  ({
    functions,
    onViewDetails,
    searchQuery = '',
  }: {
    functions: ProcessedFunction[];
    searchQuery?: string;
    onViewDetails: (func: ProcessedFunction) => void;
  }) => (
    <Grid container spacing={2} sx={{ mt: 1, mb: 2 }}>
      {functions.map((func, index) => (
        <Grid key={`${func.FunctionName}-${index}`} size={{ xs: 4 }} sx={{ mb: 2 }}>
          <FunctionCard
            func={func}
            resourceTypes={func.resourceTypes}
            onViewDetails={onViewDetails}
            searchQuery={searchQuery}
          />
        </Grid>
      ))}
    </Grid>
  ),
);

FunctionStats.displayName = 'FunctionStats';
FunctionStats.displayName = 'FunctionStats';
EmptyState.displayName = 'EmptyState';
LoadingState.displayName = 'LoadingState';
FunctionGrid.displayName = 'FunctionGrid';
FilterAutocomplete.displayName = 'FilterAutocomplete';
FunctionHeader.displayName = 'FunctionHeader';
FunctionDescription.displayName = 'FunctionDescription';
FunctionMetadata.displayName = 'FunctionMetadata';
FunctionCard.displayName = 'FunctionCard';
FunctionViewToggle.displayName = 'FunctionViewToggle';
ToolchainTypeSelector.displayName = 'ToolchainTypeSelector';
