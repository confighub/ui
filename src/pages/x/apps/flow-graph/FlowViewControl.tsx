// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import Box from '@mui/material/Box';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';

import { componentTheme } from '../componentTheme';

/** Every value the graph's top-right control can be set to: the flow canvas,
 * or Dashboard — which replaces the canvas outright with the node's scoped
 * overview (see `AppComponentView`'s `displayMode`). */
export type FlowViewControlValue = 'graph' | 'dashboard';

interface FlowViewControlProps {
  /** Selected segment. */
  value: FlowViewControlValue;
  /** Fires on any segment click. Clicking Graph while Dashboard is open is
   * how the user gets back to the canvas. */
  onChange: (value: FlowViewControlValue) => void;
}

/**
 * The graph view's top-right Graph / Dashboard segmented control. Rendered
 * by `AppComponentView` as an overlay above whichever content is showing
 * (the flow canvas column, or the Dashboard) — Dashboard replaces the canvas
 * outright, so the control can't live inside `ComponentFlowGraph` any more
 * or it would disappear along with it. Positioned against its nearest
 * positioned ancestor, so in Graph mode it stays off the side pane.
 */
export function FlowViewControl({ value, onChange }: FlowViewControlProps) {
  return (
    <Box sx={{ position: 'absolute', top: 12, right: 12, zIndex: 5 }}>
      <ToggleButtonGroup
        value={value}
        exclusive
        size="small"
        onChange={(_event, newValue: FlowViewControlValue | null) => {
          if (newValue) onChange(newValue);
        }}
        sx={{
          background: componentTheme.bgDefault,
          boxShadow: componentTheme.shadowSm,
          border: `1px solid ${componentTheme.borderDefault}`,
          borderRadius: componentTheme.radiusMd,
          overflow: 'hidden',
          '& .MuiToggleButton-root': {
            textTransform: 'none',
            fontSize: 12,
            fontFamily: componentTheme.fontSans,
            px: 1.5,
            py: 0.5,
            gap: 0.5,
            border: 'none',
          },
          '& .MuiSvgIcon-root': {
            fontSize: 16,
          },
        }}
      >
        <ToggleButton value="graph">
          <Tooltip title="Graph: the flow canvas" placement="bottom">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccountTreeOutlinedIcon />
              Graph
            </Box>
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="dashboard">
          <Tooltip title="Dashboard: this node's own Spaces as the overview KPIs, matrix, and activity feed" placement="bottom">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <DashboardOutlinedIcon />
              Dashboard
            </Box>
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
