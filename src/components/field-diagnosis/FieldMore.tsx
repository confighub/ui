// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The on-demand links under the details: `Variants · History · Used by`. Each opens its list
// under the links; a list is read only when it is opened (PLAN.md decision 12).
import { Fragment, type ReactNode, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { FieldRefLink } from './FieldRefLink';
import { Sep } from './FieldSetByLine';
import { restoreControl } from './fieldDetailsControls';
import type { FieldHistoryEntry, FieldView } from './fieldDiagnosis.types';
import type { FieldActions } from './fieldLinks';

const MONO = 'var(--font-mono)';

/** A list read on demand. */
export interface OnDemandList<T> {
  entries?: T[];
  loading: boolean;
  /** One quiet line when the read failed. */
  error?: string;
}

export interface FieldVariant {
  /** The Space of the Variant. */
  name: string;
  value?: string;
  current: boolean;
}

type More = 'variants' | 'history' | 'used';

const LABEL: Record<More, string> = {
  variants: 'Variants',
  history: 'History',
  used: 'Used by',
};

export interface FieldMoreProps {
  view: FieldView;
  actions: FieldActions;
  history: OnDemandList<FieldHistoryEntry>;
  onOpenHistory: () => void;
  /** Absent when the field has no Variant to compare with. */
  variants?: OnDemandList<FieldVariant>;
  onOpenVariants?: () => void;
}

function Quiet({ children }: { children: string }) {
  return (
    <Typography variant='body2' color='text.secondary' sx={{ py: '3px' }}>
      {children}
    </Typography>
  );
}

const HISTORY_GRID = {
  display: 'grid',
  gridTemplateColumns:
    'max-content max-content max-content max-content minmax(0, 1fr) max-content',
  columnGap: 1.5,
  alignItems: 'center',
} as const;

function ListState<T>({
  list,
  render,
}: {
  list: OnDemandList<T>;
  render: (entries: T[]) => ReactNode;
}) {
  if (list.error) return <Quiet>{list.error}</Quiet>;
  if (list.loading || !list.entries) return <Skeleton width='60%' />;
  if (list.entries.length === 0) return <Quiet>—</Quiet>;
  return <>{render(list.entries)}</>;
}

export function FieldMore({
  view,
  actions,
  history,
  onOpenHistory,
  variants,
  onOpenVariants,
}: FieldMoreProps) {
  const [open, setOpen] = useState<More | null>(null);
  const links: More[] = [...(variants ? (['variants'] as const) : []), 'history', 'used'];

  const toggle = (m: More) => {
    const next = open === m ? null : m;
    setOpen(next);
    if (next === 'history') onOpenHistory();
    if (next === 'variants') onOpenVariants?.();
  };

  return (
    <>
      <Box data-testid='fd-more' sx={{ display: 'flex', alignItems: 'center' }}>
        {links.map((m, i) => (
          <Fragment key={m}>
            {i > 0 && <Sep />}
            <Button
              size='small'
              variant='text'
              onClick={() => toggle(m)}
              data-testid={`fd-more-${m}`}
              sx={{ minWidth: 0, px: '4px', fontWeight: open === m ? 700 : 600 }}
            >
              {LABEL[m]}
            </Button>
          </Fragment>
        ))}
      </Box>

      {open === 'variants' && variants && (
        <Box data-testid='fd-variants' sx={{ mt: 1 }}>
          <ListState
            list={variants}
            render={(entries) =>
              entries.map((v) => (
                <Box key={v.name} sx={{ display: 'flex', gap: 2, py: '3px' }}>
                  <Typography
                    variant='body2'
                    color={v.current ? 'text.primary' : 'text.secondary'}
                    sx={{
                      width: 260,
                      flexShrink: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v.name}
                  </Typography>
                  <Typography
                    variant='body2'
                    title={v.value ?? '—'}
                    sx={{
                      fontFamily: MONO,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: v.value !== view.value ? 600 : 400,
                    }}
                  >
                    {v.value ?? '—'}
                  </Typography>
                </Box>
              ))
            }
          />
        </Box>
      )}

      {open === 'history' && (
        <Box data-testid='fd-history' sx={{ mt: 1 }}>
          <ListState
            list={history}
            render={(entries) => (
              // One grid for all rows, so the columns line up: rev · value · who · time · reason ·
              // Restore. The reason takes the rest, one line, its full text in the title.
              <Box sx={HISTORY_GRID}>
                {entries.map((entry, i) => {
                  const restore = restoreControl(view, entry, Boolean(actions.restore));
                  const reason = entry.reason ? `"${entry.reason}"` : entry.setBy;
                  return (
                    <Box key={i} data-testid='fd-history-row' sx={{ display: 'contents' }}>
                      <Typography
                        variant='body2'
                        color='text.secondary'
                        noWrap
                        sx={{ minHeight: 28, display: 'flex', alignItems: 'center' }}
                      >
                        {entry.revision ? (
                          <FieldRefLink refValue={entry.revision} testId='fd-history-rev' />
                        ) : (
                          '—'
                        )}
                      </Typography>
                      <Typography
                        variant='body2'
                        noWrap
                        data-testid='fd-history-value'
                        sx={{ fontFamily: MONO, color: 'text.primary' }}
                      >
                        {entry.value}
                      </Typography>
                      <Typography
                        variant='body2'
                        color='text.secondary'
                        noWrap
                        data-testid='fd-history-who'
                      >
                        {entry.who}
                      </Typography>
                      <Typography
                        variant='body2'
                        color='text.secondary'
                        noWrap
                        data-testid='fd-history-when'
                      >
                        {entry.when}
                      </Typography>
                      <Typography
                        variant='body2'
                        color='text.secondary'
                        noWrap
                        data-testid='fd-history-reason'
                        title={reason}
                        sx={{ minWidth: 0 }}
                      >
                        {reason}
                      </Typography>
                      <Box>
                        {restore.shown && (
                          <Tooltip title={restore.reason ?? ''}>
                            <span>
                              <Button
                                size='small'
                                variant='text'
                                disabled={restore.disabled}
                                onClick={() => actions.restore?.(entry)}
                                data-testid='fd-history-restore'
                              >
                                Restore
                              </Button>
                            </span>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          />
        </Box>
      )}

      {open === 'used' && (
        <Box data-testid='fd-used' sx={{ mt: 1 }}>
          {view.provided.length === 0 ? (
            <Quiet>—</Quiet>
          ) : (
            view.provided.map((p) => (
              <Typography
                key={`${p.resourceType ?? ''}|${p.attribute}`}
                variant='body2'
                color='text.secondary'
                sx={{ py: '3px' }}
              >
                Link
                <Sep />
                {p.attribute}
                {p.resourceType && (
                  <>
                    <Sep />
                    {p.resourceType}
                  </>
                )}
              </Typography>
            ))
          )}
        </Box>
      )}
    </>
  );
}
