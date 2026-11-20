// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The pane's link resolver for one field: the field details and the row hover card send their
// references to the same places (componentFieldLinks.ts).
import { useContext, useMemo } from 'react';

import type { FieldRef } from '@/components/field-diagnosis/fieldDiagnosis.types';
import type { FieldLinkResolver } from '@/components/field-diagnosis/fieldLinks';

import { useComponentFocus } from './ComponentFocusContext';
import { PaneSpacesContext, PaneStagedContext, resolveComponentFieldRef } from './componentFieldLinks';

export function usePaneFieldResolver(field: { path: string; fres?: string; spaceId: string; unitId: string }): FieldLinkResolver {
  const { go, hrefFor } = useComponentFocus();
  const inViewSpaceIds = useContext(PaneSpacesContext);
  const staged = useContext(PaneStagedContext);
  const { path, fres, spaceId, unitId } = field;
  return useMemo<FieldLinkResolver>(
    () => (ref: FieldRef) => resolveComponentFieldRef(ref, { inViewSpaceIds, field: { path, fres, spaceId, unitId }, staged, hrefFor, go }),
    [inViewSpaceIds, path, fres, spaceId, unitId, staged, hrefFor, go],
  );
}
