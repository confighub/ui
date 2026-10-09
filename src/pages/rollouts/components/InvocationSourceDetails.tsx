// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The source panel of an Invoke ChangeOrder, shown when its source box is selected: the
 * Invocation it runs, the values it gives the Invocation's parameters, which Units of each
 * Space it runs on, and the function calls the Invocation makes.
 *
 * Nothing is written at the source, so this is the change as defined. What running it
 * changes is "At the source", and what it would write in a stage is that stage's preview.
 */

import Box from '@mui/material/Box';

import type { FunctionArgument } from '@confighub/rtk-query';

import type { InvocationSource } from '../../x/apps/rollout/useInvocationSource';
import {
  rolloutBorder,
  rolloutFontMono,
  rolloutInk,
  rolloutShape,
  rolloutSurface,
  rolloutType,
} from '../rolloutsTokens';

/** One argument's value as written. */
function argumentText(argument: FunctionArgument): string {
  return argument.Value === undefined ? '' : String(argument.Value);
}

/** A parameter value as the ChangeOrder holds it. */
function parameterText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: rolloutBorder.strong }}
    >
      {children}
    </Box>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <Box component="dt" sx={{ fontSize: rolloutType.size.small, color: rolloutInk.subtle, margin: 0 }}>
        {term}
      </Box>
      <Box
        component="dd"
        sx={{ fontSize: rolloutType.size.body, color: rolloutInk.default, margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}
      >
        {children}
      </Box>
    </>
  );
}

const mono = { fontFamily: rolloutFontMono } as const;

export interface InvocationSourceDetailsProps {
  source: InvocationSource;
}

export function InvocationSourceDetails({ source }: InvocationSourceDetailsProps) {
  const parameters = Object.entries(source.parameters);
  return (
    <Box
      component="dl"
      data-testid="rollout-invocation-source"
      sx={{
        display: 'grid',
        gridTemplateColumns: '96px minmax(0, 1fr)',
        gap: '6px 14px',
        alignItems: 'baseline',
        margin: 0,
        padding: '10px 12px',
        borderRadius: `${rolloutShape.radius.md}px`,
        border: `1px solid ${rolloutBorder.default}`,
        background: rolloutSurface.sunk,
      }}
    >
      <Row term="Invocation">
        {source.status === 'loading' ? (
          'Reading the Invocation…'
        ) : source.status === 'failed' ? (
          <>
            The Invocation could not be read (<Box component="span" sx={mono}>{source.invocationId}</Box>).
          </>
        ) : (
          <>
            <Box component="span" sx={{ ...mono, fontWeight: 600 }}>
              {source.slug}
            </Box>
            {source.spaceId !== undefined ? (
              <>
                {' in '}
                <Link href={`/spaces/${source.spaceId}`}>{source.spaceSlug ?? source.spaceId}</Link>
              </>
            ) : null}
            {source.toolchainType !== undefined ? (
              <Box component="span" sx={{ color: rolloutInk.muted }}>{` · ${source.toolchainType}`}</Box>
            ) : null}
          </>
        )}
      </Row>
      <Row term="Parameters">
        {parameters.length === 0 ? (
          <Box component="span" sx={{ color: rolloutInk.muted }}>None</Box>
        ) : (
          parameters.map(([name, value]) => (
            <Box key={name} sx={mono}>
              {name} = {parameterText(value)}
            </Box>
          ))
        )}
      </Row>
      <Row term="Units">
        {source.whereUnit === undefined && source.unitFilterId === undefined ? (
          'Every Unit of each Space it is promoted into'
        ) : (
          <>
            {source.whereUnit !== undefined ? (
              <Box>
                where <Box component="span" sx={mono}>{source.whereUnit}</Box>
              </Box>
            ) : null}
            {source.unitFilterId !== undefined ? (
              <Box>
                Filter <Box component="span" sx={mono}>{source.unitFilterSlug ?? source.unitFilterId}</Box>
              </Box>
            ) : null}
          </>
        )}
      </Row>
      {source.functionInvocations.length > 0 ? (
        <Row term="Runs">
          {source.functionInvocations.map((call, i) => (
            <Box key={`${call.FunctionName ?? ''}-${i}`} sx={{ marginBottom: '4px' }}>
              {call.FunctionName !== undefined ? (
                <Box component="span" sx={{ ...mono, fontWeight: 600 }}>
                  <Link href={`/functions/${encodeURIComponent(call.FunctionName)}`}>{call.FunctionName}</Link>
                </Box>
              ) : null}
              {(call.Arguments ?? []).map((argument, j) => (
                <Box key={`${argument.ParameterName ?? ''}-${j}`} sx={{ ...mono, paddingLeft: '16px' }}>
                  {argument.ParameterName !== undefined ? `${argument.ParameterName}  ` : ''}
                  {argumentText(argument)}
                  {argument.Evaluator !== undefined && argument.Evaluator !== '' ? (
                    <Box component="span" sx={{ color: rolloutInk.muted }}>{`  (${argument.Evaluator})`}</Box>
                  ) : null}
                </Box>
              ))}
            </Box>
          ))}
        </Row>
      ) : null}
    </Box>
  );
}
