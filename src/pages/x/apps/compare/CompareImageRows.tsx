// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Container images, hoisted above the grid where they get the pane's full width.
 *
 * `ImageChangeRows` already lifts images out of the Releases tab's tree, for the
 * reason that applies twice as hard here: a registry-qualified reference does
 * not fit a 104px column. At five deployments that is the difference between a
 * page a reader can use and five wrapped cells.
 *
 * ONE GROUP PER CONTAINER, keyed by the container's NAME, and one row per
 * deployment inside it. The magnitude meter is the shipped one and it rides the
 * meter rather than the colour, because colour is already spent on the compare
 * vocabulary.
 */

import { memo, useMemo, type ReactElement } from 'react';

import Box from '@mui/material/Box';

import { componentTheme } from '../componentTheme';
import { LETTER_SX, letterFor } from './slotLetter';
import { METER_GLYPHS } from '../imageMeterGlyphs';
import {
  IMAGE_CLASS_WORD,
  IMAGE_METER_LEVEL,
  parseImageRef,
  rowImageChange,
  type ImageRef,
} from '../imageRef';
import { containerImageOf } from './containerImagePaths';
import { UNANSWERABLE, unanswerableReason } from './unanswerable';
import { rowDiffers, type CompareColumnInput, type CompareLeafRow } from './deploymentCompareModel';

export interface CompareImageRowsProps {
  columns: readonly CompareColumnInput[];
  rows: readonly CompareLeafRow[];
}

const GROUP_SX = { padding: '7px 0 6px', borderBottom: `1px solid ${componentTheme.borderMuted}` } as const;

const HEAD_SX = { display: 'flex', alignItems: 'baseline', gap: '8px', padding: '0 16px 4px' } as const;

const ROW_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 16px',
  minHeight: 22,
  // The drag layer's skeleton (`CompareColumnDnd.tsx`) positions an `::after`
  // over this element while its column is being dragged.
  position: 'relative',
} as const;

/**
 * The name column is as wide as the longest deployment name, so names show in
 * full and every row's value starts at the same x. The font is monospace, so
 * `ch` measures a name exactly. The cap keeps a very long name from pushing the
 * image tags out of the row; past it, the name is ellipsised.
 */
const WHO_MAX_WIDTH = '40%';

const WHO_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: 10.5,
  color: componentTheme.fgMuted,
  maxWidth: WHO_MAX_WIDTH,
  flex: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const VALUE_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: 12,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
} as const;

/** The repository every deployment agrees on, printed once so the rows need not repeat it. */
function sharedRepoPath(literals: readonly string[]): string | null {
  const paths = literals.map((literal) => parseImageRef(literal)?.repoPath).filter(Boolean);
  if (paths.length !== literals.length || paths.length === 0) return null;
  const first = paths[0] as string;
  return paths.every((path) => path === first) ? first : null;
}

