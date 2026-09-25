// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Custom hook for managing trigger creation form state and business logic
import { useEffect, useState } from 'react';
import type { UseFormReset, UseFormSetValue, UseFormWatch } from 'react-hook-form';

import { useAnalytics } from '@/hooks/useAnalytics';
import {
  TriggerRead,
  useCreateTriggerMutation,
  useUpdateTriggerMutation,
} from '@confighub/rtk-query';
import type { FunctionInvocation, FunctionSignature } from '@confighub/rtk-query';
import { ENTITY_TYPES } from '@/utility/analytics-constants';

// Form input interface - defines the structure of our form data
export interface IAddTriggerFormInput {
  BridgeWorkerID?: string;
  Slug: string;
  Labels?: Array<{ key: string; value: string; id: string }>;
  Annotations?: Array<{ key: string; value: string; id: string }>;
  DeleteGates?: Record<string, boolean>;
  EventType: 'Mutation' | 'PostClone';
  FunctionName: string;
  ToolchainType: 'Kubernetes/YAML';
  Disabled?: boolean;
  Warn?: boolean;
}

/**
 * Transforms the functions object into a flat array of options for the autocomplete
 * Filters to only show functions that are either Mutating or Validating or that return
 * AttributeValueList.
 */
const getFunctionOptions = (functions: FunctionInvocation) => {
  return (
    Object.entries(functions)
      ?.flatMap(([category, funcs]) =>
        Object.values(funcs as FunctionSignature[]).map((func) => ({
          category,
          ...func,
        })),
      )
      .filter(
        (func) =>
          func.Mutating ||
          func.Validating ||
          func.OutputInfo?.OutputType == 'AttributeValueList',
      ) || []
  );
};

/**
 * Custom hook for managing the Add/Edit Trigger form
 * Handles form state, function selection, argument management, and API submission
 *
 * @param orgID - Organization ID for the trigger
 * @param spaceId - Space ID where the trigger will be created
 * @param existingTrigger - Optional existing trigger for edit mode
 */
