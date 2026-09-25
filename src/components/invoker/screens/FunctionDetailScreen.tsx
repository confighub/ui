// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Fade,
  InputBase,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import UndoIcon from '@mui/icons-material/Undo';
import { UseFormReturn } from 'react-hook-form';
import { FunctionInvocationsResponse, FunctionSignature, Invocation } from '@confighub/rtk-query';
import { FunctionParameterForm } from '../FunctionParameterForm';
import { InvokerContextDisplay } from '../InvokerContextDisplay';
import { PerUnitResultCard } from '../components/PerUnitResultCard';
import type { UnitDiff } from '../utils/diff-from-revisions';
import { useColumnResize } from '@/pages/x/apps/useColumnResize';
import { componentTheme } from '@/pages/x/apps/componentTheme';
import { InvokerContext, FunctionParameterFormData } from '../types/invoker.types';
import {
  AttributeValueItem,
  AttributeValueItemWithUnit,
  FormattedErrorDisplay,
  ResultsViewMode,
  combineAttributeResultsFlat,
  combineValidationResultsFlat,
  combineValidationResultsPivot,
} from '../utils/result-formatters';
import { AttributeValueDataGrid } from '../utils/AttributeValueDataGrid';
import { AttributeValueTreeComparison } from '../utils/AttributeValueTreeComparison';
import { ValidationResultDataGrid } from '../utils/ValidationResultDataGrid';
import { ValidationResultPivotGrid } from '../utils/ValidationResultPivotGrid';
import { invokerTheme } from '../utils/invokerTheme';
import { invocationFunctions } from '@/utility/invocation-functions';

// Component for combined flat view with editing support
interface CombinedFlatViewWithEditingProps {
  combinedFlatResults: AttributeValueItemWithUnit[];
  unitSlugs: string[];
  canEdit: boolean;
  editingIndex: number | null;
  pendingChanges: Map<number, unknown>;
  undoStack: { index: number; previousValue: unknown }[];
  onStartEdit: (index: number) => void;
  onSaveEdit: (index: number, newValue: unknown) => void;
  onCancelEdit: () => void;
  onUndo: () => void;
  onSaveAll: (changeDescription: string) => Promise<void>;
  onDiscardAll: () => void;
}

