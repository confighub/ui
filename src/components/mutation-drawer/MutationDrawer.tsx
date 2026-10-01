// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { usePageHeight } from '@/hooks/usePageHeight';
import { useUnitMutationSources } from '@/hooks/useUnitData';
import {
  ExtendedMutationRead,
  ExtendedUnitRead,
  ResourceMutation,
  useInvokeFunctionsMutation,
  useListExtendedMutationsQuery,
} from '@confighub/rtk-query';
import { TOP_NAV_HEIGHT } from '@/utility/constants';
import { getFilteredMutations } from '@/utility/mutation-functions';
import { Resource, convertToResourceList } from '@/utility/schema-functions';
import { cleanString } from '@/utility/string-functions';
import { isIDInvalid } from '@/utility/validation-functions';
import Drawer from '@mui/material/Drawer';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import useTheme from '@mui/material/styles/useTheme';
import { Box } from '@mui/system';

import { CodeEditor } from '../code-editor/CodeEditor';

export interface MutationDrawerProps {
  isMutationDrawerOpen: boolean;
  onMutationDrawerClosed: () => void;
  mutations: Array<ResourceMutation>;
  unitExtended: ExtendedUnitRead;
  revisionData: string;
  revisionNum: number;
  revisionID: string;
}

/**
 * Drawer that shows the configuration a revision's mutations changed.
 * Features:
 * - Tabbed interface for different resource types
 * - Code editor highlighting the values the selected revision mutated
 */
export const MutationDrawer = ({
  isMutationDrawerOpen,
  onMutationDrawerClosed,
  mutations,
  unitExtended,
  revisionNum,
  revisionData,
  revisionID,
}: MutationDrawerProps) => {
  const theme = useTheme();
  const [selectedTab, setSelectedTab] = useState(0);
  const [resources, setResources] = useState<Array<Resource>>([]);
  // The drawer paper starts at TOP_NAV_HEIGHT, so subtract it in addition to
  // the 49px header inside the drawer.
  const editorHeight = usePageHeight(TOP_NAV_HEIGHT + 49);

  const [invokeFunctionMutation] = useInvokeFunctionsMutation();

  const { data: mutationsData } = useListExtendedMutationsQuery(
    {
      unitId: unitExtended?.Unit?.UnitID || '',
      spaceId: unitExtended?.Unit?.SpaceID || '',
      include: 'RevisionID,LinkID,TriggerID',
    },
    {
      skip:
        isIDInvalid(unitExtended?.Unit?.SpaceID) || isIDInvalid(unitExtended?.Unit?.UnitID),
    },
  );

  // Create a dictionary mapping mutation numbers to their extended data for quick lookup
  const mutationDataDictionary = mutationsData?.reduce(
    (acc, extendedMutation) => {
      const key = extendedMutation?.Mutation?.MutationNum; // Use MutationNumber as the key
      if (key !== undefined) {
        acc[key] = extendedMutation || ({} as ExtendedMutationRead); // Add the mutation to the dictionary
      }
      return acc;
    },
    {} as Record<number, ExtendedMutationRead>,
  );

  // Get filtered mutations for the current tab and revision
  const { mutationSources } = useUnitMutationSources(
    unitExtended?.Unit?.SpaceID,
    unitExtended?.Unit?.UnitID,
  );
  const filteredMutations = getFilteredMutations(
    mutationSources?.[selectedTab]?.PathMutationMap,
    mutationDataDictionary,
    revisionNum,
  );

  // Extract mutation values for the current tab that belong to the current revision
  // These values will be highlighted in the code editor
  const valuesArray = filteredMutations.map(({ mutation }) =>
    cleanString(mutation?.Value || ''),
  );

  // Fetch resource data when the drawer shows a revision. The drawer is mounted while closed,
  // and with no revision selected there is nothing to ask for: the server refuses a unit_id
  // that comes with an empty revision_id.
  useEffect(() => {
    if (!isMutationDrawerOpen || !revisionID) return;

    const getResources = async () => {
      const result = await invokeFunctionMutation({
        unitId: unitExtended?.Unit?.UnitID || '',
        spaceId: unitExtended?.Unit?.SpaceID || '',
        revisionId: revisionID,
        where: `UnitID='${unitExtended?.Unit?.UnitID || ''}'`,
        functionInvocationsRequest: {
          FunctionInvocations: [
            {
              FunctionName: 'get-resources',
              Arguments: [],
            },
          ],
        },
      });

      // Convert the response to a list of resources
      if (result.data) {
        const resourcesList = result.data
          ?.map((r) => convertToResourceList(cleanString(r?.Outputs?.['ResourceList'] || '')))
          .flat() as Array<Resource>;
        setResources(resourcesList);
      }
    };

    getResources();
  }, [revisionID, isMutationDrawerOpen]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
  };

  // Get the resource type for the currently selected tab
  const selectedResourceType = mutations?.[selectedTab]?.Resource?.ResourceType || '';

  // Find the resource data that matches the selected resource type
  const currentData = resources?.find(
    (resource) =>
      resource.ResourceType.toLocaleLowerCase() === selectedResourceType.toLocaleLowerCase(),
  )?.ResourceBody;

  return (
    <Drawer
      anchor='right'
      open={isMutationDrawerOpen}
      onClose={() => {
        onMutationDrawerClosed();
      }}
      PaperProps={{
        sx: {
          width: '80%',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Tab bar for selecting different resource types */}
      <Tabs
        value={selectedTab}
        onChange={handleTabChange}
        variant='scrollable'
        scrollButtons='auto'
        sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}
      >
        {mutations?.map((mutation, index) => (
          <Tab
            key={index}
            sx={{ maxWidth: '100%' }}
            label={`${mutation.Resource?.ResourceType} ${mutation.Resource?.ResourceName}`}
          />
        ))}
      </Tabs>
      <Box sx={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <CodeEditor
          highlightValues={valuesArray}
          height={editorHeight}
          value={currentData || revisionData}
          toolchainType={unitExtended.Unit?.ToolchainType ?? undefined}
        />
      </Box>
    </Drawer>
  );
};
