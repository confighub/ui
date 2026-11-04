// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { NavLink } from '@/components/nav-link/NavLink';
import type { UnitRead } from '@confighub/rtk-query';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

import { ENTITY_TYPE_LABEL, useBackedEntity } from './useBackedEntity';

/**
 * On a backing Unit's settings, the entity it holds the configuration of: a link to the entity's
 * page, or its name for a type with no page. Renders nothing for a Unit that backs no entity.
 */
export const BackedEntityLink = ({ unit }: { unit: UnitRead | undefined }) => {
  const { data, isLoading, isError, asked } = useBackedEntity(unit);
  if (!asked) return null;
  if (isLoading)
    return <CircularProgress size={12} aria-label='Loading the entity it backs' />;
  if (isError) {
    return (
      <Typography
        component='span'
        variant='body2'
        color='error'
        data-testid='backed-entity-error'
      >
        Could not load the entity it backs
      </Typography>
    );
  }
  if (!data) {
    return (
      <Typography
        component='span'
        variant='body2'
        color='text.secondary'
        data-testid='backed-entity-missing'
      >
        No entity has it as its backing Unit
      </Typography>
    );
  }
  const entityType = unit?.Labels?.[ENTITY_TYPE_LABEL];
  const label = `${entityType} ${data.name}`;
  return data.href ? (
    <NavLink
      to={data.href}
      data-testid='backed-entity-link'
      style={{ textDecoration: 'underline', wordBreak: 'break-word' }}
    >
      {label}
    </NavLink>
  ) : (
    <span data-testid='backed-entity-name'>{label}</span>
  );
};
