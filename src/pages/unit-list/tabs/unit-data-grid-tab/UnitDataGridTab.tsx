// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import React from 'react';
import { Section } from '@/components/styled';
import { UnitDataGrid } from '@/components/unit-data-grid/UnitDataGrid';
import type { UnitRowItem } from '@/components/unit-data-grid/utils/data-grid-helpers';
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import { Direction } from '@/types/enums';

export interface IUnitDataGridTabProps {
  units: ExtendedUnitRead[];
  isLoading: boolean;
  isVisible: boolean;
  defaultRowSelection?: number;
  onRowSelectionChange: (selectedIds: string[]) => void;
  onRowItemEdit: (id: string) => void;
  selectedUnitIds?: string[];
  filterElement?: React.ReactNode;
  customToolbarActions?: React.ReactNode;
  noRowsOverlay?: React.ReactNode;
  /** Where a unit's name links. Defaults to the unit's page. */
  slugLinkTo?: (row: UnitRowItem) => string;
}

export const UnitDataGridTab = ({
  units,
  isLoading,
  isVisible,
  defaultRowSelection,
  onRowSelectionChange,
  onRowItemEdit,
  selectedUnitIds = [],
  filterElement,
  customToolbarActions,
  noRowsOverlay,
  slugLinkTo,
}: IUnitDataGridTabProps) => {
  return (
    <Section $display={isVisible} $direction={Direction.FadeIn} $width='100%'>
      <UnitDataGrid
        units={units}
        isLoading={isLoading}
        onRowSelectionChange={onRowSelectionChange}
        defaultRowSelection={defaultRowSelection}
        onRowItemEdit={onRowItemEdit}
        selectedUnitIds={selectedUnitIds}
        filterElement={filterElement}
        customToolbarActions={customToolbarActions}
        noRowsOverlay={noRowsOverlay}
        slugLinkTo={slugLinkTo}
      />
    </Section>
  );
};
