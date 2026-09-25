// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { Box, Button, Container, Link, Typography } from '@mui/material';

export interface IEmptyTriggersProps {
    onAddTrigger: () => void;
}

export const EmptyTriggers = ({ onAddTrigger }: IEmptyTriggersProps) => {
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
                    No Triggers Yet
                </Typography>
                <Typography variant='subtitle1' color='text.secondary' gutterBottom>
                    ConfigHub supports automatic function Triggers. Triggers are registered to invoke Functions on
                    config Units at specified lifecycle Events, either arbitrary Mutations of all kinds, or more
                    specific Events, such as PostClone.
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mt: 1, mb: 2 }}>
                    <Link
                        href='https://docs.confighub.com/background/entities/trigger/'
                        target='_blank'
                        rel='noopener noreferrer'
                        underline='hover'
                    >
                        Read more about triggers →
                    </Link>
                </Typography>
                <Button
                    variant='contained'
                    color='primary'
                    size='large'
                    startIcon={<AddCircleOutlineIcon />}
                    onClick={onAddTrigger}
                >
                    Add your first Trigger
                </Button>
            </Box>
        </Container>
    );
};