const CombinedFlatViewWithEditing = ({
  combinedFlatResults,
  unitSlugs,
  canEdit,
  editingIndex,
  pendingChanges,
  undoStack,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onUndo,
  onSaveAll,
  onDiscardAll,
}: CombinedFlatViewWithEditingProps) => {
  const [showCommitMessage, setShowCommitMessage] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const isDirty = pendingChanges.size > 0;

  const handleSaveClick = () => {
    if (!showCommitMessage) {
      setShowCommitMessage(true);
    } else {
      handleConfirmSave();
    }
  };

  const handleConfirmSave = async () => {
    setSaveStatus('saving');
    try {
      await onSaveAll(commitMessage || 'Updated attributes via function invoker');
      setSaveStatus('saved');
      setShowCommitMessage(false);
      setCommitMessage('');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('idle');
    }
  };

  const handleDiscardAll = () => {
    onDiscardAll();
    setShowCommitMessage(false);
    setCommitMessage('');
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        {canEdit && isDirty ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={onUndo}
              disabled={saveStatus === 'saving' || undoStack.length === 0}
              startIcon={<UndoIcon sx={{ fontSize: 14 }} />}
              sx={{
                textTransform: 'none',
                fontSize: 12,
                fontFamily: componentTheme.fontSans,
                px: 1.5,
                height: 28,
                borderRadius: `${componentTheme.radiusSm}px`,
                borderColor: componentTheme.borderDefault,
                color: componentTheme.fgDefault,
                backgroundColor: componentTheme.bgDefault,
                '&:hover': { backgroundColor: componentTheme.bgSubtle, borderColor: componentTheme.borderDefault },
              }}
            >
              Undo
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handleDiscardAll}
              disabled={saveStatus === 'saving'}
              sx={{
                textTransform: 'none',
                fontSize: 12,
                fontFamily: componentTheme.fontSans,
                px: 1.5,
                height: 28,
                borderRadius: `${componentTheme.radiusSm}px`,
                borderColor: componentTheme.borderDefault,
                color: componentTheme.fgDefault,
                backgroundColor: componentTheme.bgDefault,
                '&:hover': { backgroundColor: componentTheme.bgSubtle, borderColor: componentTheme.borderDefault },
              }}
            >
              Discard
            </Button>
            {showCommitMessage && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  border: `1px solid ${componentTheme.borderDefault}`,
                  borderRadius: `${componentTheme.radiusSm}px`,
                  '&:focus-within': {
                    borderColor: '#ba3d03',
                    outline: `1px solid #ba3d03`,
                    outlineOffset: 0,
                  },
                  height: 28,
                  px: 1,
                  minWidth: 200,
                  backgroundColor: componentTheme.bgDefault,
                }}
              >
                <InputBase
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmSave();
                    } else if (e.key === 'Escape') {
                      setShowCommitMessage(false);
                      setCommitMessage('');
                    }
                  }}
                  placeholder="Change description (optional)"
                  autoFocus
                  disabled={saveStatus === 'saving'}
                  sx={{
                    fontSize: 12,
                    fontFamily: componentTheme.fontSans,
                    color: componentTheme.fgDefault,
                    flex: 1,
                    '& input': { padding: 0 },
                    '&::placeholder': { color: componentTheme.fgSubtle },
                  }}
                />
              </Box>
            )}
            <Button
              size="small"
              variant="contained"
              onClick={handleSaveClick}
              disabled={saveStatus === 'saving'}
              sx={{
                textTransform: 'none',
                fontSize: 12,
                fontFamily: componentTheme.fontSans,
                fontWeight: 600,
                px: 1.5,
                height: 28,
                borderRadius: `${componentTheme.radiusSm}px`,
                backgroundColor: '#ba3d03',
                color: componentTheme.fgOnEmphasis,
                boxShadow: 'none',
                '&:hover': { backgroundColor: '#8c2c00', boxShadow: 'none' },
              }}
            >
              {saveStatus === 'saving' ? 'Saving…' : showCommitMessage ? 'Confirm Save' : 'Save Changes'}
            </Button>
          </Box>
        ) : saveStatus === 'saved' ? (
          <Chip
            label="Saved"
            size="small"
            color="success"
            icon={<CheckCircleIcon />}
            sx={{ fontSize: '0.75rem' }}
          />
        ) : (
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Combined Attribute Values ({combinedFlatResults.length} items across {unitSlugs.length} units)
          </Typography>
        )}
        {(canEdit && isDirty) && (
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Combined Attribute Values ({combinedFlatResults.length} items across {unitSlugs.length} units)
          </Typography>
        )}
      </Box>
      <AttributeValueDataGrid
        attributeValues={combinedFlatResults}
        editable={canEdit}
        editingIndex={editingIndex}
        pendingChanges={pendingChanges}
        undoStack={undoStack}
        onStartEdit={onStartEdit}
        onSaveEdit={onSaveEdit}
        onCancelEdit={onCancelEdit}
        onUndo={onUndo}
        showUnitColumn={true}
      />
    </Box>
  );
};


export interface FunctionDetailScreenProps {
  context: InvokerContext;
  selectedFunction: FunctionSignature;
  form: UseFormReturn<FunctionParameterFormData>;
  prefilledValues?: FunctionParameterFormData;
  /** The stored Invocation, when the detail screen was opened from a saved one. */
  loadedInvocation?: Invocation | null;
  /** Form for a parameterized Invocation's declared parameters. */
  invocationParamForm?: UseFormReturn<FunctionParameterFormData>;
  invokeResult?: {
    success: boolean;
    message?: string;
    responses?: FunctionInvocationsResponse[];
    diffs?: UnitDiff[];
    slugByUnitId?: Record<string, string>;
  } | null;
  onRemoveUnit?: (unitId: string) => void;
  onRemoveAllUnits?: () => void;
  onRestoreAllUnits?: () => void;
  functionToolchainType?: string;
  totalVisibleUnits?: number;
  onSaveAttributes?: (unitId: string, spaceId: string, attributes: AttributeValueItem[], changeDescription: string) => Promise<void>;
  resultsSectionRef?: RefObject<HTMLDivElement | null>;
}

