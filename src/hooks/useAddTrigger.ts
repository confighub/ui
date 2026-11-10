// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Custom hook for managing trigger creation form state and business logic
import { useEffect, useState } from 'react';
import type { UseFormReset, UseFormSetValue, UseFormWatch } from 'react-hook-form';

import {
  buildTriggerBody,
  type IAddTriggerFormInput,
  triggerToFormInput,
} from '@/hooks/triggerFormBody';
import { useAnalytics } from '@/hooks/useAnalytics';
import {
  TriggerRead,
  useCreateTriggerMutation,
  useUpdateTriggerMutation,
} from '@confighub/rtk-query';
import type { FunctionInvocation, FunctionSignature } from '@confighub/rtk-query';
import { ENTITY_TYPES } from '@/utility/analytics-constants';

export type { IAddTriggerFormInput } from '@/hooks/triggerFormBody';

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
      const initialForm = triggerToFormInput(existingTrigger);

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

  /**
   * Creates or updates the Trigger, and returns it when it was written. A create with
   * `withBackingUnits` also gives the new Trigger a backing Unit.
   */
  const submitTrigger = async (
    data: IAddTriggerFormInput,
    withBackingUnits = false,
  ): Promise<TriggerRead | undefined> => {
    const triggerData = buildTriggerBody(
      data,
      argumentValues,
      { spaceId, orgID },
      !!selectedFunction.Validating && !selectedFunction.Mutating,
      existingTrigger,
    );

    // Submit to API - create or update based on mode
    if (existingTrigger) {
      const result = await updateTrigger({
        triggerId: existingTrigger.TriggerID || '',
        spaceId,
        trigger: {
          ...existingTrigger,
          ...triggerData,
        },
      });
      return result.data;
    } else {
      const result = await addTrigger({
        spaceId,
        withBackingUnits: withBackingUnits || undefined,
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
      return result.data;
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
