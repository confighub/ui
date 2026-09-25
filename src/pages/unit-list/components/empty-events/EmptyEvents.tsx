// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Box, Container, Link, Typography } from '@mui/material';

export const EmptyEvents = () => {
    return (
        <Container maxWidth='sm'>
            <Box
                display='flex'
                flexDirection='column'
                justifyContent='center'
                alignItems='center'
                minHeight='40vh'
                textAlign='center'
            >
                <Typography variant='h5' gutterBottom>
                    No Events Yet
                </Typography>
                <Typography variant='subtitle1' color='text.secondary' gutterBottom>
                    Unit events track actuation operations like Apply, Destroy, Refresh, and Import.
                    Operations are asynchronous, long-running processes that transition units through
                    states like Progressing, Ready, or Degraded.
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
                    <Link
                        href='https://docs.confighub.com/background/entities/unit/#unit-actuation-lifecycle'
                        target='_blank'
                        rel='noopener noreferrer'
                        underline='hover'
                    >
                        Read more about unit actuation →
                    </Link>
                </Typography>
            </Box>
        </Container>
    );
};

