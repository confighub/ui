// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The change's Units (D4, D5): a sunk "Units" band with "N Units in M Spaces", then the Units
 * grouped by Space (the change's Space marked "base" when it is a Component's base), each with SPACE/Unit, its kind, its
 * resource, when it last changed, and one readable line per changed field.
 */
import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import DataObjectIcon from '@mui/icons-material/DataObject';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { useListSpacesQuery, type ExtendedRevisionRead } from '@confighub/rtk-query';
import { inClause, uniqueIds } from '@/hooks/inClauseChunks';
import { useListUnitsByIdChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { changeOrderInk, changeOrderStatus, changeOrderSurface, changeOrderType } from '@/pages/change-orders/changeOrdersTokens';
import type { ChangeSetDiffRow } from '@/pages/change-sets/useChangeSetDetail';
import { formatRelative } from '@/utility/date-format';
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { PanelLink, VariantGroupLabel } from './ChangeTrackParts';
import { LONG_VALUES, diffResources, splitChange, type DiffLine } from './diffLines';
import { middleCut, monoSx } from './panelStyles';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface PanelUnit {
  unitId: string;
  slug: string;
  spaceId: string;
  spaceSlug: string;
  row?: ChangeSetDiffRow;
}

const valueSx = { ...monoSx, fontSize: 12, padding: '0 4px', borderRadius: '2px', overflowWrap: 'anywhere' } as const;
const oldSx = { ...valueSx, background: changeOrderStatus.dangerSoft, color: changeOrderStatus.danger } as const;
const newSx = { ...valueSx, background: changeOrderStatus.successGround, color: changeOrderStatus.success } as const;

function FieldLine({ line, testId, unitIndex, lineIndex }: { line: DiffLine; testId: string; unitIndex: number; lineIndex: number }) {
  const [full, setFull] = useState(false);
  const label = (
    <>
      <Box component="span" sx={{ ...monoSx, fontSize: 12, fontWeight: 600, color: changeOrderInk.default, minWidth: 72 }}>
        {line.field}
      </Box>
      {line.location ? (
        <Box component="span" data-testid={`diff-loc-${unitIndex}-${lineIndex}`} sx={{ fontSize: changeOrderType.size.small, color: tokens.t3 }}>
          {line.location}
        </Box>
      ) : null}
    </>
  );
  const rowSx = { display: 'flex', alignItems: 'baseline', gap: 1, padding: '3px 0', flexWrap: 'wrap', fontSize: changeOrderType.size.body } as const;
  if ((line.from + line.to).length <= LONG_VALUES) {
    return (
      <Box data-testid={testId} sx={rowSx}>
        {label}
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: '5px', flexWrap: 'wrap', minWidth: 0 }}>
          <Box component="span" sx={oldSx}>
            {line.from}
          </Box>
          <Box component="span" sx={{ color: tokens.t3 }}>
            →
          </Box>
          <Box component="span" sx={newSx}>
            {line.to}
          </Box>
        </Box>
      </Box>
    );
  }
  const split = splitChange(line.from, line.to);
  const same = split.same.length > 14 ? `…${split.same.slice(-13)}` : split.same;
  const value = (part: string, sx: object, sign: string, whole: string) => (
    <Box sx={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginTop: '2px' }}>
      <Box component="span" sx={{ ...monoSx, fontSize: 12, color: tokens.t3, width: 10, flex: 'none' }}>
        {sign}
      </Box>
      {full ? (
        <Box component="span" sx={{ ...sx, display: 'block', flex: 1, padding: '5px 8px' }}>
          {whole}
        </Box>
      ) : (
        <Box component="span" sx={{ ...monoSx, fontSize: 12, whiteSpace: 'nowrap', minWidth: 0 }}>
          <Box component="span" sx={{ color: tokens.t2 }}>
            {same}
          </Box>
          <Box component="span" sx={sx}>
            {middleCut(part, 14, 8)}
          </Box>
        </Box>
      )}
    </Box>
  );
  return (
    <Box data-testid={testId}>
      <Box sx={rowSx}>
        {label}
        <Box sx={{ marginLeft: 'auto' }}>
          <PanelLink small testId={`diff-full-${unitIndex}-${lineIndex}`} expanded={full} onClick={() => setFull((f) => !f)}>
            {full ? 'Show the changed part' : 'Show full value'}
          </PanelLink>
        </Box>
      </Box>
      {value(split.oldPart, oldSx, '−', line.from)}
      {value(split.newPart, newSx, '+', line.to)}
    </Box>
  );
}

