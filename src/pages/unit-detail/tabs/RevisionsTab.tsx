// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Section } from '@/components/styled';
import { EmptyRevisions } from '@/pages/unit-detail/components/empty-revisions/EmptyRevisions';
import { RevisionsTable } from '@/pages/unit-detail/components/revisions-table/RevisionsTable.tsx';
import { ExtendedUnitRead, UnitRead } from '@confighub/rtk-query';
import { type RevisionRow } from '@/types';
import { Direction } from '@/types/enums';

export interface IRevisionsTabProps {
  selectedTab: number;
  revisionRows: Array<RevisionRow>;
  currentUnitExtended: ExtendedUnitRead;
  upstreamUnit?: UnitRead;
  onRevisionApplied?: () => void;
  onRefresh?: () => void;
}

export const REVISIONS_TAB_ID = 2;

/**
 * RevisionsTab is a container component that conditionally renders the 
RevisionsTable.
 * It manages the visibility of the revisions table based on the selected tab and
 * only renders content when there are revisions to display.
*/
export const RevisionsTab = ({
  selectedTab,
  revisionRows,
  currentUnitExtended,
  upstreamUnit,
  onRevisionApplied,
  onRefresh,
}: IRevisionsTabProps) => {
  return (
    <Section
      $display={selectedTab === REVISIONS_TAB_ID}
      $direction={Direction.FadeIn}
      $width='100%'
    >
      {selectedTab === REVISIONS_TAB_ID &&
        (revisionRows.length > 0 ? (
          <RevisionsTable
            rows={revisionRows}
            currentUnitExtended={currentUnitExtended}
            onRevisionApplied={onRevisionApplied}
            upstreamUnit={upstreamUnit}
            onRefresh={onRefresh}
          />
        ) : (
          <EmptyRevisions />
        ))}
    </Section>
  );
};