function CompareImageRowsInner({ columns, rows }: CompareImageRowsProps): ReactElement | null {
  const groups = useMemo(() => {
    const found: { key: string; container: string; row: CompareLeafRow }[] = [];
    for (const row of rows) {
      const image = containerImageOf(row);
      if (!image) continue;
      found.push({ key: row.identityPath, container: `${image.list}[${image.container}]`, row });
    }
    return found;
  }, [rows]);

  const whoWidth = useMemo(() => {
    const longest = columns.reduce((max, column, index) => Math.max(max, (column?.label ?? letterFor(index)).length), 0);
    return `${longest}ch`;
  }, [columns]);

  if (groups.length === 0) return null;

  return (
    <Box data-testid="compare-image-rows">
      {groups.map(({ key, container, row }) => {
        const literals = row.cells
          .map((cell) => cell.literal)
          .filter((literal): literal is string => literal !== undefined);
        const repoPath = sharedRepoPath(literals);
        // No reference column any more, so the kind of move is a fact about
        // the ROW: the widest pairwise classification among every distinct
        // reference the row holds, printed once in the group head rather than
        // repeated (or, worse, disagreeing) beside every line.
        const refs = literals
          .map((literal) => parseImageRef(literal))
          .filter((ref): ref is ImageRef => ref !== null);
        const rowChange = rowDiffers(row.cells) ? rowImageChange(refs) : null;
        const rowWord = rowChange ? IMAGE_CLASS_WORD[rowChange] : undefined;
        const rowMeter = rowChange ? IMAGE_METER_LEVEL[rowChange] : null;

        return (
          <Box key={key} sx={GROUP_SX} data-testid="compare-image-group">
            <Box sx={HEAD_SX}>
              <Box
                component="span"
                sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, fontWeight: 700, color: componentTheme.fgDefault, flex: 'none' }}
              >
                {container}
              </Box>
              {repoPath ? (
                <Box
                  component="span"
                  sx={{ fontFamily: componentTheme.fontMono, fontSize: 10.5, color: componentTheme.fgSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                >
                  {repoPath}
                </Box>
              ) : null}
              {rowWord ? (
                <Box component="span" sx={{ fontSize: 9.5, fontWeight: 700, color: componentTheme.attention, flex: 'none' }}>
                  {rowWord}
                </Box>
              ) : null}
              {rowMeter ? (
                <Box component="span" data-meter={rowMeter} data-testid="compare-image-meter" sx={{ flex: 'none' }}>
                  {METER_GLYPHS[rowMeter]}
                </Box>
              ) : null}
            </Box>

            {row.cells.map((cell, index) => {
              const column = columns[index];
              const ref = parseImageRef(cell.literal);
              // Where every deployment agrees on the repository, the rows print
              // only the tag. Where the registry itself moved they no longer
              // share a head, so the whole reference is printed on every line.
              const printed = cell.literal === undefined
                ? null
                : repoPath && ref?.tag
                  ? ref.tag
                  : cell.literal;

              return (
                <Box
                  key={column?.deploymentId ?? index}
                  sx={ROW_SX}
                  data-testid="compare-image-row"
                  data-compare-col={column?.deploymentId}
                  data-compare-surface="image"
                  data-compare-axis="y"
                >
                  <Box
                    component="span"
                    sx={{ ...LETTER_SX, background: componentTheme.fgDefault }}
                  >
                    {letterFor(index)}
                  </Box>
                  <Box
                    component="span"
                    title={column?.displayName ? `${column.label} — ${column.displayName}` : column?.label}
                    sx={{ ...WHO_SX, width: whoWidth }}
                  >
                    {column?.label ?? letterFor(index)}
                  </Box>
                  {printed === null ? (
                    <Box
                      component="span"
                      data-fidelity="value-absent"
                      data-cell-kind={cell.kind}
                      sx={{
                        fontFamily: componentTheme.fontSans,
                        fontStyle: 'italic',
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: cell.kind === 'absent' ? componentTheme.danger : componentTheme.fgSubtle,
                      }}
                    >
                      {cell.kind === 'unknown' || cell.kind === 'no-document'
                        ? UNANSWERABLE[cell.reason ?? unanswerableReason(cell.kind, column?.unavailable)].word
                        : 'not set'}
                    </Box>
                  ) : (
                    <Box
                      component="span"
                      data-cell-kind={cell.kind}
                      title={cell.literal}
                      sx={{
                        ...VALUE_SX,
                        ...(cell.kind === 'same' ? { color: componentTheme.fgMuted } : null),
                        ...(cell.kind === 'differs'
                          ? {
                              color: componentTheme.variationEmphasis,
                              background: componentTheme.variationMuted,
                              border: `1px solid ${componentTheme.variationEdge}`,
                              borderRadius: '4px',
                              padding: '1px 4px',
                            }
                          : null),
                      }}
                    >
                      {printed}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

export const CompareImageRows = memo(CompareImageRowsInner);
