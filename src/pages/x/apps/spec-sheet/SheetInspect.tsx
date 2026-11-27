// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The Inspect popover of a field: its name, its full path, the Revisions of this Unit in which
// its value changed (newest first, each with the value it got), and its value in each Variant
// of the Component, this one marked. One column, so it fits a narrow pane. Each entity it names
// (Revision, Unit, user, ChangeSet, ChangeOrder, Tag, Release, Variant) links to its page where
// it has one, with a peek of what the server returned about it.

import { memo, useEffect, useMemo } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';

import { type ExtendedRevision, useListExtendedRevisionsQuery } from '@confighub/rtk-query';
import { useLocation } from 'react-router-dom';

import { SPACE_PARAM } from '@/hooks/useSpaceParam';
import { useRevisionDataMap } from '@/hooks/useUnitData';
import { changeOrderPath } from '@/pages/change-orders/changeOrderAddress';
import { changeSetPath } from '@/pages/change-sets/changeSetAddress';
import { unitBlameHref, unitConfigHref, unitRevisionHref } from '@/pages/unit-detail/unitDetailHrefs';
import { formatRelative } from '@/utility/date-format';

import { componentTheme as t } from '../componentTheme';
import { parseUnitData } from '../configParser';
import { Dotted } from './Dotted';
import { InspectRef } from './InspectPeek';
import type { VariantValue } from './variantValues';

/** The Revisions shown, newest first: enough to see where the value came from. */
const MAX_HISTORY = 8;

/** What a Revision did, in words, from its Source. */
function sourceWord(source: string | undefined): string {
  switch (source) {
    case 'CreateUnit':
      return 'created';
    case 'CloneUnit':
      return 'cloned';
    case 'UpgradeUnit':
    case 'MergeUnits':
      return 'merged from upstream';
    case 'NeedsProvides':
      return 'provided by a Link';
    default:
      return 'set here';
  }
}

export interface SheetInspectProps {
  spaceId: string;
  unitId: string;
  /** The Unit's Space, by slug; empty while not known. */
  spaceSlug: string;
  /** The Unit as `space/unit`, for its History rows. */
  unitLabel: string;
  /** The field's bare path in its document, which the History reads. */
  path: string;
  /** The field as the sheet labels it (Replicas, Labels · app); absent when it has no label. */
  label?: string;
  /** The field's full path, with list items named (`containers.?name=gateway`), shown under its name. */
  fullPath: string;
  /** The field's value in every Variant of the Component; undefined while not read. */
  variants?: readonly VariantValue[];
  onClose: () => void;
  /** Called when the content grows (the history is read), so the popover can stay on screen. */
  onResize?: () => void;
}

const headSx = { fontFamily: t.fontSans, fontSize: 12, fontWeight: 700, color: t.fgMuted, mt: '10px', mb: '2px' } as const;
const rowSx = {
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr) max-content',
  alignItems: 'baseline',
  columnGap: '10px',
  py: '4px',
  borderTop: `1px solid ${t.borderSubtle}`,
  fontFamily: t.fontSans,
  fontSize: 12.5,
  color: t.fgDefault,
  '&:first-of-type': { borderTop: 0 },
} as const;
/** What the History reads of each Revision, besides its data: who made it and what holds it. */
const REVISION_INCLUDE = 'UserID,Tags,ChangeSetID,ChangeOrders,Releases';

const userName = (r: ExtendedRevision) => r.User?.DisplayName || r.User?.Username;

const valueSx = { fontFamily: t.fontMono, fontSize: 12, color: t.fgDefault, textAlign: 'right', overflowWrap: 'anywhere' } as const;

