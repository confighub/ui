// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The identity of one resource, first in its section: kind, name (the metadata.name field) and
// apiVersion. Each is a field of the document, so each carries its stage key.
import { memo } from 'react';

import { FieldValue } from './FieldValue';
import { WholeResourceTick } from './IncomingField';
import { ResourceIcon } from './sheetIcons';
import { useSheetOverlay } from './sheetOverlay';
import type { SheetResource } from './specSheetModel';

export const ResourceHead = memo(function ResourceHead({
  resource,
}: {
  resource: SheetResource;
}) {
  const overlay = useSheetOverlay();
  return (
    <div className='rhead' data-testid={`res-head-${resource.id}`}>
      {resource.whole && overlay.incoming && (
        <WholeResourceTick resource={resource} incoming={overlay.incoming} />
      )}
      {resource.whole && (
        <span
          className={`wtag ${resource.whole.change}`}
          role='img'
          aria-label={resource.whole.change === 'added' ? 'Added upstream' : 'Deleted upstream'}
          data-testid={`res-wtag-${resource.id}`}
        >
          <svg viewBox='0 0 13 13' width='13' height='13' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' aria-hidden>
            <circle cx='6.5' cy='6.5' r='4.7' />
            {resource.whole.change === 'added' ? <path d='M6.5 4.3v4.4M4.3 6.5h4.4' /> : <path d='M4.3 6.5h4.4' />}
          </svg>
        </span>
      )}
      <ResourceIcon kind={resource.kind} />
      {resource.kind !== undefined && (
        <span
          className='rkind'
          data-testid={`res-kind-${resource.id}`}
          data-stage-key={resource.kindAtom?.key}
          data-path={resource.kindAtom?.path}
        >
          {resource.kind}
        </span>
      )}
      <span className='rname'>
        {resource.nameAtom ? (
          <FieldValue atom={resource.nameAtom} lines={1} />
        ) : resource.name ? (
          // A resource upstream adds or deletes whole has no field here: its name is text.
          <span className='v' data-testid={`res-name-${resource.id}`}>
            {resource.name}
          </span>
        ) : (
          <span className='lit'>no name</span>
        )}
      </span>
      {resource.apiVersion !== undefined && (
        <span
          className='rapi'
          data-stage-key={resource.apiVersionAtom?.key}
          data-path={resource.apiVersionAtom?.path}
        >
          {resource.apiVersion}
        </span>
      )}
    </div>
  );
});
