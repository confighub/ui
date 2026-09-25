// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { Main } from '@/components/styled';
import { Section } from '@/components/styled';
import {
  type ChangeSetRead,
  type UnitRead,
  useLazyListExtendedRevisionsQuery,
  useListAllRevisionsQuery,
} from '@confighub/rtk-query';
import { type RevisionRow } from '@/types';
import { Direction } from '@/types/enums';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

import { RevisionListTable } from './components/RevisionListTable';

export interface IRevisionsTabProps {
  isVisible: boolean;
  changeSet: ChangeSetRead;
  setErrorMessage?: (messages: string[]) => void;
}

export const RevisionsTab = ({
  isVisible,
  changeSet,
  setErrorMessage,
}: IRevisionsTabProps) => {
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const changeSetID = changeSet?.ChangeSetID || '';

  // First, fetch initial revisions to get unique units in this changeset
  const { data: initialRevisionsData = [], refetch: refetchRevisions } =
    useListAllRevisionsQuery(
      {
        where: `ChangeSetID = '${changeSetID}'`,
        include: 'UserID,UnitID,Tags',
      },
      {
        skip: !changeSetID,
      },
    );

  // Lazy query to fetch revisions for a specific unit
  const [fetchUnitRevisions] = useLazyListExtendedRevisionsQuery();

  // Fetch all revisions for each unit when initial data changes
  useEffect(() => {
    const fetchAllRevisions = async () => {
      if (initialRevisionsData.length === 0 || !changeSetID) {
        setRevisions([]);
        return;
      }

      setIsLoadingRevisions(true);

      try {
        // Get unique units from the initial revisions
        const uniqueUnits = new Map<string, UnitRead>();

        initialRevisionsData.forEach((extendedRevision) => {
          const unit = extendedRevision.Unit;

          if (!unit) return;

          const unitId = unit.UnitID || '';

          if (unitId && !uniqueUnits.has(unitId)) {
            uniqueUnits.set(unitId, unit);
          }
        });

        // Fetch all revisions for each unit filtered by changeset
        const allRevisionsPromises = Array.from(uniqueUnits.values()).map((unit) =>
          fetchUnitRevisions({
            spaceId: unit.SpaceID || '',
            unitId: unit.UnitID || '',
            where: `ChangeSetID = '${changeSetID}'`,
            include: 'UserID,UnitID,Tags',
          }).unwrap(),
        );

        const allRevisionsResults = await Promise.all(allRevisionsPromises);

        // Flatten and transform all revisions into RevisionRow format
        const allRows: RevisionRow[] = allRevisionsResults.flat().map((extendedRevision) => {
          const revision = extendedRevision.Revision;
          return {
            id: revision?.RevisionID || '',
            RevisionNum: revision?.RevisionNum || 0,
            ...extendedRevision,
          };
        });

        setRevisions(allRows);
      } catch (error) {
        console.error('Failed to fetch revisions:', error);
        setRevisions([]);
      } finally {
        setIsLoadingRevisions(false);
      }
    };

    fetchAllRevisions();
  }, [changeSetID, initialRevisionsData]);

  return (
    <Section $display={isVisible} $direction={Direction.FadeIn} sx={{ height: '100%' }}>
      <Main>
        {isLoadingRevisions ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
            <Typography variant='body2' color='text.secondary' sx={{ mt: 2 }}>
              Loading revisions...
            </Typography>
          </Box>
        ) : revisions.length > 0 ? (
          <RevisionListTable
            rows={revisions}
            changeSet={changeSet}
            setErrorMessage={
              setErrorMessage ? (msg: string) => setErrorMessage([msg]) : undefined
            }
            onRefresh={refetchRevisions}
          />
        ) : (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant='body1' color='text.secondary'>
              No revisions found for this changeset.
            </Typography>
          </Box>
        )}
      </Main>
    </Section>
  );
};
