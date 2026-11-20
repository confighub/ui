// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The field details in the Component side pane, under the field's row (PLAN.md U2). It reads:
//   - the row's blame field from the open Unit's blame index (for its Ref), or, in a heavy Unit,
//     the server path from the row's positional path;
//   - the field's path report by Ref (history only when History is open);
//   - the Unit (usually cached by the pane) for its upstream (D4).
// The row gives its staged state and its staged actions (edit, discard, keep, upgrade).
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { type ResourceInfo, useGetUnitPathQuery, useGetUnitQuery } from '@confighub/rtk-query';

import { FieldDetails } from '@/components/field-diagnosis/FieldDetails';
import { factsFromPath } from '@/components/field-diagnosis/adapters';
import { explainField } from '@/components/field-diagnosis/explainField';
import { type FieldAddress, pathArg } from '@/components/field-diagnosis/fieldArgs';
import { useSearchFieldVariantsQuery } from '@/components/field-diagnosis/fieldDiagnosisApi';
import type { ExplainContext } from '@/components/field-diagnosis/fieldDiagnosis.types';
import { FieldLinkResolverContext } from '@/components/field-diagnosis/fieldLinks';
import { variantField } from '@/components/field-diagnosis/variantField';
import { describeQueryError } from '@/utility/error-functions';

import { useComponentFocus } from './ComponentFocusContext';
import { encodeFres, openFieldPatch } from './componentFocus';
import { FieldBlameContext } from './fieldBlameContext';
import { useFieldReveal } from './useFieldReveal';
import { usePaneFieldResolver } from './usePaneFieldResolver';
import { heavyFieldPath } from './heavyFieldPath';
import { type FieldRowActions, useFieldActions } from './useFieldActions';
import { useUpstreamLabel } from './useUpstreamLabel';

export interface FieldRowUpgrade {
  /** The upstream value an Upgrade brings. */
  value: string;
  revisionNum?: number;
  spaceId?: string;
  unitId?: string;
  /** The row's upgrade checkbox is ticked. */
  staged: boolean;
}

/** A Unit of the same slug in a Deployment of the Component: one Variant of the field. */
export interface FieldVariantUnit {
  /** The Deployment's name. */
  name: string;
  spaceId: string;
  unitId: string;
}

export interface ComponentFieldDetailsProps {
  spaceId: string;
  unitId: string;
  /** The row's stage key and its bare path in the tree. */
  stageKey: string;
  path: string;
  /** The document the row is in, for a multi-document Unit. */
  resource?: ResourceInfo;
  /** The pane's unsaved value of this field. */
  pending?: string;
  upgrade?: FieldRowUpgrade;
  row: FieldRowActions;
  /** The field's Variants, this Unit's own included. */
  variantUnits?: FieldVariantUnit[];
  onClose: () => void;
}

function Quiet({ testId, children, title }: { testId?: string; children: string; title?: string }) {
  return (
    <Tooltip title={title ?? ''}>
      <Typography data-testid={testId} variant="body2" color="text.secondary" sx={{ p: '10px 12px' }}>
        {children}
      </Typography>
    </Tooltip>
  );
}

/** A read failed: one quiet line, the cause in its tooltip, and Retry. */
function ReadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  // fd-error is the whole line, as wide as the details; Retry sits at its end.
  return (
    <Box data-testid="fd-error" sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Quiet title={errorText(error)}>Could not read this field</Quiet>
      </Box>
      <Button size="small" variant="text" onClick={onRetry} data-testid="fd-retry">
        Retry
      </Button>
    </Box>
  );
}

function errorText(error: unknown): string {
  const d = describeQueryError(error, 'this field');
  return [d.headline, d.detail ?? d.suggestion].filter(Boolean).join('. ');
}

function Loading() {
  return (
    <Box data-testid="fd-loading" sx={{ px: 2, py: 1.5 }}>
      <Skeleton width="30%" />
      <Skeleton width="15%" height={32} />
      <Skeleton width="50%" />
    </Box>
  );
}