function UnitBlock({ unit, index, when }: { unit: PanelUnit; index: number; when: string }) {
  const name = `${unit.spaceSlug}/${unit.slug}`;
  const resources = unit.row ? diffResources(unit.row.diff) : [];
  const kind = resources[0]?.kind ?? unit.row?.resourceKind ?? '';
  let lineIndex = 0;
  return (
    <Box data-testid={`unit-${index}`} sx={{ padding: '6px 16px 12px', borderBottom: `1px solid ${tokens.bd2}` }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <DataObjectIcon sx={{ fontSize: 15, color: tokens.t2, flex: 'none', marginTop: '2px' }} />
        <Box component="span" data-testid={`unit-name-${index}`} title={name} sx={{ ...monoSx, flex: 1, fontSize: changeOrderType.size.body, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 0 }}>
          {middleCut(name, 17, 15)}
        </Box>
        {kind ? (
          <Box component="span" sx={{ flex: 'none', height: 20, padding: '0 7px', borderRadius: '3px', fontSize: changeOrderType.size.small, fontWeight: 500, color: tokens.t2, background: tokens.bgHover, display: 'inline-flex', alignItems: 'center' }}>
            {kind}
          </Box>
        ) : null}
      </Box>
      {resources.map((resource) => (
        <Box key={resource.label}>
          <Box sx={{ ...monoSx, fontSize: changeOrderType.size.small, color: tokens.t2, margin: '4px 0 2px', display: 'flex', gap: 1 }}>
            <Box component="span" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
              {resource.label}
            </Box>
            {resource === resources[0] ? (
              <Box component="span" data-testid={`unit-time-${index}`} sx={{ marginLeft: 'auto', fontSize: 12, color: tokens.t3, whiteSpace: 'nowrap' }}>
                {when}
              </Box>
            ) : null}
          </Box>
          {resource.lines.map((line) => {
            lineIndex += 1;
            return <FieldLine key={line.key} line={line} unitIndex={index} lineIndex={lineIndex} testId={`diff-row-${index}-${lineIndex}`} />;
          })}
        </Box>
      ))}
      {resources.length === 0 ? (
        <Box sx={{ fontSize: 12, color: tokens.t3, marginTop: '4px', display: 'flex', gap: 1 }}>
          <span>No edits yet</span>
          <Box component="span" data-testid={`unit-time-${index}`} sx={{ marginLeft: 'auto' }}>
            {when}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

export function UnitsSection({
  rows,
  openUnitIds,
  baseSpace,
  finished = false,
  revisions,
}: {
  rows: ChangeSetDiffRow[];
  openUnitIds: string[];
  /** The change's Space when it is a Component's base, else empty: only a base is marked "base". */
  baseSpace: string;
  /** The change is finished: an empty change says so instead of inviting saves. */
  finished?: boolean;
  revisions: ExtendedRevisionRead[] | undefined;
}) {
  // Units the change is open on with no edit yet (joined by Start or Add) have no diff row.
  const bare = useMemo(() => {
    const withRow = new Set(rows.map((r) => r.unit.unitId));
    return openUnitIds.filter((id) => !withRow.has(id));
  }, [rows, openUnitIds]);
  const bareRead = useListUnitsByIdChunkedQuery({ unitIds: bare, select: 'UnitID,Slug,SpaceID' }, { skip: bare.length === 0 });
  const bareData = bareRead.currentData;
  const bareSpaceIds = useMemo(() => uniqueIds((bareData ?? []).map((e) => e.Unit?.SpaceID)), [bareData]);
  const bareSpaces = useListSpacesQuery({ where: inClause('SpaceID', bareSpaceIds), select: 'SpaceID,Slug' }, { skip: bareSpaceIds.length === 0 });

  const units = useMemo<PanelUnit[]>(() => {
    const slugOf = new Map((bareSpaces.data ?? []).map((e) => [e.Space?.SpaceID ?? '', e.Space?.Slug ?? '']));
    const list: PanelUnit[] = rows.map((row) => ({ ...row.unit, row }));
    const stillBare = new Set(bare);
    for (const e of bare.length === 0 ? [] : (bareData ?? [])) {
      if (!e.Unit?.UnitID || !e.Unit.SpaceID || !stillBare.has(e.Unit.UnitID)) continue;
      list.push({ unitId: e.Unit.UnitID, slug: e.Unit.Slug, spaceId: e.Unit.SpaceID, spaceSlug: slugOf.get(e.Unit.SpaceID) ?? '' });
    }
    return list;
  }, [rows, bare, bareData, bareSpaces.data]);

  const lastRevisionAt = useMemo(() => {
    const at = new Map<string, string>();
    for (const entry of revisions ?? []) {
      const r = entry.Revision;
      if (!r?.UnitID || !r.CreatedAt) continue;
      if ((at.get(r.UnitID) ?? '') < r.CreatedAt) at.set(r.UnitID, r.CreatedAt);
    }
    return at;
  }, [revisions]);

  const groups = useMemo(() => {
    const bySpace = new Map<string, PanelUnit[]>();
    for (const u of units) bySpace.set(u.spaceSlug, [...(bySpace.get(u.spaceSlug) ?? []), u]);
    // The change's own Space first, then the order the read gives.
    return [...bySpace.entries()].sort((a, b) => Number(b[0] === baseSpace) - Number(a[0] === baseSpace));
  }, [units, baseSpace]);

  const band = (meta?: string) => (
    <Box
      data-testid="units-band"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        padding: '9px 16px',
        background: changeOrderSurface.sunk,
        borderTop: `1px solid ${tokens.bd0}`,
        borderBottom: `1px solid ${tokens.bd0}`,
        fontSize: changeOrderType.size.body,
        fontWeight: 600,
        color: changeOrderInk.default,
      }}
    >
      <span>Units</span>
      {meta ? (
        <Box component="span" data-testid="units-count" sx={{ marginLeft: 'auto', fontWeight: 400, color: changeOrderInk.muted, fontSize: 12 }}>
          {meta}
        </Box>
      ) : null}
    </Box>
  );

  if (units.length === 0) {
    return (
      <>
        {band()}
        <Box data-testid="units-empty" sx={{ padding: '14px 16px', fontSize: changeOrderType.size.body, color: tokens.t2 }}>
          {finished ? 'This ChangeSet finished with no Units.' : 'No Units yet. Save any Unit, on any page and in any Variant, and it joins this ChangeSet here with what changed.'}
        </Box>
      </>
    );
  }

  let index = 0;
  return (
    <>
      {band(`${plural(units.length, 'Unit')} in ${plural(groups.length, 'Space')}`)}
      {groups.map(([space, list], gi) => (
        <Box key={space} data-testid={`space-group-${gi + 1}`}>
          <VariantGroupLabel slug={space} icon={<FolderOutlinedIcon sx={{ fontSize: 13 }} />}>
            {space === baseSpace ? (
              <Box component="span" sx={{ height: 20, padding: '0 7px', borderRadius: '3px', fontSize: changeOrderType.size.small, fontWeight: 500, color: changeOrderInk.muted, border: `1px solid ${tokens.bd0}`, display: 'inline-flex', alignItems: 'center' }}>
                base
              </Box>
            ) : null}
          </VariantGroupLabel>
          {list.map((u) => {
            index += 1;
            return <UnitBlock key={u.unitId} unit={u} index={index} when={formatRelative(lastRevisionAt.get(u.unitId))} />;
          })}
        </Box>
      ))}
    </>
  );
}
