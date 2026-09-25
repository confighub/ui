// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMatch, useNavigate, useParams } from 'react-router-dom';

import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import { useInitiatives } from '@/hooks/useInitiatives';
import {
  recheckCompleted,
  selectInitiativeInvocation,
} from '@/state/slices/initiativeInvocation';
import {
  setInvocationInitiativeId,
  setSelectedUnits as setGlobalSelectedUnits,
} from '@/state/slices/selectedUnits';
import {
  type ExtendedUnitRead,
  type FunctionInvocationsResponse,
  useDeleteFilterMutation,
  useDeleteTriggerMutation,
  useDeleteViewMutation,
  useGetTriggerQuery,
  useInvokeFunctionsOnOrgMutation,
  useListAllTargetsQuery,
  useListAllUnitsQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import type { Initiative, InitiativeStatus, UnitCheckResult } from '@/types/initiative';
import { getApiErrorMessage } from '@/utility/error-functions';
import { INITIATIVE_INCLUDE, INITIATIVE_SELECT, toUnitCheckResults } from './utils/checkResultHelpers';
import { createUnitListRow } from '@/components/unit-data-grid/utils/data-grid-helpers';
import { ErrorBox } from '@/components/error-box/ErrorBox';
import AddIcon from '@mui/icons-material/Add';
import PublishedWithChangesIcon from '@mui/icons-material/PublishedWithChanges';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { Header } from '@/components/header/Header';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { styled, useTheme } from '@mui/material/styles';
import { Group, Panel, Separator } from 'react-resizable-panels';

import {
  applyClientSideFilters,
  DEFAULT_TOOLCHAIN_TYPES,
  extractLabelOptions,
  extractSlugs,
  useQueryBuilder,
} from '@/components/query-builder';
import type { ClientSideFilterContext } from '@/components/query-builder';
import { InitiativeDetailHeader } from './components/InitiativeDetailHeader';
import { InitiativeResultsPanel } from './components/InitiativeResultsPanel';
import { InitiativesKanban } from './components/InitiativesKanban';
import { InitiativeSettingsPanel } from './components/InitiativeSettingsPanel';
import { InitiativeSummaryBar } from './components/InitiativeSummaryBar';
import { InitiativeUnitsGrid } from './components/InitiativeUnitsGrid';

const StyledSeparator = styled(Separator)(({ theme }) => ({
  width: 1,
  backgroundColor: theme.palette.divider,
  position: 'relative',
  transition: 'background-color 0.15s ease',
  '&:hover, &[data-separator-active]': {
    backgroundColor: theme.palette.primary.main,
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -3,
    right: -3,
  },
}));

const PanelInner = styled(Box)({
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
});

/** True when every response carries the post-invoke validation race signature
 *  (`Success: true` with no `Outputs`). The validating trigger ran nominally
 *  but the resolve processor hadn't produced its `ValidationResult` payload
 *  yet, so the per-unit check would render as failing despite no real failure.
 *  See docs/specs/initiative-recheck-race.md. */
function isAllRacedResponse(responses: FunctionInvocationsResponse[]): boolean {
  if (responses.length === 0) return false;
  return responses.every((r) => {
    if (r.Success !== true) return false;
    if (!r.Outputs) return true;
    return !('ValidationResult' in r.Outputs) && !('ValidationResultList' in r.Outputs);
  });
}

const EmptyInitiatives = ({ onCreateClick }: { onCreateClick: () => void }) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      gap: 2,
      color: 'text.secondary',
      py: 10,
    }}
  >
    <PublishedWithChangesIcon sx={{ fontSize: 64, opacity: 0.3 }} />
    <Typography variant='h6' fontWeight={600}>
      No initiatives yet
    </Typography>
    <Typography variant='body2' textAlign='center' sx={{ maxWidth: 380 }}>
      Initiatives help you track and coordinate org-wide configuration updates across your unit
      fleet.
    </Typography>
    <Button variant='contained' startIcon={<AddIcon />} onClick={onCreateClick} sx={{ mt: 1 }}>
      Create your first initiative
    </Button>
  </Box>
);

