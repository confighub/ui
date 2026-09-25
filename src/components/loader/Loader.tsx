// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Backdrop from '@mui/material/Backdrop';
import CircularProgress from '@mui/material/CircularProgress';

export const Loader = ({ isLoading }: { isLoading: boolean }) => {
  return (
    <Backdrop
      open={isLoading}
      sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
    >
      <CircularProgress color='inherit' />
    </Backdrop>
  );
};
