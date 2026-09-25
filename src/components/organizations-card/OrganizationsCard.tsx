// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { CmpProps } from '../../types';

const Container = styled(Card)<{ $cardWidth: string }>`
  width: ${({ $cardWidth }) => $cardWidth});
  height: 350px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
`;

const Header = styled('div')`
  display: flex;
  justify-content: space-between;
`;

const Label = styled(Chip)`
  text-transform: uppercase;
  margin-right: 10px;
  margin-bottom: 20px;
  cursor: pointer;

  &:nth-of-type(odd) {
    background-color: #2e7d32;
    color: white;
  }

  &:nth-of-type(even) {
    background-color: #d9d9d9;
    color: black;
  }
`;

const TagList = styled('div')``;

const Name = styled(Typography)`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  font-weight: 400;
  font-size: 2rem;
`;

export interface SpacesCardProps extends CmpProps {
  id: string;
  name: string;
  labels: Record<string, string>;
  description: string;
  updatedAt: string;
  cardWidth: string;
  onOrganizationSelected: () => void;
}

export const OrganizationsCard = (props: SpacesCardProps) => {
  const {
    name,
    description,
    labels,
    updatedAt,
    cardWidth,
    onOrganizationSelected,
    className,
    ...rest
  } = props;

  return (
    <Container
      variant='outlined'
      onClick={onOrganizationSelected}
      className={className}
      $cardWidth={cardWidth}
      {...rest}
    >
      <CardContent>
        <Header>
          <Tooltip title={name} arrow>
            <Name>{name}</Name>
          </Tooltip>
          <TagList>
            {Object.entries(labels)
              .filter(([key]) => key !== 'Description')
              .slice(0, 1)
              .map(([key, value]) => (
                <Label key={key} label={value} variant='outlined' />
              ))}
          </TagList>
        </Header>
        <Typography sx={{ marginTop: '20px' }} variant='body1' component='div'>
          {description}
        </Typography>
      </CardContent>
      <CardActions>
        <Typography
          variant='caption'
          color='textSecondary'
          component='p'
          sx={{ marginLeft: '5px', fontStyle: 'italic' }}
        >
          Updated {updatedAt}
        </Typography>
      </CardActions>
    </Container>
  );
};
