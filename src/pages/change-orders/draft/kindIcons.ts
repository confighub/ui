// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ComponentType } from 'react';

import type { SvgIconProps } from '@mui/material/SvgIcon';
import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import FunctionsIcon from '@mui/icons-material/Functions';
import MergeIcon from '@mui/icons-material/Merge';

import DeployedCodeIcon from '@/third_party/material-symbols/DeployedCodeIcon';

import type { DraftFanOutType } from './draftFanOut';
import type { DraftKind } from './draftKinds';

/** An icon component, as MUI's and the third-party ones are. */
export type DraftIcon = ComponentType<SvgIconProps>;

/** Each kind of change's mark, on the track and in the template picker. */
export const KIND_ICON: Readonly<Record<DraftKind, DraftIcon>> = {
  baseChanges: MergeIcon,
  invoke: FunctionsIcon,
  transformPaths: AltRouteIcon,
};

/** A container image's mark, wherever the draft names one. */
export { DeployedCodeIcon as ImageIcon };

/** Each fan-out type's mark, in its sub bar. */
export const FAN_OUT_ICON: Readonly<Record<DraftFanOutType, DraftIcon>> = {
  TransformPaths: AltRouteIcon,
  Upsert: CallMergeIcon,
  Insert: AddBoxOutlinedIcon,
};
