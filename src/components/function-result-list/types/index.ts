// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { FunctionResultItem, OUTPUT_TYPES } from '@/types';

export type ViewMode = 'table' | 'code';

export type OutputType = (typeof OUTPUT_TYPES)[keyof typeof OUTPUT_TYPES];

export const VIEW_MODES = {
  TABLE: 'table',
  CODE: 'code'
}

export interface IFunctionResultListProps {
  items: FunctionResultItem[];
  isValidating?: boolean;
  isMutating?: boolean;
  isLoading?: boolean;
  treeViewTitle?: string;
  showExpandAll?: boolean;
  containerHeight?: number | string;
  mainSectionHeight?: number | string;
  outputType?: OutputType;
  /** Callback fired when row selection changes in validation mode, receives array of selected unit IDs */
  onSelectionChange?: (selectedUnitIds: string[]) => void;
  /** Unit IDs to be pre-selected when the code view renders */
  defaultSelectedUnitIds?: string[];
}