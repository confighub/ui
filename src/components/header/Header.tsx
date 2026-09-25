// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { DropdownMenu } from '@/components/dropdown-menu/DropdownMenu';
import { NavLink } from '@/components/nav-link/NavLink';
import { Ellipses } from '@/components/styled';
import { useScroll } from '@/hooks/useScroll';
import { Domains } from '@/types/enums';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import { SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import { alpha, styled } from '@mui/material/styles';

import { ActionsPopover } from '../actions-popover/ActionsPopover';
import { useUserInfo } from '../authenticated-context/AuthenticatedContext';
import { CopyToClipboard } from '../copy-to-clipboard/CopyToClipboard';
import { OrganizationSwitcher } from '@/components/organization-switcher/OrganizationSwitcher';
import { buildShareableUrl } from '@/hooks/useOrgQueryParam';

const Container = styled('div', {
  shouldForwardProp: (prop) => prop !== 'isSticky',
})<{ isSticky: boolean }>(({ theme, isSticky }) => ({
  alignSelf: 'flex-start',
  position: 'sticky',
  top: 0,
  // padding: theme.spacing(0, 2, 0, 2),
  width: '100%',
  zIndex: theme.zIndex.appBar,
  backgroundColor: isSticky ? alpha(theme.palette.background.paper, 0.95) : 'white',
  transition: 'background-color 200ms ease-in-out',
}));

const FilterSection = styled('div', {
  shouldForwardProp: (prop) => prop !== '$compactBottom',
})<{ $compactBottom?: boolean }>(({ $compactBottom }) => `
  display: flex;
  justify-content: space-between;
  padding: ${$compactBottom ? '16px 16px 0' : '16px'};
`);

const AdditionalFilters = styled('div', {
  shouldForwardProp: (prop) => prop !== '$compactBottom',
})<{ $compactBottom?: boolean }>(({ $compactBottom }) => `
  padding: ${$compactBottom ? '8px 0 0' : '0 16px'};
`);

export type BreadCrumbIconType = { [key in Domains]: React.ReactNode };

export interface HeaderProps {
  /** BreadCrumbs array. */
  breadCrumbs: Array<{
    name: string | React.ReactNode;
    isLink?: boolean;
    link?: string;
    state?: unknown;
  }>;
  /** Optional add button text. */
  addButtonText?: string;
  /** Optional delete button text. */
  deleteButtonText?: string;
  /** Optional actions components. */
  actions?: React.ReactNode;
  /** Optional add button click. */
  onAddButtonClick?: () => void;
  /** Optional delete button click. */
  onDeleteButtonClicked?: () => void;
  /** Optional customizable delete button. */
  deleteButton?: React.ReactNode;
  /** Optional customizable edit button. */
  editButton?: React.ReactNode;
  /** Optional customizable add button. */
  addButton?: React.ReactNode;
  moreItems?: {
    onChange: (event: SelectChangeEvent<unknown>) => void;
    items: Array<{
      label: string;
      value: string;
      disabled?: boolean;
      tooltip?: string;
      group?: string;
    }>;
    disabled?: boolean;
    disabledTooltip?: string;
  };
  filters?: React.ReactNode;
  /**
   * When true, removes the bottom padding from the header row and suppresses
   * the bottom Divider. Use when the `filters` slot contains a full-width tab
   * strip (e.g. ViewTabs) that provides its own bottom border — this makes the
   * tabs appear directly below the breadcrumb row with no gap.
   */
  compactBottom?: boolean;
}

/** Primary component for Page Headers.  This component uses a breadcrumb and optional buttons of Add, Delete and custom actions as components. */
export const Header = ({
  breadCrumbs,
  addButtonText,
  deleteButtonText,
  onAddButtonClick,
  onDeleteButtonClicked,
  actions,
  deleteButton,
  editButton,
  addButton,
  moreItems,
  filters,
  compactBottom = false,
  ...other
}: HeaderProps) => {
  const { userInfo } = useUserInfo();
  const isScrolling = useScroll();

  // state
  const [enableDrag, setEnableDrag] = useState(false);

  const actionsStack = (
    <Stack direction='row-reverse' sx={{ alignItems: 'center' }} spacing={1}>
      {moreItems && (
        <DropdownMenu
          label='More'
          onChange={moreItems.onChange}
          items={moreItems.items}
          ariaLabel='More'
          disabled={moreItems.disabled}
          disabledTooltip={moreItems.disabledTooltip}
        />
      )}
      {actions}
      {addButton}
      {addButtonText && (
        <Box>
          <Button
            variant='contained'
            size='small'
            color='primary'
            data-testid='header-add-button'
            onClick={() => onAddButtonClick?.()}
          >
            {addButtonText}
          </Button>
        </Box>
      )}
      {editButton}
      {deleteButtonText && (
        <Box>
          <Button variant='contained' size='small' onClick={() => onDeleteButtonClicked?.()}>
            {deleteButtonText}
          </Button>
        </Box>
      )}
      {deleteButton}
      <Box>
        <Button
          size='small'
          sx={{
            position: 'relative',
            top: '1px',
          }}
          onClick={() => setEnableDrag((prevSelected) => !prevSelected)}
        >
          {enableDrag ? <CloseIcon /> : <DragIndicatorIcon />}
        </Button>
      </Box>
    </Stack>
  );

  return (
    <Container {...other} isSticky={isScrolling}>
      <FilterSection $compactBottom={compactBottom}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Breadcrumbs aria-label='breadcrumb'>
            <OrganizationSwitcher currentOrganizationId={userInfo.ExternalOrganizationID || ''} />
            {breadCrumbs.map((breadCrumb, index) => (
              <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }} key={index}>
                {breadCrumb?.isLink ? (
                  <NavLink to={breadCrumb?.link || ''} state={breadCrumb?.state}>
                    <Ellipses
                      variant='body2'
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        maxWidth: '250px',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        color: 'secondary.main',
                      }}
                    >
                      {breadCrumb?.name}
                    </Ellipses>
                  </NavLink>
                ) : (
                  <Ellipses
                    variant='subtitle1'
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      maxWidth: '250px',
                      textDecoration: 'none',
                      cursor: 'default',
                      color: 'text.primary',
                    }}
                  >
                    {breadCrumb?.name}
                  </Ellipses>
                )}
              </Stack>
            ))}
          </Breadcrumbs>
          <CopyToClipboard
            text={userInfo.ExternalOrganizationID ? buildShareableUrl(userInfo.ExternalOrganizationID) : ''}
            title='Copy shareable link with org context'
            sx={{ ml: 0.5 }}
          />
        </Box>
        <Box sx={{ height: '32px' }}>
          <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}>
            {enableDrag ? <ActionsPopover actions={<>{actionsStack}</>} /> : actionsStack}
          </Stack>
        </Box>
      </FilterSection>
      <AdditionalFilters $compactBottom={compactBottom}>{filters}</AdditionalFilters>
      {!compactBottom && <Divider />}
    </Container>
  );
};