/**
 * Main Initiatives page.
 * Routes:
 *   /x/initiatives          → kanban list
 *   /x/initiatives/:id      → kanban list + inline detail for that initiative (deeplinkable)
 *   /x/initiatives/new      → create editor
 *   /x/initiatives/:id/edit → edit editor
 */
export const InitiativesPage = () => {
  const { id: paramId } = useParams<{ id: string }>();
  const newMatch = useMatch('/x/initiatives/new');
  const editMatch = useMatch('/x/initiatives/:id/edit');
  const isEditor = Boolean(newMatch || editMatch);
  const selectedId = isEditor ? null : (paramId ?? null);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { initiatives, removeInitiative, updateInitiative, isLoading } = useInitiatives();
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Initiative | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [deleteFilter] = useDeleteFilterMutation();
  const [deleteView] = useDeleteViewMutation();
  const [deleteTrigger] = useDeleteTriggerMutation();
  const [invokeFunctions, { isLoading: isRunningCheck }] = useInvokeFunctionsOnOrgMutation();

  const selectedInitiative = useMemo(
    () => initiatives.find((c) => c.id === selectedId) ?? null,
    [initiatives, selectedId],
  );

  const [checkResults, setCheckResults] = useState<UnitCheckResult[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollRef = useRef(false);

  /** Tracks the currently selected initiative so async callbacks can detect staleness. */
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  // Escape key to deselect initiative
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedId) {
        navigate('/x/initiatives');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedId, navigate]);

  /** Run the compliance check for a given initiative. Accepts the initiative directly
   *  so it can be called from handleSelect without waiting for a re-render.
   *  Guards against stale results: if the user navigates to a different initiative
   *  before results return, the response is discarded.
   *
   *  Race handling: the validating trigger runs asynchronously in the backend
   *  resolve processor, so a recheck fired immediately after a function
   *  invocation can return `Success: true, Outputs: null` for every unit — the
   *  race documented in docs/specs/initiative-recheck-race.md. When we detect
   *  that pattern (every response success-but-empty), we retry on a short
   *  backoff until either we get a populated response or we hit the deadline.
   *  When the orchestration calls us, it passes `isCancelled` so we can bail
   *  out of the retry loop if a newer invocation supersedes us or the user
   *  navigates away. */
  const runCheckForInitiative = useCallback(
    async (initiative: Initiative, opts?: { isCancelled?: () => boolean }) => {
      if (!initiative.triggerId || !initiative.filterId) return;
      setErrorMessage(null);
      const filterId = initiative.filterId;
      const triggerId = initiative.triggerId;
      const isCancelled = () =>
        opts?.isCancelled?.() === true || selectedIdRef.current !== initiative.id;
      const MAX_ATTEMPTS = 12;
      const RETRY_DELAY_MS = 750;
      try {
        let responses: FunctionInvocationsResponse[] = [];
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          if (isCancelled()) return;
          responses = await invokeFunctions({
            filter: filterId,
            dryRun: 'true',
            functionInvocationsRequest: { Triggers: [triggerId] },
          }).unwrap();
          if (isCancelled()) return;
          if (!isAllRacedResponse(responses)) break;
          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          }
        }

        const results = toUnitCheckResults(responses);
        const passingCount = results.filter((r) => r.success).length;
        const failingCount = results.filter((r) => !r.success && !r.notApplicable).length;
        const naCount = results.filter((r) => r.notApplicable).length;
        const now = new Date().toISOString();
        setCheckResults(results);
        updateInitiative(initiative.id, {
          checkSummary: { passing: passingCount, failing: failingCount, notApplicable: naCount, total: results.length, checkedAt: now },
        });
      } catch (err) {
        // Don't show errors for a initiative the user has already navigated away from
        if (isCancelled()) return;

        const msg = getApiErrorMessage(
          err as Parameters<typeof getApiErrorMessage>[0],
          'Failed to run compliance check. Please try again.',
        );
        setErrorMessage(msg);
      }
    },
    [invokeFunctions, updateInitiative],
  );

  // URL drives selection: selecting a card pushes /:id, deselect navigates back.
  const handleSelect = useCallback((id: string) => {
    navigate(`/x/initiatives/${id}`);
  }, [navigate]);

  // Respond to URL-driven selectedId changes: clear transient state and queue a scroll.
  // Handles both user clicks (via navigate) and deeplinks (initial load with :id).
  const prevSelectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSelectedIdRef.current === selectedId) return;
    prevSelectedIdRef.current = selectedId;
    setSelectedUnitIds([]);
    setCheckResults(null);
    setErrorMessage(null);
    if (selectedId) {
      pendingScrollRef.current = true;
    }
  }, [selectedId]);

  // Auto-fire the compliance check once the selected initiative is resolved.
  // Gated by a ref so we only run once per id (avoids re-firing when
  // `initiatives` re-renders after updateInitiative stores check results).
  const autoCheckedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) {
      autoCheckedIdRef.current = null;
      return;
    }
    if (!selectedInitiative) return;
    if (autoCheckedIdRef.current === selectedId) return;
    autoCheckedIdRef.current = selectedId;
    void runCheckForInitiative(selectedInitiative);
  }, [selectedId, selectedInitiative, runCheckForInitiative]);

  /** Auto-Recheck after an initiative-context invocation completes.
   *
   *  The backend's validating trigger runs asynchronously, so a recheck fired
   *  the instant invoke returns sees `Success: true, Outputs: null` for every
   *  unit — see docs/specs/initiative-recheck-race.md. The retry loop inside
   *  `runCheckForInitiative` handles the race; this effect just decides *when*
   *  to fire (once per `completionSeq` bump for the selected initiative) and
   *  tracks the in-flight state for the disabled-button UX.
   *
   *  The effect depends on `completionSeq` and `invocationInitiativeId`.
   *  `selectedInitiative` and `runCheckForInitiative` flow through refs so a
   *  re-render caused by `patchView` invalidating the View cache (which changes
   *  their identity) cannot re-trigger the orchestration. Supersession and
   *  navigation both cancel via the in-flight token. */
  const completionSeq = useAppSelector((s) => selectInitiativeInvocation(s).completionSeq);
  const invocationInitiativeId = useAppSelector((s) => selectInitiativeInvocation(s).initiativeId);
  const isInvocationBlocking = useAppSelector(
    (s) => { const iv = selectInitiativeInvocation(s); return iv.isInvoking || iv.isAwaitingRecheck; },
  );

  const selectedInitiativeRef = useRef(selectedInitiative);
  selectedInitiativeRef.current = selectedInitiative;
  const runCheckForInitiativeRef = useRef(runCheckForInitiative);
  runCheckForInitiativeRef.current = runCheckForInitiative;

  const lastHandledCompletionSeqRef = useRef(completionSeq);
  const inflightTokenRef = useRef<{ cancelled: boolean } | null>(null);

  useEffect(() => {
    if (completionSeq === lastHandledCompletionSeqRef.current) return;
    lastHandledCompletionSeqRef.current = completionSeq;

    const initiative = selectedInitiativeRef.current;
    if (!initiative || invocationInitiativeId !== initiative.id) {
      // Not for the visible initiative — clear the slice flag so the (other
      // initiative's) UI doesn't stay stuck if the user nav'd away mid-invoke.
      dispatch(recheckCompleted());
      return;
    }

    if (inflightTokenRef.current) inflightTokenRef.current.cancelled = true;
    const token = { cancelled: false };
    inflightTokenRef.current = token;

    void (async () => {
      try {
        await runCheckForInitiativeRef.current(initiative, {
          isCancelled: () => token.cancelled,
        });
      } finally {
        // Always release the slice flag — even on cancellation, we don't want
        // a stale "awaiting recheck" badge stuck on the button.
        if (inflightTokenRef.current === token) {
          inflightTokenRef.current = null;
          dispatch(recheckCompleted());
        }
      }
    })();
  }, [completionSeq, invocationInitiativeId, dispatch]);

  // Cancel any in-flight orchestration when the user switches initiatives or
  // leaves the page. The slice flag is cleared so neither this initiative's
  // button nor any other gets stuck waiting on an orphaned recheck.
  useEffect(() => {
    return () => {
      if (inflightTokenRef.current) {
        inflightTokenRef.current.cancelled = true;
        inflightTokenRef.current = null;
        dispatch(recheckCompleted());
      }
    };
  }, [selectedId, dispatch]);

  // --- Query builder setup (same data sources as UnitListPage) ---
  const { spaces = [] } = useListSpacesQuery(
    {},
    { selectFromResult: (result) => ({ spaces: result?.data?.map((s) => s.Space).filter(Boolean) }) },
  );
  const queryBuilderSpaces = useMemo(
    () => spaces.map((s) => ({ id: s?.SpaceID || '', name: s?.DisplayName || s?.Slug || '', labels: s?.Labels })),
    [spaces],
  );

  const { data: targetsData } = useListAllTargetsQuery({});
  const queryBuilderTargets = useMemo(
    () => targetsData?.map((t) => ({ id: t.Target?.TargetID || '', name: t.Target?.DisplayName || t.Target?.Slug || '' })) || [],
    [targetsData],
  );

  // Fetch all units in initiative scope — used only to populate query builder autocomplete
  // options (label values, slugs). Always uses the initiative's own where clause so that
  // options reflect the full scope even when the user has an active QB filter.
  const { currentData: scopeUnits = [] } = useListAllUnitsQuery(
    {
      where: selectedInitiative?.whereClause || undefined,
      whereData: selectedInitiative?.whereDataClause || undefined,
      resourceType: selectedInitiative?.resourceTypeClause || undefined,
      include: INITIATIVE_INCLUDE,
      select: INITIATIVE_SELECT,
    },
    { skip: !selectedInitiative?.whereClause },
  );

  const labelOptions = useMemo(() => extractLabelOptions(scopeUnits.map((u) => u.Unit)), [scopeUnits]);
  const slugOptions = useMemo(
    () => extractSlugs(scopeUnits.map((u) => u.Unit), (unit) => {
      const match = scopeUnits.find((u) => u.Unit === unit);
      return match?.Space?.DisplayName || match?.Space?.Slug || '';
    }),
    [scopeUnits],
  );

  const { QueryBuilderElement, filters: filterConditions, whereClause, whereDataClause, resourceTypeClause } = useQueryBuilder({
    entityType: 'Unit',
    spaces: queryBuilderSpaces,
    targets: queryBuilderTargets,
    toolchainTypes: DEFAULT_TOOLCHAIN_TYPES,
    slugs: slugOptions,
    labelOptions,
  });

  // Fetch units for display — combines the initiative's scope clause with any active query
  // builder filters so server-side filtering applies. When no QB filter is active the args
  // are identical to the scopeUnits query above and RTK Query returns the cached result
  // without a second network request.
  const combinedWhere = [selectedInitiative?.whereClause, whereClause].filter(Boolean).join(' AND ') || undefined;
  const combinedWhereData = [selectedInitiative?.whereDataClause, whereDataClause].filter(Boolean).join(' AND ') || undefined;
  const combinedResourceType = selectedInitiative?.resourceTypeClause || resourceTypeClause || undefined;

  const { currentData: units = [], error: unitsError } = useListAllUnitsQuery(
    {
      where: combinedWhere,
      whereData: combinedWhereData,
      resourceType: combinedResourceType,
      include: INITIATIVE_INCLUDE,
      select: INITIATIVE_SELECT,
    },
    { skip: !selectedInitiative?.whereClause },
  );

  // Build a map from unitId → check result value for client-side filtering
  const checkResultContext = useMemo((): ClientSideFilterContext => {
    if (!checkResults) return {};
    const map = new Map<string, string>();
    for (const r of checkResults) {
      if (r.notApplicable) map.set(r.unitId, 'N/A');
      else if (r.success) map.set(r.unitId, 'Pass');
      else map.set(r.unitId, 'Fail');
    }
    return { checkResultByUnitId: map };
  }, [checkResults]);

  // Apply client-side filters (handles both standard computed fields and checkResult)
  const filteredUnits = useMemo(
    () => applyClientSideFilters(units, filterConditions, createUnitListRow, checkResultContext),
    [units, filterConditions, checkResultContext],
  );

  // Mirror local selection into the global selectedUnits slice so the Invoker
  // sidebar (opened with F) picks up the failing units the user has checked.
  const resolvedSelection = useMemo(
    () => units.filter((u) => u.Unit?.UnitID && selectedUnitIds.includes(u.Unit.UnitID)),
    [units, selectedUnitIds],
  );
  useEffect(() => {
    dispatch(setGlobalSelectedUnits({ units: resolvedSelection }));
  }, [resolvedSelection, dispatch]);

  // Push the selected initiative id so invocations from the right sidebar
  // wrap themselves in a per-run ChangeSet labeled with that initiative.
  const activeInitiativeId = selectedInitiative?.id;
  useEffect(() => {
    dispatch(setInvocationInitiativeId(activeInitiativeId));
  }, [activeInitiativeId, dispatch]);

  // Clear both on unmount so we don't leak context into other pages.
  useEffect(
    () => () => {
      dispatch(setGlobalSelectedUnits({ units: [] }));
      dispatch(setInvocationInitiativeId(undefined));
    },
    [dispatch],
  );

  // Smooth scroll to the detail bar once units have loaded
  if (pendingScrollRef.current && units.length > 0) {
    pendingScrollRef.current = false;
    requestAnimationFrame(() => {
      const el = detailRef.current;
      const container = scrollContainerRef.current;
      if (!el || !container) return;
      const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 20;
      container.scrollTo({ top, behavior: 'smooth' });
    });
  }

  const unitsErrorMsg = unitsError
    ? `Failed to load units: ${getApiErrorMessage(unitsError, 'Unknown error')}`
    : null;

  const handleRunCheck = useCallback(async () => {
    if (!selectedInitiative) return;
    await runCheckForInitiative(selectedInitiative);
  }, [selectedInitiative, runCheckForInitiative]);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      // Delete in dependency order: Trigger → View → Filter.
      // Trigger references Filter (via UnitFilterID) and View references Filter
      // (via FilterID), so the Filter must be deleted last to avoid FK violations.
      if (deleteTarget.triggerId && deleteTarget.spaceId) {
        await deleteTrigger({ triggerId: deleteTarget.triggerId, spaceId: deleteTarget.spaceId }).unwrap();
      }
      if (deleteTarget.viewId && deleteTarget.spaceId) {
        await deleteView({ viewId: deleteTarget.viewId, spaceId: deleteTarget.spaceId }).unwrap();
      }
      if (deleteTarget.filterId && deleteTarget.spaceId) {
        await deleteFilter({ filterId: deleteTarget.filterId, spaceId: deleteTarget.spaceId }).unwrap();
      }
      removeInitiative(deleteTarget.id);
      if (selectedId === deleteTarget.id) {
        navigate('/x/initiatives');
      }
      setDeleteTarget(null);
    } catch (err) {
      const msg = getApiErrorMessage(
        err as Parameters<typeof getApiErrorMessage>[0],
        'Failed to delete initiative resources. Some backend resources may not have been cleaned up.',
      );
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, selectedId, deleteTrigger, deleteView, deleteFilter, removeInitiative, navigate]);

  const handleStatusChange = useCallback(
    (id: string, status: InitiativeStatus) => {
      updateInitiative(id, {
        status,
        completedAt: status === 'completed' ? new Date().toISOString() : undefined,
      });
    },
    [updateInitiative],
  );

  const canRunCheck = Boolean(selectedInitiative?.triggerId && selectedInitiative?.filterId);
  // Block Recheck while an initiative-context invocation is running or the
  // backend is still draining its validating-trigger queue. Rechecking during
  // that window is the race that returns empty Outputs for every unit.
  const isInvocationForSelected = invocationInitiativeId === selectedId;
  const isCheckBlocked =
    isRunningCheck ||
    (isInvocationForSelected && isInvocationBlocking);

  const cachedSummary = selectedInitiative?.checkSummary;
  const passing = checkResults ? checkResults.filter((r) => r.success).length : cachedSummary?.passing ?? 0;
  const failing = checkResults ? checkResults.filter((r) => !r.success && !r.notApplicable).length : cachedSummary?.failing ?? 0;
  const notApplicable = checkResults ? checkResults.filter((r) => r.notApplicable).length : cachedSummary?.notApplicable ?? 0;

  // --- Editor view (create or edit) ---
  if (isEditor) {
    const editorId = newMatch ? 'new' : (paramId ?? '');
    return <InitiativeEditor editorId={editorId} />;
  }

  // --- List view (kanban) ---
  return (
    <Box
      ref={scrollContainerRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'auto',
        backgroundColor: 'rgb(249, 250, 251)',
      }}
    >
      <Box>
        <Header
          breadCrumbs={[{ name: 'Initiatives' }]}
          addButtonText='New Initiative'
          onAddButtonClick={() => navigate('/x/initiatives/new')}
        />
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      ) : initiatives.length === 0 ? (
        <EmptyInitiatives onCreateClick={() => navigate('/x/initiatives/new')} />
      ) : (
        <>
          {/* Kanban board */}
          <Box sx={{ p: 3, flexShrink: 0 }}>
            <InitiativesKanban
              initiatives={initiatives}
              selectedId={selectedId}
              onSelect={handleSelect}
              onEdit={(id) => navigate(`/x/initiatives/${id}/edit`)}
              onDelete={setDeleteTarget}
              onStatusChange={handleStatusChange}
            />
          </Box>

          {/* Inline detail view for selected initiative */}
          {selectedInitiative && (
            <Box ref={detailRef} sx={{ flexShrink: 0, px: 3 }}>
              <InitiativeDetailHeader
                initiative={selectedInitiative}
                isRunningCheck={isCheckBlocked}
                canRunCheck={canRunCheck}
                onBack={() => navigate('/x/initiatives')}
                onEdit={() => navigate(`/x/initiatives/${selectedId}/edit`)}
                onRunCheck={handleRunCheck}
                checkedAt={selectedInitiative.checkSummary?.checkedAt}
                unitCount={checkResults ? checkResults.length : selectedInitiative.checkSummary?.total}
                toolchain={selectedInitiative.triggerId ? 'Kyverno' : undefined}
              />
              <Box sx={{ pt: 2, pb: 3, maxWidth: 1200, mx: 'auto', width: '100%' }}>
                <ErrorBox error={errorMessage} onClose={() => setErrorMessage(null)} sx={{ mb: 2 }} />
                <ErrorBox error={unitsErrorMsg} onClose={() => {/* query error clears on retry */}} sx={{ mb: 2 }} />
                {(checkResults || cachedSummary) && (
                  <Box sx={{ mb: 2 }}>
                    <InitiativeSummaryBar
                      total={checkResults ? checkResults.length : cachedSummary?.total ?? 0}
                      passing={passing}
                      failing={failing}
                      notApplicable={notApplicable}
                    />
                  </Box>
                )}
                {!canRunCheck && !checkResults && (
                  <Alert
                    severity='info'
                    icon={<InfoOutlinedIcon fontSize='small' />}
                    sx={{ mb: 2, fontSize: '0.8rem' }}
                  >
                    This initiative has no compliance check configured. Edit the initiative to add a compliance check.
                  </Alert>
                )}
                <Box sx={{ width: '100%' }}>
                  <InitiativeUnitsGrid
                    units={filteredUnits}
                    checkResults={checkResults}
                    filterElement={QueryBuilderElement}
                    defaultSort={checkResults ? { field: 'TestResult', sort: 'asc' } : undefined}
                    isRunningCheck={isRunningCheck}
                    selectedUnitIds={selectedUnitIds}
                    onRowSelectionChange={setSelectedUnitIds}
                  />
                </Box>
              </Box>
            </Box>
          )}
        </>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => { setDeleteTarget(null); setDeleteError(null); }}>
        <DialogTitle>Delete initiative?</DialogTitle>
        <DialogContent>
          <ErrorBox error={deleteError} onClose={() => setDeleteError(null)} sx={{ mb: 1 }} />
          <DialogContentText>
            <strong>{deleteTarget?.name}</strong> will be permanently removed along with its
            saved filter, view
            {deleteTarget?.triggerId ? ', and compliance check trigger' : ''}.
            This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteTarget(null); setDeleteError(null); }} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant='contained'
            color='error'
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={14} color='inherit' /> : undefined}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

