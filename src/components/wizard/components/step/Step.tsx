// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { css, styled } from '@mui/material/styles';

import { CmpPropsWithChildren } from '../../../../types';
import { Direction } from '../../../../types/enums';
import { TransitionMap } from '../../../styled/index';

export const Container = styled('div')<{ $direction: Direction; $display: boolean }>`
  width: 100%;
  display: ${({ $display }) => ($display ? 'block' : 'none')};
  ${(props) =>
    props.$direction &&
    css`
      animation: ${TransitionMap[props.$direction]} 0.5s;
    `};
`;

export interface StepProps extends CmpPropsWithChildren {
  $direction: Direction;
  $display: boolean;
}

export const Step = ({ children, className, $direction, $display }: StepProps) => {
  return (
    <Container className={className} $display={$display} $direction={$direction}>
      {children}
    </Container>
  );
};