export function ComponentFieldDetails({ spaceId, unitId, stageKey, path, resource, pending, upgrade, row, variantUnits, onClose }: ComponentFieldDetailsProps) {
  const blame = useContext(FieldBlameContext);
  const field = blame.index.get(stageKey);

  // A heavy Unit has no blame: its server path comes from the row's positional path.
  const heavyPath = useMemo(
    () => (blame.heavy ? heavyFieldPath(blame.data, path, resource) : undefined),
    [blame.heavy, blame.data, path, resource],
  );
  const address: FieldAddress | undefined = field
    ? { spaceId, unitId, ref: field.Ref, path: field.Path, resourceName: field.ResourceName }
    : heavyPath
      ? { spaceId, unitId, path: heavyPath, resourceName: resource?.ResourceName }
      : undefined;

  const report = useGetUnitPathQuery(pathArg(address ?? { spaceId, unitId }), { skip: !address });
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyReport = useGetUnitPathQuery(pathArg(address ?? { spaceId, unitId }, { history: true }), {
    skip: !address || !historyOpen,
  });
  const unitRead = useGetUnitQuery({ spaceId, unitId }).currentData;
  const unit = unitRead?.Unit;
  const upstreamLabel = useUpstreamLabel(unitRead);

  // Variants: shown when another Deployment has a Unit of the same slug; read on demand (Q2 (a)).
  const hasVariants = (variantUnits ?? []).some((v) => v.unitId !== unitId);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const reportField = report.currentData?.Field;
  const variantsRead = useSearchFieldVariantsQuery(
    { unitIds: (variantUnits ?? []).map((v) => v.unitId), path: reportField?.Path ?? '' },
    { skip: !variantsOpen || !hasVariants || !reportField?.Path },
  );
  const variants = useMemo(() => {
    if (!variantsRead.currentData || !reportField) return undefined;
    const byUnit = new Map(variantsRead.currentData.map((blame) => [blame.UnitID, blame.Fields]));
    return (variantUnits ?? []).map((v) => {
      const value = variantField(byUnit.get(v.unitId), reportField)?.Value;
      return { name: v.name, value: value === undefined ? undefined : value.replace(/\n$/, ''), current: v.unitId === unitId };
    });
  }, [variantsRead.currentData, reportField, variantUnits, unitId]);

  const ctx: ExplainContext = useMemo(
    () => ({
      stale: report.isFetching && Boolean(report.currentData),
      pending,
      upstream: unit?.UpstreamUnitID
        ? { spaceId: unit.UpstreamSpaceID, unitId: unit.UpstreamUnitID, revisionNum: unit.UpstreamRevisionNum, label: upstreamLabel }
        : undefined,
      incomingUpgrade:
        upgrade?.revisionNum !== undefined
          ? { value: upgrade.value, revisionNum: upgrade.revisionNum, spaceId: upgrade.spaceId, unitId: upgrade.unitId }
          : undefined,
    }),
    [report.isFetching, report.currentData, pending, unit, upgrade, upstreamLabel],
  );

  const view = useMemo(() => (report.currentData ? explainField(factsFromPath(report.currentData), ctx) : undefined), [report.currentData, ctx]);
  const history = useMemo(
    () => (historyReport.currentData ? explainField(factsFromPath(historyReport.currentData), ctx).history : undefined),
    [historyReport.currentData, ctx],
  );

  // The URL names the open field (REPLACE), so a reload, a link and Back come back to it.
  const { focus, locationKey, go } = useComponentFocus();
  const serverPath = address?.path;
  const fres = encodeFres(field?.ResourceType ?? resource?.ResourceType, field?.ResourceName ?? resource?.ResourceName);
  const focused = focus.unit === unitId && focus.field === serverPath && (focus.fres ?? undefined) === fres;
  // Written when the field resolves, not again on a focus change: Back may focus another field,
  // and this one is closing then.
  // `go` is read through a ref too: its identity follows the router's location, and a re-run on
  // every navigation would write this field back over the navigation (a gate link, Back).
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (!serverPath || focusedRef.current) return;
    goRef.current(openFieldPatch(unitId, serverPath, fres));
  }, [unitId, serverPath, fres]);
  const hostRef = useRef<HTMLDivElement>(null);
  useFieldReveal(hostRef, locationKey, Boolean(serverPath) && focus.unit === unitId && focus.field === serverPath);

  const resolve = usePaneFieldResolver({ path: serverPath ?? path, fres, spaceId, unitId });

  const { actions, dialogs } = useFieldActions({ spaceId, unitId, field: report.currentData?.Field, view, row, resolve });

  let body;
  if (!address && !blame.heavy && blame.loading) body = <Loading />;
  // A failed blame read is not "no record": the field's Ref is unknown, so say it failed.
  else if (!address && !blame.heavy && blame.error) body = <ReadError error={blame.error} onRetry={blame.refetch} />;
  else if (!address) body = <Quiet testId="fd-empty">No record for this field</Quiet>;
  else if (report.error && !report.currentData) body = <ReadError error={report.error} onRetry={() => void report.refetch()} />;
  else if (!view) body = <Loading />;
  else
    body = (
      <FieldDetails
        view={view}
        actions={actions}
        onClose={onClose}
        upgradeStaged={upgrade?.staged}
        history={{
          entries: history,
          loading: historyReport.isFetching,
          error: historyReport.error ? 'Could not read the history' : undefined,
        }}
        onOpenHistory={() => setHistoryOpen(true)}
        variants={
          hasVariants
            ? { entries: variants, loading: variantsRead.isFetching, error: variantsRead.error ? 'Could not read the Variants' : undefined }
            : undefined
        }
        onOpenVariants={() => setVariantsOpen(true)}
      />
    );

  return (
    <Box data-testid="fd-host" ref={hostRef}>
      <FieldLinkResolverContext.Provider value={resolve}>{body}</FieldLinkResolverContext.Provider>
      {dialogs}
    </Box>
  );
}
