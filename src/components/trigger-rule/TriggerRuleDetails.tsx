// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Fragment, useId, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { functionListArgs } from '@/hooks/useFunctionChannels';
import { unitLink } from '@/pages/initiatives/validationLinks';
import {
  type InvocationRead,
  type Trigger,
  useListAllUnitsQuery,
  useListFunctionsQuery,
} from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

import { formatCel } from './celFormat';
import { type RuleValue, triggerRule } from './triggerRule';

/** How many lines of an expression show before "Show all". */
const EXPRESSION_LINES = 8;

interface TriggerRuleDetailsProps {
  trigger: Trigger | undefined;
  /** The Invocation the Trigger runs, when it runs one rather than a function of its own. */
  invocation?: InvocationRead;
  /**
   * Say what each function fails and how to fix it, from its signature: for a Trigger without a
   * Description of its own, which would otherwise say so.
   */
  describeFunctions?: boolean;
}

const labelSx = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'text.secondary',
  overflowWrap: 'anywhere',
} as const;
const valueSx = { fontSize: '0.75rem', overflowWrap: 'anywhere', minWidth: 0 } as const;

/**
 * What a Trigger runs: each function, the arguments the Trigger gives it, shown by their
 * parameters' data types, the defaults of those it omits, and the other Units it reads. Read from
 * the Trigger and its functions' signatures, so it is the same for every function.
 */
export const TriggerRuleDetails = ({
  trigger,
  invocation,
  describeFunctions = false,
}: TriggerRuleDetailsProps) => {
  const executorSpaceId = invocation?.SpaceID ?? trigger?.SpaceID ?? '';
  const channelId = trigger?.ChannelID ?? invocation?.ChannelID;
  const toolchain = trigger?.ToolchainType ?? invocation?.ToolchainType ?? '';
  // The functions the Trigger's executor serves: its Channel's, else its Space's built-in ones.
  // One request per Space and Channel, however many Triggers show.
  const {
    data: functions,
    isLoading: signaturesLoading,
    isError: signaturesError,
  } = useListFunctionsQuery(
    { spaceId: executorSpaceId, ...functionListArgs(channelId ?? undefined) },
    { skip: !executorSpaceId },
  );
  const rule = useMemo(
    () => triggerRule(trigger, invocation, (name) => functions?.[toolchain]?.[name]),
    [trigger, invocation, functions, toolchain],
  );

  if (rule.functions.length === 0 && rule.reads.length === 0) return null;
  // Without the signatures the arguments have no types or defaults, and a function no description:
  // not an answer to show while they are read.
  if (signaturesLoading)
    return (
      <Typography
        sx={{ ...valueSx, color: 'text.disabled' }}
        data-testid='trigger-rule-loading'
      >
        Loading…
      </Typography>
    );
  return (
    <Box
      data-testid='trigger-rule-details'
      sx={{
        display: 'grid',
        gridTemplateColumns: 'max-content minmax(0, 1fr)',
        columnGap: 1.5,
        rowGap: 0.75,
        alignItems: 'baseline',
      }}
    >
      {signaturesError && (
        <Typography
          sx={{ ...valueSx, color: 'error.main', gridColumn: '1 / -1' }}
          data-testid='trigger-rule-signatures-error'
        >
          Could not read the functions this Trigger runs, so its arguments are shown as
          written.
        </Typography>
      )}
      {rule.functions.map((fn) => (
        <Fragment key={`${fn.position ?? 0}-${fn.functionName}`}>
          <Typography sx={labelSx}>Runs</Typography>
          <Box sx={valueSx}>
            <Box component='code' sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {fn.functionName}
              {fn.position ? `:${fn.position}` : ''}
            </Box>
            {describeFunctions && fn.summary && (
              <Typography sx={{ ...valueSx, mt: 0.25 }}>{fn.summary}</Typography>
            )}
            {describeFunctions && fn.fix && (
              <Typography sx={{ ...valueSx, mt: 0.25 }}>{fn.fix}</Typography>
            )}
          </Box>
          {fn.arguments.map((arg) => (
            <Fragment key={arg.name}>
              <Typography sx={labelSx} title={arg.description}>
                {arg.name}
              </Typography>
              <Box sx={valueSx} data-testid={`trigger-rule-argument-${arg.name}`}>
                <RuleValueView value={arg.value} />
                {arg.isDefault && (
                  <Typography
                    component='span'
                    sx={{ ...valueSx, color: 'text.secondary', ml: 0.75 }}
                  >
                    (default)
                  </Typography>
                )}
              </Box>
            </Fragment>
          ))}
        </Fragment>
      ))}
      {rule.reads.length > 0 && <ReadsRows reads={rule.reads} />}
    </Box>
  );
};

