// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import {
  OrganizationRead,
  useListOrganizationsQuery,
} from '@confighub/rtk-query';

export interface IUseOrganizationProps {
  ExternalOrganizationID: string;
}

export const useOrganization = ({ ExternalOrganizationID }: IUseOrganizationProps) => {
  const [currentOrg, setCurrentOrg] = useState<OrganizationRead>({} as OrganizationRead);
  const [orgs, setOrgs] = useState<OrganizationRead[]>([]);

  const { data } = useListOrganizationsQuery(
    {},
    {
      skip: !ExternalOrganizationID,
    },
  );

  useEffect(() => {
    if (!data) return;

    const organizations = data.flatMap((extendedOrg) =>
      extendedOrg.Organization ? [extendedOrg.Organization] : [],
    );
    setOrgs(organizations);

    const org = organizations.find(
      (org: OrganizationRead) => org.ExternalID === ExternalOrganizationID,
    );

    if (org) setCurrentOrg(org);
  }, [data, ExternalOrganizationID]);

  return { currentOrg, orgs };
};
