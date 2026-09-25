// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { FunctionResultList } from '@/components/function-result-list/FunctionResultList';
import { InvokeUnitFunctionsModal } from '@/components/invoke-unit-functions-modal/InvokeUnitFunctionsModal';
import { Main } from '@/components/styled';
import { ServerErrorBox } from '@/components/styled';
import { useAppDispatch, useAppSelector } from '@/hooks/useApp';
import {
  ExtendedUnitRead,
  FunctionInvocationsResponse,
  FunctionSignature,
  Invocation,
  UnitRead,
  useLazyGetUnitQuery,
  useListFunctionsQuery,
} from '@confighub/rtk-query';
import {
  clearErrors,
  selectFunctionInvocationResponse,
  setDiff,
  setFunctionInvocationResponse,
} from '@/state/slices/functionInvocation';
import {
  selectApiError,
  selectFromUnit,
  selectIsBulkFunctionInvocation,
  selectToUnit,
  selectUnits,
  selectUpdatedUnit,
} from '@/state/slices/functionInvocation';
import { type OutputType } from '@/types';
import { FunctionResultItem } from '@/types';
import { getFunctionInvocationAsMonad } from '@/utility/object-functions';
import CloseIcon from '@mui/icons-material/Close';
import { styled } from '@mui/material';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';

import { Header } from '../../components/header/Header';
import { decodeBase64 } from '../../utility/string-functions';
import { useUnitDataMap } from '@/hooks/useUnitData';

const Container = styled('div')`
  width: 100%;
`;

export interface BulkFunctionResults {
  items?: FunctionResultItem[];
  isMutating?: boolean;
  isValidating?: boolean;
}

/**
 * Helper function to extract output from the Outputs map
 * Returns the first non-empty output found, regardless of type
 */
const getOutputFromResult = (result: {
  Outputs?: { [key: string]: string } | null;
}): string => {
  if (!result.Outputs) {
    return '';
  }

  // Get the first non-empty output value from the map. Function outputs are still
  // byte-format on the wire, so they decode here -- everything downstream treats
  // FunctionResultItem.code as text, like the Unit data it is otherwise built from.
  for (const [, outputValue] of Object.entries(result.Outputs)) {
    if (outputValue && typeof outputValue === 'string' && outputValue.trim() !== '') {
      return decodeBase64(outputValue);
    }
  }

  return '';
};

