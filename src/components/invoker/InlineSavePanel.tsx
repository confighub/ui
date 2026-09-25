// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState, useEffect, useRef } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Checkbox,
  FormControlLabel,
  Tabs,
  Tab,
  Stack,
  IconButton,
  Autocomplete,
  Collapse,
  Alert,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import { useListSpacesQuery, useListAllBridgeWorkersQuery, Invocation, Trigger } from '@confighub/rtk-query';

const NAME_VALIDATION_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

interface InlineSavePanelProps {
  open: boolean;
  onSave: (options: SaveInvocationOptions) => Promise<{ success: boolean; error?: string }>;
  onClose?: () => void;
  defaultName?: string;
  loadedInvocation?: Invocation | Trigger | null;
  /** Default toolchain type from context (function or selected units) */
  defaultToolchainType?: string;
  /** Available toolchain types for selection */
  availableToolchainTypes?: string[];
  /** Default space ID from context (selected units) */
  defaultSpaceId?: string;
}

export interface SaveInvocationOptions {
  name: string;
  spaceId: string;
  type: 'invocation' | 'trigger';
  toolchainType: string;
  // Trigger-specific fields
  eventType?: 'Mutation' | 'PostClone';
  disabled?: boolean;
  enforced?: boolean;
  // Common fields
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  bridgeWorkerId?: string;
  // Auto-detected update IDs
  existingInvocationId?: string;
  existingTriggerId?: string;
}

/**
 * Inline expandable panel for saving invocations or triggers
 * Appears below the footer within the same scroll container
 */
