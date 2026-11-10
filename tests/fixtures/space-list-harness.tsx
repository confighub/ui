// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// A page for `change-order-space-list.spec.ts`: the shared Space list, drawn on its own with
// 55 Spaces and no server. The dev server turns this file into a module, so it can import
// the real components. The spec serves the page's HTML at a route of its own.

/* eslint-disable react-refresh/only-export-components -- the page mounts itself and exports nothing, so fast refresh has no component to track */
import { Dialog, DialogContent } from '@mui/material';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { SameInAllSpaces, SpaceNameList } from '../../src/pages/change-orders/components/SpaceListing';
import { SpaceLabelsContext } from '../../src/pages/change-orders/components/spaceLabelsContext';

const REGIONS = ['eu-west', 'eu-central', 'us-east', 'ap-southeast'];

const spaces = Array.from({ length: 55 }, (_, i) => ({
  spaceId: `space-${i}`,
  name: `cert-manager-${REGIONS[i % REGIONS.length]}-prod${i}`,
  labels: { Region: REGIONS[i % REGIONS.length], Cluster: `cluster-${i}`, Stage: 'prod' },
}));
const labelsById = new Map(spaces.map((space) => [space.spaceId, space.labels]));
const plain = spaces.map(({ spaceId, name }) => ({ spaceId, name }));

createRoot(document.getElementById('root') as HTMLElement).render(
  <MemoryRouter>
    <SpaceLabelsContext.Provider value={(spaceId) => labelsById.get(spaceId)}>
      <p data-testid="failure-line">
        Promote failed in <SpaceNameList spaces={plain.slice(1)} />
      </p>
      <p data-testid="all-line">
        <SpaceNameList spaces={plain} />
      </p>
      {new URLSearchParams(window.location.search).has('dialog') ? (
        <Dialog open aria-label="End dialog">
          <DialogContent data-testid="dialog-body">
            <SameInAllSpaces spaces={plain} />
          </DialogContent>
        </Dialog>
      ) : null}
      <p data-testid="bottom-line" style={{ position: 'fixed', bottom: 16, left: 24, margin: 0 }}>
        <SpaceNameList spaces={plain} />
      </p>
    </SpaceLabelsContext.Provider>
  </MemoryRouter>,
);
