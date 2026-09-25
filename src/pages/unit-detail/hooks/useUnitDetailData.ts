
// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  Invocation,
  SpaceRead,
  TargetRead,
  ExtendedUnitRead,
  UnitRead,
  UserRead,
  confighubApi,
  useGetTargetQuery,
  useGetUnitQuery,
  useListAllInvocationsQuery,
  useListAllTargetsQuery,
  useListAllTriggersQuery,
  useListAllUnitsQuery,
  useListExtendedRevisionsQuery,
  useListFunctionsQuery,
  useListLinksQuery,
} from '@confighub/rtk-query';
import { type RevisionRow } from '@/types';
import { TOOLCHAIN_ANY } from '@/utility/constants';
import { isIDInvalid } from '@/utility/validation-functions';

import { LinkRow } from '../components/links-table/LinksTable';

export interface IUseUnitDetailDataProps {
  id: string;
  spaceID: string;
  refresh: boolean;
}

// Stable "nothing yet" references. Consumers read these with optional chaining,
// so an empty object is the loading/absent value — but it has to be the SAME
// object every time, otherwise every render looks like new data downstream.
const EMPTY_UNIT = {} as UnitRead;
const EMPTY_UNIT_EXTENDED = {} as ExtendedUnitRead;
const EMPTY_SPACE = {} as SpaceRead;

