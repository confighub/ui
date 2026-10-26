// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ExtendedUnitRead } from '@confighub/rtk-query';

/** A Unit row's id, which slots, `?compare=` and the picker all go by. */
export const idOf = (row: ExtendedUnitRead): string => row.Unit?.UnitID ?? '';
