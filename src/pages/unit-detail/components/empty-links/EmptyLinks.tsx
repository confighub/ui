// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Box, Container, Link, Typography } from '@mui/material';

export const EmptyLinks = () => {
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
                    No Links Yet
                </Typography>
                <Typography variant='subtitle1' color='text.secondary' gutterBottom>
                    Links express dependencies between Config Units, enabling modular infrastructure where dependent resources are kept separate.
                    <br />
                    For example, a Unit containing Kubernetes Deployments and Services can link to a Unit with a Namespace resource, automatically populating the <code>metadata.namespace</code> field.
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
                    <Link
                        href='https://docs.confighub.com/background/entities/link/'
                        target='_blank'
                        rel='noopener noreferrer'
                        underline='hover'
                    >
                        Read more about links →
                    </Link>
                </Typography>
            </Box>
        </Container>
    );
};

