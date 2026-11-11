// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';

import { ChangeSetAcknowledgements } from '@/components/change-set-lock/ChangeSetAcknowledgements';
import { useChangeSetLock } from '@/components/change-set-lock/useChangeSetLock';
import { validatingTriggerRequest } from '@/hooks/useGateTriggers';
import { protectionRequest } from '@/pages/unit-detail/components/blame/blameFields';
import { getApiErrorMessage } from '@/utility/error-functions';
import { parseGateName } from '@/utility/name-format-functions';
import {
  confighubApi,
  useInvokeFunctionsOnOrgMutation,
  useSetUnitProtectionMutation,
} from '@confighub/rtk-query';
import { Alert, Box, CircularProgress, Skeleton } from '@mui/material';
import { styled } from '@mui/material/styles';

import { componentTheme } from '../componentTheme';
import type { RowOrigin } from './GateFixRow';
import { GateStep, type GateStepState } from './GateStep';
import { GatesSummary } from './GatesSummary';
import { UnitLink } from './UnitLink';
import { type Gate, type GateField, gateAfterSave } from './gateModel';
import {
  type FieldOrigin,
  blameFieldsForFinding,
  hopUnitLabel,
  originForFinding,
  originUnitKey,
} from './gateOrigin';
import {
  type StagedFix,
  type WriteOutcome,
  fixInvocations,
  triggerRunOutcome,
  unmatchedPaths,
  writeOutcome,
} from './gateWrites';
import { sameCheckElsewhere, sameFindingElsewhere } from './sameFindingElsewhere';
import type { ComponentGates } from './useComponentGates';

const LOADING_DELAY_MS = 200;

const Body = styled(Box)({
  padding: '14px 16px 24px',
  fontSize: 12.5,
  lineHeight: 'normal',
  fontFamily: componentTheme.fontSans,
  color: componentTheme.fgDefault,
});

const WarningsHeader = styled(Box)({
  fontSize: 13,
  fontWeight: 700,
  margin: '6px 0 10px',
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  color: componentTheme.fgDefault,
});

/** A gate the user cleared in this pane: kept in place, grey, with its Revision. */
interface ClearedGate {
  gate: Gate;
  index: number;
  revision: number;
}

interface SaveState {
  /** The gate's key in the pane (`gateKey`). */
  key: string;
  /** The gate as it was saved, so it still draws as cleared after the server drops it. */
  gate: Gate;
  index: number;
  /** The Revision each Unit had before the save. */
  before: Record<string, number>;
  /** The Revision the fix wrote, per Unit. */
  written: Record<string, number>;
}

export interface GatesPaneProps {
  data: ComponentGates;
  spaceSlug: string;
  /** Opens the Unit on the Configuration tab. */
  onOpenConfiguration: (unitId: string) => void;
  /** Selects the origin's node in the same pane. */
  onFixInOrigin: (origin: FieldOrigin, gate: Gate) => void;
  /** Every Unit of the Component, as `SPACE/Unit`, with the names of its gates. */
  componentUnits: { unitId: string; spaceId: string; label: string; gateNames: string[] }[];
  /** The Spaces that are nodes of this Component. */
  componentSpaceIds: string[];
}

const gateKey = (gate: Gate) => `${gate.warning ? 'w' : 'e'}:${gate.key}`;

/** Shows a skeleton only after a short wait, so a fast read does not flash. */
const useDelayed = (active: boolean, ms: number) => {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return shown;
};

