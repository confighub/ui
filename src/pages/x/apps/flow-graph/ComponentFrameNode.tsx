// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo } from 'react';
import { type NodeProps, useStore } from 'reactflow';

import Box from '@mui/material/Box';
import { styled } from '@mui/material/styles';

import { componentTheme } from '../componentTheme';
import {
  FRAME_HEADER_H,
  FRAME_PAD_X,
  type ComponentFrameNodeData,
  frameHeaderScale,
} from './componentFrames';

const Panel = styled(Box)({
  position: 'relative',
  boxSizing: 'border-box',
  borderRadius: componentTheme.radiusMd,
  background: componentTheme.bgComponentFrame,
  border: `1px solid ${componentTheme.borderComponentFrame}`,
  fontFamily: componentTheme.fontSans,
});

/**
 * The header scales up as the canvas zooms out, so the name stays readable
 * when it matters most. It is scaled from its left edge and given the width
 * the scale takes away, so it never grows past the frame.
 */
const Header = styled(Box)({
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: FRAME_HEADER_H,
  padding: `0 ${FRAME_PAD_X - 8}px`,
  transformOrigin: 'left center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  '@media (prefers-reduced-motion: no-preference)': {
    transition: 'transform 0.12s ease-out',
  },
});

const reset = {
  margin: 0,
  border: 0,
  borderRadius: componentTheme.radiusSm,
  background: 'transparent',
  font: 'inherit',
  textAlign: 'left',
} as const;

const focusRing = {
  outline: `2px solid ${componentTheme.accent}`,
  outlineOffset: 1,
} as const;

/** The name opens the Component's own graph, so it looks like a link. */
const NameLink = styled('button')({
  ...reset,
  flexShrink: 1,
  minWidth: 0,
  padding: '4px 8px',
  fontSize: 15,
  fontWeight: 700,
  color: componentTheme.fgDefault,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  cursor: 'pointer',
  '&:hover': { textDecoration: 'underline' },
  '&:focus-visible': { ...focusRing, textDecoration: 'underline' },
  '&:disabled': { cursor: 'default', textDecoration: 'none' },
});

/** The Owner, in the ThemeProvider's caption style; it selects the root Base. */
const OwnerButton = styled('button')({
  ...reset,
  flexShrink: 0,
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: componentTheme.fgMuted,
  cursor: 'pointer',
  '&:hover': { background: 'rgba(17,18,20,0.05)' },
  '&:focus-visible': focusRing,
  '&:disabled': { cursor: 'default', background: 'transparent' },
});

const selectHeaderScale = (s: { transform: [number, number, number] }) =>
  frameHeaderScale(s.transform[2]);

/**
 * The region behind one Component's tree, in a graph of two or more
 * Components. Its header names the Component, and its Owner when the frames
 * of the graph differ in Owner. A click on the name opens the Component's own
 * graph; a click on the Owner selects the Component's root Base.
 */
export const ComponentFrameNode = memo(({ data }: NodeProps<ComponentFrameNodeData>) => {
  const {
    componentName,
    owner,
    showOwner,
    ariaLabel,
    rootId,
    onSelectRoot,
    onOpenComponent,
    width,
    height,
  } = data;
  const scale = useStore(selectHeaderScale);
  const canSelect = onSelectRoot !== undefined && rootId !== null;
  return (
    <Panel
      sx={{ width, height }}
      role='group'
      aria-label={ariaLabel}
      data-testid={`flow-component-frame-${componentName}`}
    >
      <Header
        style={{ transform: `scale(${scale})`, width: `${100 / scale}%` }}
        data-testid='flow-component-frame-header'
      >
        <NameLink
          type='button'
          className='nodrag nopan'
          disabled={!onOpenComponent}
          aria-label={`Open ${componentName} graph`}
          title={`Open the ${componentName} graph`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenComponent?.(componentName, owner);
          }}
        >
          {componentName}
        </NameLink>
        {showOwner && (
          <OwnerButton
            type='button'
            className='nodrag nopan'
            disabled={!canSelect}
            title={canSelect ? `Select the root Base of ${componentName}` : undefined}
            onClick={(event) => {
              event.stopPropagation();
              if (canSelect) onSelectRoot(rootId);
            }}
          >
            {owner}
          </OwnerButton>
        )}
      </Header>
    </Panel>
  );
});

ComponentFrameNode.displayName = 'ComponentFrameNode';
