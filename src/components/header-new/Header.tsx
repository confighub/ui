// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo } from 'react';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { DropdownMenu } from '@/components/dropdown-menu/DropdownMenu';
import { NavLink } from '@/components/nav-link/NavLink';
import { Ellipses } from '@/components/styled';
import { buildShareableUrl } from '@/hooks/useOrgQueryParam';
import { useScroll } from '@/hooks/useScroll';
import { useGetMeQuery } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import { alpha, styled } from '@mui/material/styles';

import { HeaderModals } from './HeaderModals';
import { OrganizationSwitcher } from '@/components/organization-switcher/OrganizationSwitcher';
import { useHeaderBulkActions } from './useHeaderBulkActions';
import { useHeaderQueryBuilder } from './useHeaderQueryBuilder';

// ============================================================================
// Types
// ============================================================================

/** Single breadcrumb item configuration */
export interface BreadcrumbItem {
  name: string | React.ReactNode;
  isLink?: boolean;
  link?: string;
  state?: unknown;
}

/** Props for the Header component */
export interface IHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  showFilters?: boolean;
  showMoreMenu?: boolean;
}

// ============================================================================
// Styled
// ============================================================================

const Container = styled('header', {
  shouldForwardProp: (prop) => prop !== '$isSticky',
})<{ $isSticky: boolean }>(({ theme, $isSticky }) => ({
  position: 'sticky',
  top: 0,
  width: '100%',
  zIndex: theme.zIndex.appBar,
  backgroundColor: $isSticky ? alpha(theme.palette.background.paper, 0.95) : 'white',
  backdropFilter: $isSticky ? 'blur(8px)' : 'none',
  transition: 'background-color 200ms ease-in-out, backdrop-filter 200ms ease-in-out',
}));

const TopRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: theme.spacing(1, 1, 0, 1),
  minHeight: 50,
}));

const LeftSection = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  flex: 1,
  minWidth: 0,
});

const RightSection = styled(Stack)({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
});

const FilterRow = styled(Box)(({ theme }) => ({
  padding: theme.spacing(0, 0, 1, 1),
}));

// ============================================================================
// Sub-components
// ============================================================================

const BreadcrumbItemComponent = memo<{ item: BreadcrumbItem }>(({ item }) => {
  if (item.isLink && item.link) {
    return (
      <NavLink to={item.link} state={item.state}>
        <Ellipses
          variant='body2'
          sx={{
            display: 'flex',
            alignItems: 'center',
            maxWidth: 250,
            textDecoration: 'underline',
            cursor: 'pointer',
            color: 'secondary.main',
          }}
        >
          {item.name}
        </Ellipses>
      </NavLink>
    );
  }

  return (
    <Ellipses
      variant='subtitle1'
      sx={{
        display: 'flex',
        alignItems: 'center',
        maxWidth: 250,
        color: 'text.primary',
      }}
    >
      {item.name}
    </Ellipses>
  );
});

BreadcrumbItemComponent.displayName = 'BreadcrumbItemComponent';

// ============================================================================
// Header
// ============================================================================

export const Header = memo<IHeaderProps>(
  ({ breadcrumbs, showFilters, showMoreMenu = true }) => {
    const { data: meData } = useGetMeQuery();
    const isScrolling = useScroll();
    const { QueryBuilderElement } = useHeaderQueryBuilder();
    const { unitsToEdit, moreMenuConfig, modalsOpen, closeModal } = useHeaderBulkActions();

    return (
      <Container $isSticky={isScrolling}>
        <TopRow>
          <LeftSection>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Breadcrumbs aria-label='breadcrumb'>
                <OrganizationSwitcher
                  currentOrganizationId={meData?.ExternalOrganizationID || ''}
                />
                {breadcrumbs.map((item, index) => (
                  <BreadcrumbItemComponent key={index} item={item} />
                ))}
              </Breadcrumbs>
              <CopyToClipboard
                text={meData?.ExternalOrganizationID ? buildShareableUrl(meData.ExternalOrganizationID) : ''}
                title='Copy shareable link with org context'
                sx={{ ml: 0.5 }}
              />
            </Box>
          </LeftSection>

          <RightSection direction='row' spacing={1}>
            {showMoreMenu && (
              <Stack direction='row' spacing={1} alignItems='center'>
                <DropdownMenu
                  label='More'
                  onChange={moreMenuConfig.onChange}
                  items={moreMenuConfig.items}
                  ariaLabel='More'
                  disabled={moreMenuConfig.disabled}
                  disabledTooltip={moreMenuConfig.disabledTooltip}
                />
              </Stack>
            )}
          </RightSection>
        </TopRow>

        {showFilters && <FilterRow>{QueryBuilderElement}</FilterRow>}
        <Divider />

        <HeaderModals
          unitsToEdit={unitsToEdit}
          modalsOpen={modalsOpen}
          closeModal={closeModal}
        />
      </Container>
    );
  },
);

Header.displayName = 'Header';