const RuleValueView = ({ value }: { value: RuleValue }) => {
  switch (value.kind) {
    case 'list':
      return (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {value.items.map((item) => (
            <Chip
              key={item}
              label={item}
              size='small'
              variant='outlined'
              sx={{ height: 20, fontSize: '0.7rem', fontFamily: 'monospace' }}
            />
          ))}
        </Box>
      );
    case 'expression':
      return <ExpressionView value={value} />;
    case 'fields':
      return (
        <Box>
          {value.fields.map((field) => (
            <Typography key={field.name} sx={valueSx}>
              <Box component='span' sx={{ fontWeight: 600 }}>
                {field.name}:
              </Box>{' '}
              <Box component='span' sx={{ fontFamily: 'monospace' }}>
                {field.value}
              </Box>
            </Typography>
          ))}
        </Box>
      );
    default:
      return (
        <Box component='span' sx={{ fontFamily: 'monospace' }}>
          {value.text}
        </Box>
      );
  }
};

/** An expression laid out for reading, its first lines shown until asked for the rest. */
const ExpressionView = ({ value }: { value: Extract<RuleValue, { kind: 'expression' }> }) => {
  const [expanded, setExpanded] = useState(false);
  const codeId = useId();
  const lines = useMemo(
    () => (value.language === 'CEL' ? formatCel(value.text, 72) : value.text).split('\n'),
    [value],
  );
  const long = lines.length > EXPRESSION_LINES;
  const shown = long && !expanded ? lines.slice(0, EXPRESSION_LINES) : lines;
  return (
    <Box>
      <Box
        component='pre'
        id={codeId}
        sx={{
          m: 0,
          p: 1,
          fontSize: '0.7rem',
          lineHeight: 1.5,
          fontFamily: 'monospace',
          bgcolor: 'grey.50',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflowX: 'auto',
          whiteSpace: 'pre',
        }}
      >
        {shown.join('\n')}
        {long && !expanded ? '\n…' : ''}
      </Box>
      {long && (
        <Button
          size='small'
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          aria-expanded={expanded}
          aria-controls={codeId}
          sx={{ textTransform: 'none', p: 0, minWidth: 0, fontSize: '0.75rem' }}
        >
          {expanded ? 'Show less' : `Show all (${lines.length} lines)`}
        </Button>
      )}
    </Box>
  );
};

/** The Units the Trigger reads, each as a link named by its Space and slug. */
const ReadsRows = ({ reads }: { reads: { key: string; unitId: string }[] }) => {
  const ids = reads.map((r) => r.unitId);
  const { data, isLoading, isError } = useListAllUnitsQuery({
    where: `UnitID IN (${ids.map((id) => `'${id}'`).join(',')})`,
    include: 'SpaceID',
    select: 'UnitID,Slug,SpaceID',
  });
  const byId = new Map(
    (data ?? []).flatMap((eu) => (eu.Unit?.UnitID ? [[eu.Unit.UnitID, eu]] : [])),
  );
  return (
    <>
      <Typography sx={labelSx}>Reads</Typography>
      <Box
        sx={{
          ...valueSx,
          display: 'grid',
          gridTemplateColumns: 'max-content minmax(0, 1fr)',
          columnGap: 1,
        }}
      >
        {reads.map(({ key, unitId }) => {
          const unit = byId.get(unitId);
          return (
            <Fragment key={key}>
              <Box component='code' sx={{ fontFamily: 'monospace' }}>
                {key}
              </Box>
              <Box data-testid={`trigger-rule-reads-${key}`}>
                {unit?.Unit ? (
                  <Link
                    component={RouterLink}
                    to={unitLink(unit.Unit.SpaceID ?? '', unitId)}
                    underline='hover'
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    {unit.Space?.Slug ? `${unit.Space.Slug}/` : ''}
                    {unit.Unit.Slug}
                  </Link>
                ) : (
                  <Typography component='span' sx={{ ...valueSx, color: 'text.secondary' }}>
                    {isLoading
                      ? 'Loading…'
                      : isError
                        ? 'Could not read the Unit'
                        : 'A Unit you cannot see, or that was deleted'}
                  </Typography>
                )}
              </Box>
            </Fragment>
          );
        })}
      </Box>
    </>
  );
};
