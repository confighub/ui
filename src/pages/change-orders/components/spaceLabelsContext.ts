// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { createContext } from 'react';

/**
 * The labels of a Space, by id, from the Space list the ChangeOrder page already
 * reads. A list of Spaces uses them for its Group by choice, so a sentence deep
 * in a Stage card needs no labels passed down to it. Without a provider, a list
 * has no Group by choice.
 */
export type SpaceLabelsOf = (spaceId: string) => Readonly<Record<string, string>> | undefined;

export const SpaceLabelsContext = createContext<SpaceLabelsOf | undefined>(undefined);
