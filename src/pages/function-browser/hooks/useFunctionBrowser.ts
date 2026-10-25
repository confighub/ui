// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';

import {
  FunctionSignature,
  useListFunctionsQuery,
  useListOrgFunctionsQuery,
} from '@confighub/rtk-query';

import { FunctionChannelOption, useFunctionChannels } from '@/hooks/useFunctionChannels';

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
 * Hook for choosing a Channel whose served functions to browse instead of the builtin ones
 */
export const useChannelSelection = () => {
  const [channelId, setChannelId] = useState('');
  const { channels, isLoadingChannels } = useFunctionChannels();
  const channel: FunctionChannelOption | undefined = channels.find(
    (option) => option.id === channelId,
  );

  return {
    channelId,
    channels,
    channelSpaceId: channel?.spaceId ?? '',
    isLoadingChannels,
    setChannelId,
  };
};

/**
 * Hook for managing function data and processing: the builtin functions, or what the selected
 * Channel serves
 */
export const useFunctionBrowserData = (channelSpaceId: string, channelId: string) => {
  const { data: functions = {}, isLoading: isLoadingFunctions } = useListOrgFunctionsQuery({});

  const { data: channelFunctions = {} } = useListFunctionsQuery(
    { spaceId: channelSpaceId, entity: 'channel', id: channelId },
    { skip: !channelId || !channelSpaceId },
  );

  const processedFunctions = useMemo(
    () => processFunctions(channelId ? channelFunctions : functions),
    [functions, channelFunctions, channelId],
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

  const channelHook = useChannelSelection();
  const functionHook = useFunctionBrowserData(channelHook.channelSpaceId, channelHook.channelId);
  const filterHook = useFiltersAndSearch(functionHook.processedFunctions);

  const interactionHook = useFunctionInteractions();

  const isLoading =
    functionHook.isLoadingFunctions || channelHook.isLoadingChannels;

  return {
    // Channel management
    ...channelHook,

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
