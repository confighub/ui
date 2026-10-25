// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Custom hook for managing trigger creation form state and business logic
import { useEffect, useState } from 'react';
import type { UseFormReset, UseFormSetValue, UseFormWatch } from 'react-hook-form';

import { type MapRow, mapToRows, rowsToGates, rowsToMap } from '@/components/map-field-editor/map-rows';
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
  ChannelID?: string;
  Slug: string;
  Labels?: MapRow[];
  Annotations?: MapRow[];
  DeleteGates?: MapRow[];
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

  const { setValue, reset } = formApi;

  // Initialize form with existing trigger data when in edit mode
  useEffect(() => {
    if (existingTrigger) {
      // Initialize basic fields
      const initialForm: IAddTriggerFormInput = {
        Slug: existingTrigger.Slug || '',
        EventType: (existingTrigger.Event as 'Mutation' | 'PostClone') || 'Mutation',
        ChannelID: existingTrigger.ChannelID || '',
        FunctionName: existingTrigger.FunctionName || '',
        ToolchainType: (existingTrigger.ToolchainType as 'Kubernetes/YAML') || 'Kubernetes/YAML',
        Disabled: existingTrigger.Disabled || false,
        Warn: existingTrigger.Warn || false,
        Labels: mapToRows(existingTrigger.Labels),
        Annotations: mapToRows(existingTrigger.Annotations),
        DeleteGates: mapToRows(existingTrigger.DeleteGates),
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
      ChannelID: data.ChannelID ? data.ChannelID : undefined,
      // A Trigger still on a worker keeps it until a Channel is chosen, which replaces it:
      // the update sends the whole Trigger, and a Trigger names one or the other.
      ...(data.ChannelID && { BridgeWorkerID: undefined }),
      FunctionName: data.FunctionName,
      Disabled: data.Disabled || false,
      Warn: data.Warn || false,
      Labels: rowsToMap(data.Labels),
      Annotations: rowsToMap(data.Annotations),
      DeleteGates: rowsToGates(data.DeleteGates),
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

    // result
    isSuccess,
    data,
    error,

  };
};
