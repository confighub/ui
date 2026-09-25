// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useState } from 'react';

import { NavLink } from '@/components/nav-link/NavLink';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Collapse from '@mui/material/Collapse';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { alpha, styled } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';

/**
 * Section Label Component - Memoized to prevent unnecessary re-renders
 */
const SectionLabel = memo(({ label, isNavOpen }: { label: string; isNavOpen: boolean }) => (
  <ListItem sx={{ py: 0.5, px: 2.5 }}>
    <Typography
      variant='caption'
      sx={{
        color: 'rgba(255, 255, 255, 0.6)',
        fontWeight: 600,
        fontSize: '0.7rem',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        opacity: isNavOpen ? 1 : 0,
        transition: 'opacity 0.2s',
      }}
    >
      {label}
    </Typography>
  </ListItem>
));

SectionLabel.displayName = 'SectionLabel';

export interface INavItem {
  text: string;
  component: React.ReactNode;
  navigate?: string;
  disable: boolean;
  external?: boolean;
  onClick?: () => void;
  /** Optional sub-items rendered as an expandable dropdown below this item */
  subItems?: INavItem[];
}

const StyledNavLink = styled(NavLink)`
  flex: 1;
`;

const ExternalNavLink = styled('a')`
  flex: 1;
  text-decoration: none;
  color: inherit;
`;

const SubItemButton = styled(ListItemButton)(({ theme }) => ({
  minHeight: 36,
  paddingLeft: theme.spacing(4.5),
  paddingRight: theme.spacing(2.5),
  borderRadius: '8px',
  marginBottom: theme.spacing(0.25),
  marginLeft: theme.spacing(1),
  marginRight: theme.spacing(1),
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  '&.active': {
    backgroundColor: alpha('#ffffff', 0.15),
  },
}));

/**
 * Navigation Item Component - Memoized for performance
 */
export const NavItem = memo(({ item, isNavOpen }: { item: INavItem; isNavOpen: boolean }) => {
  const location = useLocation();
  const isActive =
    !!item.navigate &&
    (location.pathname === item.navigate ||
      location.pathname.startsWith(item.navigate + '/'));

  const content = (
    <ListItemButton
      onClick={item.onClick}
      sx={[
        {
          minHeight: 40,
          px: 2.5,
          borderRadius: isNavOpen ? '8px' : '50%',
          mx: isNavOpen ? 1 : 1.5,
          mb: 0.5,
          backgroundColor: isActive ? 'rgba(255, 255, 255, 0.18)' : 'transparent',
          '&:hover': {
            backgroundColor: isActive
              ? 'rgba(255, 255, 255, 0.22)'
              : 'rgba(255, 255, 255, 0.1)',
          },
        },
        isNavOpen ? { justifyContent: 'initial' } : { justifyContent: 'center' },
      ]}
    >
      <ListItemIcon
        sx={[
          {
            minWidth: 0,
            justifyContent: 'center',
          },
          isNavOpen ? { mr: 2 } : { mr: 'auto' },
        ]}
      >
        {item.component}
      </ListItemIcon>
      <ListItemText
        primary={
          <Typography color='white' variant='body2' sx={{ fontWeight: 500 }}>
            {item.text}
          </Typography>
        }
        sx={[isNavOpen ? { opacity: 1 } : { opacity: 0 }]}
      />
    </ListItemButton>
  );

  return (
    <ListItem key={item.text} disablePadding sx={{ display: 'block' }}>
      {item.onClick ? (
        content
      ) : item.external ? (
        <ExternalNavLink href={item.navigate} target='_blank' rel='noopener noreferrer'>
          {content}
        </ExternalNavLink>
      ) : (
        <StyledNavLink to={item.navigate || ''}>{content}</StyledNavLink>
      )}
    </ListItem>
  );
});

NavItem.displayName = 'NavItem';

/**
 * Navigation Item with expandable sub-items dropdown.
 * When the sidebar is open, a chevron toggles the sub-item list.
 * When the sidebar is collapsed, sub-items are hidden (icon-only mode).
 * Auto-expands when the current route matches a child route.
 */
