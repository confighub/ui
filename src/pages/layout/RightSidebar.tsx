// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useState } from 'react';

// import { ChangeSetBrowser } from '../../unit-list/changeset-browser/ChangeSetBrowser';
import { FunctionBrowser } from '@/components/function-browser/FunctionBrowser';
import { SidebarPanel } from '@/state/slices/layoutSlice';
import CloseIcon from '@mui/icons-material/Close';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import Functions from '@mui/icons-material/Functions';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled, useTheme } from '@mui/material/styles';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLAPSED_SIDEBAR_WIDTH = 48;

export interface RightSidebarProps {
  /** Width of the sidebar when expanded */
  width: number;
  /** Whether the sidebar is open/expanded */
  isOpen: boolean;
  /** Callback when resize handle is dragged */
  onResizeStart: () => void;
  /** Callback to toggle open/closed state */
  onToggle: () => void;
  /** Callback when expand button is clicked */
  onExpand: () => void;
  /** Whether the sidebar is currently maximized */
  isMaximized?: boolean;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const ResizableSidebar = styled(Box)<{ width: number }>(({ theme, width }) => ({
  width: `${width}px`,
  height: '100vh',
  position: 'relative',
  backgroundColor: theme.palette.background.paper,
  borderLeft: `1px solid ${theme.palette.divider}`,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}));

const ResizeHandle = styled(Box)(({ theme }) => ({
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: '6px',
  cursor: 'ew-resize',
  backgroundColor: 'transparent',
  transition: 'background-color 0.2s',
  zIndex: 10,
  '&:hover': {
    borderLeft: `2px solid ${theme.palette.primary.main}`,
  },
  '&:active': {
    borderLeft: `2px solid ${theme.palette.primary.dark}`,
  },
}));

const SidebarContent = styled(Box)(() => ({
  flex: 1,
  overflow: 'auto',
  // padding: theme.spacing(2),
}));

const SidebarHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(1),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

const CollapsedRail = styled(Box)(({ theme }) => ({
  width: COLLAPSED_SIDEBAR_WIDTH,
  height: '100vh',
  backgroundColor: theme.palette.grey[800],
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}));

interface RailButtonProps {
  $active?: boolean;
}

const RailButton = styled(ButtonBase, {
  shouldForwardProp: (prop) => prop !== '$active',
})<RailButtonProps>(({ theme, $active }) => ({
  width: '100%',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: theme.transitions.create('background-color', {
    duration: theme.transitions.duration.short,
  }),
  backgroundColor: $active ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
  '&:hover': {
    backgroundColor: theme.palette.grey[700],
  },
}));

const VerticalText = styled(Typography)({
  writingMode: 'vertical-rl',
  textOrientation: 'mixed',
  transform: 'rotate(180deg)',
  letterSpacing: '0.1em',
  fontWeight: 600,
  textTransform: 'uppercase',
  fontSize: '0.75rem',
});

const PANEL_TITLES: Record<SidebarPanel, string> = {
  functions: 'Function Invoker',
  changesets: 'Change Sets',
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Right Sidebar Component - Collapsed rail with panel buttons,
 * each opening its own expanded panel.
 */
export const RightSidebar = memo(
  ({ width, isOpen, isMaximized, onResizeStart, onToggle, onExpand }: RightSidebarProps) => {
    const theme = useTheme();
    const [isFunctionPanelOpen, setIsFunctionPanelOpen] = useState(false);

    const handleSideBarClick = useCallback(() => {
      setIsFunctionPanelOpen((prev) => !prev);
      if (!isOpen) {
        onToggle();
      }
    }, [isOpen, onToggle]);

    const handleClose = useCallback(() => {
      onToggle();
    }, [onToggle]);

    // Collapsed state - vertical rail with icon buttons
    if (!isOpen) {
      return (
        <CollapsedRail>
          <RailButton onClick={handleSideBarClick} $active={isFunctionPanelOpen}>
            <Functions sx={{ color: theme.palette.grey[400], mb: 1 }} />
            <VerticalText color={theme.palette.grey[400]}>Functions</VerticalText>
          </RailButton>
        </CollapsedRail>
      );
    }

    // Expanded state
    return (
      <ResizableSidebar width={width}>
        {!isMaximized && <ResizeHandle onMouseDown={onResizeStart} />}
        <SidebarHeader>
          <Typography variant='subtitle2' fontWeight={600}>
            {PANEL_TITLES['functions']}
          </Typography>
          <Stack direction='row' spacing={0.5}>
            <IconButton
              size='small'
              onClick={onExpand}
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <CloseFullscreenIcon fontSize='small' />
              ) : (
                <OpenInFullIcon fontSize='small' />
              )}
            </IconButton>
            <IconButton size='small' onClick={handleClose} title='Close'>
              <CloseIcon fontSize='small' />
            </IconButton>
          </Stack>
        </SidebarHeader>
        <SidebarContent>
          <FunctionBrowser />
        </SidebarContent>
      </ResizableSidebar>
    );
  },
);

RightSidebar.displayName = 'RightSidebar';

export { COLLAPSED_SIDEBAR_WIDTH };
