// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import React, { memo, useCallback, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { FeedbackSurveyDialog } from '@/components/feedback-survey/FeedbackSurveyDialog';
import { Header } from '@/components/header-new/Header';
import { ConfigHubIcon } from '@/components/icons/ConfigHubIcon';
import { DiscordIcon } from '@/components/icons/DiscordIcon';
import { fadeIn } from '@/components/styled';
import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import { useInvokerSidebar } from '@/hooks/useInvokerSidebar';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import { useWindowSize } from '@/hooks/useWindowResize';
import { closeAlert, selectAlert } from '@/state/slices/alert';
import { selectSelectedUnits, setSelectedUnits } from '@/state/slices/selectedUnits';
import { selectTourId, selectTourStatus } from '@/state/slices/tourSlice';
import { TOP_NAV_HEIGHT } from '@/utility/constants';
import { UserSection } from '@/components/user-section/UserSection';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DataObjectIcon from '@mui/icons-material/DataObject';
import EngineeringIcon from '@mui/icons-material/Engineering';
import ExploreIcon from '@mui/icons-material/Explore';
import FeedbackIcon from '@mui/icons-material/Feedback';
import FolderCopyIcon from '@mui/icons-material/FolderCopy';
import FunctionsIcon from '@mui/icons-material/Functions';
import LocalLibraryIcon from '@mui/icons-material/LocalLibrary';
import PublishedWithChangesIcon from '@mui/icons-material/PublishedWithChanges';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import SchemaIcon from '@mui/icons-material/Schema';
import SearchIcon from '@mui/icons-material/Search';
import Storage from '@mui/icons-material/Storage';
import ViewListIcon from '@mui/icons-material/ViewList';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popper from '@mui/material/Popper';
import Slide, { SlideProps } from '@mui/material/Slide';
import Snackbar from '@mui/material/Snackbar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { styled, useTheme } from '@mui/material/styles';

import { InvokerSidebar } from '@/components/right-sidebar';
import { GettingStartedSection } from './GettingStartedSection';
import { INavItem } from './NavGroup';
import { COLLAPSED_SIDEBAR_WIDTH, RightSidebar } from './RightSidebar';

// ============================================================================
// CONSTANTS
// ============================================================================

const RUST = '#ba3d03';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled('div')`
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: ${RUST};
`;

const ContentRow = styled('div')`
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
  background-color: rgb(249, 250, 251);
`;

const MainContent = styled('main')<{
  rightReservedWidth: number;
}>(({ theme, rightReservedWidth }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  width: `calc(100% - ${rightReservedWidth}px)`,
  animation: `${fadeIn} 1.5s ease-in`,
  height: '100%',
  backgroundColor: 'rgb(249, 250, 251)',
  transition: theme.transitions.create(['width', 'margin'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflow: 'hidden',
}));

const ContentArea = styled(Box)({
  flex: 1,
  display: 'flex',
  width: '100%',
  minHeight: 0,
  overflow: 'auto',
});

// ============================================================================
// TOP NAV ITEM COMPONENTS
// ============================================================================

/**
 * Horizontal nav button for top AppBar — handles local routes, external links,
 * and onClick actions. Active route gets a subtle highlight.
 */
const TopNavButton = memo(({ item }: { item: INavItem }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive =
    !!item.navigate &&
    !item.external &&
    (location.pathname === item.navigate ||
      location.pathname.startsWith(item.navigate + '/'));

  const handleClick = useCallback(() => {
    if (item.onClick) {
      item.onClick();
    } else if (item.external && item.navigate) {
      window.open(item.navigate, '_blank', 'noopener,noreferrer');
    } else if (item.navigate) {
      navigate(item.navigate);
    }
  }, [item, navigate]);

  return (
    <Button
      color='inherit'
      size='small'
      startIcon={item.component}
      onClick={handleClick}
      sx={{
        textTransform: 'none',
        fontWeight: isActive ? 600 : 400,
        bgcolor: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
        borderRadius: 1,
        px: 1.5,
        py: 0.75,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        '&:hover': {
          bgcolor: isActive ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)',
        },
      }}
    >
      {item.text}
    </Button>
  );
});

