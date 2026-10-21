// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { createContext, type ReactNode } from 'react';

import type { ResourceInfo } from '@confighub/rtk-query';

/**
 * Comments on the rows of one resource's diff, as a page that reviews it draws them: the button
 * that starts a thread on a row, and what sits under the row (its threads, a comment being
 * written). A diff with none draws its rows as it always has.
 *
 * `path` is the row's path in configuration path syntax (the server's `DisplayPath`); `''` is
 * the resource itself, under its heading.
 */
export interface DiffRowComments {
  renderAdd: (path: string) => ReactNode;
  renderBelow: (path: string) => ReactNode;
}

/** Comments for a whole diff, resource by resource. `undefined` for a resource that takes none. */
export interface DiffComments {
  forResource: (resource: ResourceInfo | undefined) => DiffRowComments | undefined;
}

/** The rows of the resource being drawn read their comments from here. */
export const DiffRowCommentsContext = createContext<DiffRowComments | undefined>(undefined);
