// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { createPortal } from 'react-dom';
import { Link as RouterLink } from 'react-router-dom';

import { DropdownMenu } from '@/components/dropdown-menu/DropdownMenu';
import { useScroll } from '@/hooks/useScroll';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import { SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import { alpha, styled } from '@mui/material/styles';

import { useTrailActionsSlot } from '../trail/TrailProvider';

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

const AdditionalFilters = styled('div', {
  shouldForwardProp: (prop) => prop !== '$compactBottom',
})<{ $compactBottom?: boolean }>(({ $compactBottom }) => `
  padding: ${$compactBottom ? '8px 0 0' : '16px 16px 0'};
`);

export interface HeaderProps {
  /** Optional add button text. */
  addButtonText?: string;
  /** Optional delete button text. */
  deleteButtonText?: string;
  /** Optional actions components. */
  actions?: React.ReactNode;
  /** Optional add button click. */
  onAddButtonClick?: () => void;
  /** Optional page the add button links to. Use instead of `onAddButtonClick` when the button only navigates. */
  addButtonTo?: string;
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
   * tabs appear directly below the trail bar with no gap.
   */
  compactBottom?: boolean;
}

/**
 * A page's header: optional Add, Delete and custom action buttons, and a row of
 * filters. The actions go into the trail bar that `Layout` renders above each
 * page, beside the trail; the filters stay at the top of the page.
 */
export const Header = ({
  addButtonText,
  deleteButtonText,
  onAddButtonClick,
  addButtonTo,
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
  const isScrolling = useScroll();
  const { slot } = useTrailActionsSlot();

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
          {addButtonTo ? (
            <Button
              variant='contained'
              size='small'
              color='primary'
              data-testid='header-add-button'
              component={RouterLink}
              to={addButtonTo}
            >
              {addButtonText}
            </Button>
          ) : (
            <Button
              variant='contained'
              size='small'
              color='primary'
              data-testid='header-add-button'
              onClick={() => onAddButtonClick?.()}
            >
              {addButtonText}
            </Button>
          )}
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
    </Stack>
  );

  const hasActions = Boolean(moreItems || actions || addButton || addButtonText || editButton || deleteButtonText || deleteButton);
  const actionsRow = (
    <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }} data-testid='header-actions'>
      {actionsStack}
    </Stack>
  );

  return (
    <>
      {slot && hasActions && createPortal(actionsRow, slot)}
      {filters !== undefined && filters !== null && filters !== false && (
        <Container {...other} isSticky={isScrolling}>
          <AdditionalFilters $compactBottom={compactBottom}>{filters}</AdditionalFilters>
          {!compactBottom && <Divider />}
        </Container>
      )}
    </>
  );
};