export const InlineSavePanel = ({
  open,
  onSave,
  onClose,
  defaultName = '',
  loadedInvocation,
  defaultToolchainType = '',
  availableToolchainTypes = [],
  defaultSpaceId = '',
}: InlineSavePanelProps) => {
  // Basic fields
  const [name, setName] = useState(defaultName);
  const [selectedSpaceId, setSelectedSpaceId] = useState(defaultSpaceId);
  const [saveType, setSaveType] = useState<'invocation' | 'trigger'>('invocation');
  const [toolchainType, setToolchainType] = useState(defaultToolchainType);

  // Trigger-specific fields
  const [eventType, setEventType] = useState<'Mutation' | 'PostClone'>('Mutation');
  const [disabled, setDisabled] = useState(false);
  const [enforced, setEnforced] = useState(false);

  // Common optional fields
  const [labels, setLabels] = useState<Array<{ key: string; value: string }>>([]);
  const [annotations, setAnnotations] = useState<Array<{ key: string; value: string }>>([]);
  const [bridgeWorkerId, setBridgeWorkerId] = useState('');

  // UI state
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);

  // Fetch spaces
  const { data: spacesData } = useListSpacesQuery({});
  const spaces = spacesData?.map((item) => item.Space).filter(Boolean) || [];

  // Fetch bridge workers
  const { data: bridgeWorkersData } = useListAllBridgeWorkersQuery({});
  const bridgeWorkers = bridgeWorkersData?.map((item) => item.BridgeWorker).filter(Boolean) || [];

  // Check if name matches the loaded invocation's name (for update detection)
  const trimmedName = name.trim();
  const willUpdate = loadedInvocation &&
    trimmedName.toLowerCase() === loadedInvocation.DisplayName?.toLowerCase();

  // Track previous open state
  const prevOpenRef = useRef(open);

  // Handle panel open/close transitions
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // Panel just opened - set name from default
      if (defaultName) {
        setName(defaultName);
      }
    } else if (!open && prevOpenRef.current) {
      // Panel just closed - reset form
      setName(defaultName);
      setSelectedSpaceId(defaultSpaceId);
      setSaveType('invocation');
      setToolchainType(defaultToolchainType);
      setEventType('Mutation');
      setDisabled(false);
      setEnforced(false);
      setLabels([]);
      setAnnotations([]);
      setBridgeWorkerId('');
      setError('');
      setActiveTab(0);
    }
    prevOpenRef.current = open;
  }, [open, defaultName, defaultSpaceId, defaultToolchainType]);

  // Pre-fill form fields from loaded invocation
  useEffect(() => {
    if (!loadedInvocation) return;

    if (loadedInvocation.SpaceID) setSelectedSpaceId(loadedInvocation.SpaceID);
    if (loadedInvocation.ToolchainType) setToolchainType(loadedInvocation.ToolchainType);

    const isTrigger = 'Event' in loadedInvocation;
    if (isTrigger) {
      setSaveType('trigger');
      setActiveTab(1);
      const trigger = loadedInvocation as Trigger;
      if (trigger.Event) setEventType(trigger.Event as 'Mutation' | 'PostClone');
      setDisabled(trigger.Disabled ?? false);
      setEnforced(false);
    } else {
      setSaveType('invocation');
      setActiveTab(0);
    }

    if (loadedInvocation.Labels) {
      setLabels(Object.entries(loadedInvocation.Labels).map(([key, value]) => ({ key, value })));
    }
    if (loadedInvocation.Annotations) {
      setAnnotations(Object.entries(loadedInvocation.Annotations).map(([key, value]) => ({ key, value })));
    }
    if (loadedInvocation.BridgeWorkerID) setBridgeWorkerId(loadedInvocation.BridgeWorkerID);
  }, [loadedInvocation]);

  // Scroll to error when it appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const handleSave = async () => {
    // Validate name
    if (!trimmedName) {
      setError('Name is required');
      return;
    }

    if (trimmedName.length < 3) {
      setError('Name must be at least 3 characters');
      return;
    }

    if (!NAME_VALIDATION_REGEX.test(trimmedName)) {
      setError('Name must begin with a letter or number and can only contain letters, numbers, hyphens (-), underscores (_), and periods (.)');
      return;
    }

    // Validate space selection
    if (!selectedSpaceId) {
      setError('Space is required');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      // Convert labels and annotations arrays to objects
      const labelsObj = labels.reduce((acc, { key, value }) => {
        if (key.trim() && value.trim()) {
          acc[key.trim()] = value.trim();
        }
        return acc;
      }, {} as Record<string, string>);

      const annotationsObj = annotations.reduce((acc, { key, value }) => {
        if (key.trim() && value.trim()) {
          acc[key.trim()] = value.trim();
        }
        return acc;
      }, {} as Record<string, string>);

      const options: SaveInvocationOptions = {
        name: trimmedName,
        spaceId: selectedSpaceId,
        type: saveType,
        toolchainType,
        ...(saveType === 'trigger' && {
          eventType,
          disabled,
          enforced,
        }),
        ...(Object.keys(labelsObj).length > 0 && { labels: labelsObj }),
        ...(Object.keys(annotationsObj).length > 0 && { annotations: annotationsObj }),
        ...(bridgeWorkerId.trim() && { bridgeWorkerId: bridgeWorkerId.trim() }),
        // Pass existing ID if detected for auto-update (use correct ID based on type)
        ...(willUpdate && loadedInvocation && saveType === 'invocation' && { existingInvocationId: loadedInvocation.InvocationID }),
        ...(willUpdate && loadedInvocation && saveType === 'trigger' && { existingTriggerId: (loadedInvocation as Trigger).TriggerID }),
      };

      const result = await onSave(options);
      if (result.success) {
        // Reset form and close panel on success
        resetForm();
        onClose?.();
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to save ${saveType}`);
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setName(defaultName);
    setSelectedSpaceId(defaultSpaceId);
    setSaveType('invocation');
    setToolchainType(defaultToolchainType);
    setEventType('Mutation');
    setDisabled(false);
    setEnforced(false);
    setLabels([]);
    setAnnotations([]);
    setBridgeWorkerId('');
    setError('');
    setActiveTab(0);
  };

  const validateName = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    if (trimmed.length < 3) {
      setError('Name must be at least 3 characters');
      return;
    }
    if (!NAME_VALIDATION_REGEX.test(trimmed)) {
      setError('Name must begin with a letter or number and can only contain letters, numbers, hyphens (-), underscores (_), and periods (.)');
      return;
    }
    setError('');
  };

  const addLabel = () => {
    setLabels([...labels, { key: '', value: '' }]);
  };

  const removeLabel = (index: number) => {
    setLabels(labels.filter((_, i) => i !== index));
  };

  const updateLabel = (index: number, field: 'key' | 'value', value: string) => {
    const newLabels = [...labels];
    newLabels[index][field] = value;
    setLabels(newLabels);
  };

  const addAnnotation = () => {
    setAnnotations([...annotations, { key: '', value: '' }]);
  };

  const removeAnnotation = (index: number) => {
    setAnnotations(annotations.filter((_, i) => i !== index));
  };

  const updateAnnotation = (index: number, field: 'key' | 'value', value: string) => {
    const newAnnotations = [...annotations];
    newAnnotations[index][field] = value;
    setAnnotations(newAnnotations);
  };

  return (
    <Collapse in={open} timeout={300}>
      <Box
        sx={{
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        {/* Panel Content */}
        <Box sx={{ px: 2.5, py: 2 }}>
          <Stack spacing={2}>
            {/* Header */}
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                Save {saveType === 'invocation' ? 'Invocation' : 'Trigger'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {saveType === 'invocation'
                  ? 'Save this function call configuration for later use'
                  : 'Create a trigger to automatically execute this function on events'}
              </Typography>
            </Box>

            {/* Type selector */}
            <Tabs
              value={activeTab}
              onChange={(_, newValue) => {
                setActiveTab(newValue);
                setSaveType(newValue === 0 ? 'invocation' : 'trigger');
              }}
              sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label="Invocation" />
              <Tab label="Trigger" />
            </Tabs>

            {/* Basic fields */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Update detection message */}
              {trimmedName && (
                <Alert severity={willUpdate ? 'warning' : 'info'} sx={{ py: 0.5 }}>
                  {willUpdate
                    ? `This will update the existing ${saveType} "${loadedInvocation?.DisplayName}"`
                    : `This will save as a new ${saveType}`}
                </Alert>
              )}

              <TextField
                autoFocus
                label="Name"
                placeholder="e.g., my-production-deployment"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  validateName(e.target.value);
                }}
                fullWidth
                required
                size="small"
                disabled={isSaving}
                error={!!error && error.includes('Name')}
                helperText={error.includes('Name') ? error : `Unique identifier for this ${saveType}`}
              />

              <Autocomplete
                size="small"
                options={spaces}
                getOptionLabel={(option) => option?.DisplayName || ''}
                value={spaces.find((s) => s?.SpaceID === selectedSpaceId) || null}
                onChange={(_, newValue) => setSelectedSpaceId(newValue?.SpaceID || '')}
                disabled={isSaving}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Space"
                    required
                    error={!!error && error.includes('Space')}
                    helperText={`Select the space for this ${saveType}`}
                  />
                )}
              />

              <FormControl fullWidth size="small">
                <InputLabel>Toolchain Type</InputLabel>
                <Select
                  value={toolchainType}
                  onChange={(e) => setToolchainType(e.target.value)}
                  label="Toolchain Type"
                  required
                  input={<OutlinedInput label="Toolchain Type" />}
                  disabled={isSaving}
                >
                  {availableToolchainTypes.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Trigger-specific fields */}
              {saveType === 'trigger' && (
                <>
                  <FormControl fullWidth size="small">
                    <InputLabel>Event Type</InputLabel>
                    <Select
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value as 'Mutation' | 'PostClone')}
                      label="Event Type"
                      input={<OutlinedInput label="Event Type" />}
                      disabled={isSaving}
                    >
                      <MenuItem value="Mutation">Mutation</MenuItem>
                      <MenuItem value="PostClone">PostClone</MenuItem>
                    </Select>
                  </FormControl>

                  <Stack direction="row" spacing={2}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={disabled}
                          onChange={(e) => setDisabled(e.target.checked)}
                          disabled={isSaving}
                        />
                      }
                      label="Disabled"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={enforced}
                          onChange={(e) => setEnforced(e.target.checked)}
                          disabled={isSaving}
                        />
                      }
                      label="Enforced"
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
                    • Disabled: Trigger won't execute even when events occur<br />
                    • Enforced: Cannot be overridden (implements mandatory policies)
                  </Typography>
                </>
              )}

              {/* Optional fields */}
              <Divider />
              <Typography variant="subtitle2">Optional Fields</Typography>

              {/* Labels */}
              <Box>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2">Labels</Typography>
                  <IconButton size="small" onClick={addLabel} disabled={isSaving}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Stack>
                {labels.map((label, index) => (
                  <Stack key={index} direction="row" spacing={1}>
                    <TextField
                      size="small"
                      label="Key"
                      value={label.key}
                      onChange={(e) => updateLabel(index, 'key', e.target.value)}
                      disabled={isSaving}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      size="small"
                      label="Value"
                      value={label.value}
                      onChange={(e) => updateLabel(index, 'value', e.target.value)}
                      disabled={isSaving}
                      sx={{ flex: 1 }}
                    />
                    <IconButton size="small" onClick={() => removeLabel(index)} disabled={isSaving}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Box>

              {/* Annotations */}
              <Box>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2">Annotations</Typography>
                  <IconButton size="small" onClick={addAnnotation} disabled={isSaving}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Stack>
                {annotations.map((annotation, index) => (
                  <Stack key={index} direction="row" spacing={1} sx={{ mb: 1 }}>
                    <TextField
                      size="small"
                      label="Key"
                      value={annotation.key}
                      onChange={(e) => updateAnnotation(index, 'key', e.target.value)}
                      disabled={isSaving}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      size="small"
                      label="Value"
                      value={annotation.value}
                      onChange={(e) => updateAnnotation(index, 'value', e.target.value)}
                      disabled={isSaving}
                      sx={{ flex: 1 }}
                    />
                    <IconButton size="small" onClick={() => removeAnnotation(index)} disabled={isSaving}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Box>

              {/* Bridge Worker */}
              <Autocomplete
                size="small"
                options={bridgeWorkers}
                getOptionLabel={(option) => option?.Slug || ''}
                value={bridgeWorkers.find((bw) => bw?.BridgeWorkerID === bridgeWorkerId) || null}
                onChange={(_, newValue) => setBridgeWorkerId(newValue?.BridgeWorkerID || '')}
                disabled={isSaving}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Bridge Worker"
                    helperText="Specify a bridge worker to execute this function"
                  />
                )}
              />
            </Box>

            {/* General error message */}
            {error && !error.includes('Name') && !error.includes('Space') && (
              <Alert ref={errorRef} severity="error">{error}</Alert>
            )}
          </Stack>
        </Box>

        {/* Sticky Action Footer */}
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1.5,
            padding: 2,
            borderTop: 1,
            borderColor: 'divider',
            backgroundColor: 'background.default',
            zIndex: 1,
          }}
        >
          <Button
            variant="outlined"
            startIcon={<CloseIcon />}
            onClick={onClose}
            disabled={!onClose}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            color="primary"
            disabled={isSaving || !trimmedName || !selectedSpaceId}
            startIcon={isSaving ? <CircularProgress size={16} /> : <SaveIcon />}
          >
            {isSaving ? 'Saving...' : willUpdate ? 'Update' : 'Save'}
          </Button>
        </Box>
      </Box>
    </Collapse>
  );
};
