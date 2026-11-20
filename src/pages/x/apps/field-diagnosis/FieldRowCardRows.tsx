// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What field diagnosis adds to the row hover card ("Edit this value"; PLAN.md U5, contract D5):
// rows in the card's own style, from the open Unit's CACHED blame only (no request on hover): the
// set-by row, at most one attention line, the guards that "Keep on merge" does not already say,
// and Details. The card's old "Functions: ..." line of the Unit's last revision is gone.
import { type MouseEvent, useContext, useMemo } from 'react';
import Box from '@mui/material/Box';

import { FieldNeedText } from '@/components/field-diagnosis/FieldNeeds';
import { FieldSetByLine } from '@/components/field-diagnosis/FieldSetByLine';
import { factsFromBlame } from '@/components/field-diagnosis/adapters';
import { explainField } from '@/components/field-diagnosis/explainField';
import { FieldLinkResolverContext, FieldPathContext } from '@/components/field-diagnosis/fieldLinks';

import { componentTheme } from '../componentTheme';
import { useComponentFocus } from './ComponentFocusContext';
import { encodeFres, openFieldPatch } from './componentFocus';
import { FieldBlameContext } from './fieldBlameContext';
import { rowCardLines } from './rowCardLines';
import { usePaneFieldResolver } from './usePaneFieldResolver';

/** The card's muted status row (ActionTooltipContent, row 4). */
const ROW = {
  px: 1.5,
  pb: '6px',
  fontFamily: componentTheme.fontSans,
  fontSize: 10.5,
  color: componentTheme.fgSubtle,
  lineHeight: 1.4,
  // The card's bubble is click-through; rows with links opt back in.
  pointerEvents: 'auto',
  // Rows drawn with the details' Typography take the card's size.
  '& .MuiTypography-root': { fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit' },
  '& .MuiTypography-root:not(a)': { color: 'inherit' },
  '& a': { color: componentTheme.accent },
} as const;

const ONE_LINE = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

const isPlainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export interface FieldRowCardRowsProps {
  spaceId: string;
  unitId: string;
  stageKey: string;
  /** The card shows its own "Keep on merge" / "Let merges update this" row (the Override guard). */
  keepShown: boolean;
  /** The card shows its own status line (a staged edit, a staged or waiting upgrade). */
  hasStatus: boolean;
  /** Open the row's details (the URL follows, by replace). */
  onOpen: () => void;
}

export function FieldRowCardRows({ spaceId, unitId, stageKey, keepShown, hasStatus, onOpen }: FieldRowCardRowsProps) {
  const { index, upstream } = useContext(FieldBlameContext);
  const field = index.get(stageKey);
  // The withheld change's source and revision come from the Unit as the pane listed it: no
  // request on hover. The source's "space/unit" peek line is read only once a peek opens.
  const lines = useMemo(() => {
    if (!field) return undefined;
    return rowCardLines(explainField(factsFromBlame(field), { upstream }), { keepShown, hasStatus });
  }, [field, upstream, keepShown, hasStatus]);

  const fres = encodeFres(field?.ResourceType, field?.ResourceName);
  const resolve = usePaneFieldResolver({ path: field?.Path ?? '', fres, spaceId, unitId });
  const { hrefFor } = useComponentFocus();
  const detailsHref = hrefFor(field?.Path ? openFieldPatch(unitId, field.Path, fres) : { unit: unitId });

  const fieldPathValue = useMemo(() => ({ path: field?.Path, resourceName: field?.ResourceName }), [field]);
  const setBy = lines?.setBy;
  const attention = lines?.attention;
  const fullSetBy = setBy ? [setBy.who, setBy.when, setBy.reason ? `"${setBy.reason}"` : undefined].filter(Boolean).join(' · ') : '';

  return (
    <FieldLinkResolverContext.Provider value={resolve}>
      <FieldPathContext.Provider value={fieldPathValue}>
        {/* The card's own width (ActionTooltipContent: 196-248px): rows wrap or cut, never widen it. */}
        <Box data-testid="fd-peek-rows" sx={{ minWidth: 196, maxWidth: 248 }}>
          {setBy && (
            <Box sx={{ ...ROW, ...ONE_LINE }} title={fullSetBy} data-testid="fd-peek-setby">
              <FieldSetByLine setBy={setBy} />
            </Box>
          )}
          {attention && (
            <Box
              data-testid="fd-peek-attention"
              sx={{ ...ROW, fontSize: 11.5, color: componentTheme.fgDefault, display: 'flex', gap: '6px', alignItems: 'baseline' }}
            >
              <Box component="span" sx={{ color: attention.tone === 'block' ? componentTheme.danger : componentTheme.attention, flexShrink: 0 }}>
                {attention.tone === 'block' ? '✕' : '⚠'}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <FieldNeedText need={attention} />
              </Box>
            </Box>
          )}
          {(lines?.guards ?? []).map((g) => (
            <Box key={g.key} sx={ROW} title={g.meaning} data-testid="fd-peek-guard">
              {g.key} · edits {g.edits ? '✓' : '✗'} merges {g.merges ? '✓' : '✗'}
            </Box>
          ))}
          <Box
            component="a"
            href={detailsHref}
            data-testid="fd-peek-details"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              if (!isPlainClick(e)) return;
              e.preventDefault();
              onOpen();
            }}
            sx={{
              display: 'block',
              pointerEvents: 'auto',
              cursor: 'pointer',
              borderTop: `1px solid ${componentTheme.borderSubtle}`,
              px: 1.5,
              py: '7px',
              fontFamily: componentTheme.fontSans,
              fontSize: 11.5,
              fontWeight: 660,
              color: componentTheme.accent,
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            Details
          </Box>
        </Box>
      </FieldPathContext.Provider>
    </FieldLinkResolverContext.Provider>
  );
}
