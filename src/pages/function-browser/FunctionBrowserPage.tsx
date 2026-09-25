// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { QueryBox } from '@/components/query-box/QueryBox';
import { Main } from '@/components/styled';
import { WorkerSelector } from '@/components/worker-selector/WorkerSelector';
import { styled } from '@mui/material';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';

import { Header } from '../../components/header/Header';
import {
  EmptyState,
  FilterAutocomplete,
  FunctionGrid,
  FunctionStats,
  FunctionViewToggle,
  ToolchainTypeSelector,
} from './components';
import { FunctionDetailsDrawer } from './components/function-details-drawer/FunctionDetailsDrawer';
import { FunctionsTable } from './components/functions-table/FunctionsTable';
import { useFunctionBrowser } from './hooks/useFunctionBrowser';
import { ToolchainFilterType, VIEW_OPTIONS } from './utils/function-browser-utils';

const Container = styled('div')`
  width: 100%;
`;

// Main component
export const FunctionBrowserPage = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    filteredFunctions,
    processedFunctions,
    selectedView,
    selectedToolchain,
    selectedFilter,
    selectedFunction,
    workers,
    workerId,
    handleViewDetails,
    setSelectedView,
    setSearchQuery,
    searchQuery,
    setWorkerId,
    setSelectedFilter,
    setSelectedToolchain,
  } = useFunctionBrowser();

  // Event handlers
  const handleQueryApplied = (query: string) => {
    setSearchQuery(query);
  };

  return (
    <Container sx={{ color: 'text.primary' }}>
      <Header
        breadCrumbs={[
          {
            name: 'Function Browser',
            isLink: false,
          },
        ]}
        actions={
          <>
            <ToolchainTypeSelector
              value={selectedToolchain}
              onChange={(type: ToolchainFilterType) => setSelectedToolchain(type)}
            />
            <WorkerSelector
              value={workerId}
              onChange={(workerId: string) => {
                setWorkerId(workerId);
              }}
              workers={workers.filter((w): w is NonNullable<typeof w> => w !== undefined)}
            />
            <FilterAutocomplete
              selectedFilter={selectedFilter}
              onFilterChange={setSelectedFilter}
            />
          </>
        }
        filters={
          <Grid container>
            <Grid size={{ xs: 4 }}>
              <QueryBox
                placeholder='Search Functions'
                onQueryApplied={handleQueryApplied}
                onChange={handleQueryApplied}
              />
            </Grid>
            <Grid size={{ xs: 2.8 }} />
            <Grid
              size={{ xs: 5.2 }}
              sx={{ justifyContent: 'flex-end', display: 'flex' }}
            ></Grid>
          </Grid>
        }
      />
      <Main sx={{ px: 2 }}>
        <Stack
          direction='row'
          spacing={1}
          sx={{ pt: 2, pb: 2, justifyContent: 'space-between' }}
        >
          <FunctionStats
            filteredCount={filteredFunctions.length}
            totalCount={processedFunctions.length}
          />
          <FunctionViewToggle
            selectedView={selectedView}
            setSelectedView={(view) => setSelectedView(view)}
          />
        </Stack>
        <Box sx={{ minHeight: '60vh' }}>
          {filteredFunctions.length === 0 ? (
            <EmptyState />
          ) : selectedView === VIEW_OPTIONS.Grid ? (
            // And in your main FunctionBrowserPage component, update the FunctionGrid usage:
            <FunctionGrid
              functions={filteredFunctions}
              searchQuery={searchQuery}
              onViewDetails={(func) => {
                handleViewDetails(func);
                setDrawerOpen(true);
              }}
            />
          ) : (
            <FunctionsTable
              functions={filteredFunctions}
              onFunctionClick={(func) => {
                handleViewDetails(func);
                setDrawerOpen(true);
              }}
            />
          )}
        </Box>
        <FunctionDetailsDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          function={selectedFunction}
        />
      </Main>
    </Container>
  );
};

export default FunctionBrowserPage;
