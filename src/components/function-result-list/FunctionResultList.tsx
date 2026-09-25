// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ValidationResultTable } from '@/components/validation-result-table/ValidationResultTable';
import Box from '@mui/material/Box';

import { ResultList } from './components/result-list/ResultList';
import { ResultEditorView, ResultTableView } from './components/result-views';
import { ResultsToolbar } from './components/results-toolbar/ResultsToobar';
import { useFunctionResultList } from './hooks/useFunctionResultList';
import { IFunctionResultListProps, VIEW_MODES } from './types';
import { canToggleView, isCodeOnlyType } from './utility';

const CONTENT_BACKGROUND_COLOR = 'rgb(249, 250, 251)';

export const FunctionResultList = ({
  items = [],
  isValidating = false,
  isMutating = false,
  isLoading = false,
  treeViewTitle = 'Functions',
  containerHeight = 'calc(100vh - 68px)',
  mainSectionHeight = 'calc(100vh - 200px)',
  outputType = 'YAML',
  onSelectionChange,
  defaultSelectedUnitIds,
}: IFunctionResultListProps) => {
  const {
    selectedIndex,
    setSelectedIndex,
    viewMode,
    setViewMode,
    parseAllItemsData,
    getValidationRows,
  } = useFunctionResultList({ items, isValidating, isMutating });

  if (isLoading || items.length === 0) {
    return null;
  }

  // Validation mode
  if (isValidating) {
    return (
      <Box sx={{ p: 2 }}>
        <ValidationResultTable
          rows={getValidationRows()}
          onSelectionChange={onSelectionChange}
          defaultSelectedUnitIds={defaultSelectedUnitIds}
        />
      </Box>
    );
  }

  const canToggle = canToggleView(outputType) && !isCodeOnlyType(outputType) && !isMutating;
  const showTableView = viewMode === VIEW_MODES.TABLE && !isMutating;
  const showCodeView = viewMode === VIEW_MODES.CODE || isMutating;
  const tableData = showTableView || outputType === 'YAML' ? parseAllItemsData() : [];

  // Default/mutation mode
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: viewMode === VIEW_MODES.CODE ? 'row' : 'column',
        overflow: showTableView ? 'auto' : 'hidden',
        height: containerHeight,
      }}
    >
      {viewMode === VIEW_MODES.CODE && (
        <ResultList
          items={items}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
          title={treeViewTitle}
          onSelectionChange={onSelectionChange}
          defaultSelectedUnitIds={defaultSelectedUnitIds}
        />
      )}

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: CONTENT_BACKGROUND_COLOR,
          p: 2,
        }}
      >
        <ResultsToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          canToggle={canToggle}
        />

        {showTableView && <ResultTableView outputType={outputType} data={tableData} />}

        {showCodeView && items[selectedIndex] && (
          <ResultEditorView
            item={items[selectedIndex]}
            isMutating={isMutating}
            outputType={outputType}
            allTableData={tableData}
            selectedIndex={selectedIndex}
            height={mainSectionHeight}
          />
        )}
      </Box>
    </Box>
  );
};
