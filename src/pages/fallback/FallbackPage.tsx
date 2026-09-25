// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// import { useNavigate } from 'react-router-dom';
// import { FallbackProps } from 'react-error-boundary';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import { motion } from 'framer-motion';

const FallbackContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  height: '70vh',
  backgroundColor: theme.palette.background.default,
}));

export const FallbackPage = () => {
  return (
    <FallbackContainer>
      <motion.svg
        xmlns='http://www.w3.org/2000/svg'
        viewBox='0 0 30 30'
        fill='none'
        initial={{ rotate: 0, scaleY: 1, y: 0, opacity: 1 }}
        animate={{ rotate: 20, scaleY: 0.85, y: 3, opacity: 0.8 }}
        transition={{ duration: 1.5, ease: 'easeInOut' }}
        width={300}
        height={300}
      >
        <path
          fillRule='evenodd'
          clipRule='evenodd'
          d='M14 8C16.2091 8 18 6.20914 18 4C18 1.79086 16.2091 0 14 0C11.7909 0 10 1.79086 10 4C10 6.20914 11.7909 8 14 8Z'
          fill='#ba3d03'
        />
        <path
          fillRule='evenodd'
          clipRule='evenodd'
          d='M21 16C23.2091 16 25 14.2091 25 12C25 9.79086 23.2091 8 21 8C18.7909 8 17 9.79086 17 12C17 14.2091 18.7909 16 21 16Z'
          fill='#ba3d03'
        />
        <path
          fillRule='evenodd'
          clipRule='evenodd'
          d='M7 16C9.20914 16 11 14.2091 11 12C11 9.79086 9.20914 8 7 8C4.79086 8 3 9.79086 3 12C3 14.2091 4.79086 16 7 16Z'
          fill='#ba3d03'
        />
        <path
          d='M14 6V20M14 20L19.5 13.5M14 20L9 13.5'
          stroke='#ba3d03'
          strokeWidth='2'
          strokeLinejoin='round'
        />
        <path
          d='M13.8924 25.8483C11.9306 21.6768 6.89434 19.2508 2.02459 19.9827C2.51253 23.2292 7.31083 27.1455 13.8924 25.8483Z'
          stroke='#ba3d03'
          strokeWidth='2.2'
          strokeLinejoin='round'
        />
        <path
          d='M13.9355 25.8483C15.8972 21.6768 20.9335 19.2508 25.8033 19.9827C25.3154 23.2292 20.5171 27.1455 13.9355 25.8483Z'
          stroke='#ba3d03'
          strokeWidth='2.2'
          strokeLinejoin='round'
        />
      </motion.svg>
      <Typography
        sx={{
          fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
        }}
        variant='h4'
      >
        Oops! Something went wrong.
      </Typography>
      <Button
        variant='text'
        size='large'
        color='primary'
        onClick={() => window.location.reload()}
      >
        Reload
      </Button>
    </FallbackContainer>
  );
};

export default FallbackPage;
