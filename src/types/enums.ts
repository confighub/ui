// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Keyframes } from '@emotion/react';

export enum Direction {
  Up = 'up',
  Down = 'down',
  Left = 'left',
  Right = 'right',
  FadeIn = 'fade-in',
}

export enum Position {
  TopRight = 'top-right',
  TopLeft = 'top-left',
  BottomRight = 'bottom-right',
  BottomLeft = 'bottom-left',
}

export enum NotificationType {
  Info = 'info',
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

export type TransitionMapType = { [key in Direction]: Keyframes };

export enum Domains {
  space = 'space',
  unit = 'unit',
  bridgeworker = 'bridgeworker',
  target = 'target',
}

export enum RevisionType {
  LastReleasedRevisionNum = 'LastReleasedRevisionNum',
  HeadRevisionNum = 'HeadRevisionNum',
}