TopNavButton.displayName = 'TopNavButton';

/**
 * "Tools" dropdown button — opens an MUI Menu listing sub-items.
 * Highlights when the current route matches any child route.
 */
const TopNavToolsButton = memo(({ item }: { item: INavItem }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  const hasActiveChild = item.subItems?.some(
    (sub) =>
      !!sub.navigate &&
      (location.pathname === sub.navigate ||
        location.pathname.startsWith(sub.navigate + '/')),
  );

  const handleOpen = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    setAnchor(e.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchor(null);
  }, []);

  const handleSubItemClick = useCallback(
    (sub: INavItem) => {
      handleClose();
      if (sub.navigate) navigate(sub.navigate);
    },
    [handleClose, navigate],
  );

  return (
    <>
      <Button
        color='inherit'
        size='small'
        startIcon={item.component}
        endIcon={<ArrowDropDownIcon />}
        onClick={handleOpen}
        sx={{
          textTransform: 'none',
          fontWeight: hasActiveChild ? 600 : 400,
          bgcolor: hasActiveChild
            ? 'rgba(255,255,255,0.15)'
            : anchor
              ? 'rgba(255,255,255,0.1)'
              : 'transparent',
          borderRadius: 1,
          px: 1.5,
          py: 0.75,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          '&:hover': {
            bgcolor: 'rgba(255,255,255,0.1)',
          },
        }}
      >
        {item.text}
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={handleClose}
        slotProps={{
          paper: {
            elevation: 4,
            sx: { mt: 0.5, minWidth: 210, borderRadius: 1 },
          },
        }}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      >
        {item.subItems?.map((sub) => {
          const isSubActive =
            !!sub.navigate &&
            (location.pathname === sub.navigate ||
              location.pathname.startsWith(sub.navigate + '/'));

          return (
            <MenuItem
              key={sub.text}
              onClick={() => handleSubItemClick(sub)}
              selected={isSubActive}
              sx={{ gap: 1.5, py: 1, minHeight: 40, color: 'text.secondary' }}
            >
              {sub.component}
              <Typography
                variant='body2'
                sx={{ fontWeight: isSubActive ? 600 : 400, color: 'text.primary' }}
              >
                {sub.text}
              </Typography>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
});

TopNavToolsButton.displayName = 'TopNavToolsButton';

// ============================================================================
// NAVIGATION CONFIGURATION
// ============================================================================

/**
 * Whether the Rollouts nav entry is shown.
 *
 * ON, by an explicit product decision taken with the limitation in view. The
 * console is built and verified (`ui/tests/rollouts-page.spec.ts`, which
 * tracks this flag directly, and `ui/tests/rollouts-populated.spec.ts`), but on a
 * server that does not return `InScopeSpaceIDs` every row reports "Not
 * reported" rather than its stages. That was the reason this stayed off — the
 * first impression it gives someone without context. The user has seen that
 * state and the populated-render evidence, and asked for the entry anyway.
 *
 * Kept as a flag rather than inlined so it can go back to `false` in one
 * character if the data gap turns out to be longer-lived than expected.
 */
const SHOW_ROLLOUTS_NAV = true;

const ConfigurationItems: INavItem[] = [
  {
    text: 'Plugin explorer',
    component: <ExploreIcon sx={{ color: 'white' }} />,
    navigate: '/plugins',
    disable: false,
  },
  {
    text: 'Components',
    component: <AccountTreeIcon sx={{ color: 'white' }} />,
    navigate: `/components`,
    disable: false,
  },
  // Sits between Components and Units, per the approved design.
  ...(SHOW_ROLLOUTS_NAV
    ? [
        {
          text: 'Rollouts',
          component: <RocketLaunchIcon sx={{ color: 'white' }} />,
          navigate: `/rollouts`,
          disable: false,
        },
      ]
    : []),
  {
    text: 'Units',
    component: <DataObjectIcon sx={{ color: 'white' }} />,
    navigate: `/units`,
    disable: false,
  },
  {
    text: 'Spaces',
    component: <FolderCopyIcon sx={{ color: 'white' }} />,
    navigate: `/spaces`,
    disable: false,
  },
  {
    text: 'Targets',
    component: <Storage sx={{ color: 'white' }} />,
    navigate: `/targets`,
    disable: false,
  },
  {
    text: 'Workers',
    component: <EngineeringIcon sx={{ color: 'white' }} />,
    navigate: `/bridge-workers`,
    disable: false,
  },
  {
    text: 'Tools',
    component: <WorkspacesIcon sx={{ color: 'white' }} />,
    disable: false,
    subItems: [
      {
        text: 'Dashboard',
        component: <DashboardIcon sx={{ fontSize: 18 }} />,
        navigate: `/unit-dashboard`,
        disable: false,
      },
      {
        text: 'Functions',
        component: <FunctionsIcon sx={{ fontSize: 18 }} />,
        navigate: `/function-browser`,
        disable: false,
      },
      {
        text: 'View Explorer',
        component: <SearchIcon sx={{ fontSize: 18 }} />,
        navigate: `/x/view-explorer`,
        disable: false,
      },
      {
        text: 'Resource Explorer',
        component: <ViewListIcon sx={{ fontSize: 18 }} />,
        navigate: `/x/resource-explorer`,
        disable: false,
      },
      {
        text: 'Initiatives',
        component: <PublishedWithChangesIcon sx={{ fontSize: 18 }} />,
        navigate: `/x/initiatives`,
        disable: false,
      },
      {
        // Authoring a ChangeWorkflow. Runs on local fixtures, not the API yet.
        text: 'Workflow Builder',
        component: <SchemaIcon sx={{ fontSize: 18 }} />,
        navigate: `/x/workflow-builder`,
        disable: false,
      },
    ],
  },
];

const SupportItems = (onFeedbackClick: () => void): INavItem[] => [
  {
    text: 'Feedback',
    component: <FeedbackIcon sx={{ color: 'white' }} />,
    disable: false,
    onClick: onFeedbackClick,
  },
  {
    text: 'Discord',
    component: <DiscordIcon color='white' />,
    navigate: `https://discord-auth.confighub.net/discord/join`,
    disable: false,
    external: true,
  },
  {
    text: 'Docs',
    component: <LocalLibraryIcon sx={{ color: 'white' }} />,
    navigate: `https://docs.confighub.com`,
    disable: false,
    external: true,
  },
];

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const SlideTransition = (props: SlideProps) => {
  return <Slide {...props} direction='up' />;
};

// ============================================================================
// MAIN LAYOUT COMPONENT
// ============================================================================

/**
 * Main Layout Component
 * Manages the overall application layout with a fixed top AppBar (rust background)
 * replacing the former left sidebar drawer.
 */
export const Layout = memo(() => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { message, isOpen: snackBarIsOpen, type: severity } = useAppSelector(selectAlert);
  const location = useLocation();
  const [gettingStartedAnchor, setGettingStartedAnchor] = useState<null | HTMLElement>(null);
  const activeTourId = useAppSelector(selectTourId);
  const tourStatus = useAppSelector(selectTourStatus);
  // `completeTour` (and an interrupted tour left mid-run) never clears
  // `tourId` — only `exitTour` does — so a bare tourId check would hide this
  // popover forever after the user's very first tour, including a full,
  // successful completion. 'running' and 'finished' are the only states
  // where a second, unrelated overlay genuinely shouldn't compete with the
  // tour — 'finished' still has its own completion screen on screen, even
  // though the tour itself is no longer advancing steps.
  const isGettingStartedOpen =
    Boolean(gettingStartedAnchor) &&
    !(activeTourId && (tourStatus === 'running' || tourStatus === 'finished'));

  const isDashboardPage = location.pathname === '/unit-dashboard';

  const { width: windowWidth } = useWindowSize();
  const {
    sidebarWidth,
    isSidebarOpen,
    isMaximized,
    isFeedbackDialogOpen,
    setIsFeedbackDialogOpen,
    toggleSidebar,
    handleResizeStart,
    toggleMaximize,
  } = useResizableSidebar();

  const effectiveSidebarWidth = isMaximized && isSidebarOpen ? windowWidth : sidebarWidth;

  // Invoker sidebar — no left nav offset needed in the top-nav layout
  const invoker = useInvokerSidebar(0);

  const rightReservedWidth = isDashboardPage
    ? isSidebarOpen
      ? effectiveSidebarWidth
      : COLLAPSED_SIDEBAR_WIDTH
    : 0;

  // Feed the global Invoker sidebar the units currently selected anywhere
  // in the app (populated by each page via the selectedUnits slice).
  const reduxSelectedUnits = useAppSelector(selectSelectedUnits);
  const invokerSelectedUnits = useMemo(
    () =>
      (reduxSelectedUnits ?? [])
        .filter(
          (u) => u.Unit?.UnitID && u.Unit?.Slug && u.Unit?.ToolchainType && u.Unit?.SpaceID,
        )
        .map((u) => ({
          id: u.Unit!.UnitID!,
          name: u.Unit!.Slug,
          toolchainType: u.Unit!.ToolchainType,
          spaceId: u.Unit!.SpaceID!,
          spaceName: u.Space?.Slug,
        })),
    [reduxSelectedUnits],
  );

  const handleInvokerRemoveUnit = useCallback(
    (unitId: string) => {
      dispatch(
        setSelectedUnits({
          units: (reduxSelectedUnits ?? []).filter((u) => u.Unit?.UnitID !== unitId),
        }),
      );
    },
    [dispatch, reduxSelectedUnits],
  );

  const handleInvokerRemoveAllUnits = useCallback(() => {
    dispatch(setSelectedUnits({ units: [] }));
  }, [dispatch]);

  // Memoize support items to prevent recreation on every render
  const supportItems = useMemo(
    () => SupportItems(() => setIsFeedbackDialogOpen(true)),
    [setIsFeedbackDialogOpen],
  );

  const handleCloseAlert = useCallback(() => {
    dispatch(closeAlert());
  }, [dispatch]);

  const handleCloseFeedback = useCallback(() => {
    setIsFeedbackDialogOpen(false);
  }, [setIsFeedbackDialogOpen]);

  return (
    <Container>
      {/* ── Top Navigation AppBar ─────────────────────────────────────── */}
      <AppBar
        position='fixed'
        elevation={0}
        sx={{
          bgcolor: RUST,
          color: 'white',
          height: TOP_NAV_HEIGHT,
          zIndex: theme.zIndex.drawer + 1,
          boxShadow: 'none',
          borderRadius: 0,
        }}
      >
        <Toolbar
          variant='dense'
          sx={{
            minHeight: `${TOP_NAV_HEIGHT}px !important`,
            height: TOP_NAV_HEIGHT,
            px: { xs: 1, sm: 2 },
            gap: 0.5,
            color: 'white',
            '& .MuiButton-root': { color: 'white' },
            '& .MuiIconButton-root': { color: 'white' },
            '& .MuiTypography-root': { color: 'white' },
            '& .MuiSvgIcon-root': { color: 'white' },
          }}
        >
          {/* Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', mr: 1.5, flexShrink: 0 }}>
            <ConfigHubIcon color='white' height='28px' width='28px' />
            <Typography
              color='white'
              variant='subtitle2'
              fontWeight={700}
              sx={{ ml: 1, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}
            >
              ConfigHub
            </Typography>
          </Box>

          <Divider
            orientation='vertical'
            flexItem
            sx={{ borderColor: 'rgba(255,255,255,0.25)', mx: 0.5 }}
          />

          {/* Primary nav items */}
          {ConfigurationItems.map((item) =>
            item.subItems ? (
              <TopNavToolsButton key={item.text} item={item} />
            ) : (
              <TopNavButton key={item.text} item={item} />
            ),
          )}

          {/* Flexible spacer */}
          <Box sx={{ flex: 1 }} />

          {/* Get started — right-aligned, before support items */}
          <Button
            data-testid='get-started-nav-button'
            color='inherit'
            size='small'
            startIcon={<ExploreIcon sx={{ color: 'white' }} />}
            onClick={(e) =>
              setGettingStartedAnchor((prev) => (prev ? null : e.currentTarget))
            }
            sx={{
              textTransform: 'none',
              fontWeight: 400,
              bgcolor: isGettingStartedOpen ? 'rgba(255,255,255,0.15)' : 'transparent',
              borderRadius: 1,
              px: 1.5,
              py: 0.75,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
            }}
          >
            Get started
          </Button>
          <Popper
            open={isGettingStartedOpen}
            anchorEl={gettingStartedAnchor}
            placement='bottom-end'
            sx={{ zIndex: theme.zIndex.drawer + 2 }}
            modifiers={[{ name: 'offset', options: { offset: [0, 8] } }]}
          >
            <ClickAwayListener onClickAway={() => setGettingStartedAnchor(null)}>
              {/* The panel supplies its own surface, border and shadow — this
                  wrapper only sets the dropdown width and its scroll bound. */}
              <Box sx={{ width: 336, maxHeight: 'calc(100vh - 72px)', overflowY: 'auto' }}>
                <GettingStartedSection isNavOpen />
              </Box>
            </ClickAwayListener>
          </Popper>

          {/* Support items — right-aligned */}
          {supportItems.map((item) => (
            <TopNavButton key={item.text} item={item} />
          ))}

          <Divider
            orientation='vertical'
            flexItem
            sx={{ borderColor: 'rgba(255,255,255,0.25)', mx: 0.5 }}
          />

          {/* Account */}
          <Box sx={{ display: 'flex', alignItems: 'center', mx: 0.5 }}>
            <UserSection />
          </Box>
        </Toolbar>
      </AppBar>

      {/* Spacer — pushes content below the fixed AppBar */}
      <Box sx={{ height: `${TOP_NAV_HEIGHT}px`, flexShrink: 0 }} />

      {/* ── Content row: MainContent + right sidebars ────────────────── */}
      <ContentRow>
        <MainContent rightReservedWidth={rightReservedWidth}>
          {/* Only show the new header for the dashboard page */}
          {isDashboardPage && <Header breadcrumbs={[{ name: 'Units' }]} showFilters={true} />}
          <ContentArea>
            <Outlet />
          </ContentArea>
        </MainContent>

        {/* Global Invoker Sidebar — flex sibling on non-dashboard pages */}
        {!isDashboardPage && (
          <InvokerSidebar
            selectedUnits={invokerSelectedUnits.length > 0 ? invokerSelectedUnits : undefined}
            onRemoveUnit={handleInvokerRemoveUnit}
            onRemoveAllUnits={handleInvokerRemoveAllUnits}
            totalVisibleUnits={invokerSelectedUnits.length}
            isOpen={invoker.isOpen}
            panelWidth={invoker.panelWidth}
            isResizing={invoker.isResizing}
            onToggle={invoker.toggle}
            onOpen={invoker.open}
            onClose={invoker.close}
            onResizeStart={invoker.handleResizeStart}
          />
        )}

        {/* Collapsible Right Sidebar — dashboard page only */}
        {isDashboardPage && (
          <RightSidebar
            width={effectiveSidebarWidth}
            isOpen={isSidebarOpen}
            isMaximized={isMaximized}
            onResizeStart={handleResizeStart}
            onToggle={toggleSidebar}
            onExpand={toggleMaximize}
          />
        )}
      </ContentRow>

      {/* Feedback Dialog */}
      <FeedbackSurveyDialog open={isFeedbackDialogOpen} onClose={handleCloseFeedback} />

      {/* Global Alert Snackbar */}
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        open={snackBarIsOpen}
        onClose={handleCloseAlert}
        TransitionComponent={SlideTransition}
        key='slideTransition'
      >
        <Alert
          onClose={handleCloseAlert}
          severity={severity}
          variant='filled'
          sx={{ width: '100%' }}
        >
          {message}
        </Alert>
      </Snackbar>
    </Container>
  );
});

Layout.displayName = 'Layout';
