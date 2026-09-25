// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  FunctionSignature,
  useListAllBridgeWorkersQuery,
  useListBridgeWorkerFunctionsQuery,
  useListOrgFunctionsQuery,
} from '@confighub/rtk-query';

import {
  FILTER_OPTIONS,
  FilterType,
  ProcessedFunction,
  ToolchainFilterType,
  VIEW_OPTIONS,
  filterAndSearchFunctions,
  processFunctions,
} from '../utils/function-browser-utils';

/**
 * Hook for managing worker selection and initialization
 */
export const useWorkerSelection = () => {
  const [workerId, setWorkerId] = useState('');
  const [workerSpaceID, setWorkerSpaceId] = useState('');

  const { workers, isLoading: isLoadingWorkers } = useListAllBridgeWorkersQuery(
    {},
    {
      selectFromResult: ({ data, isLoading }) => ({
        workers: data?.map((worker) => worker.BridgeWorker).filter(Boolean) || [],
        isLoading,
      }),
    },
  );

  useEffect(() => {
    // Initialize workerId with the first available worker if not set
    if (workerId && workers.length > 0) {
      setWorkerSpaceId(
        workers?.find((worker) => worker?.BridgeWorkerID === workerId)?.SpaceID || '',
      );
    }
  }, [workerId]);

  return {
    workerId,
    workers,
    workerSpaceID,
    isLoadingWorkers,
    setWorkerId,
  };
};

/**
 * Hook for managing function data and processing
 */
export const useFunctionBrowserData = (spaceId: string, workerId: string) => {
  const { data: functions = {}, isLoading: isLoadingFunctions } = useListOrgFunctionsQuery({});

  const { data: workerFunctions = [] } = useListBridgeWorkerFunctionsQuery(
    {
      spaceId,
      bridgeWorkerId: workerId,
    },
    {
      skip: !workerId, // Skip query if no workerId selected
    },
  );

  const processedFunctions = useMemo(
    // @ts-expect-error TODO: Same shape
    () => processFunctions(workerId ? workerFunctions : functions),
    [functions, workerFunctions, workerId], // Add workerId to dependencies
  );

  return {
    functions,
    processedFunctions,
    isLoadingFunctions,
  };
};

/**
 * Hook for managing filters and search
 */
export const useFiltersAndSearch = (functions: ProcessedFunction[]) => {
  const [selectedFilter, setSelectedFilter] = useState<FilterType>(FILTER_OPTIONS.All);
  const [selectedToolchain, setSelectedToolchain] = useState<ToolchainFilterType>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFunctions = useMemo(
    () => filterAndSearchFunctions(functions, selectedFilter, selectedToolchain, searchQuery),
    [functions, selectedFilter, selectedToolchain, searchQuery],
  );

  const clearFilters = useCallback(() => {
    setSelectedFilter(FILTER_OPTIONS.All);
    setSelectedToolchain('All');
    setSearchQuery('');
  }, []);

  return {
    selectedFilter,
    setSelectedFilter,
    selectedToolchain,
    setSelectedToolchain,
    searchQuery,
    setSearchQuery,
    filteredFunctions,
    clearFilters,
  };
};

/**
 * Hook for handling function interactions
 */
export const useFunctionInteractions = () => {
  const [selectedFunction, setSelectedFunction] = useState<ProcessedFunction>(
    {} as ProcessedFunction,
  );
  const handleViewDetails = useCallback((func: ProcessedFunction) => {
    setSelectedFunction(func);
  }, []);

  const handleFunctionSelect = useCallback((func: FunctionSignature) => {
    // TODO: Handle function selection logic
    console.log('Function selected:', func.FunctionName);
  }, []);

  return {
    handleViewDetails,
    handleFunctionSelect,
    selectedFunction,
  };
};

/**
 * Main hook that combines all function browser logic
 */
export const useFunctionBrowser = () => {
  const [selectedView, setSelectedView] = useState<string>(VIEW_OPTIONS.Grid);

  const workerHook = useWorkerSelection();
  const functionHook = useFunctionBrowserData(workerHook.workerSpaceID, workerHook.workerId); // Pass workerId
  const filterHook = useFiltersAndSearch(functionHook.processedFunctions);

  const interactionHook = useFunctionInteractions();

  const isLoading = functionHook.isLoadingFunctions || workerHook.isLoadingWorkers;

  return {
    // Worker management
    ...workerHook,

    // Function data
    ...functionHook,

    // Filters and search
    ...filterHook,

    // Interactions
    ...interactionHook,

    // Loading state
    isLoading,

    selectedView,
    setSelectedView,
  };
};
