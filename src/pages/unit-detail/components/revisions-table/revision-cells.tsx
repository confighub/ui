// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Link as RouterLink } from 'react-router-dom';

import { INFO_PEEK_TOOLTIP_SX, InfoPeekCard } from '@/components/info-peek/InfoPeek';
import { changeSetPath } from '@/pages/change-sets/changeSetAddress';
import { CenteredTableCell } from '@/components/styled';
import { ChangeSetRead } from '@confighub/rtk-query';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { styled, useTheme } from '@mui/material/styles';

export const TagsScrollContainer = styled(Stack)(({ theme }) => ({
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'thin',
  scrollbarColor: `${theme.palette.action.disabled} transparent`,
  '&::-webkit-scrollbar': {
    height: 1,
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    borderRadius: 2,
    backgroundColor: theme.palette.action.active,
  },
}));

export const CountChip = ({
  count,
  color,
  names,
}: {
  count: number;
  color: 'error' | 'warning' | 'success' | 'default';
  names: string[];
}) => {
  if (count === 0) return <CenteredTableCell sx={{ justifyContent: 'center' }} />;
  return (
    <CenteredTableCell sx={{ justifyContent: 'center' }}>
      <Tooltip title={names.join(', ')}>
        <Chip size='small' color={color} label={count} />
      </Tooltip>
    </CenteredTableCell>
  );
};

/** The ChangeSet a Revision was made in, with its description in a peek. It opens the ChangeSet's page. */
export const ChangeSetCell = ({ changeSet }: { changeSet: ChangeSetRead | undefined }) => {
  const theme = useTheme();
  if (!changeSet) return <CenteredTableCell />;
  const open = changeSet.State === 'Open';
  const href = changeSet.SpaceSlug ? changeSetPath(changeSet.SpaceSlug, changeSet.Slug) : undefined;
  return (
    <CenteredTableCell>
      <Tooltip
        placement='bottom-start'
        enterDelay={120}
        leaveDelay={0}
        disableInteractive
        slotProps={{ tooltip: { sx: INFO_PEEK_TOOLTIP_SX }, transition: { timeout: { enter: 120, exit: 0 } } }}
        title={
          <InfoPeekCard
            color={open ? theme.palette.info.main : theme.palette.text.secondary}
            spec={{
              eyebrow: `ChangeSet · ${changeSet.State ?? ''}`,
              metric: { value: changeSet.Slug },
              lines: changeSet.Description ? [changeSet.Description] : [],
              ...(href !== undefined ? { action: 'Open the ChangeSet' } : {}),
            }}
          />
        }
      >
        {href !== undefined ? (
          <Chip
            size='small'
            color={open ? 'info' : 'default'}
            label={changeSet.Slug}
            component={RouterLink}
            to={href}
            clickable
            // The row opens the Revision; the chip opens the ChangeSet.
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
            data-testid='revision-change-set-link'
          />
        ) : (
          <Chip size='small' color={open ? 'info' : 'default'} label={changeSet.Slug} />
        )}
      </Tooltip>
    </CenteredTableCell>
  );
};

export const ChipList = ({ children }: { children: React.ReactNode }) => (
  <CenteredTableCell sx={{ overflow: 'hidden' }}>
    <TagsScrollContainer direction='row' spacing={0.5}>
      {children}
    </TagsScrollContainer>
  </CenteredTableCell>
);