export const useAddTrigger = (
  orgID: string,
  spaceId: string,
  existingTrigger: TriggerRead | undefined,
  formApi: {
    setValue: UseFormSetValue<IAddTriggerFormInput>;
    watch: UseFormWatch<IAddTriggerFormInput>;
    reset: UseFormReset<IAddTriggerFormInput>;
  },
) => {
  // State
  const [serverError, setServerError] = useState<string>('');
  const [selectedFunction, setSelectedFunction] = useState<FunctionSignature>({});

  // Argument values state - simple key-value store for function argument inputs
  // This is separate from form state to avoid complex form array management
  const [argumentValues, setArgumentValues] = useState<Record<string, string>>({});

  const [addTrigger, { isSuccess: isCreateSuccess, data: createData, error: createError }] =
    useCreateTriggerMutation();
  const [
    updateTrigger,
    { isSuccess: isUpdateSuccess, data: updateData, error: updateError },
  ] = useUpdateTriggerMutation();
  const { trackEntityCreated } = useAnalytics();

  const isSuccess = existingTrigger ? isUpdateSuccess : isCreateSuccess;
  const data = existingTrigger ? updateData : createData;
  const error = existingTrigger ? updateError : createError;

  const { setValue, watch, reset } = formApi;

  // Initialize form with existing trigger data when in edit mode
  useEffect(() => {
    if (existingTrigger) {
      // Initialize basic fields
      const initialForm: IAddTriggerFormInput = {
        Slug: existingTrigger.Slug || '',
        EventType: (existingTrigger.Event as 'Mutation' | 'PostClone') || 'Mutation',
        BridgeWorkerID: existingTrigger.BridgeWorkerID || '',
        FunctionName: existingTrigger.FunctionName || '',
        ToolchainType: (existingTrigger.ToolchainType as 'Kubernetes/YAML') || 'Kubernetes/YAML',
        Disabled: existingTrigger.Disabled || false,
        Warn: existingTrigger.Warn || false,
        Labels:
          Object.entries(existingTrigger.Labels || {}).map(([key, value]) => ({
            id: `${key}-${value}-${Date.now()}`,
            key,
            value,
          })) || [],
        Annotations:
          Object.entries(existingTrigger.Annotations || {}).map(([key, value]) => ({
            id: `${key}-${value}-${Date.now()}`,
            key,
            value,
          })) || [],
        DeleteGates: existingTrigger.DeleteGates || {},
      };

      reset(initialForm);

      // Initialize arguments from existing trigger
      if (existingTrigger.Arguments && existingTrigger.Arguments.length > 0) {
        const initialArguments = existingTrigger.Arguments.reduce(
          (acc, arg) => {
            if (arg.ParameterName && arg.Value) {
              acc[arg.ParameterName] = String(arg.Value);
            }
            return acc;
          },
          {} as Record<string, string>,
        );

        setArgumentValues(initialArguments);

        // Also set form values for each parameter so they show in FunctionParametersField
        Object.entries(initialArguments).forEach(([paramName, value]) => {
          setValue(paramName as keyof IAddTriggerFormInput & string, value);
        });
      }
    }
  }, [existingTrigger, reset, setValue]);

  // Custom hook for handling labels, annotations, and delete gates key-value pairs
  const [newLabelKey, setNewLabelKey] = useState('');
  const [newLabelValue, setNewLabelValue] = useState('');
  const [newAnnotationKey, setNewAnnotationKey] = useState('');
  const [newAnnotationValue, setNewAnnotationValue] = useState('');
  const [newDeleteGateKey, setNewDeleteGateKey] = useState('');

  const labels = watch('Labels') || [];
  const annotations = watch('Annotations') || [];

  const addLabel = () => {
    if (!newLabelKey.trim() || !newLabelValue.trim()) return;

    const newLabel = {
      id: `${Date.now()}-${Math.random()}`,
      key: newLabelKey.trim(),
      value: newLabelValue.trim(),
    };

    setValue('Labels', [...labels, newLabel]);
    setNewLabelKey('');
    setNewLabelValue('');
  };

  const addAnnotation = () => {
    if (!newAnnotationKey.trim() || !newAnnotationValue.trim()) return;

    const newAnnotation = {
      id: `${Date.now()}-${Math.random()}`,
      key: newAnnotationKey.trim(),
      value: newAnnotationValue.trim(),
    };

    setValue('Annotations', [...annotations, newAnnotation]);
    setNewAnnotationKey('');
    setNewAnnotationValue('');
  };

  const removeLabel = (id: string) => {
    setValue(
      'Labels',
      labels.filter((label) => label.id !== id),
    );
  };

  const removeAnnotation = (id: string) => {
    setValue(
      'Annotations',
      annotations.filter((annotation) => annotation.id !== id),
    );
  };


  // Handles function selection from the autocomplete
  const handleFunctionSelect = (functionData: FunctionSignature) => {
    if (functionData?.FunctionName) {
      setValue('FunctionName', functionData.FunctionName);
      setSelectedFunction(functionData);
      // Clear previous arguments when switching functions
      setArgumentValues({});
    }
  };

  // Updates a specific argument value
  const updateArgumentValue = (paramName: string, value: string) => {
    setArgumentValues((prev) => ({
      ...prev,
      [paramName]: value,
    }));
  };

  const submitTrigger = async (data: IAddTriggerFormInput) => {
    // Transform argumentValues object into API format
    const args = Object.entries(argumentValues).map(([paramName, value]) => ({
      ParameterName: paramName,
      Value: value,
    }));

    const triggerData: TriggerRead = {
      Slug: data.Slug,
      BridgeWorkerID: data.BridgeWorkerID ? data.BridgeWorkerID : undefined,
      FunctionName: data.FunctionName,
      Disabled: data.Disabled || false,
      Warn: data.Warn || false,
      Labels: data?.Labels?.reduce(
        (acc, label) => {
          acc[label.key] = label.value;
          return acc;
        },
        {} as Record<string, string>,
      ),
      Annotations: data?.Annotations?.reduce(
        (acc, annotation) => {
          acc[annotation.key] = annotation.value;
          return acc;
        },
        {} as Record<string, string>,
      ),
      DeleteGates: data.DeleteGates || {},
      SpaceID: spaceId,
      Arguments: args,
      Event: data.EventType,
      ToolchainType: data.ToolchainType,
      OrganizationID: orgID,
    };

    // Submit to API - create or update based on mode
    if (existingTrigger) {
      await updateTrigger({
        triggerId: existingTrigger.TriggerID || '',
        spaceId,
        trigger: {
          ...existingTrigger,
          ...triggerData,
        },
      });
    } else {
      const result = await addTrigger({
        spaceId,
        trigger: triggerData,
      });

      // Track trigger creation (only dropdown values, no user input)
      if ('data' in result && result.data) {
        trackEntityCreated({
          entity_type: ENTITY_TYPES.TRIGGER,
          entity_id: result.data.TriggerID || '',
          event_type: data.EventType,
          toolchain_type: data.ToolchainType,
        });
      }
    }
  };

  return {

    // Error handling
    serverError,
    setServerError,

    // Function selection and arguments
    selectedFunction,
    argumentValues,
    handleFunctionSelect,
    updateArgumentValue,
    setSelectedFunction,

    // Utility functions
    getFunctionOptions,

    // Form submission
    submitTrigger,

    // Key-value handlers for labels, annotations, and delete gates
    addLabel,
    addAnnotation,
    removeAnnotation,
    removeLabel,
    labels,
    annotations,
    newLabelKey,
    newLabelValue,
    newAnnotationKey,
    newAnnotationValue,
    newDeleteGateKey,
    setNewLabelKey,
    setNewLabelValue,
    setNewAnnotationKey,
    setNewAnnotationValue,
    setNewDeleteGateKey,

    // result
    isSuccess,
    data,
    error,

  };
};
