// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  FunctionInvocationsResponse,
  FunctionSignature,
  Invocation,
} from '@confighub/rtk-query';
import { AttributeValueItem } from './utils/result-formatters';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { InlineSavePanel, SaveInvocationOptions as InlineSaveOptions } from './InlineSavePanel';
import { PanelContent, PanelFooter } from './styles/invoker.styles';
import {
  FunctionParameterFormData,
  InvokerContext,
  SaveInvocationOptions,
  InvocationHistoryItem,
} from './types/invoker.types';
import { useFuzzySearch } from './hooks/useFuzzySearch';
import { FunctionListScreen } from './screens/FunctionListScreen';
import { FunctionDetailScreen } from './screens/FunctionDetailScreen';
import { FunctionsByToolchain } from './utils/fuzzy-search.utils';

export interface InvokerContentProps {
  context: InvokerContext;
  functions: FunctionSignature[];
  savedInvocations: Invocation[];
  recentInvocations: InvocationHistoryItem[];
  selectedFunction: FunctionSignature | null;
  onSelectFunction: (func: FunctionSignature | null) => void;
  onSelectInvocation?: (invocation: Invocation | InvocationHistoryItem, functionName: string) => void;
  prefilledValues?: FunctionParameterFormData;
  loadedInvocation?: Invocation | null;
  onInvoke: (
    functionName: string,
    parameters: FunctionParameterFormData,
    dryRun: boolean,
    parameterizedInvocationId?: string,
  ) => Promise<void>;
  onSave: (
    options: SaveInvocationOptions,
    parameters: FunctionParameterFormData
  ) => Promise<{ success: boolean; error?: string }>;
  isInvoking?: boolean;
  invokeResult?: {
    success: boolean;
    message?: string;
    responses?: FunctionInvocationsResponse[];
    slugByUnitId?: Record<string, string>;
  } | null;
  onRemoveUnit?: (unitId: string) => void;
  onAddUnit?: (unit: { id: string; name: string; toolchainType: string; spaceId: string }) => void;
  onRemoveAllUnits?: () => void;
  onRestoreAllUnits?: () => void;
  toolchainFilter?: string | null;
  availableToolchainTypes?: string[];
  onToolchainFilterChange?: (filter: string | null) => void;
  onRemoveHistoryItem?: (id: string) => void;
  onDeleteSavedInvocation?: (invocationId: string) => void;
  functionsByToolchain?: FunctionsByToolchain;
  totalVisibleUnits?: number;
  onSaveAttributes?: (unitId: string, spaceId: string, attributes: AttributeValueItem[], changeDescription: string) => Promise<void>;
  isSavingAttributes?: boolean;
  /** Set when a page asked for a Trigger to be created in its Space */
  saveAsTrigger?: { requestSeq: number; spaceId: string; spaceName: string; onCancel: () => void };
}

