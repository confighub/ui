// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode } from 'react';

import { NavLink } from '@/components/nav-link/NavLink';
import {
  Binding,
  ExtendedLinkRead,
  FunctionInvocation,
  ResourceInfo,
} from '@confighub/rtk-query';
import { isGoZeroTime } from '@/utility/datetime-utils';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { unitConfigHref } from '../../unitDetailHrefs';

export interface LinkDetailsDrawerProps {
  /** The Link to show, or `undefined` for the drawer to be closed. */
  link: ExtendedLinkRead | undefined;
  onClose: () => void;
}

const linkStyle = { textDecoration: 'underline', cursor: 'pointer' } as const;

const mono = { fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' } as const;

/** `set-image-reference-by-uri(repository-uri=ghcr.io/x, image-reference=:{{.Params.tag}})` */
function formatFunctionCall(invocation: FunctionInvocation | undefined): string {
  if (invocation === undefined) return '';
  const args = (invocation.Arguments ?? []).map((arg) => {
    const value = String(arg.Value ?? '');
    const evaluator = arg.Evaluator ? ` (${arg.Evaluator})` : '';
    return arg.ParameterName ? `${arg.ParameterName}=${value}${evaluator}` : `${value}${evaluator}`;
  });
  return `${invocation.FunctionName ?? ''}(${args.join(', ')})`;
}

function formatResource(resource: ResourceInfo | undefined): string {
  if (resource === undefined) return '';
  return [resource.ResourceType, resource.ResourceName].filter((part) => part).join(' ');
}

function formatTime(value: string | undefined): string {
  return value && !isGoZeroTime(value) ? new Date(value).toLocaleString() : '';
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant='subtitle1' sx={{ fontWeight: 600, mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

/** Fields with nothing in them are left out: every Link type uses only some. */
function Fields({ fields }: { fields: Array<[string, ReactNode]> }) {
  const present = fields.filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false);
  return (
    <Box
      component='dl'
      sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 3, rowGap: 0.75, m: 0 }}
    >
      {present.map(([name, value]) => (
        <Box key={name} sx={{ display: 'contents' }}>
          <Box component='dt' sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
            {name}
          </Box>
          <Box component='dd' sx={{ m: 0, ...mono }}>
            {value === true ? 'true' : value}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function ListTable({ columns, rows }: { columns: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <Table size='small'>
      <TableHead>
        <TableRow>
          {columns.map((column) => (
            <TableCell key={column}>{column}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {row.map((cell, j) => (
              <TableCell key={j} sx={mono}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function bindingRows(bindings: Binding[]): Array<Array<ReactNode>> {
  return bindings.map((binding) => [
    binding.AttributeName ?? '',
    [formatResource(binding.NeededResource), binding.NeededPath].filter((part) => part).join(' '),
    [formatResource(binding.ProvidedResource), binding.ProvidedPath].filter((part) => part).join(' '),
  ]);
}

function labelRows(map: Record<string, string | boolean> | undefined): Array<[string, ReactNode]> {
  return Object.entries(map ?? {}).map(([key, value]) => [key, String(value)]);
}

/**
 * Every property of one Link: what it connects, how it updates, and, for the Link types that
 * have them, the paths, functions and bindings that decide what it carries.
 */
export const LinkDetailsDrawer = ({ link: extendedLink, onClose }: LinkDetailsDrawerProps) => {
  const link = extendedLink?.Link;
  const from = extendedLink?.FromUnit;
  const to = extendedLink?.ToUnit;

  const unitLink = (spaceId: string | undefined, unitId: string | undefined, slug: string | undefined) =>
    spaceId && unitId ? (
      <NavLink to={unitConfigHref(spaceId, unitId)} style={linkStyle}>
        {slug ?? unitId}
      </NavLink>
    ) : (
      (slug ?? unitId)
    );
  const spaceLink = (spaceId: string | undefined, slug: string | undefined) =>
    spaceId ? (
      <NavLink to={`/spaces/${spaceId}`} style={linkStyle}>
        {slug ?? spaceId}
      </NavLink>
    ) : (
      slug
    );

  return (
    <Drawer
      anchor='right'
      open={link !== undefined}
      onClose={onClose}
      sx={{ '& .MuiDrawer-paper': { width: 1000, maxWidth: '100%' } }}
    >
      {link !== undefined && (
        <Box sx={{ p: 3 }} data-testid='link-details-drawer'>
          <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 2 }}>
            <Typography variant='h6' sx={mono}>
              {link.Slug}
            </Typography>
            <IconButton aria-label='Close' onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Stack>

          <Section title='Link'>
            <Fields
              fields={[
                ['Display name', link.DisplayName !== link.Slug ? link.DisplayName : ''],
                ['Update type', link.UpdateType],
                ['From unit', unitLink(from?.SpaceID ?? link.SpaceID, link.FromUnitID, from?.Slug)],
                ['From space', spaceLink(link.SpaceID, extendedLink?.Space?.Slug ?? link.SpaceSlug)],
                ['To unit', unitLink(to?.SpaceID ?? link.ToSpaceID, link.ToUnitID, to?.Slug)],
                ['To space', spaceLink(link.ToSpaceID, extendedLink?.ToSpace?.Slug)],
                ['Auto update', link.AutoUpdate],
                ['Stale', link.Stale],
                ['Protect', link.Protect],
                ['Squash', link.Squash],
                ['Merge enable subtraction', link.MergeEnableSubtraction],
                ['Where resource', link.WhereResource],
                ['Where mutation', link.WhereMutation],
                ['Transform invocation', extendedLink?.TransformInvocation?.Slug ?? link.TransformInvocationID],
                ['Upstream last merged revision', link.UpstreamLastMergedRevisionNum || ''],
                ['Downstream last merged revision', link.DownstreamLastMergedRevisionNum || ''],
                ['Hidden', link.HiddenReason],
                ['Created', formatTime(link.CreatedAt)],
                ['Updated', formatTime(link.UpdatedAt)],
                ['Link ID', link.LinkID],
                ['Version', link.Version],
              ]}
            />
          </Section>

          {(link.UpstreamPaths ?? []).length > 0 && (
            <Section title='Upstream paths'>
              <ListTable
                columns={['Name', 'Path', 'Resource']}
                rows={(link.UpstreamPaths ?? []).map((path) => [
                  path.Name ?? '',
                  path.Path ?? '',
                  formatResource(path.Resource),
                ])}
              />
            </Section>
          )}

          {(link.UpstreamGetters ?? []).length > 0 && (
            <Section title='Upstream getters'>
              <ListTable
                columns={['Name', 'Function']}
                rows={(link.UpstreamGetters ?? []).map((getter) => [
                  getter.Name ?? '',
                  formatFunctionCall(getter.FunctionInvocation),
                ])}
              />
            </Section>
          )}

          {(link.DownstreamPaths ?? []).length > 0 && (
            <Section title='Downstream paths'>
              <ListTable
                columns={['Path', 'Resource', 'Expression', 'Evaluator', 'Data type']}
                rows={(link.DownstreamPaths ?? []).map((path) => [
                  path.Path ?? '',
                  formatResource(path.Resource),
                  path.Expression ?? '',
                  path.Evaluator ?? '',
                  path.DataType ?? '',
                ])}
              />
            </Section>
          )}

          {(link.DownstreamSetters ?? []).length > 0 && (
            <Section title='Downstream setters'>
              <ListTable
                columns={['Function', 'Parameters']}
                rows={(link.DownstreamSetters ?? []).map((setter) => [
                  formatFunctionCall(setter.FunctionInvocation),
                  (setter.Parameters ?? []).join(', '),
                ])}
              />
            </Section>
          )}

          {(link.ManualBindings ?? []).length > 0 && (
            <Section title='Manual bindings'>
              <ListTable columns={['Attribute', 'Needed', 'Provided']} rows={bindingRows(link.ManualBindings ?? [])} />
            </Section>
          )}

          {(link.Bindings ?? []).length > 0 && (
            <Section title='Bindings'>
              <ListTable columns={['Attribute', 'Needed', 'Provided']} rows={bindingRows(link.Bindings ?? [])} />
            </Section>
          )}

          {Object.keys(link.Guards ?? {}).length > 0 && (
            <Section title='Guards'>
              <Fields fields={labelRows(link.Guards)} />
            </Section>
          )}

          {Object.keys(link.Labels ?? {}).length > 0 && (
            <Section title='Labels'>
              <Fields fields={labelRows(link.Labels)} />
            </Section>
          )}

          {Object.keys(link.Annotations ?? {}).length > 0 && (
            <Section title='Annotations'>
              <Fields fields={labelRows(link.Annotations)} />
            </Section>
          )}

          {Object.keys(link.DeleteGates ?? {}).length > 0 && (
            <Section title='Delete gates'>
              <Fields fields={labelRows(link.DeleteGates)} />
            </Section>
          )}
        </Box>
      )}
    </Drawer>
  );
};
