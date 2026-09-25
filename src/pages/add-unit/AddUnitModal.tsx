// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { CodeEditor } from '@/components/code-editor/CodeEditor';
import { SimpleGateCard } from '@/components/simple-gate-card/SimpleGateCard';
import { SimpleLabelCard } from '@/components/simple-label-card/SimpleLabelCard';
import { SectionCard } from '@/components/styled';
import { ServerErrorBox } from '@/components/styled';
import { FullScreenDialog } from '@/components/styled';
import { ToolchainSelector } from '@/components/unit-form';
import { Wizard } from '@/components/wizard/Wizard';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { useUnitForm } from '@/hooks/useUnitForm';
import { CreateUnitApiArg, SpaceRead, useCreateUnitMutation, useLazyListUnitsQuery } from '@confighub/rtk-query';
import { SLUG_MAX_LENGTH, SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import { IUnitMutationModalProps } from '@/types';
import { Direction } from '@/types/enums';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
import CloseIcon from '@mui/icons-material/Close';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import { useUploadUnitData } from '@/hooks/useUnitData';

const Form = styled('form')`
  width: 80%;
  margin-top: 10px;
`;

export const AddUnitModal = ({
  isOpen,
  onClose,
  spaces,
  disable,
  onSubmit,
  refresh,
}: IUnitMutationModalProps) => {
  const [configDataState, setConfigDataState] = useState<string>('');
  const [newDeleteGateKey, setNewDeleteGateKey] = useState('');
  const [newDestroyGateKey, setNewDestroyGateKey] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [inputErrors, setInputErrors] = useState<Set<string>>(new Set());

  const makeInputErrorHandler = useCallback(
    (key: string) => (hasError: boolean) => {
      setInputErrors((prev) => {
        const next = new Set(prev);
        if (hasError) next.add(key);
        else next.delete(key);
        return next;
      });
    },
    [],
  );

  const {
    form,
    targets,
    selectedSpaceID,
    selectedToolchainType,
    unitData,
    setUnitData,
    onSpaceSelected,
    onToolchainTypeSelected,
    resetForm,
  } = useUnitForm({
    defaultValues: {
      DeleteGates: {},
      DestroyGates: {},
    },
    mode: 'onChange',
  });

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
    watch,
    setValue,
    trigger,
  } = form;
  const [createUnit, { error, isSuccess, data: createdUnit }] = useCreateUnitMutation();
  const [uploadUnitData] = useUploadUnitData();
  const { trackEntityCreated } = useAnalytics();

  // For slug uniqueness validation
  const [checkUnitsQuery] = useLazyListUnitsQuery();

  const formToolchainType = watch('ToolchainType');

  const {
    handleSubmit: handleConfigSubmit,
    setValue: setConfigValue,
    reset: resetConfigValue,
    control: controlConfigValue,
    watch: watchConfigValue,
  } = useForm<{ configData: string }>({
    defaultValues: { configData: '' },
  });

  useApiErrorMessage(error, isSuccess, setErrorMessage);

  // Re-validate Slug when space changes (since uniqueness depends on space)
  useEffect(() => {
    if (selectedSpaceID) {
      trigger('Slug');
    }
  }, [selectedSpaceID, trigger]);

  // Using the onSuccess option in useApiErrorMessage is behaving strange.  The state with onClose isn't being reset properly for some reason.
  useEffect(() => {
    const handleSuccess = async () => {
      if (isSuccess && createdUnit) {
        // Track unit creation (only dropdown values, no user input)
        trackEntityCreated({
          entity_type: ENTITY_TYPES.UNIT,
          entity_id: createdUnit.Unit?.UnitID || '',
          toolchain_type: unitData.ToolchainType || '',
        });

        // Wait for refresh to complete before closing modal
        if (refresh) {
          await Promise.resolve(refresh());
        }
        onClose();
        resetForm();
        resetConfigValue();
        setActiveStep(0);
        setNewDeleteGateKey('');
        setNewDestroyGateKey('');
        setErrorMessage('');
      }
    };

    handleSuccess();
  }, [isSuccess, createdUnit, trackEntityCreated, unitData.ToolchainType]);

  watchConfigValue('configData');
  watch('Labels');
  watch('SpaceID');
  watch('DeleteGates');
  watch('DestroyGates');

  const handleClose = () => {
    resetForm();
    resetConfigValue();
    setActiveStep(0);
    setNewDeleteGateKey('');
    setNewDestroyGateKey('');
    onClose();
    setErrorMessage('');
  };

  const onUnitAdded = async () => {
    const currentDeleteGates = watch('DeleteGates') || {};
    const currentDestroyGates = watch('DestroyGates') || {};

    const input: CreateUnitApiArg = {
      spaceId: unitData.SpaceID || '',
      unit: {
        Slug: unitData.Slug,
        Labels: {
          ...unitData.Labels,
        },
        Annotations: {
          ...unitData.Annotations,
        },
        ToolchainType: unitData.ToolchainType,
        ...(unitData.TargetID ? { TargetId: unitData.TargetID } : {}),
        ...(currentDeleteGates && Object.keys(currentDeleteGates).length > 0
          ? { DeleteGates: currentDeleteGates }
          : {}),
        ...(currentDestroyGates && Object.keys(currentDestroyGates).length > 0
          ? { DestroyGates: currentDestroyGates }
          : {}),
      },
    };

    const response = await createUnit(input);

    // Configuration is a separate write: the Unit body has nowhere to put one. The Unit is
    // left in place if this fails -- it exists, and deleting it would be the worse outcome.
    const createdUnitEntity = response.data?.Unit;
    if (configDataState && createdUnitEntity?.UnitID && input.spaceId) {
      await uploadUnitData({
        spaceId: input.spaceId,
        unitId: createdUnitEntity.UnitID,
        body: configDataState,
      });
    }

    onSubmit?.(createdUnitEntity);
  };

  return (
    // TODO: Redesign
    <FullScreenDialog fullScreen open={isOpen} onClose={handleClose}>
      <DialogTitle>
        <Breadcrumbs aria-label='breadcrumb'>
          <Typography variant='h5'>Units</Typography>
          <Typography variant='h5' sx={{ fontStyle: 'italic' }}>
            Add Unit
          </Typography>
        </Breadcrumbs>
        <IconButton
          aria-label='close'
          onClick={handleClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <ServerErrorBox $display={!!errorMessage} sx={{ mt: 1 }}>
          <Typography variant='caption'>Error: {errorMessage}</Typography>
          <IconButton
            aria-label='close'
            onClick={() => setErrorMessage('')}
            sx={{
              color: (theme) => theme.palette.error.main,
            }}
            size='small'
          >
            <CloseIcon />
          </IconButton>
        </ServerErrorBox>
        <Wizard activeStep={activeStep} totalSteps={2}>
          <Wizard.Steps
            steps={[
              {
                label: 'Enter a few details',
              },
              {
                label: 'Config Data',
              },
              {
                label: 'Protection Gates',
                description: <Typography variant='caption'>Optional</Typography>,
              },
            ]}
            orientation='vertical'
          />
          <Wizard.Step $display={activeStep === 0} $direction={Direction.Left}>
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleSubmit((data) => {
                  setUnitData(data);
                  setActiveStep(1);
                })();
              }}
            >
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <SectionCard title='Basic Details'>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 6 }}>
                        <Controller
                          name='Slug'
                          control={control}
                          rules={{
                            required: 'Slug is required',
                            maxLength: {
                              value: SLUG_MAX_LENGTH,
                              message: `Slug must be ${SLUG_MAX_LENGTH} characters or less`,
                            },
                            pattern: {
                              value: SLUG_PATTERN,
                              message: SLUG_PATTERN_MESSAGE,
                            },
                            validate: async (value: string) => {
                              if (!selectedSpaceID || !value) return true;

                              // Only check uniqueness for pattern-valid slugs.
                              // This also ensures the value is safe for the where clause
                              // since SLUG_PATTERN restricts to [A-Za-z0-9], hyphens,
                              // underscores, and periods.
                              if (!SLUG_PATTERN.test(value)) return true;

                              // Debounce: wait for user to stop typing before checking uniqueness
                              await new Promise((resolve) => setTimeout(resolve, 300));
                              if (form.getValues('Slug') !== value) return true;

                              try {
                                const result = await checkUnitsQuery({
                                  spaceId: selectedSpaceID,
                                  where: `Slug = '${value}'`,
                                });

                                if (result.data && result.data.length > 0) {
                                  return 'A unit with this name already exists in this space';
                                }
                                return true;
                              } catch (e) {
                                console.error('Uniqueness check failed:', e);
                                // Let the form proceed — backend will catch duplicates
                                return true;
                              }
                            },
                          }}
                          render={({ field }) => (
                            <TextField
                              fullWidth
                              label='Name'
                              error={!!errors.Slug}
                              size='small'
                              helperText={errors.Slug?.message}
                              {...field}
                            />
                          )}
                        />
                      </Grid>

                      <Grid size={{ xs: 6 }}>
                        <Controller
                          name='SpaceID'
                          control={control}
                          rules={{ required: 'Space is required' }}
                          render={({ field }) => (
                            <FormControl fullWidth size='small'>
                              <InputLabel id='space-checkbox-label'>Space</InputLabel>
                              <Select
                                {...field}
                                value={selectedSpaceID}
                                onChange={onSpaceSelected}
                                input={<OutlinedInput label='Space' />}
                                size='small'
                                error={!!errors.SpaceID}
                                renderValue={(selected) =>
                                  spaces?.find((space) => space.SpaceID === selected)?.Slug
                                }
                              >
                                {spaces?.map((space: SpaceRead) => (
                                  <MenuItem key={space.Slug} value={space.SpaceID}>
                                    <Checkbox checked={selectedSpaceID === space.SpaceID} />
                                    <ListItemText primary={space.Slug} />
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          )}
                        />
                      </Grid>

                      <Grid size={{ xs: 6 }}>
                        <ToolchainSelector
                          control={control}
                          errors={errors}
                          selectedToolchainType={selectedToolchainType}
                          onToolchainTypeSelected={onToolchainTypeSelected}
                        />
                      </Grid>

                      <Grid size={{ xs: 6 }}>
                        <Controller
                          name='TargetID'
                          control={control}
                          render={({ field }) => (
                            <FormControl
                              title={!formToolchainType ? 'Select a toolchain type first' : ''}
                              fullWidth
                              size='small'
                              disabled={!formToolchainType}
                            >
                              <InputLabel>Target</InputLabel>
                              <Select
                                label='Target'
                                size='small'
                                input={<OutlinedInput label='Target' />}
                                {...field}
                                onChange={(event) => {
                                  setValue('TargetID', event.target.value);
                                }}
                              >
                                {targets?.length > 0 ? (
                                  targets.map((target) => (
                                    <MenuItem key={target?.TargetID} value={target?.TargetID}>
                                      {target?.Slug}
                                    </MenuItem>
                                  ))
                                ) : (
                                  <MenuItem value=''>
                                    <em>No targets available for this toolchain type</em>
                                  </MenuItem>
                                )}
                              </Select>
                            </FormControl>
                          )}
                        />
                      </Grid>
                    </Grid>
                  </SectionCard>
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <SimpleLabelCard
                    watch={watch}
                    setValue={setValue}
                    fieldName='Labels'
                    type='Labels'
                    title='Labels'
                    description='Labels are key-value pairs that help organize and identify units.'
                    onErrorChange={makeInputErrorHandler('Labels')}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <SimpleLabelCard
                    watch={watch}
                    setValue={setValue}
                    fieldName='Annotations'
                    type='Annotations'
                    title='Annotations'
                    description='Annotations store additional metadata and information about the unit.'
                    onErrorChange={makeInputErrorHandler('Annotations')}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Button disabled={disable || !isValid || inputErrors.size > 0} variant='contained' type='submit' fullWidth>
                    Next
                  </Button>
                </Grid>
              </Grid>
            </Form>
          </Wizard.Step>
          <Wizard.Step $display={activeStep === 1} $direction={Direction.Right}>
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleConfigSubmit(() => {
                  setActiveStep(2);
                })();
              }}
            >
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <Controller
                    name='configData'
                    control={controlConfigValue}
                    render={({ field }) => (
                      <CodeEditor
                        {...field}
                        value={''}
                        toolchainType={formToolchainType ?? undefined}
                        onCodeChanged={(value) => {
                          setConfigValue('configData', value);
                          setConfigDataState(value);
                        }}
                        canEdit={true}
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Button variant='outlined' onClick={() => setActiveStep(0)} fullWidth>
                    Back
                  </Button>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Button disabled={disable} variant='contained' type='submit' fullWidth>
                    Next
                  </Button>
                </Grid>
              </Grid>
            </Form>
          </Wizard.Step>
          <Wizard.Step $display={activeStep === 2} $direction={Direction.Right}>
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleConfigSubmit(() => {
                  onUnitAdded();
                })();
              }}
            >
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <SimpleGateCard
                    watch={watch}
                    setValue={setValue}
                    gateFieldName='DeleteGates'
                    gateType='Delete'
                    title='Delete Gates'
                    description='Delete gates prevent units from being deleted until the gates are removed.'
                    newGateKey={newDeleteGateKey}
                    setNewGateKey={setNewDeleteGateKey}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <SimpleGateCard
                    watch={watch}
                    setValue={setValue}
                    gateFieldName='DestroyGates'
                    gateType='Destroy'
                    title='Destroy Gates'
                    description='Destroy gates prevent units from being destroyed until the gates are removed.'
                    newGateKey={newDestroyGateKey}
                    setNewGateKey={setNewDestroyGateKey}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Button variant='outlined' onClick={() => setActiveStep(1)} fullWidth>
                    Back
                  </Button>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Button disabled={disable} variant='contained' type='submit' fullWidth>
                    Create Unit
                  </Button>
                </Grid>
              </Grid>
            </Form>
          </Wizard.Step>
        </Wizard>
      </DialogContent>
    </FullScreenDialog>
  );
};
