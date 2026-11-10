// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Link as RouterLink } from 'react-router-dom';

import { getApiErrorMessage } from '@/utility/error-functions';
import { useListAllResourcesQuery } from '@confighub/rtk-query';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { spaceLink, unitLink } from '../validationLinks';
import { annotationKeyOfPath } from '../validationModel';

/** A resource excepted from the Trigger, as the panel lists it. */
export interface ExceptedResource {
  resourceId: string;
  unitId: string;
  unitSlug: string;
  spaceId: string;
  spaceSlug: string;
  toolchainType: string;
  type: string;
  name: string;
  reason: string;
  /** Whether the exception is the resource's only annotation. */
  onlyAnnotation: boolean;
}

interface PolicyExceptionsProps {
  /** The annotation path the Trigger's WhereResource skips resources by. */
  annotationPath: string;
  onRemove: (excepted: ExceptedResource) => void;
}

/** How many annotations a resource has. */
const annotationCount = (data: unknown): number => {
  const metadata = (
    data as { metadata?: { annotations?: Record<string, unknown> } } | undefined
  )?.metadata;
  return Object.keys(metadata?.annotations ?? {}).length;
};

/** The value of a resource's annotation, read from its parsed data. */
const annotationValue = (data: unknown, key: string): string => {
  const metadata = (
    data as { metadata?: { annotations?: Record<string, unknown> } } | undefined
  )?.metadata;
  const value = metadata?.annotations?.[key];
  return typeof value === 'string' ? value : '';
};

/**
 * The resources excepted from a validating Trigger, and why: those carrying the annotation its
 * WhereResource skips. An exception is part of the resource's configuration, so this reads the
 * configuration rather than anything stored about the Trigger.
 */
export const PolicyExceptions = ({ annotationPath, onRemove }: PolicyExceptionsProps) => {
  const key = annotationKeyOfPath(annotationPath);
  const {
    data = [],
    isLoading,
    error,
  } = useListAllResourcesQuery({
    where: `Data.${annotationPath} IS NOT NULL`,
  });
  const rows = [...data]
    .flatMap((er) => (er.Resource ? [er.Resource] : []))
    .sort(
      (a, b) =>
        (a.SpaceSlug ?? '').localeCompare(b.SpaceSlug ?? '') ||
        (a.UnitSlug ?? '').localeCompare(b.UnitSlug ?? '') ||
        (a.ResourceName ?? '').localeCompare(b.ResourceName ?? ''),
    );

  return (
    <Box data-testid='validation-exceptions'>
      <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
        A resource annotated <code>{key}</code> is skipped by this Trigger; the value says why.
      </Typography>
      {error ? (
        <Typography variant='body2' color='error'>
          {getApiErrorMessage(error, 'Could not read the exceptions.')}
        </Typography>
      ) : isLoading ? (
        <Typography variant='body2' color='text.disabled'>
          Loading…
        </Typography>
      ) : rows.length === 0 ? (
        <Typography variant='body2' color='text.secondary'>
          No resource is excepted.
        </Typography>
      ) : (
        <TableContainer
          sx={{
            maxHeight: 320,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.paper',
          }}
        >
          <Table size='small' stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Unit</TableCell>
                <TableCell>Resource</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.ResourceID} hover>
                  <TableCell>
                    <Link
                      component={RouterLink}
                      to={spaceLink(r.SpaceID ?? '')}
                      underline='hover'
                      color='text.secondary'
                    >
                      {r.SpaceSlug}
                    </Link>
                    /
                    <Link
                      component={RouterLink}
                      to={unitLink(r.SpaceID ?? '', r.UnitID ?? '')}
                      target='_blank'
                      rel='noopener'
                      underline='hover'
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                    >
                      {r.UnitSlug}
                      <OpenInNew
                        sx={{ fontSize: 13, opacity: 0.6 }}
                        aria-label='opens in a new tab'
                      />
                    </Link>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {r.ResourceType} {r.ResourceName}
                  </TableCell>
                  <TableCell>{annotationValue(r.Data, key) || '(no reason given)'}</TableCell>
                  <TableCell align='right'>
                    <Button
                      size='small'
                      sx={{ textTransform: 'none' }}
                      onClick={() =>
                        onRemove({
                          resourceId: r.ResourceID ?? '',
                          unitId: r.UnitID ?? '',
                          unitSlug: r.UnitSlug ?? '',
                          spaceId: r.SpaceID ?? '',
                          spaceSlug: r.SpaceSlug ?? '',
                          toolchainType: r.ToolchainType ?? 'Kubernetes/YAML',
                          type: r.ResourceType ?? '',
                          name: r.ResourceName ?? '',
                          reason: annotationValue(r.Data, key),
                          onlyAnnotation: annotationCount(r.Data) === 1,
                        })
                      }
                    >
                      Remove…
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};