export const SheetInspect = memo(function SheetInspect({
  spaceId,
  unitId,
  spaceSlug,
  unitLabel,
  path,
  label,
  fullPath,
  variants,
  onClose,
  onResize,
}: SheetInspectProps) {
  const { data: revisions, isLoading, isError } = useListExtendedRevisionsQuery(
    { spaceId, unitId, include: REVISION_INCLUDE },
    { skip: !spaceId || !unitId },
  );
  const { dataFor, ready } = useRevisionDataMap((revisions ?? []).map((r) => r.Revision?.RevisionID));

  // The Revisions in which the value changed, newest first: each one the value got there.
  const history = useMemo(() => {
    if (!revisions || !ready) return undefined;
    const oldestFirst = [...revisions].sort((a, b) => (a.Revision?.RevisionNum ?? 0) - (b.Revision?.RevisionNum ?? 0));
    const out: { num: number; word: string; when: string; at?: string; value: string | undefined; item: ExtendedRevision }[] = [];
    let last: string | undefined;
    let first = true;
    for (const item of oldestFirst) {
      const rev = item.Revision;
      const value = parseUnitData(dataFor(rev?.RevisionID)).get(path);
      if (!first && value === last) continue;
      first = false;
      last = value;
      out.push({ num: rev?.RevisionNum ?? 0, word: sourceWord(rev?.Source), when: formatRelative(rev?.CreatedAt), at: rev?.CreatedAt, value, item });
    }
    return out.reverse().slice(0, MAX_HISTORY);
  }, [revisions, ready, dataFor, path]);

  const headNum = useMemo(() => Math.max(0, ...(revisions ?? []).map((r) => r.Revision?.RevisionNum ?? 0)), [revisions]);
  // A Variant opens in this drawer: the same page, another Space selected.
  const location = useLocation();
  const variantHref = (variantSpaceId: string) => {
    const params = new URLSearchParams(location.search);
    params.set(SPACE_PARAM, variantSpaceId);
    return `${location.pathname}?${params.toString()}`;
  };
  const unitPeek = {
    kind: 'Unit',
    name: unitLabel,
    lines: [spaceSlug ? `In Space ${spaceSlug}` : undefined, headNum ? `Head revision r${headNum}` : undefined].filter(Boolean),
    links: [
      { label: 'Blame of this field', href: unitBlameHref(spaceId, unitId, path), testId: 'field-inspect-blame' },
      { label: 'Space page', href: `/spaces/${spaceId}` },
    ],
  };

  useEffect(() => {
    onResize?.();
  }, [history, variants, isError, onResize]);


  return (
    <Box data-testid='field-inspect' sx={{ width: 340, maxWidth: '100%', boxSizing: 'border-box', p: '12px 14px 12px' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {label && (
            <Box data-testid='field-inspect-name' sx={{ fontFamily: t.fontSans, fontSize: 14, fontWeight: 700, color: t.fgDefault, overflowWrap: 'anywhere' }}>
              <Dotted>{label}</Dotted>
            </Box>
          )}
          <Box data-testid='field-inspect-path' sx={{ fontFamily: t.fontMono, fontSize: label ? 11 : 12, lineHeight: '16px', color: t.fgMuted, mt: label ? '2px' : 0, overflowWrap: 'break-word' }}>
            <Dotted>{fullPath}</Dotted>
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          data-testid='field-inspect-close'
          aria-label='Close'
          size='small'
          sx={{ width: 22, height: 22, mt: '-2px', color: t.fgSubtle, '&:hover': { color: t.fgDefault } }}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      <Box sx={headSx}>History</Box>
      <Box data-testid='field-inspect-history'>
        {isError ? (
          <Box role='alert' sx={{ fontFamily: t.fontSans, fontSize: 12, color: t.danger, py: '4px' }}>
            The history could not be read.
          </Box>
        ) : isLoading || history === undefined ? (
          <Box sx={{ fontFamily: t.fontSans, fontSize: 12, color: t.fgMuted, py: '4px' }}>Reading the history…</Box>
        ) : (
          history.map((h) => {
            const rev = h.item.Revision;
            const who = userName(h.item);
            const changeSet = h.item.ChangeSet;
            const extras = [
              changeSet && (
                <InspectRef
                  key='cs'
                  href={changeSet.SpaceID === spaceId && spaceSlug ? changeSetPath(spaceSlug, changeSet.Slug) : undefined}
                  testId={`field-inspect-rev-${h.num}-changeset`}
                  onFollow={onClose}
                  peek={{ kind: 'ChangeSet', name: changeSet.DisplayName || changeSet.Slug, lines: changeSet.Description ? [changeSet.Description] : undefined }}
                >
                  {changeSet.DisplayName || changeSet.Slug}
                </InspectRef>
              ),
              ...(h.item.ChangeOrders ?? []).map((co) => (
                <InspectRef
                  key={`co-${co.Slug}`}
                  href={changeOrderPath(co.SpaceID === spaceId ? spaceSlug : undefined, co.Slug)}
                  testId={`field-inspect-rev-${h.num}-changeorder-${co.Slug}`}
                  onFollow={onClose}
                  peek={{ kind: 'ChangeOrder', name: co.DisplayName || co.Slug, lines: co.Description ? [co.Description] : undefined }}
                >
                  {co.DisplayName || co.Slug}
                </InspectRef>
              )),
              ...(h.item.Tags ?? []).map((tag) => (
                <InspectRef
                  key={`tag-${tag.Slug}`}
                  testId={`field-inspect-rev-${h.num}-tag-${tag.Slug}`}
                  peek={{ kind: 'Tag', name: tag.DisplayName || tag.Slug, lines: ['On this Revision'] }}
                >
                  {tag.DisplayName || tag.Slug}
                </InspectRef>
              )),
              (h.item.Releases ?? []).length > 0 && (
                <InspectRef
                  key='rel'
                  href={spaceSlug ? `/releases?${SPACE_PARAM}=${encodeURIComponent(spaceSlug)}` : undefined}
                  testId={`field-inspect-rev-${h.num}-released`}
                  onFollow={onClose}
                  peek={{
                    kind: 'Release',
                    name: `${(h.item.Releases ?? []).length === 1 ? 'A Release' : `${(h.item.Releases ?? []).length} Releases`} of ${spaceSlug || 'this Space'}`,
                    lines: ['Bundled this Revision'],
                  }}
                >
                  released
                </InspectRef>
              ),
            ].filter(Boolean);
            return (
              <Box key={h.num} sx={rowSx} data-testid={`field-inspect-revision-${h.num}`}>
                <Box component='span' sx={{ fontFamily: t.fontMono, fontSize: 11.5, color: t.fgMuted }}>
                  <InspectRef
                    href={unitRevisionHref(spaceId, unitId, h.num)}
                    testId={`field-inspect-rev-${h.num}-link`}
                    onFollow={onClose}
                    peek={{
                      kind: 'Revision',
                      name: `r${h.num} of ${unitLabel}`,
                      lines: [
                        h.word,
                        rev?.Description && rev.Description !== rev.Source ? rev.Description : undefined,
                        who ? `By ${who}` : undefined,
                        h.at ? new Date(h.at).toLocaleString() : undefined,
                      ].filter(Boolean),
                    }}
                  >
                    r{h.num}
                  </InspectRef>
                </Box>
                <Box component='span' sx={{ minWidth: 0 }}>
                  <Box component='span' sx={{ fontWeight: 700 }}>
                    <InspectRef href={unitConfigHref(spaceId, unitId)} testId={`field-inspect-rev-${h.num}-unit`} onFollow={onClose} peek={unitPeek}>
                      {unitLabel}
                    </InspectRef>
                  </Box>{' '}
                  <Box component='span' sx={{ color: t.fgMuted }}>
                    {h.word}
                    {h.when ? `, ${h.when}` : ''}
                    {who && (
                      <>
                        {' by '}
                        <InspectRef
                          testId={`field-inspect-rev-${h.num}-user`}
                          peek={{ kind: 'User', name: who, lines: h.item.User?.Username && h.item.User.Username !== who ? [h.item.User.Username] : undefined }}
                        >
                          {who}
                        </InspectRef>
                      </>
                    )}
                  </Box>
                  {extras.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', fontSize: 11.5, color: t.fgMuted, mt: '1px' }}>{extras}</Box>
                  )}
                </Box>
                <Box component='span' sx={valueSx}>
                  {h.value ?? <Box component='span' sx={{ color: t.fgMuted }}>not set</Box>}
                </Box>
              </Box>
            );
          })
        )}
      </Box>

      {variants && variants.length > 0 && (
        <>
          <Box sx={headSx}>Variants</Box>
          <Box data-testid='field-inspect-variants'>
            {variants.map((v) => (
              <Box key={v.deploymentId} sx={{ ...rowSx, gridTemplateColumns: 'minmax(0, 1fr) max-content' }}>
                <Box component='span' sx={{ fontWeight: v.isCurrent ? 700 : 500, minWidth: 0, overflowWrap: 'anywhere' }}>
                  <InspectRef
                    href={variantHref(v.deploymentId)}
                    testId={`field-inspect-variant-${v.spaceSlug}`}
                    onFollow={onClose}
                    peek={{
                      kind: 'Variant',
                      name: v.displayName,
                      lines: [
                        `Space ${v.spaceSlug}`,
                        v.upstreamName ? `Made from ${v.upstreamName}` : 'A base',
                        v.releaseNum !== undefined ? `Runs Release ${v.releaseNum}` : undefined,
                        `${v.unitCount} ${v.unitCount === 1 ? 'Unit' : 'Units'}`,
                      ].filter(Boolean),
                      links: [
                        { label: 'Space page', href: `/spaces/${v.deploymentId}` },
                        { label: 'Unit page', href: unitConfigHref(v.deploymentId, v.unitId) },
                      ],
                    }}
                  >
                    {v.displayName}
                  </InspectRef>
                  {v.isCurrent && (
                    // The Variant open in the drawer, said in words.
                    <Box component='span' aria-label='this Variant' sx={{ fontWeight: 400, color: t.fgMuted, ml: '6px' }}>
                      (this Variant)
                    </Box>
                  )}
                </Box>
                <Box component='span' sx={valueSx}>
                  {v.value ?? <Box component='span' sx={{ color: t.fgMuted }}>not set</Box>}
                </Box>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
});
