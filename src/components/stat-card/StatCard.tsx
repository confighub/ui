// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode } from 'react';

import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

const StatValueSizes = {
  sm: '18px',
  md: '24px',
  lg: '32px',
  default: '24px',
};

const Container = styled('div')<{ $isPrimary: boolean }>`
  display: flex;
  flex-direction: column;
  background-color: ${({ theme, $isPrimary }) =>
    $isPrimary ? theme.palette.success.main : 'transparent'};
  color: ${({ theme, $isPrimary }) =>
    $isPrimary ? theme.palette.primary.contrastText : '#3c3c43c7'};
  gap: 15px;
  padding: 24px;
  border: 1px solid ${({ $isPrimary }) => ($isPrimary ? 'inherit' : 'rgba(224, 224, 224, 1)')};
  border-radius: 16px;
  width: 33%;
`;

const Info = styled('div')`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const InfoRight = styled('div')`
  display: flex;
  flex-direction: row;
  gap: 5px;
  align-items: center;
`;

const Title = styled(Typography)<{ size?: 'sm' | 'md' | 'lg' }>`
  font-size: ${({ size }) => StatValueSizes[size || 'default']};
`;

export interface StatCardProps {
  title: string;
  value: string | number;
  showTrendingUp?: boolean;
  percentage?: string;
  isPrimary?: boolean;
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

// TODO: update design system...
export const StatCard = ({
  title,
  isPrimary = true,
  size = 'md',
  value,
  percentage,
  showTrendingUp,
  children,
  className,
}: StatCardProps) => {
  return (
    <Container className={className} $isPrimary={isPrimary}>
      <Title size={size}>{title}</Title>
      <Info>
        <Typography variant='body1'>{value}</Typography>
        <InfoRight>
          {percentage && <Typography>{percentage}</Typography>}
          {showTrendingUp && <TrendingUpIcon />}
        </InfoRight>
      </Info>
      {children}
    </Container>
  );
};
