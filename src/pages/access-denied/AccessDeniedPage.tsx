// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Box, Button, Container, Typography } from '@mui/material';
import { Block as BlockIcon } from '@mui/icons-material';

import { logout } from '@/auth/session';

export const AccessDeniedPage = () => {
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
        <BlockIcon sx={{ fontSize: 80, color: 'error.main' }} />
        <Typography variant="h3" component="h1" gutterBottom>
          Access Denied
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          You do not have permission to access this instance of ConfigHub.
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Please contact your administrator to request access.
        </Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={() => logout()}
          sx={{ mt: 2 }}
        >
          Sign Out
        </Button>
      </Box>
    </Container>
  );
};

export default AccessDeniedPage;
