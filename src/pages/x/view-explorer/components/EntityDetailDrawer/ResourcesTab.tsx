// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import {
  ResourceView,
  UnitResourceBrowser,
} from '@/components/unit-resources/UnitResourceBrowser';

interface ResourcesTabProps {
  spaceID: string | undefined;
  unitID: string | undefined;
}

/**
 * The resources of the Unit the drawer is for, as on the unit detail page's Resources tab,
 * with the list above the selected resource to fit the drawer. The drawer remounts for each
 * row, so the selection starts over with each Unit.
 */
export function ResourcesTab({ spaceID, unitID }: ResourcesTabProps) {
  const [selectedId, setSelectedId] = useState('');
  const [view, setView] = useState<ResourceView>('overview');

  return (
    <UnitResourceBrowser
      spaceID={spaceID}
      unitID={unitID}
      selectedId={selectedId}
      onSelect={setSelectedId}
      view={view}
      onViewChange={setView}
      orientation='vertical'
    />
  );
}
