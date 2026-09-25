// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { authFetch } from '@/auth/session';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { DiscordIcon } from '@/components/icons/DiscordIcon';
import { ServerErrorBox } from '@/components/styled';
import { useAnalytics } from '@/hooks/useAnalytics';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface FeedbackFormData {
  feedback: string;
  allowContact: boolean;
}

export interface FeedbackSurveyDialogProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackSurveyDialog({ open, onClose }: FeedbackSurveyDialogProps): JSX.Element {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FeedbackFormData>({
    defaultValues: {
      feedback: '',
      allowContact: false,
    },
  });

  const { trackFeedbackSurveySubmitted } = useAnalytics();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [serverError, setServerError] = useState<string>('');

  // Reset form state when dialog closes
  const handleClose = () => {
    reset();
    setIsSuccess(false);
    setServerError('');
    onClose();
  };

  const onSubmit = async (data: FeedbackFormData): Promise<void> => {
    setServerError('');
    setIsLoading(true);

    try {
      const response = await authFetch('/api/userfeedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feedback: data.feedback,
          allowContact: data.allowContact,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to submit feedback');
      }

      trackFeedbackSurveySubmitted({
        allow_contact: data.allowContact,
        feedback_length: data.feedback.length,
      });

      setIsSuccess(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'An error occurred while submitting feedback');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinDiscord = (): void => {
    window.open('https://discord-auth.confighub.net/discord/join', '_blank');
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant='h6'>Share Your Feedback</Typography>
          <IconButton aria-label='close' onClick={handleClose} size='small'>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        {isSuccess ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CheckCircleIcon color='success' sx={{ fontSize: 64, mb: 2 }} />
            <Typography variant='h6' gutterBottom>
              Thank you for your feedback!
            </Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
              We really appreciate you taking the time to share your thoughts with us.
            </Typography>
            <Typography variant='body2' sx={{ mb: 3 }}>
              Want to connect with our community? Join our Discord server for updates, discussions,
              and support.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button variant='outlined' onClick={handleClose}>
                Close
              </Button>
              <Button variant='contained' onClick={handleJoinDiscord} startIcon={<DiscordIcon />}>
                Join Discord
              </Button>
            </Box>
          </Box>
        ) : (
          <Box component='form' onSubmit={handleSubmit(onSubmit)}>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
              We'd love to hear your thoughts! Share any feedback, suggestions, or issues you've
              encountered.
            </Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
              Prefer to chat? Join us on{' '}
              <Link
                href='https://discord-auth.confighub.net/discord/join'
                target='_blank'
                rel='noopener noreferrer'
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  verticalAlign: 'middle',
                  color: '#5865F2',
                  textDecorationColor: '#5865F2',
                  '&:hover': {
                    color: '#4752C4',
                    textDecorationColor: '#4752C4',
                  },
                }}
              >
                <Box component='span' sx={{ display: 'inline-flex', ml: '2px' }}>
                  <DiscordIcon width='16px' height='16px' color='#5865F2' />
                </Box>
                Discord
              </Link>
              .
            </Typography>

            <Controller
              name='feedback'
              control={control}
              rules={{
                required: 'Feedback is required',
                minLength: {
                  value: 10,
                  message: 'Please provide at least 10 characters of feedback',
                },
              }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label='Your Feedback'
                  multiline
                  rows={6}
                  fullWidth
                  size='small'
                  error={!!errors.feedback}
                  helperText={errors.feedback?.message}
                  placeholder='Tell us what you think...'
                  sx={{ mb: 2 }}
                />
              )}
            />

            <Controller
              name='allowContact'
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value} size='small' />}
                  label={
                    <Typography variant='body2'>
                      Allow the team to contact me about this feedback (optional)
                    </Typography>
                  }
                  sx={{ mb: 2 }}
                />
              )}
            />

            {serverError && (
              <ServerErrorBox $display={true} sx={{ mb: 2 }}>
                {serverError}
              </ServerErrorBox>
            )}

            <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 2 }}>
              Your feedback helps us improve ConfigHub. Thank you for your time!
            </Typography>
          </Box>
        )}
      </DialogContent>
      {!isSuccess && (
        <DialogActions>
          <Button onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            variant='contained'
            disabled={isLoading}
            color='primary'
          >
            {isLoading ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
