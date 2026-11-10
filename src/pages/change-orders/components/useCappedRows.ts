// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { capNames, NAMES_SHOWN } from './spaceListLogic';

/**
 * Rows of a list of Units, drawn in full (a diff, a reason): the first `limit`, and the
 * rest once `showAll` runs. `more` counts the rows still hidden.
 */
export function useCappedRows<T>(items: readonly T[], limit: number = NAMES_SHOWN) {
  const [all, setAll] = useState(false);
  const { shown, more } = capNames(items, limit);
  return { visible: all ? items : shown, more: all ? 0 : more, showAll: () => setAll(true) };
}
