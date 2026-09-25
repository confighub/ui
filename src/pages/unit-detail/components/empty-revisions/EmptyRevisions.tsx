// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Box, Container, Link, Typography } from '@mui/material';

export const EmptyRevisions = () => {
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
                    No Revisions Yet
                </Typography>
                <Typography variant='subtitle1' color='text.secondary' gutterBottom>
                    Every time you make a change to the configuration data in a Config Unit, you create a new revision.
                    ConfigHub keeps track of all changes in the form of a list of all historical revisions. You may restore
                    a previous revision in order to undo changes.
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
                    <Link
                        href='https://docs.confighub.com/background/entities/revision/'
                        target='_blank'
                        rel='noopener noreferrer'
                        underline='hover'
                    >
                        Read more about revisions →
                    </Link>
                </Typography>
            </Box>
        </Container>
    );
};

