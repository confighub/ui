// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { MutationsTable } from '@/components/mutation-table/MutationTable';
import { Section } from '@/components/styled';
import { ExtendedUnitRead } from '@confighub/rtk-query';
import { Direction } from '@/types/enums';

export interface IMutationsTabProps {
  unitExtended: ExtendedUnitRead;
  selectedTab: number;
  onTabSelected: (newValue: number) => void;
}

export const MUTATIONS_TAB_ID = 6;

export const MutationsTab = ({
  unitExtended,
  selectedTab,
  onTabSelected,
}: IMutationsTabProps) => {
  return (
    <Section
      $display={selectedTab === MUTATIONS_TAB_ID}
      $direction={Direction.FadeIn}
      $width='100%'
    >
      {selectedTab === MUTATIONS_TAB_ID && (
        <MutationsTable onTabSelected={onTabSelected} unitExtended={unitExtended} />
      )}
    </Section>
  );
};
