// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { HoverCard } from '@/components/styled';
import { formatRelative } from '@/utility/date-format';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

export interface Comment {
  id: string;
  userId: string;
  username: string;
  profilePictureURL?: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
}

export interface DiffApprovalCommentsProps {
  comments: Comment[];
  currentUserId: string;
  currentUsername: string;
  currentUserAvatar?: string;
  onAddComment: (content: string) => void;
  onUpdateComment: (commentId: string, content: string) => void;
  onDeleteComment?: (commentId: string) => void;
}

const CommentCard = styled(HoverCard)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  overflow: 'visible',
  '&:hover': {
    borderColor: theme.palette.action.hover,
  },
}));

const CommentHeader = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  paddingBottom: theme.spacing(1),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}));

const CommentBody = styled(Box)(({ theme }) => ({
  padding: theme.spacing(0, 2, 2, 2),
}));

const CommentInputCard = styled(HoverCard)(({ theme }) => ({
  borderColor: theme.palette.divider,
  overflow: 'visible',
}));

export const DiffApprovalComments = ({
  comments,
  currentUserId,
  currentUsername,
  currentUserAvatar,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
}: DiffApprovalCommentsProps) => {
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const handleAddComment = () => {
    if (newComment.trim()) {
      onAddComment(newComment.trim());
      setNewComment('');
    }
  };

  const startEditing = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEditing = () => {
    setEditingCommentId(null);
    setEditContent('');
  };

  const saveEdit = (commentId: string) => {
    if (editContent.trim()) {
      onUpdateComment(commentId, editContent.trim());
      cancelEditing();
    }
  };

  return (
    <Box sx={{ maxWidth: 900 }} mt={2}>
      {/* Header */}
      <Stack direction='row' alignItems='center' spacing={2} mb={1}>
        <Typography variant='h6' fontWeight='bold'>
          Discussion
        </Typography>
        <Chip label={`${comments.length} comments`} size='small' variant='outlined' />
      </Stack>

      {/* New Comment Input */}
      <CommentInputCard variant='outlined'>
        <Box sx={{ p: 2 }}>
          <Stack direction='row' spacing={2} alignItems='flex-start'>
            <Avatar src={currentUserAvatar} sx={{ width: 40, height: 40, mt: 0.5 }}>
              {currentUsername.charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <TextField
                fullWidth
                multiline
                rows={3}
                placeholder='Leave a comment...'
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                variant='outlined'
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'background.paper',
                  },
                }}
              />
              <Stack direction='row' spacing={1} mt={2} justifyContent='flex-end'>
                <Button
                  variant='outlined'
                  size='small'
                  onClick={() => setNewComment('')}
                  disabled={!newComment.trim()}
                >
                  Cancel
                </Button>
                <Button
                  variant='contained'
                  size='small'
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                >
                  Comment
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Box>
      </CommentInputCard>

      {/* Comments List */}
      {comments.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant='body2' color='text.secondary'>
            No comments yet. Be the first to share your thoughts!
          </Typography>
        </Box>
      ) : (
        <Stack spacing={0}>
          {comments.map((comment) => {
            const isOwner = comment.userId === currentUserId;
            const isEditing = editingCommentId === comment.id;

            return (
              <CommentCard key={comment.id} variant='outlined'>
                <CommentHeader>
                  <Stack direction='row' spacing={2} alignItems='center'>
                    <Avatar src={comment.profilePictureURL} sx={{ width: 40, height: 40 }}>
                      {comment.username.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Stack direction='row' spacing={1} alignItems='center'>
                        <Typography variant='subtitle2' fontWeight='bold'>
                          {comment.username}
                        </Typography>
                        {isOwner && (
                          <Chip label='You' size='small' color='primary' variant='outlined' />
                        )}
                      </Stack>
                      <Typography variant='caption' color='text.secondary'>
                        {formatRelative(comment.createdAt)}
                        {comment.isEdited && ' (edited)'}
                      </Typography>
                    </Box>
                  </Stack>

                  {/* Actions */}
                  {isOwner && !isEditing && (
                    <Stack direction='row' spacing={1}>
                      <Button
                        size='small'
                        variant='text'
                        onClick={() => startEditing(comment)}
                      >
                        Edit
                      </Button>
                      {onDeleteComment && (
                        <Button
                          size='small'
                          variant='text'
                          color='error'
                          onClick={() => onDeleteComment(comment.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </Stack>
                  )}
                </CommentHeader>

                <CommentBody>
                  {isEditing ? (
                    <Box>
                      <TextField
                        fullWidth
                        multiline
                        rows={3}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        variant='outlined'
                        sx={{
                          mb: 2,
                          '& .MuiOutlinedInput-root': {
                            backgroundColor: 'background.paper',
                          },
                        }}
                      />
                      <Stack direction='row' spacing={1} justifyContent='flex-end'>
                        <Button variant='outlined' size='small' onClick={cancelEditing}>
                          Cancel
                        </Button>
                        <Button
                          variant='contained'
                          size='small'
                          onClick={() => saveEdit(comment.id)}
                          disabled={!editContent.trim()}
                        >
                          Save
                        </Button>
                      </Stack>
                    </Box>
                  ) : (
                    <Typography
                      variant='body2'
                      sx={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {comment.content}
                    </Typography>
                  )}
                </CommentBody>
              </CommentCard>
            );
          })}
        </Stack>
      )}
    </Box>
  );
};
