
// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  Invocation,
  SpaceRead,
  TargetRead,
  ExtendedLinkRead,
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
  useSearchListLinksQuery,
} from '@confighub/rtk-query';
import { type RevisionRow } from '@/types';
import { isIDInvalid } from '@/utility/validation-functions';

import { LinkRow } from '../components/links-table/LinksTable';

const EMPTY_LINKS: ExtendedLinkRead[] = [];
const LINK_INCLUDE = 'FromUnitID,ToUnitID,SpaceID,ToSpaceID';

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
  const currentUnit = fetchedUnit ?? EMPTY_UNIT;

  // Whether the unit has downstreams decides whether pushing to them is offered.
  const { data: downstreamUnits = [] } = useListAllUnitsQuery(
    {
      include: 'SpaceID',
      where: `UpstreamUnitID = '${id}'`,
    },
    {
      skip: isIDInvalid(id),
    },
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

  // The Links from this Unit are in its Space; the Links to it can be in any Space, such as
  // the Links from the Units of every environment to a Unit that records facts for them all.
  const { data: linksFromData = EMPTY_LINKS, refetch: refetchLinksFrom } = useListLinksQuery(
    {
      spaceId: spaceID,
      where: `FromUnitID = '${id}'`,
      include: LINK_INCLUDE,
    },
    {
      skip: isIDInvalid(spaceID) || isIDInvalid(id),
    },
  );
  const { data: linksToData = EMPTY_LINKS, refetch: refetchLinksTo } = useSearchListLinksQuery(
    {
      where: `ToUnitID = '${id}'`,
      include: LINK_INCLUDE,
    },
    {
      skip: isIDInvalid(id),
    },
  );

  const { targets = [] } = useListAllTargetsQuery(
    {},
    {
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
    if (isIDInvalid(id)) return;
    if (!isIDInvalid(spaceID)) refetchLinksFrom();
    refetchLinksTo();
  }, [refresh, spaceID, id, refetchLinksFrom, refetchLinksTo]);

  // Process links data when it changes. A Link from this Unit to itself is in both lists.
  useEffect(() => {
    if (isIDInvalid(id)) return;

    const rows = new Map<string, LinkRow>();
    for (const extendedLink of [...linksFromData, ...linksToData]) {
      const linkId = extendedLink.Link?.LinkID;
      if (linkId === undefined || rows.has(linkId)) continue;
      rows.set(linkId, { id: linkId, ...extendedLink });
    }

    setLinks([...rows.values()]);
  }, [refresh, linksFromData, linksToData, id]);

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
    isFetchingUnit,
    isEditInvocationCancelled,
    setIsEditInvocationCancelled,
    invocationToEdit,
    setInvocationToEdit,
  };
};