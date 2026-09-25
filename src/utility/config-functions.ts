// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  InvokeFunctionsApiArg,
  UnitRead,
  UpdateUnitApiArg,
} from '@confighub/rtk-query';
import { Attribute } from '@/types';


/**
 * The metadata half of a configuration save. Configuration itself is written through the
 * Unit's data endpoint, which is a separate call: the Unit body has nowhere to put a
 * configuration, which is what stops a metadata write from destroying one it never fetched.
 */
export const createUpdateUnitArgs = (
  unit: UnitRead,
  lastChangeDescription?: string,
): UpdateUnitApiArg => ({
  spaceId: unit.SpaceID!,
  unitId: unit.UnitID!,
  unit: {
    ...unit,
    ...(lastChangeDescription && { LastChangeDescription: lastChangeDescription }),
  },
});

export const createSetAttributesArgs = (
  unit: UnitRead,
  updatedAttributes: Attribute[],
  lastChangeDescription?: string,
): InvokeFunctionsApiArg => ({
  spaceId: unit.SpaceID || '',
  // unitId: unit.UnitID || '',
  where: `UnitID='${unit.UnitID}'`,
  functionInvocationsRequest: {
    ...(lastChangeDescription && { ChangeDescription: lastChangeDescription }),
    FunctionInvocations: [
      {
        FunctionName: 'set-attributes',
        Arguments: [
          {
            ParameterName: 'attribute-list',
            Value: JSON.stringify(updatedAttributes),
          },
        ],
      },
    ],
  },
});
