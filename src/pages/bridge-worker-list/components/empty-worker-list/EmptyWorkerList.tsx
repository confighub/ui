// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { Box, Button, Container, Link, Typography } from '@mui/material';

export interface IEmptyWorkerListProps {
    onAddWorker: () => void;
}

export const EmptyWorkerList = ({ onAddWorker }: IEmptyWorkerListProps) => {
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
                    No Bridge Workers
                </Typography>
                <Typography variant='subtitle1' color='text.secondary' gutterBottom>
                    A Worker is a process that runs separately from ConfigHub and communicates with ConfigHub to
                    perform various tasks. Workers allow tasks to be performed inside networks that ConfigHub does not
                    have access to and enable developers to build custom functionality.
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mt: 1, mb: 2 }}>
                    <Link
                        href='https://docs.confighub.com/background/entities/worker/'
                        target='_blank'
                        rel='noopener noreferrer'
                        underline='hover'
                    >
                        Read more about workers →
                    </Link>
                </Typography>
                <Button
                    variant='contained'
                    color='primary'
                    size='large'
                    startIcon={<AddCircleOutlineIcon />}
                    onClick={onAddWorker}
                >
                    Add your first Bridge Worker
                </Button>
            </Box>
        </Container>
    );
};

