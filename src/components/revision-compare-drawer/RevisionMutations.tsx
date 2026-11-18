// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { NavLink } from '@/components/nav-link/NavLink';
import { useRevisionMutationSources } from '@/hooks/useUnitData';
import { MoreRowsButton } from '@/pages/change-orders/components/SpaceListing';
import { useCappedRows } from '@/pages/change-orders/components/useCappedRows';
import { unitLinksHref, unitRevisionHref } from '@/pages/unit-detail/unitDetailHrefs';
import { formatRelative } from '@/utility/date-format';
import { getApiErrorMessage } from '@/utility/error-functions';
import { SPACE_TRIGGERS_TAB } from '@/utility/space-summary-counts';
import {
  type ExtendedMutationRead,
  type ResourceMutation,
  useListExtendedMutationsQuery,
} from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';

import {
  type MutationChange,
  mutationArguments,
  mutationChanges,
  upstreamRevisions,
} from './revisionMutationChanges';

/** Changes listed for a mutation before "show all". */
const CHANGES_SHOWN = 10;

const monoSx = { fontFamily: 'monospace', wordBreak: 'break-all' } as const;

/** One `label: value` line, left out when there is nothing to say. */
const Line = ({ label, children }: { label: string; children?: React.ReactNode }) => {
  if (children === undefined || children === null || children === '') return null;
  return (
    <Stack direction='row' spacing={1} alignItems='baseline'>
      <Typography variant='body2' color='text.secondary' sx={{ minWidth: 140, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant='body2' component='div'>
          {children}
        </Typography>
      </Box>
    </Stack>
  );
};

/** The changes shown, each run of one resource's under that resource's name. */
const byResource = (changes: readonly MutationChange[]) => {
  const groups: { resource: string; changes: MutationChange[] }[] = [];
  for (const change of changes) {
    const last = groups[groups.length - 1];
    if (last?.resource === change.resource) last.changes.push(change);
    else groups.push({ resource: change.resource, changes: [change] });
  }
  return groups;
};

const Changes = ({ changes }: { changes: MutationChange[] }) => {
  const rows = useCappedRows(changes, CHANGES_SHOWN);
  return (
    <Box sx={{ mt: 1 }} data-testid='revision-mutation-changes'>
      <Typography variant='subtitle2' sx={{ mb: 0.5 }}>
        Changes
      </Typography>
      <Stack spacing={1}>
        {byResource(rows.visible).map((group) => (
          <Box key={group.changes[0].key}>
            <Typography variant='body2' sx={{ fontWeight: 600 }}>
              {group.resource}
            </Typography>
            <Stack spacing={0.25}>
              {group.changes.map((change) => (
                <Stack key={change.key} direction='row' spacing={1} alignItems='baseline'>
                  <Typography
                    variant='body2'
                    color='text.secondary'
                    sx={{ minWidth: 60, flexShrink: 0 }}
                  >
                    {change.type}
                  </Typography>
                  <Box sx={{ minWidth: 0 }}>
                    {change.path ? (
                      <Typography variant='body2' sx={monoSx}>
                        {change.path}
                      </Typography>
                    ) : (
                      <Typography variant='body2'>the whole resource</Typography>
                    )}
                    {change.value && (
                      <Box
                        component='pre'
                        sx={{
                          ...monoSx,
                          m: 0,
                          color: 'text.secondary',
                          fontSize: '0.8125rem',
                          whiteSpace: 'pre-wrap',
                          maxHeight: 160,
                          overflow: 'auto',
                        }}
                      >
                        {change.value}
                      </Box>
                    )}
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
      <MoreRowsButton
        total={changes.length}
        more={rows.more}
        noun='change'
        onShow={rows.showAll}
      />
    </Box>
  );
};

/** Everything the mutation records: what made it, why, and what it changed. */
const MutationCard = ({
  row,
  sources,
  sourcesLoading,
  sourcesError,
}: {
  row: ExtendedMutationRead;
  sources: readonly ResourceMutation[];
  sourcesLoading: boolean;
  sourcesError?: unknown;
}) => {
  const mutation = row.Mutation ?? {};
  const changes = useMemo(
    () => mutationChanges(sources, mutation.MutationNum ?? 0),
    [sources, mutation.MutationNum],
  );
  const args = mutationArguments(row);
  const provided = [
    [mutation.ProvidedResource?.ResourceType, mutation.ProvidedResource?.ResourceName]
      .filter(Boolean)
      .join(' '),
    mutation.ProvidedPath,
  ]
    .filter(Boolean)
    .join(' at ');
  const guards = Object.entries(mutation.Guards ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  return (
    <Box
      sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}
      data-testid='revision-mutation'
    >
      <Stack direction='row' spacing={1} alignItems='baseline' flexWrap='wrap'>
        <Typography variant='body2' sx={{ fontWeight: 600 }}>
          Mutation {mutation.MutationNum}
        </Typography>
        {mutation.CreatedAt && (
          <Tooltip title={dayjs(mutation.CreatedAt).format('YYYY-MM-DD HH:mm:ss')}>
            <Typography variant='caption' color='text.secondary'>
              {formatRelative(mutation.CreatedAt)}
            </Typography>
          </Tooltip>
        )}
      </Stack>
      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
        <Line label='Function'>{mutation.FunctionInvocation?.FunctionName}</Line>
        <Line label='Arguments'>
          {args.length > 0 ? (
            <Typography variant='body2' sx={monoSx}>
              {args.join(' ')}
            </Typography>
          ) : undefined}
        </Line>
        <Line label='Where resource'>{mutation.FunctionInvocation?.WhereResource}</Line>
        <Line label='Trigger'>
          {row.Trigger?.Slug ? (
            <NavLink
              to={`/spaces/${row.Trigger.SpaceID}?tab=${SPACE_TRIGGERS_TAB}&edit=${row.Trigger.TriggerID}`}
            >
              {row.Trigger.Slug}
            </NavLink>
          ) : undefined}
        </Line>
        <Line label='Invocation'>{row.Invocation?.Slug}</Line>
        <Line label='Link'>
          {row.Link?.Slug && mutation.SpaceID && mutation.UnitID ? (
            <NavLink to={unitLinksHref(mutation.SpaceID, mutation.UnitID)}>
              {row.Link.Slug}
            </NavLink>
          ) : undefined}
        </Line>
        <Line label='Provided by'>{provided}</Line>
        <Line label='Merged from'>
          {row.MergeSource?.Slug ? (
            <NavLink to={`/units/${row.MergeSource.SpaceID}/${row.MergeSource.UnitID}`}>
              {[row.MergeSource.SpaceSlug, row.MergeSource.Slug].filter(Boolean).join('/')}
            </NavLink>
          ) : undefined}
        </Line>
        <Line label='Upstream revisions'>{upstreamRevisions(row)}</Line>
        <Line label='Restored'>
          {mutation.RestoredRevisionNum && mutation.SpaceID && mutation.UnitID ? (
            <NavLink
              to={unitRevisionHref(
                mutation.SpaceID,
                mutation.UnitID,
                mutation.RestoredRevisionNum,
              )}
            >
              revision {mutation.RestoredRevisionNum}
            </NavLink>
          ) : undefined}
        </Line>
        <Line label='Replay'>
          {[mutation.ReplayOutcome, mutation.ReplayReason].filter(Boolean).join(': ')}
        </Line>
        <Line label='Subgroup'>{mutation.Subgroup}</Line>
        <Line label='Guards'>{guards}</Line>
      </Stack>
      {sourcesError ? (
        <Typography variant='body2' color='error' sx={{ mt: 1 }}>
          {getApiErrorMessage(sourcesError, 'What this mutation changed could not be loaded.')}
        </Typography>
      ) : changes.length > 0 ? (
        <Changes changes={changes} />
      ) : sourcesLoading ? (
        <CircularProgress size={16} sx={{ mt: 1 }} aria-label='Loading changes' />
      ) : (
        <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
          No values this mutation set remain in this revision.
        </Typography>
      )}
    </Box>
  );
};

export interface RevisionMutationsProps {
  spaceId: string;
  unitId: string;
  revisionId: string;
  revisionNum: number;
}

/** The mutations recorded in one revision, each with what it changed. */
export const RevisionMutations = ({
  spaceId,
  unitId,
  revisionId,
  revisionNum,
}: RevisionMutationsProps) => {
  const {
    data: mutations,
    isLoading,
    error,
  } = useListExtendedMutationsQuery(
    {
      spaceId,
      unitId,
      where: `RevisionNum = ${revisionNum}`,
      include: 'LinkID,TriggerID,MergeSourceID,InvocationID',
    },
    { skip: !spaceId || !unitId },
  );
  const {
    mutationSources,
    isFetching: sourcesLoading,
    error: sourcesError,
  } = useRevisionMutationSources(spaceId, unitId, revisionId);
  const sorted = useMemo(
    () =>
      [...(mutations ?? [])].sort(
        (a, b) => (a.Mutation?.MutationNum ?? 0) - (b.Mutation?.MutationNum ?? 0),
      ),
    [mutations],
  );

  if (error) {
    return (
      <Typography variant='body2' color='error'>
        {getApiErrorMessage(error, 'The mutations could not be loaded.')}
      </Typography>
    );
  }
  if (isLoading || !mutations) {
    return <CircularProgress size={20} aria-label='Loading mutations' />;
  }
  if (sorted.length === 0) {
    return (
      <Typography variant='body2' color='text.secondary' fontStyle='italic'>
        This revision records no mutations.
      </Typography>
    );
  }
  return (
    <Stack spacing={1.5} data-testid='revision-mutations'>
      {sorted.map((row) => (
        <MutationCard
          key={row.Mutation?.MutationID}
          row={row}
          sources={mutationSources}
          sourcesLoading={sourcesLoading}
          sourcesError={sourcesError}
        />
      ))}
    </Stack>
  );
};
