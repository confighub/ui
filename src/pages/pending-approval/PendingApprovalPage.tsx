// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Box, Button, Container, Typography } from '@mui/material';
import { HourglassEmpty as PendingIcon } from '@mui/icons-material';

import { redirectToLogin } from '@/auth/session';

export const PendingApprovalPage = () => {
  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          textAlign: 'center',
          gap: 2,
        }}
      >
        <PendingIcon sx={{ fontSize: 80, color: 'warning.main' }} />
        <Typography variant="h3" component="h1" gutterBottom>
          Account Pending Approval
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Thank you for signing up! Your account is currently pending approval.
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          An administrator needs to grant access before you can continue. Watch your email inbox for an approval email.
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
           Once approved, click the button below to sign in and access the application.
        </Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={() => redirectToLogin('/')}
          sx={{ mt: 2 }}
        >
          Try Signing In Again
        </Button>
      </Box>
    </Container>
  );
};

export default PendingApprovalPage;
