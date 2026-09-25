// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { APPLY_STATES } from '@/types';
import { ActionStatusType } from '@confighub/rtk-query';

  export const getStateColor = (applyState: string) => {
    switch (applyState) {
      case APPLY_STATES.PENDING:
        return 'info';
      case APPLY_STATES.PROGRESSING:
        return 'warning';
      case APPLY_STATES.COMPLETED:
        return 'success';
      case APPLY_STATES.FAILED:
        return 'error';
      default:
        return 'default';
    }
  };

    // Map ActionStatusType to internal apply states
    export const getApplyState = (progress: ActionStatusType): string => {
      switch (progress) {
        case 'None':
          return APPLY_STATES.NONE;
        case 'Pending':
        case 'Submitted':
          return APPLY_STATES.PENDING;
        case 'Progressing':
          return APPLY_STATES.PROGRESSING;
        case 'Completed':
          return APPLY_STATES.COMPLETED;
        case 'Failed':
          return APPLY_STATES.FAILED;
        case 'Canceled':
          return APPLY_STATES.CANCELED;
        default:
          return APPLY_STATES.NONE;
      }
    };
