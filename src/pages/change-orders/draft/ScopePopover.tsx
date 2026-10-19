// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderCopyOutlinedIcon from '@mui/icons-material/FolderCopyOutlined';
import SearchIcon from '@mui/icons-material/Search';

import type { ChangeOrderOutcomeKind } from '../changeOrderOutcome';
import { OUTCOME_META } from '../components/outcomeMeta';
import {
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { draftCopy } from './draftCopy';
import { BARE_BUTTON, DRAFT_TRANSITION, FIELD_BUTTON_SX, FOCUS_RING, NOW_VALUE_SX, OPTION_SX, PILL_SX } from './draftLook';
import { DraftPopover, PopoverHeading } from './DraftPopover';
import type { DraftVariant } from './draftTypes';

const copy = draftCopy.page.scope;

/** The id the blocker focuses when Where holds the first problem. */
export const DRAFT_SCOPE_ID = 'draft-scope';

/** A stage at most this long lists its variants flat; a longer one groups them by region. */
const FLAT_LIMIT = 6;
/** The filter field appears once there are more variants than a glance takes in. */
const SEARCH_FROM = 20;

type Tri = 'true' | 'false' | 'mixed';

function triOf(ids: readonly string[], inScope: ReadonlySet<string>): Tri {
  const n = ids.filter((id) => inScope.has(id)).length;
  return n === 0 ? 'false' : n === ids.length ? 'true' : 'mixed';
}

interface CheckProps {
  state: Tri;
}

function Check({ state }: CheckProps) {
  const on = state !== 'false';
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        boxSizing: 'border-box',
        width: 15,
        height: 15,
        borderRadius: '3px',
        border: `1px solid ${on ? changeOrderStatus.accent : changeOrderBorder.strong}`,
        background: on ? changeOrderStatus.accent : changeOrderSurface.card,
        display: 'grid',
        placeItems: 'center',
        flex: 'none',
        marginTop: '1px',
      }}
    >
      {state === 'true' ? <CheckIcon sx={{ fontSize: 12, color: changeOrderSurface.card }} /> : null}
      {state === 'mixed' ? <Box sx={{ width: 7, height: 2, background: changeOrderSurface.card, borderRadius: '1px' }} /> : null}
    </Box>
  );
}

interface DotsProps {
  ids: readonly string[];
  kindBySpaceId: ReadonlyMap<string, ChangeOrderOutcomeKind>;
}