export const InvokerContent = ({
  context,
  functions,
  savedInvocations,
  recentInvocations,
  selectedFunction,
  onSelectFunction,
  onSelectInvocation,
  prefilledValues,
  loadedInvocation,
  onInvoke,
  onSave,
  isInvoking = false,
  invokeResult,
  onRemoveUnit,
  onAddUnit,
  onRemoveAllUnits,
  onRestoreAllUnits,
  toolchainFilter,
  availableToolchainTypes,
  onToolchainFilterChange,
  onRemoveHistoryItem,
  onDeleteSavedInvocation,
  functionsByToolchain,
  totalVisibleUnits,
  onSaveAttributes,
  saveAsTrigger,
}: InvokerContentProps) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const savePanelRef = useRef<HTMLDivElement>(null);
  const resultsSectionRef = useRef<HTMLDivElement>(null);
  const [showInlineSavePanel, setShowInlineSavePanel] = useState(false);
  const [dryRun, setDryRun] = useState(false);

  // Scroll to results when invoke completes
  // Use a small delay to ensure the element is rendered before scrolling
  useEffect(() => {
    if (invokeResult && resultsSectionRef.current) {
      // Use requestAnimationFrame to wait for the DOM to update
      requestAnimationFrame(() => {
        resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [invokeResult]);

  // Scroll to save panel when it opens
  useEffect(() => {
    if (showInlineSavePanel && savePanelRef.current) {
      savePanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showInlineSavePanel]);

  // Create form with prefilled values - this will be fresh on each remount due to key prop
  const form = useForm<FunctionParameterFormData>({
    defaultValues: prefilledValues || {},
    mode: 'onChange',
  });

  // A parameterized Invocation declares its own parameter namespace. When one is
  // loaded, the user fills these declared parameters (in a separate form) rather
  // than the function-signature arguments, and we send ParameterizedInvocations.
  const invocationParamForm = useForm<FunctionParameterFormData>({
    defaultValues: {},
    mode: 'onChange',
  });
  const isParameterizedInvocation = !!(
    loadedInvocation?.InvocationID &&
    loadedInvocation.Parameters &&
    loadedInvocation.Parameters.length > 0
  );

  // Close save panel when going back to list
  if (!selectedFunction && showInlineSavePanel) {
    setShowInlineSavePanel(false);
  }

  // Creating a Trigger: the save panel is the point, so it opens with the function.
  const selectedFunctionName = selectedFunction?.FunctionName;
  const createTriggerRequestSeq = saveAsTrigger?.requestSeq;
  useEffect(() => {
    if (selectedFunctionName && createTriggerRequestSeq) {
      setShowInlineSavePanel(true);
    }
  }, [selectedFunctionName, createTriggerRequestSeq]);

  // Fuzzy search
  const { query, setQuery, results, savedResults, recentResults, hasResults } = useFuzzySearch({
    functions,
    savedInvocations,
    recentInvocations,
    functionsByToolchain,
    debounceMs: 200,
  });

  // Handle form submission. For a parameterized Invocation we validate and submit
  // its declared-parameter form and pass the InvocationID so the caller sends
  // ParameterizedInvocations; otherwise we submit the function-argument form.
  const onValidationError = (errors: unknown) => {
    console.error('Form validation errors:', errors);
  };
  const handleInvoke = isParameterizedInvocation
    ? invocationParamForm.handleSubmit(async (data) => {
        if (!selectedFunction?.FunctionName || !loadedInvocation?.InvocationID) return;
        await onInvoke(selectedFunction.FunctionName, data, dryRun, loadedInvocation.InvocationID);
      }, onValidationError)
    : form.handleSubmit(async (data) => {
        if (!selectedFunction?.FunctionName) return;
        await onInvoke(selectedFunction.FunctionName, data, dryRun);
      }, onValidationError);

  const handleSave = () => {
    setShowInlineSavePanel(true);
  };

  // Handle inline save panel save
  const handleInlineSave = async (options: InlineSaveOptions): Promise<{ success: boolean; error?: string }> => {
    const data = form.getValues();

    // Determine if we're updating based on the existing ID (invocation or trigger)
    const saveOptions = options.existingInvocationId
      ? {
        mode: 'overwrite' as const,
        invocationId: options.existingInvocationId,
      }
      : options.existingTriggerId
      ? {
        mode: 'overwrite' as const,
        triggerId: options.existingTriggerId,
      }
      : {
        mode: 'new' as const,
        displayName: options.name,
        spaceId: options.spaceId,
        type: options.type,
        toolchainType: options.toolchainType,
        eventType: options.eventType,
        disabled: options.disabled,
        enforced: options.enforced,
        labels: options.labels,
        annotations: options.annotations,
        bridgeWorkerId: options.bridgeWorkerId,
      };

    const result = await onSave(saveOptions, data);

    if (result?.success) {
      setShowInlineSavePanel(false);
    }

    return result ?? { success: false, error: 'No response from save' };
  };

  const canInvoke = context.selectedUnits?.length > 0;

  // With no Units to take it from, a saved function call is for a toolchain that has the function,
  // Kubernetes/YAML when it is one of them.
  const saveToolchainType = (() => {
    const fromContext = toolchainFilter || context.primaryToolchainType;
    const functionName = selectedFunction?.FunctionName;
    if (fromContext || !functionName || !functionsByToolchain) return fromContext || '';
    const withFunction = Object.keys(functionsByToolchain).filter(
      (toolchain) => !!functionsByToolchain[toolchain]?.[functionName],
    );
    return withFunction.includes('Kubernetes/YAML') ? 'Kubernetes/YAML' : withFunction[0] || '';
  })();

  return (
    <>
      {/* Content - Screen Routing */}
      <PanelContent
        sx={{
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {!selectedFunction ? (
          <Box sx={{ p: 2, flex: 1 }}>
            {saveAsTrigger && (
              <Alert
                severity="info"
                sx={{ mb: 2 }}
                data-testid="invoker-create-trigger-hint"
                action={
                  <Button color="inherit" size="small" onClick={saveAsTrigger.onCancel}>
                    Cancel
                  </Button>
                }
              >
                Pick a function and set its arguments to save it as a Trigger
                {saveAsTrigger.spaceName ? ` in Space ${saveAsTrigger.spaceName}` : ''}. Select Units
                to try it on them first.
              </Alert>
            )}
            <FunctionListScreen
              context={context}
              searchQuery={query}
              onSearchQueryChange={setQuery}
              searchResults={results}
              savedResults={savedResults}
              recentResults={recentResults}
              hasResults={hasResults}
              onSelectFunction={onSelectFunction}
              onSelectInvocation={onSelectInvocation}
              searchInputRef={searchInputRef}
              onRemoveUnit={onRemoveUnit}
              onAddUnit={onAddUnit}
              onRemoveAllUnits={onRemoveAllUnits}
              onRestoreAllUnits={onRestoreAllUnits}
              toolchainFilter={toolchainFilter}
              availableToolchainTypes={availableToolchainTypes}
              onToolchainFilterChange={onToolchainFilterChange}
              onRemoveHistoryItem={onRemoveHistoryItem}
              onDeleteSavedInvocation={onDeleteSavedInvocation}
              totalVisibleUnits={totalVisibleUnits}
            />
          </Box>
        ) : (
          <>
            <Box sx={{ p: 2, flex: 1 }}>
              <FunctionDetailScreen
                context={context}
                selectedFunction={selectedFunction}
                form={form}
                prefilledValues={prefilledValues}
                loadedInvocation={loadedInvocation}
                invocationParamForm={invocationParamForm}
                invokeResult={invokeResult}
                onRemoveUnit={onRemoveUnit}
                onRemoveAllUnits={onRemoveAllUnits}
                onRestoreAllUnits={onRestoreAllUnits}
                functionToolchainType={toolchainFilter || undefined}
                totalVisibleUnits={totalVisibleUnits}
                onSaveAttributes={onSaveAttributes}
                resultsSectionRef={resultsSectionRef}
              />
            </Box>

            {/* Footer - Sticky when panel closed, part of flow when open */}
            <PanelFooter
              sx={{
                position: showInlineSavePanel ? 'static' : 'sticky',
                bottom: 0,
                zIndex: 15,
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    size="small"
                  />
                }
                label="Dry Run"
                sx={{ ml: 1, mr: 0 }}
              />
              {!showInlineSavePanel && (
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleSave}
                >
                  Save
                </Button>
              )}

              <Button
                variant="contained"
                color="primary"
                startIcon={isInvoking ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                onClick={handleInvoke}
                disabled={!canInvoke || isInvoking || !selectedFunction}
                data-testid="invoker-invoke-button"
              >
                {isInvoking ? 'Invoking...' : 'Invoke'}
              </Button>
            </PanelFooter>

            {/* Inline Save Panel */}
            <Box ref={savePanelRef}>
              <InlineSavePanel
                open={showInlineSavePanel}
                onSave={handleInlineSave}
                onClose={() => setShowInlineSavePanel(false)}
                defaultName={loadedInvocation?.DisplayName || selectedFunction?.FunctionName}
                loadedInvocation={loadedInvocation}
                defaultToolchainType={saveToolchainType}
                availableToolchainTypes={availableToolchainTypes}
                defaultSpaceId={saveAsTrigger?.spaceId || context.selectedUnits?.[0]?.spaceId}
                defaultSaveType={saveAsTrigger ? 'trigger' : 'invocation'}
                presetKey={saveAsTrigger?.requestSeq}
              />
            </Box>
          </>
        )}
      </PanelContent>
    </>
  );
};

// Export the header content renderer as a separate component for use in ResizableInvoker
export const InvokerHeaderContent = ({
  selectedFunction,
  onSelectFunction,
}: {
  selectedFunction: FunctionSignature | null;
  context: InvokerContext;
  onSelectFunction: (func: FunctionSignature | null) => void;
}) => (
  <>
    {selectedFunction && (
      <IconButton
        onClick={() => onSelectFunction(null)}
        size="small"
        aria-label="Back"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <ArrowBackIcon fontSize="small" />
      </IconButton>
    )}
  </>
);