// TODO: editing an invocation when selecting units from the table or code view doesn't output the results... Could be a bug with loading option...
export const FunctionListPage = () => {
  const { name } = useParams();
  const [serverError, setServerError] = useState<Array<string>>([]);

  // State selectors
  const functionInvocationResponse = useAppSelector(selectFunctionInvocationResponse);
  const isBulkFunctionInvocation = useAppSelector(selectIsBulkFunctionInvocation);
  const fromUnit = useAppSelector(selectFromUnit);
  const updatedUnit = useAppSelector(selectUpdatedUnit);
  const toUnit = useAppSelector(selectToUnit);
  const units = useAppSelector(selectUnits);
  // The "before" side of each result diff: the stored configuration, in one request.
  const { dataFor: unitDataFor } = useUnitDataMap((units ?? []).map((u) => u.Unit?.UnitID));
  const apiError = useAppSelector(selectApiError);
  const dispatch = useAppDispatch();

  const [bulkFunctionResult, setBulkFunctionResult] = useState<BulkFunctionResults>(
    {} as BulkFunctionResults,
  );

  // State for invoke function modal
  const [isInvokeModalOpen, setIsInvokeModalOpen] = useState(false);
  const [selectedFunction, setSelectedFunction] = useState<FunctionSignature | null>(null);
  const [invocationToEdit, setInvocationToEdit] = useState<Invocation | undefined>(undefined);
  // Separate state for the function being edited in the modal (doesn't affect view until invocation completes)
  const [modalFunction, setModalFunction] = useState<FunctionSignature | null>(null);

  // State for tracking selected unit IDs from ValidationResultTable
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  const spaceId = units?.[0]?.Space?.SpaceID || '';

  const { data: functions = {} } = useListFunctionsQuery({ spaceId }, { skip: !spaceId });
  const [getUnitByID] = useLazyGetUnitQuery();

  // Convert ExtendedUnitRead to UnitRead for the modal
  // If units are selected in the ValidationResultTable, only include those units
  const unitsForModal: UnitRead[] = useMemo(() => {
    const allUnits = (units?.map((u) => u.Unit).filter(Boolean) as UnitRead[]) || [];
    if (selectedUnitIds.length === 0) {
      return allUnits;
    }
    return allUnits.filter((unit) => selectedUnitIds.includes(unit.UnitID || ''));
  }, [units, selectedUnitIds]);

  /** Handle selection change from ValidationResultTable */
  const handleValidationSelectionChange = useCallback((unitIds: string[]) => {
    setSelectedUnitIds(unitIds);
  }, []);

  /**
   * Handle function invocation results
   */
  const handleFunctionInvocation = async (
    data: FunctionInvocationsResponse[],
    apiError?: string,
    _preInvocationUnits?: ExtendedUnitRead[],
    func?: FunctionSignature,
  ) => {
    // Update the function invocation response in Redux to show results
    dispatch(
      setFunctionInvocationResponse({
        functions: data,
        units: units || [],
        apiError,
      }),
    );

    // Update the selected function if provided
    if (func) {
      setSelectedFunction(func);
    }

    // Show any errors
    if (apiError) {
      setServerError((prev) => [...prev, apiError]);
    }
  };

  /**
   * Handle modal close
   */
  const handleModalClose = () => {
    setIsInvokeModalOpen(false);
    setInvocationToEdit(undefined);
    setModalFunction(null);
  };

  // Use selectedFunction if available (from autocomplete), otherwise fall back to URL param
  const functionSignatureFromUrl =
    // @ts-expect-error TODO:
    (functions?.[`Kubernetes/YAML`]?.[name] as FunctionSignature) || {};
  const functionSignature = selectedFunction || functionSignatureFromUrl;

  const isLoading = !functionInvocationResponse && !apiError;
  const isMutating = isBulkFunctionInvocation ? functionSignature.Mutating : true;
  const isValidating = functionSignature.Validating;
  const items = bulkFunctionResult.items || [];

  // Used for bulk function invocations
  useEffect(() => {
    if (!isBulkFunctionInvocation && isLoading) return;

    // Handle both API errors and function invocation errors
    const allErrors: Array<string> = [];

    // Add API error if it exists (total failure case)
    if (apiError) {
      allErrors.push(apiError);
    }

    // Add function invocation errors if they exist (partial failure case)
    const functionErrors = functionInvocationResponse
      ?.map((response) => response?.Error?.Message)
      ?.filter(Boolean) as Array<string>;

    if (functionErrors && functionErrors.length > 0) {
      allErrors.push(...functionErrors);
    }

    setServerError(allErrors.length > 0 ? allErrors : []);

    // @ts-expect-error TODO: Fix the typing later
    const response = functionInvocationResponse.map((resp) =>
      getFunctionInvocationAsMonad(resp, units || []),
    );

    const items = response.map(({ result, unit, space }) => ({
      id: unit?.UnitID ?? result.UnitID,
      name: `${unit?.Slug}`,
      function: `${functionSignature.FunctionName ?? ''}`,
      code: getOutputFromResult(result),
      spaceName: space.Slug,
    }));

    const validationRows = response
      .map(({ result, unit, space }) => ({
        id: unit.UnitID,
        name: unit.DisplayName || '',
        isSuccess: result.Success,
        validationResult: decodeBase64(
          result?.Outputs?.['ValidationResult'] ||
            result?.Outputs?.['ValidationResultList'] ||
            '',
        ),
        validationErrors: unit.ValidationErrors || {},
        labels: unit.Labels || {},
        lastChangeDescription: unit.LastChangeDescription || '',
        headRevision: unit.HeadRevisionNum,
        lastReleasedRevision: unit.LastReleasedRevisionNum,
        spaceName: space.Slug,
        spaceId: unit.SpaceID,
      }))
      .filter((row) => row.id);

    const validatingItems = [
      {
        name: `${functionSignature.FunctionName?.toUpperCase() ?? ''} VALIDATION RESULTS`,
        description: '',
        rows: validationRows,
      },
    ];

    const mutatingItems = response.map(({ result, unit, space }) => {
      const diff =
        (result.Mutations?.length ?? 0) > 0 ? (result.ConfigData as string) : undefined;
      return {
        id: unit.UnitID,
        name: `${unit.Slug}`,
        function: `${functionSignature.FunctionName ?? ''}`,
        additionalInfo: `Space/${space.DisplayName?.toUpperCase() ?? ''}/Unit/${unit.DisplayName?.toUpperCase() ?? ''}`,
        description: `DIFF`,
        code: unitDataFor(unit.UnitID),
        spaceName: space.Slug,
        diff,
      };
    });

    const itemsToShow =
      (isMutating && mutatingItems) || (isValidating && validatingItems) || items;

    setBulkFunctionResult({
      isMutating: isMutating ?? false,
      isValidating: isValidating ?? false,
      // @ts-expect-error TODO: Fix the typing later
      items: itemsToShow,
    });
  }, [
    isBulkFunctionInvocation,
    functionInvocationResponse,
    functionSignature.FunctionName,
    selectedFunction,
    units,
    isMutating,
    isValidating,
    apiError,
  ]);

  // Used for linking units
  useEffect(() => {
    if (isBulkFunctionInvocation) return;

    setBulkFunctionResult({
      items: [
        {
          name: `Link units ${fromUnit?.Slug} -> ${toUnit?.Slug}`,
          description: `Diff ${fromUnit?.Slug} after link`,
          code: unitDataFor(fromUnit?.UnitID),
          diff: unitDataFor(updatedUnit?.UnitID),
        },
      ],
    });

    if (fromUnit?.HeadRevisionNum !== updatedUnit?.HeadRevisionNum) return;
    let isCanceled = false;
    let timeoutId: NodeJS.Timeout;

    const waitForUpdate = async () => {
      const pollingTimeout = 5000; // 5 seconds timeout
      const checkInterval = 250; // Check every 250ms
      const startTime = Date.now();

      while (Date.now() - startTime < pollingTimeout && !isCanceled) {
        try {
          const result = await getUnitByID({
            unitId: updatedUnit?.UnitID || '',
            spaceId: updatedUnit?.SpaceID || '',
          });

          if (
            !!result.data?.Unit?.HeadRevisionNum &&
            result.data.Unit.HeadRevisionNum !== updatedUnit?.HeadRevisionNum &&
            !isCanceled
          ) {
            isCanceled = true;
            if (timeoutId) {
              clearTimeout(timeoutId);
            }

            dispatch(
              setDiff({
                fromUnit: fromUnit,
                updatedUnit: result.data?.Unit,
                toUnit: toUnit,
              }),
            );
            return;
          }

          if (!isCanceled) {
            await new Promise((resolve) => {
              timeoutId = setTimeout(resolve, checkInterval);
            });
          }
        } catch (error) {
          console.error('Error refetching unit:', error);
          isCanceled = true;
          break;
        }
      }
    };

    waitForUpdate();

    return () => {
      isCanceled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isBulkFunctionInvocation, fromUnit, toUnit, updatedUnit, dispatch]);

  return (
    <Container sx={{ color: 'text.primary' }}>
      <Header
        breadCrumbs={[
          {
            name: 'Units',
            isLink: true,
            link: '/units',
          },
          { name: isBulkFunctionInvocation ? 'Bulk Functions' : 'Link Units' },
          { name: functionSignature.FunctionName || name || 'Function Details' },
        ]}
      />
      <Main sx={{ padding: '0px' }}>
        <ServerErrorBox
          $display={!!(serverError && serverError.length > 0)}
          sx={{ m: 2, maxHeight: '50px', overflowY: 'auto', p: 1 }}
        >
          <List
            data-testid='server-error-list'
            sx={{
              listStyleType: 'disc',
              pl: 2,
              borderRadius: '8px',
              height: '-webkit-fill-available',
            }}
          >
            {serverError?.map((item, index) => (
              <ListItem
                key={index}
                sx={{
                  display: 'list-item',
                  p: 0,
                }}
              >
                <ListItemText
                  primary={<Typography variant='caption'>Error: {item}</Typography>}
                />
              </ListItem>
            ))}
          </List>

          <IconButton
            aria-label='close'
            onClick={() => {
              setServerError([]);
              dispatch(clearErrors());
            }}
            sx={{
              color: (theme) => theme.palette.error.main,
            }}
            size='small'
          >
            <CloseIcon />
          </IconButton>
        </ServerErrorBox>
        {!isLoading && (
          <FunctionResultList
            outputType={(functionSignature.OutputInfo?.OutputType as OutputType) || 'YAML'}
            items={items}
            isValidating={isValidating}
            isMutating={isMutating}
            isLoading={false}
            treeViewTitle={isBulkFunctionInvocation ? 'Functions' : 'Links'}
            onSelectionChange={handleValidationSelectionChange}
            defaultSelectedUnitIds={selectedUnitIds}
          />
        )}
      </Main>

      <InvokeUnitFunctionsModal
        isOpen={isInvokeModalOpen}
        onClose={handleModalClose}
        func={modalFunction || undefined}
        unitsToEdit={unitsForModal}
        onSubmit={(data, apiError) => {
          handleFunctionInvocation(
            data as FunctionInvocationsResponse[],
            apiError,
            undefined,
            modalFunction || undefined,
          );
        }}
        defaultToolchainType={unitsForModal[0]?.ToolchainType}
        invocationToEdit={invocationToEdit}
      />
    </Container>
  );
};

export default FunctionListPage;
