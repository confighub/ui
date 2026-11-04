// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Link as RouterLink } from 'react-router-dom';

import { unitConfigHref } from '@/pages/unit-detail/unitDetailHrefs';
import { Button } from '@mui/material';

import type { FieldOrigin } from './gateOrigin';
import { PrimarySmallButton, primarySmallButtonSx } from './gateStyles';

export interface FixInOriginButtonProps {
  origin: FieldOrigin;
  testId: string;
  /** Whether a Space is a node of this Component, so the pane can select it. */
  isComponentSpace: (spaceId: string | undefined) => boolean;
  onFixInOrigin: (origin: FieldOrigin) => void;
  sx?: object;
}

/**
 * "Fix in <origin Space>". An origin that is a node of this Component is selected in the same
 * pane; any other origin has no node to select, so the button is a link to the origin Unit's
 * configuration page, in a new tab, as every Unit link in the side pane is.
 */
export const FixInOriginButton = ({
  origin,
  testId,
  isComponentSpace,
  onFixInOrigin,
  sx,
}: FixInOriginButtonProps) => {
  const { SpaceID: spaceId, UnitID: unitId, SpaceSlug: spaceSlug } = origin.from;
  if (spaceId && unitId && !isComponentSpace(spaceId)) {
    return (
      <Button
        component={RouterLink}
        to={unitConfigHref(spaceId, unitId)}
        target='_blank'
        rel='noopener noreferrer'
        data-testid={testId}
        sx={{ ...primarySmallButtonSx, ...sx }}
      >
        Fix in {spaceSlug}
      </Button>
    );
  }
  return (
    <PrimarySmallButton data-testid={testId} onClick={() => onFixInOrigin(origin)} sx={sx}>
      Fix in {spaceSlug}
    </PrimarySmallButton>
  );
};
