// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { DiffTreeView } from '@/components/diff-tree-view/DiffTreeView';
import { ErrorList } from '@/components/error-list/ErrorList';
import { Header } from '@/components/header/Header';
import { MutationsTimeline } from '@/components/mutations-timeline/MutationsTimeline';
import { SettingsTabs } from '@/components/settings-tabs/SettingsTabs';
import { Section } from '@/components/styled';
import {
  useGetUserQuery,
  useListAllUnitsQuery,
  useListUsersQuery,
} from '@confighub/rtk-query';
import { Direction } from '@/types/enums';
import { calculateTotalChanges } from '@/utility/diff-methods';
import { getInitials } from '@/utility/name-format-functions';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';


const Layout = styled('div')`
  display: flex;
  flex-direction: column;
  min-width: 100%;
  height: 100%;
`;

const TabsContainer = styled('div')`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
`;

export const ChangeReviewPage = () => {
  const [selectedTab, setSelectedTab] = useState(0);
  const [searchParams] = useSearchParams();
  const unitIDs = searchParams.get('ids') ?? '';
  const userID = searchParams.get('source') ?? '';
  const [errorMessage, setErrorMessage] = useState<string[]>([]);

  const { data: allUnits = [], isLoading } = useListAllUnitsQuery({
    where: `UnitID IN (${unitIDs})`,
    include: 'SpaceID,HeadRevisionNum,LastReleasedRevisionNum',
  });
  const { data: extendedUser } = useGetUserQuery({ userId: userID });
  const user = extendedUser?.User;

  const handleErrorClose = () => setErrorMessage([]);

  // Get unique user IDs from all revisions
  const userIdsFilter = useMemo(() => {
    const ids = new Set<string>();
    allUnits.forEach((unit) => {
      if (unit.HeadRevision?.UserID) {
        ids.add(unit.HeadRevision.UserID);
      }
    });
    const idArray = Array.from(ids);
    // Create a WHERE clause for the API: UserID IN ('id1', 'id2', ...)
    return idArray.length > 0
      ? `UserID IN (${idArray.map((id) => `'${id}'`).join(', ')})`
      : undefined;
  }, [allUnits]);

  // Fetch all users that made mutations
  const { data: usersData = [] } = useListUsersQuery(
    { where: userIdsFilter || '' },
    { skip: !userIdsFilter },
  );

  const usersMap = useMemo(() => {
    const map = new Map();
    usersData.forEach(({ User: user }) => {
      if (user?.UserID) {
        map.set(user.UserID, user);
      }
    });
    return map;
  }, [usersData]);

  const mutationItems = useMemo(
    () =>
      allUnits.map((unit) => ({
        unit: unit.Unit!,
        headRevision: unit.HeadRevision!,
        lastReleasedRevision: unit.LastReleasedRevision!,
        user: unit.HeadRevision?.UserID ? usersMap.get(unit.HeadRevision.UserID) : undefined,
      })),
    [allUnits, usersMap],
  );

  const totalChanges = useMemo(() => calculateTotalChanges(allUnits), [allUnits]);

  const onTabSelected = (newValue: number) => {
    setSelectedTab(newValue);
  };

  return (
    <Layout>
      <Header
        breadCrumbs={[{ name: 'Units', link: '/units', isLink: true }, { name: 'Changes' }]}
        filters={
          <TabsContainer>
            <SettingsTabs
              tabs={['Configs changed', 'Mutations']}
              onTabSelected={onTabSelected}
              defaultValue={selectedTab}
            />
          </TabsContainer>
        }
      />
      <Container
        maxWidth='xl'
        sx={{ p: 0, paddingLeft: '0px !important', paddingRight: '0px !important' }}
      >
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Diffs Tab */}
            <Section $display={selectedTab === 0} $direction={Direction.FadeIn}>
              <DiffTreeView
                title={
                  <Box sx={{ p: 2 }}>
                    <ErrorList errors={errorMessage} onClose={handleErrorClose} />
                    <Typography variant='h4' fontWeight='bold' gutterBottom>
                      Review Changes
                    </Typography>
                    <Stack direction='row' spacing={1}>
                      <Avatar src={user?.ProfilePictureURL} sx={{ width: 24, height: 24 }}>
                        {getInitials(user?.Username || '')}
                      </Avatar>
                      <Typography variant='body2' color='text.secondary'>
                        has pending config changes on {allUnits.length} units
                      </Typography>

                      <Chip
                        label={`${totalChanges} ${totalChanges === 1 ? 'unit changed' : 'units changed'}`}
                        size='small'
                        color='primary'
                        variant='outlined'
                      />
                    </Stack>
                  </Box>
                }
                units={allUnits}
                editorOffset='300px'
                containerHeight='calc(100vh - 122px)'
              />
            </Section>

            {/* Mutations Tab */}
            <Section $display={selectedTab === 1} $direction={Direction.FadeIn}>
              <MutationsTimeline mutations={mutationItems} />
            </Section>
          </>
        )}
      </Container>
    </Layout>
  );
};

export default ChangeReviewPage;
