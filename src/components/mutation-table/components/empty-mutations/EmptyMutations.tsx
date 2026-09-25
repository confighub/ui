// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Box, Container, Link, Typography } from '@mui/material';

export const EmptyMutations = () => {
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
                    No Mutations Yet
                </Typography>
                <Typography variant='subtitle1' color='text.secondary' gutterBottom>
                    Revisions are broken down into one or more Mutations, which track the sources of granular
                    changes to the configuration, including automated changes, such as imperative or Triggered
                    function invocations, addition of links, upgrades from upstream units, and other update API calls.
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
                    <Link
                        href='https://docs.confighub.com/background/entities/mutation/'
                        target='_blank'
                        rel='noopener noreferrer'
                        underline='hover'
                    >
                        Read more about mutations →
                    </Link>
                </Typography>
            </Box>
        </Container>
    );
};

