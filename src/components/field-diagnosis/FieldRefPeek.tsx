// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The peek of a reference token (contract D7): the light InfoPeek card chrome, with the approved
// spike's body (first line the title, the rest muted, each one line). The body mounts only while
// the peek is open, so a closed peek costs nothing; only a Unit's peek reads data (its value of
// the field, its head revision).
import { type ReactElement, type ReactNode, useContext } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useGetSpaceQuery, useGetUnitPathQuery, useGetUnitQuery } from '@confighub/rtk-query';

import { INFO_PEEK_TOOLTIP_SX } from '@/components/info-peek/InfoPeek';

import { pathArg } from './fieldArgs';
import type { FieldRef, UnitRef } from './fieldDiagnosis.types';
import { FieldPathContext } from './fieldLinks';

const MONO = 'var(--font-mono)';
const PEEK_SLOT_PROPS = { tooltip: { sx: INFO_PEEK_TOOLTIP_SX } } as const;
const PEEK_MAX_WIDTH = 320;

/** The resource name of `Type|Name` (a Link provider's field names its own). */
const decodeFresName = (fres: string | undefined) => {
  const name = fres?.split('|')[1];
  return name ? name : undefined;
};

const PEEK_TEST_ID: Partial<Record<FieldRef['kind'], string>> = {
  unit: 'fd-peek-unit',
  gate: 'fd-peek-gate',
  revision: 'fd-peek-revision',
  link: 'fd-peek-link',
  user: 'fd-peek-user',
  changeOrder: 'fd-peek-changeorder',
};

export function PeekCard({ lines, testId }: { lines: ReactNode[]; testId?: string }) {
  return (
    <Box data-testid={testId} sx={{ p: '8px 10px', maxWidth: PEEK_MAX_WIDTH }}>
      {lines.map((line, i) => (
        <Typography
          key={i}
          variant="body2"
          noWrap
          color={i === 0 ? 'text.primary' : 'text.secondary'}
          title={typeof line === 'string' ? line : undefined}
          sx={{ fontWeight: i === 0 ? 600 : 400 }}
        >
          {line}
        </Typography>
      ))}
    </Box>
  );
}

const Sep = () => (
  <Box component="span" sx={{ color: 'text.disabled', mx: '6px' }}>
    ·
  </Box>
);

/** "fd-staging · web", the field's value there, "head rev 3". */
function UnitPeek({ refValue, note }: { refValue: UnitRef; note?: string }) {
  const open = useContext(FieldPathContext);
  const spaceId = refValue.spaceId ?? '';
  const unitId = refValue.unitId ?? '';
  const path = refValue.field ?? open.path;
  // The resource names the document in a Unit of several. The server matches it by type and
  // name, else by the name without its namespace (which differs between Variants).
  const resourceName = refValue.field ? decodeFresName(refValue.fres) : open.resourceName;
  const unit = useGetUnitQuery({ spaceId, unitId });
  const space = useGetSpaceQuery({ spaceId });
  const field = useGetUnitPathQuery(pathArg({ spaceId, unitId, path, resourceName }), { skip: !path });
  const value = field.error
    ? 'Could not read'
    : field.currentData
      ? (field.currentData.Field?.Value ?? '').replace(/\n$/, '') || '—'
      : '…';
  const head = unit.currentData?.Unit?.HeadRevisionNum;
  return (
    <PeekCard
      testId="fd-peek-unit"
      lines={[
        <>
          {space.currentData?.Space?.Slug ?? '…'}
          <Sep />
          {unit.currentData?.Unit?.Slug ?? '…'}
        </>,
        ...(path
          ? [
              <Box key="v" component="span" sx={field.error ? undefined : { fontFamily: MONO }}>
                {value}
              </Box>,
            ]
          : []),
        ...(head !== undefined ? [`head rev ${head}`] : []),
        ...(note ? [note] : []),
      ]}
    />
  );
}

function hasPeek(ref: FieldRef, note: string | undefined): boolean {
  if (ref.kind === 'unit') return Boolean(ref.spaceId && ref.unitId);
  return (ref.peek?.length ?? 0) > 0 || Boolean(note);
}

/** Wraps a token in its peek, when it has one. `note` says what the link does, as its last line. */
export function FieldRefPeek({ refValue, note, children }: { refValue: FieldRef; note?: string; children: ReactElement }) {
  if (!hasPeek(refValue, note)) return children;
  const lines = refValue.peek?.length ? refValue.peek : [refValue.label];
  const title =
    refValue.kind === 'unit' ? (
      <UnitPeek refValue={refValue} note={note} />
    ) : (
      <PeekCard testId={PEEK_TEST_ID[refValue.kind]} lines={note ? [...lines, note] : lines} />
    );
  return (
    <Tooltip title={title} enterDelay={300} enterNextDelay={300} placement="bottom-start" slotProps={PEEK_SLOT_PROPS}>
      {children}
    </Tooltip>
  );
}