/**
 * Editor sub-view for creating or editing a initiative.
 * Rendered when a initiative id is present in the URL.
 */
const InitiativeEditor = ({ editorId }: { editorId: string }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { initiatives } = useInitiatives();

  const isCreateMode = editorId === 'new';
  const initiative = isCreateMode ? undefined : initiatives.find((c) => c.id === editorId);

  const { data: triggerData } = useGetTriggerQuery(
    { triggerId: initiative?.triggerId ?? '', spaceId: initiative?.spaceId ?? '' },
    { skip: !initiative?.triggerId || !initiative?.spaceId },
  );

  const kyvernoPolicy = triggerData?.Trigger?.Arguments?.find(
    (a) => a.ParameterName === 'policy',
  )?.Value?.toString();

  const triggerBridgeWorkerId = triggerData?.Trigger?.BridgeWorkerID ?? undefined;
  const triggerWarn = triggerData?.Trigger?.Warn;

  const [whereClause, setWhereClause] = useState('');
  const [whereDataClause, setWhereDataClause] = useState('');
  const [resourceTypeClause, setResourceTypeClause] = useState('');
  const [scopePortalTarget, setScopePortalTarget] = useState<HTMLElement | null>(null);
  const [checkResults, setCheckResults] = useState<UnitCheckResult[] | null>(null);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [scopeUnits, setScopeUnits] = useState<ExtendedUnitRead[]>([]);

  // Mirror the editor's grid selection into the global selectedUnits slice so
  // the Invoker sidebar (F shortcut) picks up the units the user has checked.
  // Cleared on unmount so we don't leak the editor's context into other pages.
  useEffect(() => {
    const resolved = scopeUnits.filter(
      (u) => u.Unit?.UnitID && selectedUnitIds.includes(u.Unit.UnitID),
    );
    dispatch(setGlobalSelectedUnits({ units: resolved }));
    return () => {
      dispatch(setGlobalSelectedUnits({ units: [] }));
    };
  }, [selectedUnitIds, scopeUnits, dispatch]);

  const handleWhereClauseChange = useCallback((where: string, whereData: string, resourceType: string) => {
    setWhereClause(where);
    setWhereDataClause(whereData);
    setResourceTypeClause(resourceType);
  }, []);

  if (!isCreateMode && !initiative) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography color='text.secondary'>Initiative not found.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <Header
        breadCrumbs={[
          { name: 'Initiatives', isLink: true, link: '/x/initiatives' },
          { name: isCreateMode ? 'New Initiative' : (initiative?.name ?? 'Edit Initiative') },
        ]}
      />

      {/* Resizable split-pane body */}
      <Group orientation='horizontal' style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left pane — settings */}
        <Panel defaultSize='30%' minSize='20%' maxSize='55%' style={{ position: 'relative' }}>
          <PanelInner sx={{ backgroundColor: theme.palette.background.paper }}>
            <Box
              sx={{
                px: 3,
                py: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Button
                size='small'
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate('/x/initiatives')}
                sx={{ textTransform: 'none', color: 'primary.main', minWidth: 'auto' }}
              >
                Back
              </Button>
              <Box sx={{ width: '1px', height: 16, bgcolor: 'divider', flexShrink: 0 }} />
              <Typography variant='subtitle2' color='text.secondary' fontWeight={600}>
                CONFIGURATION
              </Typography>
            </Box>
            <InitiativeSettingsPanel
              initiative={initiative}
              onWhereClauseChange={handleWhereClauseChange}
              scopePortalTarget={scopePortalTarget}
              onTestResults={setCheckResults}
              kyvernoPolicy={kyvernoPolicy}
              triggerBridgeWorkerId={triggerBridgeWorkerId}
              triggerWarn={triggerWarn}
            />
          </PanelInner>
        </Panel>

        <StyledSeparator />

        {/* Right pane — live results */}
        <Panel minSize='30%' style={{ position: 'relative' }}>
          <PanelInner>
            <InitiativeResultsPanel
              whereClause={whereClause}
              whereDataClause={whereDataClause}
              resourceTypeClause={resourceTypeClause}
              onScopeContainerReady={setScopePortalTarget}
              checkResults={checkResults}
              selectedUnitIds={selectedUnitIds}
              onRowSelectionChange={setSelectedUnitIds}
              onUnitsLoaded={setScopeUnits}
            />
          </PanelInner>
        </Panel>
      </Group>
    </Box>
  );
};

export default InitiativesPage;
