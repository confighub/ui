// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { Box, Button, Container, Link, Typography } from '@mui/material';

export interface IEmptySpaceListProps {
    onAddSpace: () => void;
}

export const EmptySpaceList = ({ onAddSpace }: IEmptySpaceListProps) => {
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
                    Welcome to Spaces
                </Typography>
                <Typography variant='subtitle1' color='text.secondary' gutterBottom>
                    Spaces are used to group configuration based on various attributes and are the primary way to
                    manage access to Config Units and other resources. Spaces provide the highest level of isolation
                    inside an Organization and function as a way to provide configuration context.
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mt: 1, mb: 2 }}>
                    <Link
                        href='https://docs.confighub.com/background/entities/space/'
                        target='_blank'
                        rel='noopener noreferrer'
                        underline='hover'
                    >
                        Read more about spaces →
                    </Link>
                </Typography>
                <Button
                    variant='contained'
                    color='primary'
                    size='large'
                    startIcon={<AddCircleOutlineIcon />}
                    onClick={onAddSpace}
                >
                    Create your first Space
                </Button>
            </Box>
        </Container>
    );
};