export const FunctionDetailScreen = ({
  context,
  selectedFunction,
  form,
  prefilledValues,
  loadedInvocation,
  invocationParamForm,
  invokeResult,
  onRemoveUnit,
  onRemoveAllUnits,
  onRestoreAllUnits,
  functionToolchainType,
  totalVisibleUnits,
  onSaveAttributes,
  resultsSectionRef,
}: FunctionDetailScreenProps) => {
  // A parameterized Invocation declares its own parameters; render those (into
  // invocationParamForm) instead of the function-signature arguments.
  const isParameterized = !!(
    loadedInvocation?.InvocationID &&
    loadedInvocation.Parameters &&
    loadedInvocation.Parameters.length > 0 &&
    invocationParamForm
  );
  // The stored arguments of every function the Invocation calls, flattened for the read-only
  // Definition section. The function name qualifies each argument when there is more than one.
  const definitionRows = invocationFunctions(loadedInvocation).flatMap((fn, fnIndex, all) =>
    (fn.Arguments ?? []).map((arg, argIndex) => {
      const name = arg.ParameterName || `arg${argIndex}`;
      return {
        key: `${fnIndex}-${argIndex}`,
        label: all.length > 1 ? `${fn.FunctionName ?? ''}.${name}` : name,
        value: arg.Value === undefined || arg.Value === null ? '(empty)' : String(arg.Value),
      };
    }),
  );
  // Results view mode state - default to combined-flat when there are attribute outputs
  const [resultsViewMode, setResultsViewMode] = useState<ResultsViewMode>('individual');

  // Shared diff-column resize state so every per-unit card aligns its tree
  // columns identically.
  const { columnStyle, onDividerMouseDown, isDragging } = useColumnResize();

  // Index diffs by UnitID so each card can look up its own diff in O(1).
  const diffByUnitId = useMemo(() => {
    const map = new Map<string, UnitDiff>();
    invokeResult?.diffs?.forEach((d) => map.set(d.unitId, d));
    return map;
  }, [invokeResult?.diffs]);

  // Update view mode when results change
  useEffect(() => {
    // Default to combined-flat view whenever there are attribute or validation outputs (regardless of unit count)
    const hasAttrs = invokeResult?.responses?.some((response) => {
      if (!response.Outputs) return false;
      return Object.keys(response.Outputs).some(
        (key) => key === 'AttributeValueList' || key.toLowerCase().includes('attribute')
      );
    });

    const hasValidations = invokeResult?.responses?.some((response) => {
      if (!response.Outputs) return false;
      return Object.keys(response.Outputs).some(
        (key) => key === 'ValidationResult' || key === 'ValidationResultList'
      );
    });

    if (hasAttrs || hasValidations) {
      setResultsViewMode('combined-flat');
    } else {
      setResultsViewMode('individual');
    }
  }, [invokeResult?.responses]);

  // Check if there are attribute value outputs to display in combined view
  const hasAttributeOutputs = useMemo(() => {
    if (!invokeResult?.responses) return false;
    return invokeResult.responses.some((response) => {
      if (!response.Outputs) return false;
      return Object.keys(response.Outputs).some(
        (key) => key === 'AttributeValueList' || key.toLowerCase().includes('attribute')
      );
    });
  }, [invokeResult?.responses]);

  // Check if there are validation result outputs to display in combined view
  const hasValidationOutputs = useMemo(() => {
    if (!invokeResult?.responses) return false;
    return invokeResult.responses.some((response) => {
      if (!response.Outputs) return false;
      return Object.keys(response.Outputs).some(
        (key) => key === 'ValidationResult' || key === 'ValidationResultList'
      );
    });
  }, [invokeResult?.responses]);

  // Combined flat results
  const combinedFlatResults = useMemo(() => {
    if (!invokeResult?.responses || !context.unitIdToSlugMap) return [];
    return combineAttributeResultsFlat(invokeResult.responses, context.unitIdToSlugMap);
  }, [invokeResult?.responses, context.unitIdToSlugMap]);

  // Unique unit slugs derived from flat results (for display counts)
  const combinedUnitSlugs = useMemo(
    () => [...new Set(combinedFlatResults.map((r) => r.unitSlug))],
    [combinedFlatResults],
  );

  // Combined validation flat results
  const combinedValidationFlatResults = useMemo(() => {
    if (!invokeResult?.responses || !context.unitIdToSlugMap) return [];
    return combineValidationResultsFlat(invokeResult.responses, context.unitIdToSlugMap);
  }, [invokeResult?.responses, context.unitIdToSlugMap]);

  // Combined validation pivot results
  const { pivotRows: validationPivotRows, unitSlugs: validationUnitSlugs } = useMemo(() => {
    if (!invokeResult?.responses || !context.unitIdToSlugMap) {
      return { pivotRows: [], unitSlugs: [] };
    }

    return combineValidationResultsPivot(invokeResult.responses, context.unitIdToSlugMap);
  }, [invokeResult?.responses, context.unitIdToSlugMap]);

  // Combined flat view editing state
  const [combinedEditingIndex, setCombinedEditingIndex] = useState<number | null>(null);
  const [combinedPendingChanges, setCombinedPendingChanges] = useState<Map<number, unknown>>(new Map());
  const [combinedUndoStack, setCombinedUndoStack] = useState<{ index: number; previousValue: unknown }[]>([]);

  // Reset combined editing state when results change
  useEffect(() => {
    setCombinedEditingIndex(null);
    setCombinedPendingChanges(new Map());
    setCombinedUndoStack([]);
  }, [invokeResult?.responses]);

  // Check if editing is allowed for combined view (need onSaveAttributes)
  const canEditCombined = !!onSaveAttributes;

  const handleCombinedStartEdit = useCallback((index: number) => {
    setCombinedEditingIndex(index);
  }, []);

  const handleCombinedCancelEdit = useCallback(() => {
    setCombinedEditingIndex(null);
  }, []);

  const handleCombinedSaveEdit = useCallback((index: number, newValue: unknown) => {
    // Get the previous value (either from pending changes or original)
    const previousValue = combinedPendingChanges.has(index)
      ? combinedPendingChanges.get(index)
      : combinedFlatResults[index]?.Value;

    // Add to undo stack
    setCombinedUndoStack((prev) => [...prev, { index, previousValue }]);

    // Update pending changes
    setCombinedPendingChanges((prev) => {
      const newChanges = new Map(prev);
      newChanges.set(index, newValue);
      return newChanges;
    });
    setCombinedEditingIndex(null);
  }, [combinedPendingChanges, combinedFlatResults]);

  const handleCombinedUndo = useCallback(() => {
    if (combinedUndoStack.length === 0) return;

    const lastEntry = combinedUndoStack[combinedUndoStack.length - 1];

    // Remove from undo stack
    setCombinedUndoStack((prev) => prev.slice(0, -1));

    // Restore the previous value
    setCombinedPendingChanges((prev) => {
      const newChanges = new Map(prev);
      // If the previous value was the original, remove from pending changes
      if (lastEntry.previousValue === combinedFlatResults[lastEntry.index]?.Value) {
        newChanges.delete(lastEntry.index);
      } else {
        newChanges.set(lastEntry.index, lastEntry.previousValue);
      }
      return newChanges;
    });
  }, [combinedUndoStack, combinedFlatResults]);

  // Save all pending changes in combined view - groups by unit
  const handleCombinedSaveAll = useCallback(async (changeDescription: string) => {
    if (!onSaveAttributes || combinedPendingChanges.size === 0) return;

    // Group changes by unit
    const changesByUnit = new Map<string, { unitId: string; spaceId: string; attributes: AttributeValueItem[] }>();

    for (const [index, newValue] of combinedPendingChanges) {
      const item = combinedFlatResults[index];
      if (!item?.unitId || !item.spaceId) continue;

      const key = `${item.unitId}:${item.spaceId}`;
      if (!changesByUnit.has(key)) {
        // Get all attributes for this unit (with pending changes applied)
        const unitAttributes = combinedFlatResults
          .map((attr, idx) => {
            if (attr.unitId !== item.unitId) return null;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { unitSlug, unitId, spaceId, ...baseAttr } = attr;
            if (combinedPendingChanges.has(idx)) {
              return { ...baseAttr, Value: combinedPendingChanges.get(idx) };
            }
            return baseAttr;
          })
          .filter((a): a is AttributeValueItem => a !== null);

        changesByUnit.set(key, {
          unitId: item.unitId,
          spaceId: item.spaceId,
          attributes: unitAttributes,
        });
      } else {
        // Update the attribute in the existing entry
        const entry = changesByUnit.get(key)!;
        const attrIndex = entry.attributes.findIndex(
          (a) =>
            a.AttributeName === item.AttributeName &&
            a.Path === item.Path &&
            a.ResourceType === item.ResourceType &&
            a.ResourceName === item.ResourceName
        );
        if (attrIndex >= 0) {
          entry.attributes[attrIndex] = { ...entry.attributes[attrIndex], Value: newValue };
        }
      }
    }

    // Save each unit's changes
    const savePromises = Array.from(changesByUnit.values()).map(({ unitId, spaceId, attributes }) =>
      onSaveAttributes(unitId, spaceId, attributes, changeDescription)
    );

    await Promise.all(savePromises);

    // Clear pending changes after successful save
    setCombinedPendingChanges(new Map());
    setCombinedUndoStack([]);
  }, [onSaveAttributes, combinedPendingChanges, combinedFlatResults]);

  return (
    <>
      {/* Context Display */}
      <InvokerContextDisplay
        context={context}
        defaultExpanded={false}
        onRemoveUnit={onRemoveUnit}
        onRemoveAllUnits={onRemoveAllUnits}
        onRestoreAllUnits={onRestoreAllUnits}
        functionToolchainType={functionToolchainType}
        totalVisibleUnits={totalVisibleUnits}
      />

      {/* Function Details — flat header matching component theme */}
      <Box
        sx={{
          py: 1.25,
          borderBottom: `1px solid ${componentTheme.borderDefault}`,
        }}
      >
        {loadedInvocation && (loadedInvocation.DisplayName || loadedInvocation.Slug) && (
          <Typography
            sx={{
              mb: 0.25,
              fontFamily: componentTheme.fontSans,
              fontWeight: 600,
              fontSize: 12,
              color: componentTheme.accent,
            }}
          >
            {loadedInvocation.DisplayName || loadedInvocation.Slug}
          </Typography>
        )}
        <Typography
          sx={{
            fontFamily: componentTheme.fontSans,
            fontWeight: 600,
            fontSize: 14,
            color: componentTheme.fgDefault,
          }}
        >
          {selectedFunction.FunctionName}
        </Typography>
        {selectedFunction.Description && (
          <Typography
            sx={{
              mt: 0.25,
              fontFamily: componentTheme.fontSans,
              fontSize: 12,
              color: componentTheme.fgMuted,
            }}
          >
            {selectedFunction.Description}
          </Typography>
        )}
        {(() => {
          const traits: { label: string; color: string }[] = [];
          if (selectedFunction.Mutating) traits.push({ label: 'Mutating', color: componentTheme.attention });
          if (selectedFunction.Validating) traits.push({ label: 'Validating', color: componentTheme.accent });
          if (selectedFunction.Idempotent) traits.push({ label: 'Idempotent', color: componentTheme.success });
          if (traits.length === 0) return null;
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75, flexWrap: 'wrap' }}>
              {traits.map((trait, idx) => (
                <Box key={trait.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography
                    sx={{
                      fontFamily: componentTheme.fontSans,
                      fontWeight: 600,
                      fontSize: 10,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      color: trait.color,
                    }}
                  >
                    {trait.label}
                  </Typography>
                  {idx < traits.length - 1 && (
                    <Typography sx={{ fontSize: 10, color: componentTheme.fgSubtle }}>·</Typography>
                  )}
                </Box>
              ))}
            </Box>
          );
        })()}
      </Box>

      {/* Definition — for a parameterized Invocation, show the fixed stored
          arguments (the yq expression and the templated param mappings) read-only
          so it's clear what the Invocation does before supplying parameters. */}
      {isParameterized && definitionRows.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography
            sx={{
              mb: 1,
              fontFamily: componentTheme.fontSans,
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: componentTheme.fgMuted,
            }}
          >
            Definition
          </Typography>
          <Box
            sx={{
              p: 1,
              borderRadius: 1,
              backgroundColor: componentTheme.bgSubtle,
              border: `1px solid ${componentTheme.borderDefault}`,
              fontFamily: componentTheme.fontMono,
              fontSize: 11,
              lineHeight: 1.5,
              color: componentTheme.fgDefault,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            {definitionRows.map((row, idx) => (
              <Box key={row.key} sx={{ mb: idx === definitionRows.length - 1 ? 0 : 0.5 }}>
                <Box component="span" sx={{ color: componentTheme.fgMuted, mr: 0.5 }}>
                  {row.label}:
                </Box>
                {row.value}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Parameter Form — declared Invocation parameters when parameterized,
          otherwise the function-signature arguments. */}
      {(isParameterized || (selectedFunction.Parameters && selectedFunction.Parameters.length > 0)) && (
        <Box sx={{ mt: 2 }}>
          <Typography
            sx={{
              mb: 1,
              fontFamily: componentTheme.fontSans,
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: componentTheme.fgMuted,
            }}
          >
            Parameters
          </Typography>
          {isParameterized && invocationParamForm ? (
            <FunctionParameterForm
              parameters={loadedInvocation?.Parameters}
              form={invocationParamForm}
            />
          ) : (
            <FunctionParameterForm
              selectedFunction={selectedFunction}
              form={form}
              prefilledValues={prefilledValues}
            />
          )}
        </Box>
      )}

      {/* Invocation Result */}
      {invokeResult && (
        <ThemeProvider theme={invokerTheme}>
        <Fade in>
          <Box ref={resultsSectionRef} sx={{ mt: 3 }}>
            {/* Lean result banner — matches the per-unit card vocabulary:
                colored dot + headline + muted message, with a thin accent
                bar on failures to keep the error prominent. */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.75,
                py: 1,
                pl: invokeResult.success ? 0 : 1.25,
                borderLeft: invokeResult.success ? 'none' : `2px solid ${componentTheme.danger}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Box
                  aria-hidden
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flexShrink: 0,
                    backgroundColor: invokeResult.success ? componentTheme.success : componentTheme.danger,
                  }}
                />
                <Typography
                  sx={{
                    fontFamily: componentTheme.fontSans,
                    fontWeight: 600,
                    fontSize: 13,
                    color: invokeResult.success ? componentTheme.success : componentTheme.danger,
                  }}
                >
                  {invokeResult.success ? 'All invocations succeeded' : 'Invocation failed'}
                </Typography>
                {invokeResult.message && (
                  invokeResult.success ? (
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: componentTheme.fontSans,
                        color: componentTheme.fgMuted,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {invokeResult.message}
                    </Typography>
                  ) : (
                    <Box sx={{ flex: '1 1 100%', mt: 0.25 }}>
                      <FormattedErrorDisplay message={invokeResult.message} />
                    </Box>
                  )
                )}
              </Box>
              {!invokeResult.success && invokeResult.responses && (() => {
                const firstError = invokeResult.responses.find((r) => r.Error);
                if (!firstError?.Error) return null;
                const showMessage =
                  firstError.Error.Message && firstError.Error.Message !== invokeResult.message;
                const details = firstError.Error.Details ?? [];
                if (!showMessage && details.length === 0) return null;
                return (
                  <Box sx={{ pl: 2.25, fontFamily: componentTheme.fontSans }}>
                    {showMessage && (
                      <Typography sx={{ fontSize: 12, color: componentTheme.fgDefault }}>
                        {firstError.Error.Message}
                      </Typography>
                    )}
                    {details.slice(0, 3).map((detail, idx) => (
                      <Typography
                        key={idx}
                        sx={{ fontSize: 12, color: componentTheme.fgMuted, mt: 0.25 }}
                      >
                        • {detail}
                      </Typography>
                    ))}
                    {details.length > 3 && (
                      <Typography
                        variant="caption"
                        sx={{
                          mt: 0.5,
                          display: 'block',
                          color: componentTheme.fgSubtle,
                          fontFamily: componentTheme.fontSans,
                        }}
                      >
                        +{details.length - 3} more details below
                      </Typography>
                    )}
                  </Box>
                );
              })()}
            </Box>

            {/* Detailed Results */}
            {invokeResult.responses && invokeResult.responses.length > 0 && (
              <Box sx={{ mt: 2 }}>
                {/* View Mode Toggle - show whenever there are attribute or validation outputs */}
                {(hasAttributeOutputs || hasValidationOutputs) && (
                  <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Typography
                      sx={{
                        fontFamily: componentTheme.fontSans,
                        fontWeight: 600,
                        fontSize: 10,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        color: componentTheme.fgMuted,
                      }}
                    >
                      View
                    </Typography>
                    <ToggleButtonGroup
                      value={resultsViewMode}
                      exclusive
                      onChange={(_, newMode) => {
                        if (newMode !== null) setResultsViewMode(newMode);
                      }}
                      size="small"
                      sx={{
                        '& .MuiToggleButton-root': {
                          textTransform: 'none',
                          fontSize: 11,
                          fontFamily: componentTheme.fontSans,
                          lineHeight: 1.4,
                          px: 1,
                          py: 0.25,
                          border: `1px solid ${componentTheme.borderDefault}`,
                          color: componentTheme.fgMuted,
                          '&:hover': {
                            backgroundColor: componentTheme.bgSubtle,
                          },
                          '&.Mui-selected': {
                            color: componentTheme.fgDefault,
                            backgroundColor: componentTheme.bgSubtle,
                            fontWeight: 600,
                            '&:hover': {
                              backgroundColor: componentTheme.bgInset,
                            },
                          },
                        },
                      }}
                    >
                      <ToggleButton value="individual">Individual</ToggleButton>
                      <ToggleButton value="combined-flat">Flat</ToggleButton>
                      <ToggleButton value="combined-tree">Tree</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                )}

                {/* Combined Flat View */}
                {resultsViewMode === 'combined-flat' && hasAttributeOutputs && combinedFlatResults.length > 0 && (
                  <CombinedFlatViewWithEditing
                    combinedFlatResults={combinedFlatResults}
                    unitSlugs={combinedUnitSlugs}
                    canEdit={canEditCombined}
                    editingIndex={combinedEditingIndex}
                    pendingChanges={combinedPendingChanges}
                    undoStack={combinedUndoStack}
                    onStartEdit={handleCombinedStartEdit}
                    onSaveEdit={handleCombinedSaveEdit}
                    onCancelEdit={handleCombinedCancelEdit}
                    onUndo={handleCombinedUndo}
                    onSaveAll={handleCombinedSaveAll}
                    onDiscardAll={() => {
                      setCombinedPendingChanges(new Map());
                      setCombinedUndoStack([]);
                      setCombinedEditingIndex(null);
                    }}
                  />
                )}

                {/* Combined Tree View */}
                {resultsViewMode === 'combined-tree' && hasAttributeOutputs && combinedFlatResults.length > 0 && (
                  <AttributeValueTreeComparison
                    items={combinedFlatResults}
                    editable={canEditCombined}
                    onSaveAttributes={onSaveAttributes}
                  />
                )}

                {/* Validation Results in Combined Views */}
                {hasValidationOutputs && (
                  <Box sx={{ mt: hasAttributeOutputs ? 3 : 0 }}>
                    {hasAttributeOutputs && (
                      <Typography variant="h6" sx={{ mb: 2, fontSize: '1rem', fontWeight: 600 }}>
                        Validation Results
                      </Typography>
                    )}

                    {/* Combined Flat View for Validations */}
                    {resultsViewMode === 'combined-flat' && combinedValidationFlatResults.length > 0 && (
                      <ValidationResultDataGrid
                        validationResults={combinedValidationFlatResults}
                        showUnitColumn={true}
                      />
                    )}

                    {/* Combined Tree View for Validations - use pivot grid */}
                    {resultsViewMode === 'combined-tree' && validationPivotRows.length > 0 && (
                      <ValidationResultPivotGrid
                        pivotRows={validationPivotRows}
                        unitSlugs={validationUnitSlugs}
                      />
                    )}
                  </Box>
                )}

                {/* Per-unit cards — one section per response, combining the
                    status dot, field-level diff tree, error details, and
                    output renderers into a single unified card. Replaces the
                    old accordion view. */}
                {(resultsViewMode === 'individual' || (!hasAttributeOutputs && !hasValidationOutputs)) && invokeResult.responses.map((response, index) => {
                  const unitDisplay = response.UnitID
                    ? invokeResult.slugByUnitId?.[response.UnitID]
                      || context.unitIdToSlugMap?.[response.UnitID]
                      || response.UnitID
                    : `Result ${index + 1}`;
                  const diff = response.UnitID ? diffByUnitId.get(response.UnitID) : undefined;
                  return (
                    <PerUnitResultCard
                      key={response.UnitID ?? index}
                      response={response}
                      diff={diff}
                      unitDisplay={unitDisplay}
                      columnStyle={columnStyle}
                      onDividerMouseDown={onDividerMouseDown}
                      isDragging={isDragging}
                      onSaveAttributes={onSaveAttributes}
                    />
                  );
                })}
              </Box>
            )}
          </Box>
        </Fade>
        </ThemeProvider>
      )}
    </>
  );
};