const NavItemWithDropdown = memo(
  ({ item, isNavOpen }: { item: INavItem; isNavOpen: boolean }) => {
    const location = useLocation();

    // Check if any sub-item matches the current route
    const hasActiveChild = !!item.subItems?.some(
      (sub) =>
        sub.navigate &&
        (location.pathname === sub.navigate ||
          location.pathname.startsWith(sub.navigate + '/')),
    );

    const [open, setOpen] = useState(hasActiveChild);
    const isExpanded = open && isNavOpen;

    const handleToggle = () => setOpen((prev) => !prev);

    return (
      <ListItem disablePadding sx={{ display: 'block' }}>
        {/* Main row */}
        <ListItemButton
          onClick={handleToggle}
          sx={[
            {
              minHeight: 40,
              px: 2.5,
              borderRadius: isNavOpen ? '8px' : '50%',
              mx: isNavOpen ? 1 : 1.5,
              mb: 0.5,
              backgroundColor: hasActiveChild ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
              '&:hover': {
                backgroundColor: hasActiveChild
                  ? 'rgba(255, 255, 255, 0.18)'
                  : 'rgba(255, 255, 255, 0.1)',
              },
            },
            isNavOpen ? { justifyContent: 'initial' } : { justifyContent: 'center' },
          ]}
        >
          <ListItemIcon
            sx={[
              { minWidth: 0, justifyContent: 'center' },
              isNavOpen ? { mr: 2 } : { mr: 'auto' },
            ]}
          >
            {item.component}
          </ListItemIcon>
          <ListItemText
            primary={
              <Typography color='white' variant='body2' sx={{ fontWeight: 500 }}>
                {item.text}
              </Typography>
            }
            sx={[isNavOpen ? { opacity: 1 } : { opacity: 0 }]}
          />
          {isNavOpen &&
            (open ? (
              <ExpandLessIcon sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 18 }} />
            ) : (
              <ExpandMoreIcon sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 18 }} />
            ))}
        </ListItemButton>

        {/* Sub-items — collapse instantly when sidebar is closed to avoid empty space */}
        <Collapse in={isExpanded} timeout={isNavOpen ? 'auto' : 0} unmountOnExit>
          {item.subItems?.map((sub) => {
            const isSubActive =
              !!sub.navigate &&
              (location.pathname === sub.navigate ||
                location.pathname.startsWith(sub.navigate + '/'));

            return (
              <ListItem key={sub.text} disablePadding sx={{ display: 'block' }}>
                {sub.onClick ? (
                  <SubItemButton onClick={sub.onClick}>
                    <ListItemIcon sx={{ minWidth: 0, mr: 1.5, justifyContent: 'center' }}>
                      {sub.component}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography color='white' variant='body2' sx={{ fontWeight: 400, fontSize: '0.8125rem' }}>
                          {sub.text}
                        </Typography>
                      }
                    />
                  </SubItemButton>
                ) : (
                  <StyledNavLink to={sub.navigate || ''}>
                    <SubItemButton
                      sx={
                        isSubActive
                          ? { backgroundColor: 'rgba(255,255,255,0.15)' }
                          : undefined
                      }
                    >
                      <ListItemIcon sx={{ minWidth: 0, mr: 1.5, justifyContent: 'center' }}>
                        {sub.component}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography color='white' variant='body2' sx={{ fontWeight: isSubActive ? 600 : 400, fontSize: '0.8125rem' }}>
                            {sub.text}
                          </Typography>
                        }
                      />
                    </SubItemButton>
                  </StyledNavLink>
                )}
              </ListItem>
            );
          })}
        </Collapse>
      </ListItem>
    );
  },
);

NavItemWithDropdown.displayName = 'NavItemWithDropdown';

/**
 * Navigation Group Component - Memoized for performance
 */
export const NavGroup = memo(
  ({
    items,
    label,
    isNavOpen,
    showLabel = true,
  }: {
    items: INavItem[];
    label?: string;
    isNavOpen: boolean;
    showLabel?: boolean;
  }) => (
    <>
      {showLabel && label && <SectionLabel label={label} isNavOpen={isNavOpen} />}
      {items.map((item) =>
        item.subItems ? (
          <NavItemWithDropdown key={item.text} item={item} isNavOpen={isNavOpen} />
        ) : (
          <NavItem key={item.text} item={item} isNavOpen={isNavOpen} />
        ),
      )}
    </>
  ),
);

NavGroup.displayName = 'NavGroup';
