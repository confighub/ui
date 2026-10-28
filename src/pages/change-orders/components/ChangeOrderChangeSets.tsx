// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The ChangeSets a ChangeOrder's change was made in, each with its Description: what the change
 * is, as its author wrote it while making it. Shown above the diff, which says what it did.
 *
 * Renders nothing when the change was made in no ChangeSet, or before the read has answered.
 */

import { Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';

import { FILTER_URL_PARAMS } from '@/utility/constants/url-params';

import { changeSetPath } from '../../change-sets/changeSetAddress';

import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import type { ChangeOrderChangeSet } from '../changeOrderChangeSets';

interface ChangeOrderChangeSetsProps {
  changeSets: readonly ChangeOrderChangeSet[];
  /** The ChangeOrder's own Space: a ChangeSet residing anywhere else is named with its Space. */
  baseSpaceId?: string;
}

/**
 * The unit list over the ChangeSet's Units. By UnitID rather than ChangeSetID: closing a
 * ChangeSet takes its Units out of it, so a closed one would list none.
 */
function unitListHref(unitIds: readonly string[]): string {
  const where = `UnitID IN (${unitIds.map((id) => `'${id}'`).join(', ')})`;
  return `/units?${new URLSearchParams({ [FILTER_URL_PARAMS.WHERE]: where }).toString()}`;
}

function changeSetName(changeSet: ChangeOrderChangeSet, baseSpaceId: string | undefined): string {
  if (changeSet.spaceSlug === undefined || changeSet.spaceSlug === '' || changeSet.spaceId === baseSpaceId) {
    return changeSet.slug;
  }
  return `${changeSet.spaceSlug}/${changeSet.slug}`;
}

export function ChangeOrderChangeSets({ changeSets, baseSpaceId }: ChangeOrderChangeSetsProps) {
  if (changeSets.length === 0) return null;
  return (
    <Box
      component="section"
      role="region"
      aria-label="ChangeSets"
      data-testid="change-order-change-sets"
      sx={{ margin: '16px 0 14px', display: 'flex', flexDirection: 'column', gap: `${changeOrderShape.gap.md}px` }}
    >
      <Box
        component="h3"
        sx={{
          margin: 0,
          fontSize: changeOrderType.size.body,
          fontWeight: changeOrderType.weight.semibold,
          lineHeight: changeOrderType.lineHeight.heading,
          color: changeOrderInk.muted,
        }}
      >
        {changeSets.length === 1 ? 'Made in ChangeSet' : `Made in ${changeSets.length} ChangeSets`}
      </Box>
      {changeSets.map((changeSet) => {
        const open = changeSet.state === 'Open';
        const tone = open ? changeOrderStatus.progress : changeOrderInk.subtle;
        const units = changeSet.unitIds.length;
        return (
          <Box
            key={changeSet.changeSetId}
            data-testid="change-order-change-set"
            sx={{
              border: `1px solid ${changeOrderBorder.default}`,
              borderLeft: `${changeOrderShape.leadingEdge}px solid ${open ? changeOrderStatus.progressLine : changeOrderBorder.strong}`,
              borderRadius: `${changeOrderShape.radius.md}px`,
              background: changeOrderSurface.sunk,
              padding: '8px 12px',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: `${changeOrderShape.gap.md}px` }}>
              <Box
                {...(changeSet.spaceSlug
                  ? { component: RouterLink, to: changeSetPath(changeSet.spaceSlug, changeSet.slug), target: '_blank', rel: 'noopener noreferrer' }
                  : { component: 'span' })}
                data-testid="change-order-change-set-slug"
                sx={{
                  fontFamily: changeOrderFontMono,
                  fontSize: changeOrderType.size.body,
                  fontWeight: changeOrderType.weight.semibold,
                  color: changeOrderInk.default,
                  overflowWrap: 'anywhere',
                }}
              >
                {changeSetName(changeSet, baseSpaceId)}
              </Box>
              {changeSet.state !== undefined && changeSet.state !== '' ? (
                <Box
                  component="span"
                  sx={{
                    borderRadius: `${changeOrderShape.radius.pill}px`,
                    border: `1px solid ${tone}`,
                    color: tone,
                    padding: '0 8px',
                    fontSize: changeOrderType.size.micro,
                    fontWeight: changeOrderType.weight.semibold,
                    lineHeight: 1.6,
                  }}
                >
                  {changeSet.state}
                </Box>
              ) : null}
              {units > 0 ? (
                <Box
                  component={RouterLink}
                  to={unitListHref(changeSet.unitIds)}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ fontSize: changeOrderType.size.small, color: changeOrderAction.ink }}
                >
                  {units === 1 ? '1 unit' : `${units} units`}
                </Box>
              ) : null}
              {changeSet.adopted ? (
                <Box component="span" sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
                  Sets the end
                </Box>
              ) : null}
            </Box>
            {changeSet.description.trim() !== '' ? (
              <Box
                data-testid="change-order-change-set-description"
                sx={{
                  marginTop: '4px',
                  fontSize: changeOrderType.size.prose,
                  lineHeight: changeOrderType.lineHeight.body,
                  color: changeOrderInk.muted,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                }}
              >
                {changeSet.description}
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