/** The Gates tab of the Component side pane: the numbered gates, then the warnings. */
export const GatesPane = ({
  data,
  spaceSlug,
  onOpenConfiguration,
  onFixInOrigin,
  componentUnits,
  componentSpaceIds,
}: GatesPaneProps) => {
  const dispatch = useDispatch();
  const [invokeFunctions] = useInvokeFunctionsOnOrgMutation();
  const [setProtection] = useSetUnitProtectionMutation();

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [staged, setStaged] = useState<Map<string, StagedFix>>(new Map());
  const [fixHere, setFixHere] = useState<Set<string>>(new Set());
  const [keep, setKeep] = useState<Map<string, boolean>>(new Map());
  const [unwritable, setUnwritable] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  const [elsewhereOpen, setElsewhereOpen] = useState<Set<string>>(new Set());
  const [cleared, setCleared] = useState<ClearedGate[]>([]);
  const [stillFailing, setStillFailing] = useState<Map<string, number>>(new Map());
  const [saveError, setSaveError] = useState<{
    key: string;
    title: string;
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState<SaveState | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState<string | null>(null);

  const {
    gates,
    warnings,
    units,
    blame,
    isBlameLoading,
    blameError,
    componentBlame,
    isComponentBlameLoading,
  } = data;

  // A save ends when every Unit it wrote has a newer head Revision and its Triggers have run.
  useEffect(() => {
    if (!saving || checking !== saving.key) return;
    const done = Object.entries(saving.before).every(([unitId, before]) => {
      const unit = units.find((u) => u.UnitID === unitId);
      return (
        !!unit &&
        (unit.HeadRevisionNum ?? 0) > before &&
        !unit.ValidationErrors?.['awaiting/triggers']
      );
    });
    if (!done) return;
    const revision = Math.max(...Object.values(saving.written));
    // A warning is looked up among the warnings: it is never a numbered gate.
    const still = gateAfterSave(saving.gate, gates, warnings);
    if (still) {
      setStillFailing((prev) => new Map(prev).set(saving.key, revision));
      // The fields that still fail open for a value here, as the ones just saved were.
      setFixHere((prev) => new Set([...prev, ...still.fields.map((f) => f.key)]));
    } else {
      setCleared((prev) => [...prev, { gate: saving.gate, index: saving.index, revision }]);
      setOpenKey(null);
    }
    setChecking(null);
    setSaving(null);
  }, [saving, checking, units, gates, warnings]);

  // Gates the user cleared stay in place; the rest come from the server. Cleared warnings stay
  // among the warnings.
  const withCleared = useCallback(
    (list: Gate[], warning: boolean) => {
      const shown: { gate: Gate; cleared?: ClearedGate }[] = list.map((gate) => ({ gate }));
      const mine = cleared.filter((c) => c.gate.warning === warning);
      for (const c of [...mine].sort((a, b) => a.index - b.index)) {
        if (list.some((g) => gateKey(g) === gateKey(c.gate))) continue;
        shown.splice(Math.min(c.index, shown.length), 0, { gate: c.gate, cleared: c });
      }
      return shown;
    },
    [cleared],
  );
  const shownGates = useMemo(() => withCleared(gates, false), [withCleared, gates]);
  const shownWarnings = useMemo(() => withCleared(warnings, true), [withCleared, warnings]);
  // A ChangeSet open on a Unit locks it: a fix and its Keep on merge each create a Revision, which
  // becomes part of the ChangeSet, so each names it once the person has acknowledged that. A save
  // to a Unit whose ChangeSet is not acknowledged is refused, naming it.
  const lockUnits = useMemo(
    () => [
      ...new Map(
        [...gates, ...warnings].flatMap((gate) => gate.units).map((u) => [u.unitId, u]),
      ).values(),
    ],
    [gates, warnings],
  );
  const lock = useChangeSetLock(lockUnits);

  const firstOpen = shownGates.find((g) => !g.cleared);
  const activeKey =
    openKey ??
    (firstOpen
      ? gateKey(firstOpen.gate)
      : warnings.length && !gates.length
        ? gateKey(warnings[0])
        : null);
  const activeIndex = shownGates.findIndex((g) => gateKey(g.gate) === activeKey);
  const firstOpenIndex = firstOpen ? shownGates.indexOf(firstOpen) : -1;

  const rowOrigin = useCallback(
    (field: GateField): RowOrigin => {
      if (isBlameLoading) return { loading: true };
      if (blameError) return { loading: false, failed: true };
      return {
        loading: false,
        origin: originForFinding(blameFieldsForFinding(blame, field, field.gateName)),
      };
    },
    [blame, isBlameLoading, blameError],
  );

  const elsewhereOf = (gate: Gate) => {
    const field = gate.fields[0];
    if (!field) {
      // A check that names no field has no origin: the same check on other Units of the Component.
      const unit = gate.units[0];
      if (!unit || gate.warning) return { loading: false };
      const { triggerSlug } = parseGateName(gate.gateName);
      return {
        loading: false,
        found: sameCheckElsewhere(
          componentUnits,
          { unitId: unit.unitId, spaceId: unit.spaceId, label: `${spaceSlug}/${unit.slug}` },
          triggerSlug,
          gate.functionName,
        ),
      };
    }
    if (isBlameLoading || isComponentBlameLoading) return { loading: true };
    const origin = originForFinding(blameFieldsForFinding(blame, field, field.gateName));
    if (!origin?.upstream) return { loading: false };
    const found = sameFindingElsewhere(
      gate.warning ? componentBlame.warnings : componentBlame.errors,
      { unitId: field.unitId, label: `${field.spaceSlug}/${field.unitSlug}` },
      field.functionName,
      gate.fields.map((f) => f.path),
      originUnitKey(origin.from),
      {
        spaceId: origin.from.SpaceID,
        unitId: origin.from.UnitID,
        label: hopUnitLabel(origin.from),
      },
      origin.from.SpaceSlug ?? '',
    );
    return { loading: false, found };
  };

  const stage = (field: GateField, fix: StagedFix | undefined) => {
    setSaveError(null);
    setStaged((prev) => {
      const next = new Map(prev);
      if (fix) next.set(field.key, fix);
      else next.delete(field.key);
      return next;
    });
  };

  const discard = (gate: Gate) => {
    setStaged((prev) => {
      const next = new Map(prev);
      gate.fields.forEach((f) => next.delete(f.key));
      return next;
    });
    setSaveError(null);
  };

  const clearStaged = (fields: GateField[]) =>
    setStaged((prev) => {
      const next = new Map(prev);
      fields.forEach((f) => next.delete(f.key));
      return next;
    });

  /**
   * Writes the staged fixes Unit by Unit, each in one request. What a Unit's answer says decides
   * what happens to its fixes: written ones are cleared at once (so a second save cannot apply a
   * delete again to the entry that moved into its place), the rest stay, and the user is told
   * which Units were saved and which were not, and why.
   */
  const save = async (gate: Gate, index: number) => {
    const key = gateKey(gate);
    setSaveError(null);
    const before: Record<string, number> = {};
    const written: Record<string, number> = {};
    const notSaved: string[] = [];
    const saved: string[] = [];
    setChecking(key);
    for (const unit of gate.units) {
      const label = `${spaceSlug}/${unit.slug}`;
      const fields = gate.fields.filter((f) => f.unitId === unit.unitId && staged.has(f.key));
      const invocations = fixInvocations(fields, staged);
      if (invocations.length === 0) continue;
      let outcome: WriteOutcome;
      try {
        const answer = await invokeFunctions({
          executorSpace: unit.spaceId,
          where: `UnitID = '${unit.unitId}'`,
          changeSetId: lock.changeSetFor(unit.unitId),
          functionInvocationsRequest: {
            ToolchainType: unit.toolchainType || 'Kubernetes/YAML',
            FunctionInvocations: invocations,
          },
        }).unwrap();
        outcome = writeOutcome(answer?.find((a) => a.UnitID === unit.unitId) ?? answer?.[0]);
      } catch (err: unknown) {
        const message = getApiErrorMessage(err, 'Could not save the fixes.');
        const missing = new Set(unmatchedPaths(message));
        if (missing.size > 0) {
          setUnwritable(
            (prev) =>
              new Set([
                ...prev,
                ...fields.filter((f) => missing.has(f.path)).map((f) => f.key),
              ]),
          );
        }
        outcome = { status: 'failed', reason: message };
      }
      if (outcome.status !== 'written') {
        notSaved.push(`${label}: ${outcome.reason}`);
        continue;
      }
      before[unit.unitId] = unit.headRevisionNum;
      // One request makes one Revision.
      written[unit.unitId] = unit.headRevisionNum + 1;
      saved.push(`${label} as Revision ${written[unit.unitId]}`);
      clearStaged(fields);
      dispatch(confighubApi.util.invalidateTags(['Unit']));
      const kept = fields.filter(
        (f) => staged.get(f.key)?.op === 'set' && (keep.get(f.key) ?? true),
      );
      const keptBlame = kept.flatMap((f) => {
        const origin = originForFinding(blameFieldsForFinding(blame, f, f.gateName));
        return origin?.upstream && !origin.protected ? [origin.field] : [];
      });
      if (keptBlame.length > 0) {
        try {
          await setProtection({
            spaceId: unit.spaceId,
            unitId: unit.unitId,
            unitProtectionRequest: {
              ResourceProtection: protectionRequest(keptBlame, true),
              ChangeSetID: lock.changeSetFor(unit.unitId),
            },
          }).unwrap();
        } catch (err: unknown) {
          notSaved.push(
            `${label}: the fix was saved as Revision ${written[unit.unitId]}, but Keep on merge was not: ${getApiErrorMessage(err)}`,
          );
        }
      }
    }
    if (notSaved.length > 0) {
      setSaveError({
        key,
        title: 'Not saved.',
        message: `${notSaved.join(' ')}${saved.length > 0 ? ` Saved: ${saved.join(', ')}.` : ''}`,
      });
    }
    if (Object.keys(before).length === 0) {
      setChecking(null);
      return;
    }
    setStillFailing((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    setSaving({ key, gate, index, before, written });
  };

  /**
   * Runs the gate's Trigger again on each of its Units and records the result. Each Unit's answer
   * is read: a Unit the Trigger did not run on is named, so a re-check never looks done when it
   * was not.
   */
  const recheck = async (gate: Gate) => {
    const triggerID = gate.trigger?.TriggerID;
    if (!triggerID) return;
    const key = gateKey(gate);
    setRechecking(key);
    setSaveError(null);
    const failed: string[] = [];
    for (const unit of gate.units) {
      const label = `${spaceSlug}/${unit.slug}`;
      try {
        const answer = await invokeFunctions({
          executorSpace: unit.spaceId,
          where: `UnitID = '${unit.unitId}'`,
          functionInvocationsRequest: validatingTriggerRequest(unit.toolchainType, triggerID, {
            updateValidationResults: true,
          }),
        }).unwrap();
        const outcome = triggerRunOutcome(
          answer?.find((a) => a.UnitID === unit.unitId) ?? answer?.[0],
        );
        if (!outcome.ran) failed.push(`${label}: ${outcome.reason}`);
      } catch (err: unknown) {
        failed.push(`${label}: ${getApiErrorMessage(err, 'Could not run the Trigger.')}`);
      }
    }
    dispatch(confighubApi.util.invalidateTags(['Unit']));
    if (failed.length > 0)
      setSaveError({ key, title: 'Not re-checked.', message: failed.join(' ') });
    setRechecking(null);
  };

  const showSkeleton = useDelayed(data.isLoading, LOADING_DELAY_MS);

  if (data.isLoading) {
    return (
      <Body aria-busy>
        <Box data-testid='gates-loading'>
          {showSkeleton && (
            <>
              <Skeleton
                variant='rounded'
                animation={false}
                sx={{ width: '60%', height: 16, my: 1, bgcolor: componentTheme.bgInset }}
              />
              <Skeleton
                variant='rounded'
                animation={false}
                sx={{ width: '85%', height: 12, my: 1, bgcolor: componentTheme.bgInset }}
              />
              <Skeleton
                variant='rounded'
                animation={false}
                sx={{ width: '40%', height: 12, my: 1, bgcolor: componentTheme.bgInset }}
              />
              <Skeleton
                variant='rounded'
                animation={false}
                sx={{ height: 110, mt: '18px', mb: 1, bgcolor: componentTheme.bgInset }}
              />
              <Skeleton
                variant='rounded'
                animation={false}
                sx={{ height: 60, my: 1, bgcolor: componentTheme.bgInset }}
              />
            </>
          )}
        </Box>
      </Body>
    );
  }
  if (data.error) {
    return (
      <Body>
        <Alert
          severity='error'
          data-testid='gates-read-error'
          sx={{ overflowWrap: 'anywhere' }}
        >
          <b>Could not read the gates.</b> Reading the Units of {spaceSlug} failed:{' '}
          {getApiErrorMessage(data.error)} Nothing is shown until it can be read.
        </Alert>
      </Body>
    );
  }
  if (data.awaiting && !checking) {
    return (
      <Body>
        <Box
          data-testid='gates-awaiting'
          sx={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            p: '12px 14px',
            borderRadius: `${componentTheme.radiusMd}px`,
            border: `1px solid ${componentTheme.borderDefault}`,
          }}
        >
          <CircularProgress
            size={14}
            sx={{ color: componentTheme.attention, flexShrink: 0 }}
          />
          <div>
            <Box sx={{ fontWeight: 700 }}>
              Checking Revision {data.awaiting.HeadRevisionNum}
            </Box>
            <Box sx={{ color: componentTheme.fgMuted, mt: '2px' }}>
              The Triggers are running on{' '}
              <UnitLink
                spaceId={data.awaiting.SpaceID}
                unitId={data.awaiting.UnitID}
                testId='gates-awaiting-unit-link'
              >
                {spaceSlug}/{data.awaiting.Slug}
              </UnitLink>
              . The Space stays blocked until they finish.
            </Box>
          </div>
        </Box>
      </Body>
    );
  }
  if (shownGates.length === 0 && shownWarnings.length === 0) {
    return (
      <Body>
        <Box data-testid='gates-empty' sx={{ p: '28px 8px' }}>
          <Box sx={{ fontSize: 14, fontWeight: 700 }}>No gates</Box>
          <Box sx={{ color: componentTheme.fgMuted, mt: '6px', lineHeight: 1.55 }}>
            Every validating Trigger passed on the head Revision of each Unit in {spaceSlug}.
            Nothing is blocked.
          </Box>
        </Box>
      </Body>
    );
  }

  const stepProps = (gate: Gate, index: number) => ({
    gate,
    spaceSlug,
    onOpen: () => setOpenKey(gateKey(gate)),
    rowOrigin,
    staged,
    fixHere,
    keep,
    unwritable,
    onStage: stage,
    onFixHere: (field: GateField) =>
      setFixHere((prev) => {
        const next = new Set(prev);
        if (next.has(field.key)) next.delete(field.key);
        else next.add(field.key);
        return next;
      }),
    onKeepChange: (field: GateField, value: boolean) =>
      setKeep((prev) => new Map(prev).set(field.key, value)),
    showAllFields: showAll.has(gateKey(gate)),
    onShowAllFields: () => setShowAll((prev) => new Set(prev).add(gateKey(gate))),
    elsewhere: elsewhereOf(gate),
    elsewhereOpen: elsewhereOpen.has(gateKey(gate)),
    onToggleElsewhere: () =>
      setElsewhereOpen((prev) => {
        const next = new Set(prev);
        if (next.has(gateKey(gate))) next.delete(gateKey(gate));
        else next.add(gateKey(gate));
        return next;
      }),
    checking: checking === gateKey(gate),
    saveError: saveError?.key === gateKey(gate) ? saveError : undefined,
    stillFailingRevision: stillFailing.get(gateKey(gate)),
    rechecking: rechecking === gateKey(gate),
    onSave: () => void save(gate, index),
    onDiscard: () => discard(gate),
    onRecheck: () => void recheck(gate),
    onOpenConfiguration,
    onFixInOrigin: (origin: FieldOrigin) => onFixInOrigin(origin, gate),
    isComponentSpace: (spaceId: string | undefined) =>
      !!spaceId && componentSpaceIds.includes(spaceId),
  });

  const openGates = shownGates.filter((g) => !g.cleared);
  const openGatesCount = openGates.length;
  const findings = openGates.reduce((n, g) => n + g.gate.findingCount, 0);
  const unitCount = new Set(openGates.flatMap((g) => g.gate.units.map((u) => u.unitId))).size;

  return (
    <Body data-testid='gates-tab'>
      {openGatesCount > 0 ? (
        <GatesSummary
          variant='blocked'
          spaceSlug={spaceSlug}
          openGates={openGates.length}
          findings={findings}
          units={unitCount}
          warnings={warnings.length}
          segments={shownGates.map((g) => !!g.cleared)}
        />
      ) : (
        <GatesSummary
          variant='ok'
          spaceSlug={spaceSlug}
          openGates={0}
          findings={0}
          units={0}
          warnings={warnings.length}
          segments={[]}
        />
      )}
      <ChangeSetAcknowledgements lock={lock} testId='gates-change-set' sx={{ my: 1 }} />
      <Box>
        {shownGates.map(({ gate, cleared: c }, i) => {
          const state: GateStepState = c ? 'cleared' : i === activeIndex ? 'open' : 'closed';
          const opened = activeIndex >= 0 ? activeIndex : firstOpenIndex;
          const note =
            i < opened
              ? 'Click the gate to open it.'
              : `Opens when gate ${opened + 1} is cleared.`;
          return (
            <GateStep
              key={gateKey(gate)}
              {...stepProps(gate, i)}
              label={String(i + 1)}
              state={state}
              closedNote={note}
              hasNext={i < shownGates.length - 1}
              clearedRevision={c?.revision}
            />
          );
        })}
      </Box>
      {shownWarnings.length > 0 && (
        <Box data-testid='warnings-section' sx={{ mt: '6px' }}>
          <WarningsHeader data-testid='warnings-header'>
            Warnings
            <Box
              component='span'
              sx={{ fontSize: 11.5, fontWeight: 600, color: componentTheme.fgSubtle }}
            >
              do not block
            </Box>
          </WarningsHeader>
          {shownWarnings.map(({ gate, cleared: c }, i) => (
            <GateStep
              key={gateKey(gate)}
              {...stepProps(gate, i)}
              label={`w${i + 1}`}
              state={c ? 'cleared' : gateKey(gate) === activeKey ? 'open' : 'closed'}
              closedNote='Click to open it. It does not block.'
              hasNext={i < shownWarnings.length - 1}
              clearedRevision={c?.revision}
            />
          ))}
        </Box>
      )}
    </Body>
  );
};