/** Coloured squares for the variants a group holds that do not take the change as written. */
function Dots({ ids, kindBySpaceId }: DotsProps) {
  const kinds = new Map<ChangeOrderOutcomeKind, number>();
  for (const id of ids) {
    const kind = kindBySpaceId.get(id);
    if (kind !== undefined && kind !== 'same') kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
  if (kinds.size === 0) return null;
  return (
    <Box component="span" sx={{ display: 'inline-flex', gap: '3px', alignItems: 'center', alignSelf: 'center' }}>
      {[...kinds].map(([kind, n]) => (
        <Box
          key={kind}
          component="i"
          title={`${OUTCOME_META[kind].label}: ${n}`}
          sx={{ width: 7, height: 7, borderRadius: `${changeOrderShape.radius.xs}px`, background: OUTCOME_META[kind].tone }}
        />
      ))}
    </Box>
  );
}

const ROW_SX = { ...OPTION_SX, '&[aria-checked]': { boxShadow: 'none', background: 'transparent' }, '&:hover, &:focus-visible': { background: changeOrderSurface.sunk } };
const SMALL_ROW_SX = { ...ROW_SX, padding: '4px 8px' };
const MONO_SX = { fontFamily: changeOrderFontMono, fontSize: 12, fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.default };
const ASIDE_SX = { fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, whiteSpace: 'nowrap' };

interface StageGroup {
  stage: string;
  ids: string[];
  regions: { region: string; ids: string[] }[];
}

export interface ScopePickerProps {
  variants: readonly DraftVariant[];
  inScopeIds: readonly string[];
  /** The governing workflow's stage names: the groups' order. */
  stageOrder: readonly string[];
  kindBySpaceId: ReadonlyMap<string, ChangeOrderOutcomeKind>;
  /** `out=` as it should be: slugs left out, `[]` for every variant, `null` for as last time. */
  onChange: (out: string[] | null) => void;
  asChip: boolean;
  /** "−1 +2" against last time, for the diff row. */
  delta?: string;
  /** Told when the popover opens and closes, so the ledger keeps the control where it was while it is open. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Which variants the ChangeOrder covers: stage, then region, then variant, each group a
 * three-state check. "All" takes every variant; "As last time" returns to the last ChangeOrder's.
 * The scope never empties from here: the last variant cannot be unticked.
 */
export function ScopePicker({
  variants,
  inScopeIds,
  stageOrder,
  kindBySpaceId,
  onChange,
  asChip,
  delta,
  onOpenChange,
}: ScopePickerProps) {
  const [anchor, setAnchorState] = useState<HTMLElement | null>(null);
  const setAnchor = (next: HTMLElement | null) => {
    setAnchorState(next);
    onOpenChange?.(next !== null);
  };
  const [query, setQuery] = useState('');
  const [openRegions, setOpenRegions] = useState<ReadonlySet<string>>(new Set());
  const inScope = useMemo(() => new Set(inScopeIds), [inScopeIds]);

  const groups = useMemo((): StageGroup[] => {
    const q = query.trim().toLowerCase();
    const matches = (variant: DraftVariant) =>
      q === '' || [variant.slug, variant.name, variant.region ?? ''].some((text) => text.toLowerCase().includes(q));
    const byStage = new Map<string, DraftVariant[]>();
    for (const variant of variants) {
      if (!matches(variant)) continue;
      const stage = variant.stage ?? copy.noStage;
      byStage.set(stage, [...(byStage.get(stage) ?? []), variant]);
    }
    const rank = (stage: string) => {
      const at = stageOrder.indexOf(stage);
      return at < 0 ? stageOrder.length + (stage === copy.noStage ? 1 : 0) : at;
    };
    return [...byStage.entries()]
      .sort(([a], [b]) => rank(a) - rank(b))
      .map(([stage, members]) => {
        const regions = new Map<string, string[]>();
        for (const member of members) {
          const region = member.region ?? copy.noRegion;
          regions.set(region, [...(regions.get(region) ?? []), member.spaceId]);
        }
        return { stage, ids: members.map((member) => member.spaceId), regions: [...regions].map(([region, ids]) => ({ region, ids })) };
      });
  }, [variants, stageOrder, query]);

  const byId = useMemo(() => new Map(variants.map((variant) => [variant.spaceId, variant])), [variants]);
  const write = (next: ReadonlySet<string>) => {
    if (next.size === 0) return;
    onChange(variants.filter((variant) => !next.has(variant.spaceId)).map((variant) => variant.slug));
  };
  const toggleOne = (id: string) => {
    const next = new Set(inScope);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    write(next);
  };
  const toggleMany = (ids: readonly string[]) => {
    const on = triOf(ids, inScope) !== 'true';
    const next = new Set(inScope);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    // Unticking a group that holds the whole scope keeps its first variant, as unticking one would.
    if (next.size === 0) next.add(ids[0]);
    write(next);
  };
  const searching = query.trim() !== '';
  const count = inScopeIds.length;

  const variantRow = (id: string, aside: string | undefined) => {
    const variant = byId.get(id);
    if (variant === undefined) return null;
    return (
      <Box
        key={id}
        component="button"
        type="button"
        role="menuitemcheckbox"
        data-draft-option
        aria-checked={inScope.has(id)}
        onClick={() => toggleOne(id)}
        sx={SMALL_ROW_SX}
      >
        <Check state={inScope.has(id) ? 'true' : 'false'} />
        <Box component="span" translate="no" sx={{ ...MONO_SX, flex: 1, minWidth: 0 }}>
          {variant.name}
        </Box>
        <Dots ids={[id]} kindBySpaceId={kindBySpaceId} />
        {aside === undefined ? null : <Box component="span" sx={ASIDE_SX}>{aside}</Box>}
      </Box>
    );
  };

  return (
    <>
      <Box
        component="button"
        type="button"
        id={DRAFT_SCOPE_ID}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-label={`${copy.title}: ${draftCopy.page.ledger.variants(count)}`}
        onClick={(event) => setAnchor(event.currentTarget)}
        data-testid="draft-scope"
        sx={asChip ? PILL_SX : FIELD_BUTTON_SX}
      >
        {asChip ? (
          <>
            <FolderCopyOutlinedIcon aria-hidden />
            <Box component="span" sx={{ fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.default, fontVariantNumeric: 'tabular-nums' }}>
              {count}
            </Box>
            {draftCopy.page.ledger.variants(count).replace(/^\d+ /, '')}
            <ExpandMoreIcon aria-hidden />
          </>
        ) : (
          <>
            <Box component="span" sx={NOW_VALUE_SX}>
              {draftCopy.page.ledger.variants(count)}
            </Box>
            <ExpandMoreIcon aria-hidden sx={{ fontSize: 16, color: changeOrderInk.subtle }} />
          </>
        )}
      </Box>
      {delta === undefined || delta === '' ? null : (
        <Box component="span" sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
          {delta}
        </Box>
      )}
      <DraftPopover anchorEl={anchor} onClose={() => setAnchor(null)} label={copy.title} wide height={420}>
        <PopoverHeading icon={<FolderCopyOutlinedIcon aria-hidden />}>{copy.title}</PopoverHeading>
        {variants.length > SEARCH_FROM ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              margin: '2px 4px 6px',
              padding: '0 8px',
              height: 30,
              border: `1px solid ${changeOrderBorder.default}`,
              borderRadius: `${changeOrderShape.radius.md}px`,
            }}
          >
            <SearchIcon aria-hidden sx={{ fontSize: 16, color: changeOrderInk.subtle }} />
            <InputBase
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              inputProps={{ 'aria-label': copy.title, type: 'search', autoComplete: 'off', spellCheck: false }}
              sx={{ flex: 1, fontSize: changeOrderType.size.body }}
            />
          </Box>
        ) : null}
        <Box role="menu" aria-label={copy.title} sx={{ maxHeight: 380, overflow: 'auto', overscrollBehavior: 'contain' }}>
          {groups.map((group) => {
            const flat = group.ids.length <= FLAT_LIMIT || searching;
            return (
              <Box key={group.stage}>
                <Box
                  component="button"
                  type="button"
                  role="menuitemcheckbox"
                  data-draft-option
                  aria-checked={triOf(group.ids, inScope)}
                  onClick={() => toggleMany(group.ids)}
                  sx={ROW_SX}
                >
                  <Check state={triOf(group.ids, inScope)} />
                  <Box component="span" translate="no" sx={{ ...MONO_SX, flex: 1 }}>
                    {group.stage}
                  </Box>
                  <Dots ids={group.ids} kindBySpaceId={kindBySpaceId} />
                  <Box component="span" sx={ASIDE_SX}>
                    {group.ids.filter((id) => inScope.has(id)).length}/{group.ids.length}
                  </Box>
                </Box>
                <Box sx={{ paddingLeft: '26px' }}>
                  {flat
                    ? group.ids.map((id) => variantRow(id, byId.get(id)?.region ?? '—'))
                    : group.regions.map(({ region, ids }) => {
                        const key = `${group.stage}|${region}`;
                        const open = openRegions.has(key);
                        return (
                          <Box key={key}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <Box
                                component="button"
                                type="button"
                                aria-expanded={open}
                                aria-label={region}
                                onClick={() =>
                                  setOpenRegions((previous) => {
                                    const next = new Set(previous);
                                    if (next.has(key)) next.delete(key);
                                    else next.add(key);
                                    return next;
                                  })
                                }
                                sx={{
                                  ...BARE_BUTTON,
                                  display: 'grid',
                                  placeItems: 'center',
                                  width: 20,
                                  height: 20,
                                  borderRadius: '4px',
                                  color: changeOrderInk.subtle,
                                  transition: DRAFT_TRANSITION,
                                  '&:hover': { background: changeOrderSurface.inset },
                                  '&:focus-visible': FOCUS_RING,
                                  '& .MuiSvgIcon-root': { fontSize: 16, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' },
                                }}
                              >
                                <ChevronRightIcon aria-hidden />
                              </Box>
                              <Box
                                component="button"
                                type="button"
                                role="menuitemcheckbox"
                                data-draft-option
                                aria-checked={triOf(ids, inScope)}
                                onClick={() => toggleMany(ids)}
                                sx={{ ...SMALL_ROW_SX, flex: 1 }}
                              >
                                <Check state={triOf(ids, inScope)} />
                                <Box component="span" translate="no" sx={{ ...MONO_SX, flex: 1 }}>
                                  {region}
                                </Box>
                                <Dots ids={ids} kindBySpaceId={kindBySpaceId} />
                                <Box component="span" sx={ASIDE_SX}>
                                  {ids.filter((id) => inScope.has(id)).length}/{ids.length}
                                </Box>
                              </Box>
                            </Box>
                            {open ? <Box sx={{ paddingLeft: '26px' }}>{ids.map((id) => variantRow(id, undefined))}</Box> : null}
                          </Box>
                        );
                      })}
                </Box>
              </Box>
            );
          })}
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 8px 4px',
            borderTop: `1px solid ${changeOrderBorder.default}`,
            marginTop: '6px',
            fontSize: changeOrderType.size.small,
            color: changeOrderInk.subtle,
          }}
        >
          {[
            { label: copy.all(variants.length), out: [] as string[] },
            { label: copy.asLastTime, out: null },
          ].map((action) => (
            <Box
              key={action.label}
              component="button"
              type="button"
              onClick={() => onChange(action.out)}
              sx={{
                ...BARE_BUTTON,
                fontSize: changeOrderType.size.small,
                fontWeight: changeOrderType.weight.semibold,
                color: changeOrderInk.muted,
                borderRadius: '3px',
                transition: DRAFT_TRANSITION,
                '&:hover': { color: changeOrderInk.default },
                '&:focus-visible': FOCUS_RING,
              }}
            >
              {action.label}
            </Box>
          ))}
          <Box component="span" sx={{ marginLeft: 'auto' }}>
            {copy.selected(count)}
          </Box>
        </Box>
      </DraftPopover>
    </>
  );
}
