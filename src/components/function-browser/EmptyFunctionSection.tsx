// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Functions from '@mui/icons-material/Functions';
import { Box, Container, Link, Typography } from '@mui/material';

export const EmptyFunctionsSection = () => {
  return (
    <Container maxWidth='sm'>
      <Box
        display='flex'
        flexDirection='column'
        justifyContent='center'
        alignItems='center'
        minHeight='calc(100vh - 200px)'
        textAlign='center'
      >
        <Functions sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography variant='body2' color='text.secondary' textAlign='center'>
          No Functions Selected
        </Typography>
        <Typography variant='caption' color='text.secondary' gutterBottom>
          In ConfigHub, configuration data is separate from the code that operates on it. A
          Function is a executable piece of code that operates on configuration data in Config
          Units that ConfigHub can invoke. Functions operate on configuration elements that are
          (mostly) standard APIs with defined schemas and backward compatibility guarantees in
          well known stable formats, such as Kubernetes resources represented in YAML.
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mt: 1, mb: 2 }}>
          <Link
            href='https://docs.confighub.com/background/entities/function/'
            target='_blank'
            rel='noopener noreferrer'
            underline='hover'
          >
            Read more about functions →
          </Link>
        </Typography>
      </Box>
    </Container>
  );
};
