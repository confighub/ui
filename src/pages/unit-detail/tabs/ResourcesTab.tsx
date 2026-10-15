// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useSearchParams } from 'react-router-dom';

import { Section } from '@/components/styled';
import { UnitResourceBrowser } from '@/components/unit-resources/UnitResourceBrowser';
import { Direction } from '@/types/enums';
import { UnitRead } from '@confighub/rtk-query';

import {
  UNIT_DETAIL_TAB,
  readResourceView,
  readSelectedResource,
  writeResourceView,
  writeSelectedResource,
} from '../unitDetailHrefs';

const RESOURCES_TAB_ID = UNIT_DETAIL_TAB.resources;

export interface IResourcesTabProps {
  unit: UnitRead;
  selectedTab: number;
}

/**
 * ResourcesTab browses the resources in the Unit's configuration, each as an Overview or as
 * YAML.
 *
 * The selection and the view live in the page's URL (`unitDetailHrefs`), so another page can
 * link to one resource of the Unit.
 */
export const ResourcesTab = ({ unit, selectedTab }: IResourcesTabProps) => {
  const isSelected = selectedTab === RESOURCES_TAB_ID;
  return (
    <Section $display={isSelected} $direction={Direction.FadeIn} $width='100%'>
      {isSelected && <UnitResources unit={unit} />}
    </Section>
  );
};

function UnitResources({ unit }: { unit: UnitRead }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const updateParams = (update: (params: URLSearchParams) => void) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        update(next);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <UnitResourceBrowser
      spaceID={unit.SpaceID}
      unitID={unit.UnitID}
      refreshKey={unit.HeadRevisionNum}
      selectedId={readSelectedResource(searchParams)}
      onSelect={(id) => updateParams((p) => writeSelectedResource(p, id))}
      view={readResourceView(searchParams)}
      onViewChange={(v) => updateParams((p) => writeResourceView(p, v))}
      orientation='horizontal'
      sx={{
        height: 'calc(100vh - 250px)',
        minHeight: 400,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    />
  );
}
