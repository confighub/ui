// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo } from 'react';
import type { NodeProps } from 'reactflow';

import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

import { componentTheme } from '../componentTheme';
import { CaretButton, CountBadge } from './StackNode';
import type { ExpandFrameNodeData } from './fold/foldNodes';
import { stackToggleLabel } from './fold/markStyle';

const Frame = styled(Box)({
  boxSizing: 'border-box',
  borderRadius: 12,
  border: `1.5px solid ${componentTheme.borderDefault}`,
  background: 'rgba(255,255,255,0.8)',
  boxShadow: componentTheme.shadowSm,
  fontFamily: componentTheme.fontSans,
});

const Header = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 32,
  padding: '0 8px 0 12px',
  whiteSpace: 'nowrap',
  minWidth: 0,
});

const Name = styled('span')({
  fontSize: 13,
  fontWeight: 700,
  color: componentTheme.fgDefault,
});

const Meta = styled('span')({
  fontSize: 11,
  color: componentTheme.fgSubtle,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
});

const Why = styled('span')({
  marginLeft: 'auto',
  flexShrink: 0,
  fontFamily: componentTheme.fontMono,
  fontSize: 10.5,
  color: componentTheme.fgMuted,
  background: componentTheme.bgInset,
  borderRadius: 999,
  padding: '2px 8px',
});

/**
 * The frame an open stack's members sit in, in the rows below the stack's
 * cell. Its header repeats which stack it is and where it lives, because the
 * frame spans the fold's full width and can sit far below the stack itself,
 * and it says who opened it, so a stack that a search opened does not look
 * like the user's own choice.
 */
export const ExpandFrameNode = memo(({ data }: NodeProps<ExpandFrameNodeData>) => {
  const {
    groupId,
    label,
    count,
    groupLabel,
    baseName,
    componentName,
    openedBy,
    onCollapse,
    width,
    height,
  } = data;
  const base = groupLabel ? `${groupLabel}, ${baseName} Base` : `${baseName} Base`;
  const where = componentName ? `${componentName} › ${base}` : base;
  return (
    <Frame sx={{ width, height }} data-testid={`flow-stack-frame-${groupId}`}>
      <Header>
        <CaretButton
          type='button'
          className='nodrag nopan'
          aria-label={stackToggleLabel(true, label, count, componentName)}
          aria-expanded
          title='Collapse'
          sx={{ marginRight: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            onCollapse(groupId);
          }}
        >
          <ExpandLessIcon />
        </CaretButton>
        <Name>{label}</Name>
        <CountBadge>{count}</CountBadge>
        <Meta>{where}</Meta>
        <Why>{openedBy === 'search' ? 'Opened by search' : 'Opened by you'}</Why>
      </Header>
    </Frame>
  );
});

ExpandFrameNode.displayName = 'ExpandFrameNode';