export const useUnitDetailData = ({ id, spaceID, refresh }: IUseUnitDetailDataProps) => {
  // State
  const [currentUnit, setCurrentUnit] = useState<UnitRead>(EMPTY_UNIT);
  const [currentSpace, setCurrentSpace] = useState<SpaceRead>(EMPTY_SPACE);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [usersState, setUsersState] = useState<(UserRead | undefined)[]>([]);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [upstreamUnit, setUpstreamUnit] = useState<UnitRead>(EMPTY_UNIT);
  const [isEditInvocationCancelled, setIsEditInvocationCancelled] = useState<boolean>(false);
  const [invocationToEdit, setInvocationToEdit] = useState<Invocation | undefined>(undefined);

  // Redux API
  const [getUpstreamUnitById] = confighubApi.endpoints.getUnit.useLazyQuery();
  const [getSpaceByID] = confighubApi.endpoints.getSpace.useLazyQuery();
  const [triggerDownstreamUnits] =
    confighubApi.endpoints.listAllUnits.useLazyQuerySubscription();
  const [triggerUnitEvents] = confighubApi.endpoints.listUnitEvents.useLazyQuerySubscription();

  const { data: revisionsData = [], refetch: refetchRevisions } =
    useListExtendedRevisionsQuery(
      {
        spaceId: spaceID,
        unitId: id,
        include: 'UserID, Tags',
      },
      {
        skip: isIDInvalid(spaceID) || isIDInvalid(id),
      },
    );
  const [getSpaces, { data: extendedSpaces = [] }] =
    confighubApi.endpoints.listSpaces.useLazyQuery();

  const { data: functions = [] } = useListFunctionsQuery({
    spaceId: spaceID || '',
  });

  const { data: invocationsData } = useListAllInvocationsQuery({});
  const { data: triggersData } = useListAllTriggersQuery({});

  const invocations = useMemo(
    () => invocationsData?.map((r) => r.Invocation).filter(Boolean) || [],
    [invocationsData],
  );

  const triggers = useMemo(
    () => triggersData?.map((r) => r.Trigger).filter(Boolean) || [],
    [triggersData],
  );

  const { data: target = {} } = useGetTargetQuery(
    {
      targetId: currentUnit?.TargetID || '',
      spaceId: spaceID,
    },
    {
      skip: isIDInvalid(currentUnit?.TargetID) || isIDInvalid(spaceID),
    },
  );

  const { data: downstreamUnits = [] } = useListAllUnitsQuery(
    {
      include: 'SpaceID',
      where: `UpstreamUnitID = '${id}'`,
    },
    {
      skip: isIDInvalid(id),
    },
  );

  // The ONLY fetch of this unit. Note there is no `= {}` default: that would mint
  // a new object on every render and re-run everything downstream of it.
  const {
    data: freshExtendedUnit,
    isFetching: isFetchingUnit,
    refetch: refetchUnit,
  } = useGetUnitQuery({
    unitId: id,
    spaceId: spaceID,
  });

  const currentUnitExtended = freshExtendedUnit ?? EMPTY_UNIT_EXTENDED;
  const fetchedUnit = freshExtendedUnit?.Unit;

  const { data: linksData = [], refetch: refetchLinks } = useListLinksQuery(
    {
      spaceId: spaceID,
      include: 'FromUnitID,ToUnitID,ToSpaceID',
    },
    {
      skip: isIDInvalid(spaceID),
    },
  );

  const { targets = [] } = useListAllTargetsQuery(
    {
      where: `ToolchainType IN ('${currentUnit?.ToolchainType}', '${TOOLCHAIN_ANY}')`,
    },
    {
      skip: !currentUnit?.ToolchainType,
      selectFromResult: ({ data }) => ({
        targets:
          data?.map((et) => et.Target).filter((t): t is TargetRead => t !== undefined) || [],
      }),
    },
  );

  // `refresh` is a toggled boolean, so "did the caller ask for a refresh?" is
  // "did it change since we last looked?". Needed because the unit query below
  // already fetches on mount and on id/spaceID change — refetching it there too
  // would fire the request twice for a single page load.
  const lastRefreshRef = useRef(refresh);

  // General State
  useEffect(() => {
    // Clear state on refresh. currentUnit/currentUnitExtended are intentionally
    // NOT cleared here: they now track the unit query, which keeps the previous
    // payload visible while it refetches instead of flashing an empty page.
    setUpstreamUnit(EMPTY_UNIT);
    setLinks([]);
    setCurrentSpace(EMPTY_SPACE);
    setUsersState([]);
    setRevisions([]);

    const isRefreshRequest = lastRefreshRef.current !== refresh;
    lastRefreshRef.current = refresh;

    const getCurrentUnit = async () => {
      if (isRefreshRequest) {
        refetchUnit();
      }

      const freshSpace = await getSpaceByID({ spaceId: spaceID });

      triggerDownstreamUnits({
        include: 'SpaceID',
        where: `UpstreamUnitID = '${id}'`,
      });

      triggerUnitEvents({
        unitId: id,
        spaceId: spaceID,
      });

      getSpaces({});

      if (freshSpace?.data) {
        setCurrentSpace(freshSpace.data.Space || EMPTY_SPACE);
      }
    };

    if (id && spaceID) {
      getCurrentUnit();
    }
  }, [id, spaceID, refresh]);

  // Mirror the unit carried by the extended payload into state. It stays state
  // (rather than being read straight through) because the downstream-units table
  // sets it optimistically while navigating to another unit; the next resolved
  // fetch takes over from there.
  useEffect(() => {
    setCurrentUnit(fetchedUnit ?? EMPTY_UNIT);
  }, [fetchedUnit]);

  // The upstream unit is a DIFFERENT unit, so it keeps its own fetch. It is
  // keyed off the unit we just loaded, and re-runs on refresh so the "upgrade
  // available" chip stays accurate.
  const upstreamUnitID = fetchedUnit?.UpstreamUnitID;
  const upstreamSpaceID = fetchedUnit?.UpstreamSpaceID;

  useEffect(() => {
    if (!upstreamUnitID) {
      setUpstreamUnit(EMPTY_UNIT);
      return;
    }

    let isCurrent = true;
    const getUpstreamUnit = async () => {
      const response = await getUpstreamUnitById({
        unitId: upstreamUnitID,
        spaceId: upstreamSpaceID || '',
      });
      if (isCurrent) {
        setUpstreamUnit(response?.data?.Unit || EMPTY_UNIT);
      }
    };
    getUpstreamUnit();

    return () => {
      isCurrent = false;
    };
  }, [upstreamUnitID, upstreamSpaceID, refresh, getUpstreamUnitById]);

  // Refetch revisions when refresh changes
  useEffect(() => {
    if (!isIDInvalid(id) && !isIDInvalid(spaceID)) {
      refetchRevisions();
    }
  }, [refresh, id, spaceID, refetchRevisions]);

  // Process revisions data when it changes
  useEffect(() => {
    if (revisionsData.length === 0 || isIDInvalid(id)) return;

    const rows: RevisionRow[] = revisionsData?.map((extendedRevision) => {
      const revision = extendedRevision.Revision;
      return {
        id: revision?.RevisionID || '',
        RevisionNum: revision?.RevisionNum || 0,
        ...extendedRevision,
      };
    });

    setRevisions(rows);

    // ExtendedRevisionRead already has User data, no need to fetch separately
    const users = revisionsData
      .map((extRevision) => extRevision.User)
      .filter((user): user is UserRead => user !== undefined);
    setUsersState(users);
  }, [refresh, revisionsData, id]);

  // Refetch links when refresh changes
  useEffect(() => {
    if (!isIDInvalid(spaceID)) {
      refetchLinks();
    }
  }, [refresh, spaceID, refetchLinks]);

  // Process links data when it changes
  useEffect(() => {
    if (linksData.length === 0 || isIDInvalid(id)) return;

    const rows: LinkRow[] = linksData
      ?.filter?.(
        (extendedLink) =>
          extendedLink.Link &&
          (extendedLink.Link?.FromUnitID === id || extendedLink.Link?.ToUnitID === id),
      )
      ?.map((extendedLink) => ({
        id: extendedLink.Link?.LinkID || '',
        ...extendedLink,
      }));

    setLinks(rows);
  }, [refresh, linksData, id]);

  const spaces = extendedSpaces
    .map((es) => es.Space)
    .filter((s): s is SpaceRead => s !== undefined);

  return {
    downstreamUnits,
    target,
    functions,
    invocations,
    triggers,
    spaces,
    links,
    revisions,
    usersState,
    currentUnit,
    currentUnitExtended,
    currentSpace,
    targets,
    upstreamUnit,
    setCurrentUnit,
    isFetchingUnit,
    isEditInvocationCancelled,
    setIsEditInvocationCancelled,
    invocationToEdit,
    setInvocationToEdit,
  };
};