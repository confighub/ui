// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';

import { fadeIn } from '../styled';

export type ActionRule = {
  isActive: boolean;
  tooltipMessage: string;
  showWarning?: boolean;
  chainToNext?: boolean;
};

export type VisibilityRule = {
  shouldShow: boolean;
  reason?: string;
};

export type EnablementRule = {
  shouldEnable: boolean;
  reason?: string;
};

export interface ActionButtonProps {
  // Core button props
  buttonText: string;
  onButtonClick: () => void;

  // Rule-based conditions
  actionRules?: Array<ActionRule>;
  visibilityRules?: Array<VisibilityRule>;
  enablementRules?: Array<EnablementRule>;
}

export const createEnablementRule = (
  shouldDisable: boolean,
  reason: string,
): EnablementRule => ({
  shouldEnable: !shouldDisable,
  reason: shouldDisable ? reason : undefined,
});

export const ActionButton = ({
  buttonText,
  onButtonClick,
  actionRules = [],
  visibilityRules = [],
  enablementRules = [],
}: ActionButtonProps) => {
  // Determine visibility
  const shouldShowButton = (): boolean => {
    if (visibilityRules.length === 0) return true;
    return visibilityRules.some((rule) => rule.shouldShow);
  };

  // Determine if button should be enabled
  const shouldEnableButton = (): boolean => {
    // If no enablement rules, default to enabled
    if (enablementRules.length === 0) return true;

    // All enablement rules must pass for button to be enabled
    return enablementRules.every((rule) => rule.shouldEnable);
  };

  // Get active tooltip messages
  const getActiveTooltipMessages = (): string[] => {
    const activeActionMessages = actionRules
      .filter((rule) => rule.isActive)
      .map((rule) => rule.tooltipMessage);

    const visibilityMessages = visibilityRules
      .filter((rule) => !rule.shouldShow && rule.reason)
      .map((rule) => rule.reason!);

    const enablementMessages = enablementRules
      .filter((rule) => !rule.shouldEnable && rule.reason)
      .map((rule) => rule.reason!);

    return [...activeActionMessages, ...visibilityMessages, ...enablementMessages];
  };

  // Get warning status
  const hasWarnings = (): boolean => {
    return actionRules.some((rule) => rule.isActive && rule.showWarning);
  };

  const isButtonVisible = shouldShowButton();
  const isButtonEnabled = shouldEnableButton();
  const tooltipMessages = getActiveTooltipMessages();
  const showWarnings = hasWarnings();

  // Don't render if visibility rules say to hide
  if (!isButtonVisible) {
    return null;
  }

  const tooltipContent = tooltipMessages.length > 0 ? tooltipMessages.join(' ') : '';

  return (
    <Box>
      <Tooltip title={tooltipContent} arrow>
        <span>
          <Button
            variant='contained'
            onClick={onButtonClick}
            disabled={!isButtonEnabled}
            sx={{
              animation: `${fadeIn} 0.3s ease-in`,
              ...(showWarnings && {
                backgroundColor: 'warning.main',
                '&:hover': {
                  backgroundColor: 'warning.dark',
                },
              }),
            }}
            color={showWarnings ? 'warning' : 'primary'}
            size='small'
          >
            {buttonText}
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
};
