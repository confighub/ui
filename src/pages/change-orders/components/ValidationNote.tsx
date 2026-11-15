// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * One line saying whether what a Release would bundle has ValidationErrors, and
 * which Units do: under a `Validated` or `Released` gate, which a Unit with
 * ValidationErrors holds, since a Release of it is refused.
 *
 * `inherit` leaves every color to the line it is on, as the stage log's lines need: a
 * failed gate's line is drawn on a red band, which recolors its own parts, so a color
 * set here would be unreadable on it. The count of failing Units is then bold, not red.
 */
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';

import {
  changeOrderAction,
  changeOrderFontMono,
  changeOrderStatus,
} from '../changeOrdersTokens';
import {
  type ReleaseValidation,
  type ValidationFailure,
  failureName,
  hasValidationNote,
  validationGateHref,
  validationSpaceHref,
  validationUnitHref,
} from '../releaseValidation';
import { SpacesMoreButton } from './SpaceListing';
import { capNames, moreText } from './spaceListLogic';

/** On a band that sets the line's colors, the "+M more" button takes them as well. */
const INHERIT_BUTTON_SX = {
  font: 'inherit',
  color: 'inherit',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
} as const;

/**
 * One Unit with ValidationErrors, each name a link to where it is read and fixed: the
 * Unit to its Overview, with the gate's card open when it has one; the Space to its Units
 * with ValidationErrors; each gate to its Trigger on the Validation board. `inherit` leaves
 * the links' colors to the line they are on.
 */
export function ValidationFailureLinks({
  failure,
  inherit = false,
}: {
  failure: ValidationFailure;
  inherit?: boolean;
}) {
  const linkSx = inherit ? undefined : { color: changeOrderAction.ink };
  return (
    <>
      <Box
        component={RouterLink}
        to={validationUnitHref(failure)}
        sx={inherit ? undefined : { ...linkSx, fontFamily: changeOrderFontMono }}
      >
        {failure.slug}
      </Box>{' '}
      in{' '}
      <Box
        component={RouterLink}
        to={validationSpaceHref(failure.spaceId)}
        title={`Units with ValidationErrors in ${failure.spaceSlug}`}
        sx={linkSx}
      >
        {failure.spaceSlug}
      </Box>{' '}
      (
      {failure.gates.map((gate, i) => {
        const href = validationGateHref(failure, gate);
        return (
          <span key={gate}>
            {i > 0 ? ', ' : ''}
            {href === undefined ? (
              gate
            ) : (
              <Box
                component={RouterLink}
                to={href}
                title='The Trigger, and every Unit failing it'
                sx={linkSx}
              >
                {gate}
              </Box>
            )}
          </span>
        );
      })}
      )
    </>
  );
}

export function ValidationNote({
  validation,
  testId,
  inherit = false,
}: {
  validation: ReleaseValidation | undefined;
  testId?: string;
  inherit?: boolean;
}) {
  if (!hasValidationNote(validation)) return null;
  const line = (children: ReactNode, color?: string) =>
    inherit ? (
      <span data-testid={testId}>Validation: {children}</span>
    ) : (
      <Box
        component='span'
        data-testid={testId}
        sx={{
          display: 'block',
          fontSize: '12.5px',
          color: color ?? 'text.secondary',
          mt: '2px',
        }}
      >
        Validation: {children}
      </Box>
    );
  if (validation.status === 'loading') return line('checking…');
  if (validation.status === 'failed')
    return line('the ValidationErrors could not be read.', changeOrderStatus.warn);
  const { failures, unitCount } = validation;
  if (failures.length === 0) {
    return line(
      unitCount === 1
        ? 'the Unit a Release would bundle has no ValidationErrors.'
        : `none of the ${unitCount} Units a Release would bundle has ValidationErrors.`,
    );
  }
  const { shown, more } = capNames(failures);
  // The whole list, each Unit by its Space, linked to its Overview.
  const all = failures.map((failure) => ({
    spaceId: failure.unitId,
    name: failureName(failure),
    href: validationUnitHref(failure),
  }));
  return line(
    <>
      <Box
        component='span'
        sx={inherit ? { fontWeight: 600 } : { color: changeOrderStatus.danger }}
      >
        {failures.length === 1 ? '1 Unit has' : `${failures.length} Units have`}{' '}
        ValidationErrors, which refuse a Release:{' '}
      </Box>
      {shown.map((failure, i) => (
        <span key={failure.unitId}>
          {i > 0 ? '; ' : ''}
          <ValidationFailureLinks failure={failure} inherit={inherit} />
        </span>
      ))}
      {more > 0 ? (
        <>
          {' '}
          <SpacesMoreButton
            spaces={all}
            noun='Unit'
            visibleText={`+${moreText(more)}`}
            testId='validation-more'
            {...(inherit ? { buttonSx: INHERIT_BUTTON_SX } : {})}
          >
            {`+${moreText(more)}`}
          </SpacesMoreButton>
        </>
      ) : null}
      .
    </>,
  );
}
