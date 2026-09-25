// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Box, Button, Container, Link, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

export interface EmptyDownstreamProps {
  onCloneClick?: () => void;
}

export const EmptyDownstream = ({ onCloneClick }: EmptyDownstreamProps) => {
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
          No Downstream Units
        </Typography>
        <Typography variant='subtitle1' color='text.secondary' gutterBottom>
          ConfigHub maintains a one-to-one correspondence between a Config Unit and the associated live infrastructure.
          When you clone a unit from this upstream source, downstream units track their relationship and can receive
          propagated changes through upgrades.
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
          <Link
            href='https://docs.confighub.com/background/concepts/variant/'
            target='_blank'
            rel='noopener noreferrer'
            underline='hover'
          >
            Read more about variants →
          </Link>
        </Typography>
        {onCloneClick && (
          <Button
            variant='contained'
            color='primary'
            startIcon={<ContentCopyIcon />}
            onClick={onCloneClick}
            sx={{ mt: 2 }}
          >
            Clone This Unit
          </Button>
        )}
      </Box>
    </Container>
  );
};

