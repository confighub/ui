// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { useListAllUnitsQuery } from '@confighub/rtk-query';
import type { Initiative, InitiativeStatus } from '@/types/initiative';
import { PRIORITY_COLORS } from '@/types/initiative';
import { getInitiativeStatus } from '@/pages/initiatives/utils/deriveInitiativeStatus';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import UndoIcon from '@mui/icons-material/Undo';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';

interface InitiativeKanbanCardProps {
  initiative: Initiative;
  isSelected?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: InitiativeStatus) => void;
}

export const InitiativeKanbanCard = ({ initiative, isSelected = false, onSelect, onEdit, onDelete, onStatusChange }: InitiativeKanbanCardProps) => {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const status = getInitiativeStatus(initiative);

  const { data: units = [], isLoading } = useListAllUnitsQuery(
    {
      where: initiative.whereClause || undefined,
      whereData: initiative.whereDataClause || undefined,
      resourceType: initiative.resourceTypeClause || undefined,
      select: 'UnitID,Slug',
      include: 'SpaceID',
    },
    { skip: !initiative.whereClause },
  );

  const unitCount = units.length;
  const summary = initiative.checkSummary;
  const hasSummary = Boolean(summary);
  const passingCount = summary?.passing ?? 0;
  const checkable = (summary?.total ?? 0) - (summary?.notApplicable ?? 0);
  const progressPct =
    hasSummary && checkable > 0 ? Math.round((passingCount / checkable) * 100) : 0;

  const deadlineLabel = initiative.deadline
    ? `Due ${dayjs(initiative.deadline).format('MMM D')}`
    : 'No deadline';

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
  };
  const handleMenuClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuAnchor(null);
  };
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuAnchor(null);
    onEdit();
  };
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuAnchor(null);
    onDelete();
  };

  const priorityStyle = PRIORITY_COLORS[initiative.priority];

  return (
    <Card
      elevation={isSelected ? 2 : 0}
      sx={{
        borderRadius: '8px',
        border: isSelected ? '2px solid' : '1px solid',
        borderColor: isSelected ? 'primary.main' : 'divider',
        transition: 'all 0.2s ease-in-out',
        cursor: 'pointer',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.08)',
          transform: 'translateY(-1px)',
        },
      }}
      onClick={onSelect}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        {/* Header: name + menu */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant='subtitle2' fontWeight={600} sx={{ flex: 1, mr: 0.5, lineHeight: 1.3 }}>
            {initiative.name}
          </Typography>
          <IconButton size='small' onClick={handleMenuOpen} sx={{ mt: -0.5, mr: -0.5 }}>
            <MoreVertIcon fontSize='small' />
          </IconButton>
        </Box>

        {/* Description */}
        {initiative.description && (
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.4,
              mb: 1,
            }}
          >
            {initiative.description}
          </Typography>
        )}

        {/* Priority + enforcement + deadline */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Chip
            label={initiative.priority}
            size='small'
            sx={{
              fontWeight: 700,
              fontSize: '0.65rem',
              letterSpacing: 0.5,
              height: 20,
              bgcolor: priorityStyle.bg,
              color: priorityStyle.color,
            }}
          />
          {initiative.enforced && (
            <Chip
              label='ENFORCED'
              size='small'
              title='Failures block Apply with ValidationErrors'
              sx={{
                fontWeight: 700,
                fontSize: '0.65rem',
                letterSpacing: 0.5,
                height: 20,
                bgcolor: '#fde7e7',
                color: '#b71c1c',
              }}
            />
          )}
          <Typography variant='caption' color='text.secondary'>
            {deadlineLabel}
          </Typography>
        </Box>

        {/* Progress bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinearProgress
            variant='determinate'
            value={progressPct}
            sx={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              bgcolor: 'grey.200',
              '& .MuiLinearProgress-bar': {
                bgcolor: hasSummary ? (progressPct === 100 ? '#4caf50' : 'primary.main') : 'grey.400',
              },
            }}
          />
          {isLoading ? (
            <Skeleton width={40} height={14} />
          ) : (
            <Typography variant='caption' color='text.secondary' fontWeight={500} sx={{ whiteSpace: 'nowrap' }}>
              {hasSummary ? `${passingCount} / ${checkable}` : `-- / ${unitCount}`}
            </Typography>
          )}
        </Box>
      </CardContent>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
      >
        {status === 'draft' && (
          <MenuItem onClick={(e) => { e.stopPropagation(); setMenuAnchor(null); onStatusChange('in_progress'); }}>
            <ListItemIcon><PlayArrowIcon fontSize='small' color='primary' /></ListItemIcon>
            <ListItemText>Activate</ListItemText>
          </MenuItem>
        )}
        {status === 'in_progress' && (
          <MenuItem onClick={(e) => { e.stopPropagation(); setMenuAnchor(null); onStatusChange('completed'); }}>
            <ListItemIcon><CheckCircleOutlineIcon fontSize='small' color='success' /></ListItemIcon>
            <ListItemText>Mark Completed</ListItemText>
          </MenuItem>
        )}
        {status !== 'draft' && (
          <MenuItem onClick={(e) => { e.stopPropagation(); setMenuAnchor(null); onStatusChange('draft'); }}>
            <ListItemIcon><UndoIcon fontSize='small' /></ListItemIcon>
            <ListItemText>Move to Draft</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={handleEdit}>
          <ListItemIcon><EditIcon fontSize='small' /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteIcon fontSize='small' color='error' /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </Card>
  );
};
