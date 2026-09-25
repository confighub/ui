// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import React from 'react';
import { Section } from '@/components/styled';
import { UnitDataGrid } from '@/components/unit-data-grid/UnitDataGrid';
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import { Direction } from '@/types/enums';

export interface IUnitDataGridTabProps {
  units: ExtendedUnitRead[];
  isLoading: boolean;
  isVisible: boolean;
  defaultRowSelection?: number;
  onRowSelectionChange: (selectedIds: string[]) => void;
  onRowItemEdit: (id: string) => void;
  disableToolbar: boolean;
  selectedUnitIds?: string[];
  filterElement?: React.ReactNode;
  customToolbarActions?: React.ReactNode;
  noRowsOverlay?: React.ReactNode;
}

export const UnitDataGridTab = ({
  units,
  isLoading,
  isVisible,
  defaultRowSelection,
  onRowSelectionChange,
  onRowItemEdit,
  disableToolbar,
  selectedUnitIds = [],
  filterElement,
  customToolbarActions,
  noRowsOverlay,
}: IUnitDataGridTabProps) => {
  return (
    <Section $display={isVisible} $direction={Direction.FadeIn} $width='100%'>
      <UnitDataGrid
        units={units}
        isLoading={isLoading}
        onRowSelectionChange={onRowSelectionChange}
        defaultRowSelection={defaultRowSelection}
        onRowItemEdit={onRowItemEdit}
        disableToolbar={disableToolbar}
        selectedUnitIds={selectedUnitIds}
        filterElement={filterElement}
        customToolbarActions={customToolbarActions}
        noRowsOverlay={noRowsOverlay}
      />
    </Section>
  );
};
