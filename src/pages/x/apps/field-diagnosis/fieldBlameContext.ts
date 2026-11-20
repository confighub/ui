// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The open Unit's blame index, for every row of its tree. ComponentValuesSection loads it once per
// open Unit (useUnitBlameIndex) and provides it; a row reads its field by stage key, so a row
// costs no request (PLAN.md R6).
import { createContext } from 'react';

import type { UnitUpstream } from '../componentTypes';
import type { UnitBlameIndex } from './useUnitBlameIndex';

export interface FieldBlameValue extends UnitBlameIndex {
  /** The Unit's configuration the index was built on. */
  data: string | undefined;
  /** The Unit's upstream, as the pane listed it (a withheld change's source and revision). */
  upstream?: UnitUpstream;
}

export const FieldBlameContext = createContext<FieldBlameValue>({
  index: new Map(),
  loading: false,
  error: undefined,
  heavy: false,
  refetch: () => undefined,
  data: undefined,
});
