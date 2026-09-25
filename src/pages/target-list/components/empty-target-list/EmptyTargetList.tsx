// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { Box, Button, Container, Link, Typography } from '@mui/material';

export interface IEmptyTargetListProps {
    onAddTarget: () => void;
}

export const EmptyTargetList = ({ onAddTarget }: IEmptyTargetListProps) => {
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
                    No Targets Yet
                </Typography>
                <Typography variant='subtitle1' color='text.secondary' gutterBottom>
                    A Target is an entity in ConfigHub that represents an infrastructure resource where configuration
                    can be applied. It abstracts access to cloud accounts, clusters, or other environments, allowing
                    ConfigHub users to manage resources without directly handling credentials.
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mt: 1, mb: 2 }}>
                    <Link
                        href='https://docs.confighub.com/background/entities/target/'
                        target='_blank'
                        rel='noopener noreferrer'
                        underline='hover'
                    >
                        Read more about targets →
                    </Link>
                </Typography>
                <Button
                    variant='contained'
                    color='primary'
                    size='large'
                    startIcon={<AddCircleOutlineIcon />}
                    onClick={onAddTarget}
                >
                    Add your first Target
                </Button>
            </Box>
        </Container>
    );
};

