// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
    type RevisionRead,
    type UnitEventRead,
    type UnitRead,
    type UserRead,
    useListExtendedRevisionsQuery,
    useListUnitEventsQuery,
  } from '@confighub/rtk-query';
  import dayjs from 'dayjs';
  import groupBy from 'lodash/groupBy';
  import relativeTime from 'dayjs/plugin/relativeTime';
  
  
  const isRevision = (item: RevisionRead): item is RevisionRead & UserRead => {
    return 'RevisionID' in item;
  };
  
  const isUnitEvent = (item: UnitEventRead): item is UnitEventRead => {
    return 'UnitEventID' in item;
  };
  
  export interface IUseActivityProps {
    unit: UnitRead;
  }
  
  export type UserExtendedRevision = RevisionRead & {
    DisplayName?: string;
    ProfilePictureURL?: string;
  };
  
  export const useActivity = ({ unit }: IUseActivityProps) => {
  
  dayjs.extend(relativeTime);
    const {
      data: events = [],
      isLoading: isEventsLoading,
      isUninitialized: isEventsUninitialized,
    } = useListUnitEventsQuery(
      { spaceId: unit?.SpaceID || '', unitId: unit?.UnitID || '' },
      { skip: !unit?.SpaceID || !unit?.UnitID },
    );
  
    const { revisions = [], isRevisionsLoading } = useListExtendedRevisionsQuery(
      {
        spaceId: unit?.SpaceID || '',
        unitId: unit?.UnitID || '',
        include: 'UserID',
      },
      {
        skip: !unit?.SpaceID || !unit?.UnitID,
        selectFromResult: ({ data, isLoading }) => ({
          revisions: data?.map(
            (revision) =>
              ({
                ...revision?.Revision,
                DisplayName: revision?.User?.DisplayName,
                ProfilePictureURL: revision?.User?.ProfilePictureURL,
              }) as UserExtendedRevision, // Cast this this explicitly to UserExtendedRevision
          ),
          isRevisionsLoading: isLoading,
        }),
      },
    );
  
    const mergedEvents = [...(events || []), ...revisions]
      .map((item: UserExtendedRevision | UnitEventRead) => {
        // Shared properties can be defined outside the if/else blocks
        const createdAt = dayjs(item.CreatedAt).toDate();
  
        // Use the type guards to handle each type of item separately
        if (isUnitEvent(item)) {
          // TypeScript now knows `item` is of type `UnitEventRead`
          return {
            id: item.UnitEventID,
            createdAt: createdAt,
            description: item.Message,
            action: item.Action,
            results: item.Result ? [{ status: 'info', value: item.Result }] : [],
            status: item.Status,
            userName: 'Automated', // Events are automated
            profileURL: '', // Events have no user profile
          };
        }
  
        if (isRevision(item)) {
          // TypeScript now knows `item` is of type `RevisionRead & UserRead`
          return {
            id: item.RevisionID,
            createdAt: createdAt,
            description: item.Description,
            action: `${item.UserAgent} ${item.Source}`,
            results: Object.entries(item.ValidationErrors || {}).map(([key]) => ({
              status: 'error',
              value: key,
            })),
            status: undefined, // Or a default status, as Revisions don't have this property
            userName: item.DisplayName,
            profileURL: item.ProfilePictureURL,
          };
        }
  
        // Return null for any items that don't match guards, just in case
        return null;
      })
      .filter((event): event is NonNullable<typeof event> => event !== null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  
    const groupedEvents = groupBy(
      mergedEvents,
      (event) => dayjs(event.createdAt).startOf('week').format('YYYY-MM-DD'), // Group by the start of the week
    );
  
    return {
      mergedEvents,
      groupedEvents,
      isEventsLoading,
      isEventsUninitialized,
      isRevisionsLoading
    }
  };
  