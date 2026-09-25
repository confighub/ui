// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  Box,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Tooltip,
  Typography,
  styled,
} from '@mui/material';

import type { EdgeType, NodeDisplayType } from './UnitTreeView';

const ControlsContainer = styled(Box)(() => ({
  display: 'flex',
  // gap: 3,
  padding: 2,
  // backgroundColor: theme.palette.background.default,
  // borderRadius: 1,
  marginBottom: 2,
  // border: `1px solid ${theme.palette.divider}`,
}));

const ControlGroup = styled(FormControl)({
  minWidth: 200,
});

interface UnitTreeControlsProps {
  edgeType: EdgeType;
  nodeType: NodeDisplayType;
  onEdgeTypeChange: (edgeType: EdgeType) => void;
  onNodeTypeChange: (nodeType: NodeDisplayType) => void;
}

export const UnitTreeControls = ({
  edgeType,
  nodeType,
  onEdgeTypeChange,
  onNodeTypeChange,
}: UnitTreeControlsProps) => {
  return (
    <ControlsContainer>
      <ControlGroup>
        <Box display='flex' alignItems='center' gap={0.5}>
          <FormLabel>Edge Type</FormLabel>
          <Tooltip
            title='Clone: Shows configuration inheritance via UpstreamUnit relationships. Link: Shows dependency relationships between units.'
            placement='top'
          >
            <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          </Tooltip>
        </Box>
        <RadioGroup
          row
          value={edgeType}
          onChange={(e) => onEdgeTypeChange(e.target.value as EdgeType)}
        >
          <FormControlLabel
            value='clone'
            control={<Radio size='small' />}
            label={<Typography variant='body2'>Clone</Typography>}
          />
          <FormControlLabel
            value='link'
            control={<Radio size='small' />}
            label={<Typography variant='body2'>Link</Typography>}
          />
        </RadioGroup>
      </ControlGroup>

      <ControlGroup>
        <Box display='flex' alignItems='center' gap={0.5}>
          <FormLabel>Node Display</FormLabel>
          <Tooltip
            title='Unit: Shows unit names as tree nodes with space names below. Space: Shows space names as tree nodes with unit names below.'
            placement='top'
          >
            <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          </Tooltip>
        </Box>
        <RadioGroup
          row
          value={nodeType}
          onChange={(e) => onNodeTypeChange(e.target.value as NodeDisplayType)}
        >
          <FormControlLabel
            value='unit'
            control={<Radio size='small' />}
            label={<Typography variant='body2'>Unit</Typography>}
          />
          <FormControlLabel
            value='space'
            control={<Radio size='small' />}
            label={<Typography variant='body2'>Space</Typography>}
          />
        </RadioGroup>
      </ControlGroup>
    </ControlsContainer>
  );
};
