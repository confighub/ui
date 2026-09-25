// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { forwardRef, useState } from 'react';

import MoreVertIcon from '@mui/icons-material/MoreVert';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Slide from '@mui/material/Slide';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import { TransitionProps } from '@mui/material/transitions';

import { CmpProps } from '../../../../types';

const Transition = forwardRef(function Transition(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>,
) {
  return <Slide direction='up' ref={ref} {...props} />;
});

const Container = styled(Card)<{ $cardWidth: string }>`
  width: ${({ $cardWidth }) => $cardWidth});
  height: 200px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const Header = styled('div')`
  display: flex;
  justify-content: space-between;
`;

const Label = styled(Chip)`
  text-transform: uppercase;
  margin-right: 10px;
  margin-bottom: 20px;
  cursor: pointer;

  &:nth-of-type(odd) {
    background-color: #2e7d32;
    color: white;
  }

  &:nth-of-type(even) {
    background-color: #d9d9d9;
    color: black;
  }
`;

const TagList = styled('div')``;

export interface SpacesCardProps extends CmpProps {
  id: string;
  name: string;
  description: string;
  labels: Record<string, string>;
  updatedAt: string;
  cardWidth: string;
  members: Array<{ name: string; profileUrl?: string }>;
  onSpaceSelected: () => void;
  onSpaceDeleted: () => void;
}

export const SpacesCard = (props: SpacesCardProps) => {
  // TODO: Get space members...
  const {
    name,
    className,
    labels,
    updatedAt,
    cardWidth,
    description,
    members,
    onSpaceSelected,
    onSpaceDeleted,
    ...rest
  } = props;

  const [deleteDialogOpened, setDeleteDialogOpened] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  // TODO: Dynamic from API
  const options = [
    {
      type: 'Delete',
      action: () => {
        onDeleteRequested();
      },
    },
    {
      type: 'Settings',
      action: () => onSpaceSelected(),
    },
  ];

  const onDeleteRequested = () => {
    setDeleteDialogOpened(true);
  };

  const onDeleteClosed = () => {
    setDeleteDialogOpened(false);
  };

  const onDeleteConfirmed = async () => {
    onDeleteClosed();
    onSpaceDeleted();
  };

  return (
    <Container variant='outlined' className={className} $cardWidth={cardWidth} {...rest}>
      <CardContent>
        <Header>
          <Typography variant='h5' component='div'>
            {name}
          </Typography>
          <TagList>
            {Object.entries(labels)
              .slice(0, 1)
              .map(([key, value]) => (
                <Label key={key} label={value} variant='outlined' />
              ))}
          </TagList>
          <IconButton
            aria-label='more'
            id='long-button'
            aria-controls={open ? 'long-menu' : undefined}
            aria-expanded={open ? 'true' : undefined}
            aria-haspopup='true'
            sx={{ alignItems: 'flex-start' }}
            onClick={handleClick}
          >
            <MoreVertIcon />
          </IconButton>
          <Menu
            id='long-menu'
            MenuListProps={{
              'aria-labelledby': 'long-button',
            }}
            anchorEl={anchorEl}
            open={open}
            onClose={handleClose}
          >
            {options.map((option) => (
              <MenuItem key={option.type} onClick={option.action}>
                {option.type}
              </MenuItem>
            ))}
          </Menu>
        </Header>
        <Typography variant='body2' component='p'>
          {description}
        </Typography>
      </CardContent>
      <Stack direction='row' spacing={1} sx={{ paddingLeft: '15px' }}>
        {members?.map((member) => (
          <Avatar key={member.name} src={member.profileUrl}>
            {member?.name}
          </Avatar>
        ))}
      </Stack>
      <CardActions>
        <Typography
          variant='caption'
          color='textSecondary'
          component='p'
          sx={{ marginLeft: '5px', fontStyle: 'italic' }}
        >
          Updated {updatedAt}
        </Typography>
      </CardActions>
      <Dialog
        open={deleteDialogOpened}
        TransitionComponent={Transition}
        keepMounted
        onClose={onDeleteClosed}
        aria-describedby='alert-dialog-slide-description'
      >
        <DialogTitle>Delete {name}?</DialogTitle>
        <DialogContent>
          <DialogContentText id='alert-dialog-slide-description'>
            Are you sure you want to delete this space?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={onDeleteClosed}>Disagree</Button>
          <Button onClick={onDeleteConfirmed}>Agree</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};
