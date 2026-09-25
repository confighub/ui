// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import UndoIcon from '@mui/icons-material/Undo';
import { CodeEditor } from '@/components/code-editor/CodeEditor';
import { decodeBase64Value } from './invocation-history.utils';
import { AttributeValueDataGrid } from './AttributeValueDataGrid';

export interface ValidationResultItem {
  Passed: boolean;
  Details?: string[];
  FailedAttributes?: string[];
  Message?: string;
  Reason?: string;
}

/**
 * Parsed CEL/expression error with location info
 */
export interface ParsedExpressionError {
  errorType: string;
  message: string;
  expression?: string;
  column?: number;
}

/**
 * Parse CEL/expression error messages into structured format
 * Handles errors like:
 * ERROR: <input>:1:8: Syntax error: token recognition error at: '= '
 *  | r.slug = "test-unit-hello"
 *  | .......^
 */
export const parseExpressionErrors = (errorMessage: string): ParsedExpressionError[] => {
  const errors: ParsedExpressionError[] = [];

  // Match ERROR patterns with optional expression and caret
  const errorPattern = /ERROR:\s*<[^>]+>:\d+:(\d+):\s*([^\n]+)(?:\n\s*\|\s*([^\n]+)\n\s*\|\s*([.^]+))?/g;

  let match;
  while ((match = errorPattern.exec(errorMessage)) !== null) {
    const [, columnStr, message, expression, caret] = match;
    errors.push({
      errorType: 'Syntax error',
      message: message.trim(),
      expression: expression?.trim(),
      column: caret ? caret.indexOf('^') + 1 : parseInt(columnStr, 10),
    });
  }

  // If no structured errors found, return the whole message as a single error
  if (errors.length === 0 && errorMessage.trim()) {
    // Check if it starts with common error patterns
    const simpleMatch = errorMessage.match(/failed to compile expression[^:]*:\s*(.+)/i);
    if (simpleMatch) {
      errors.push({
        errorType: 'Compilation error',
        message: simpleMatch[1].trim(),
      });
    } else {
      errors.push({
        errorType: 'Error',
        message: errorMessage.trim(),
      });
    }
  }

  return errors;
};

/**
 * Check if an error message contains CEL/expression syntax errors
 */
export const isExpressionError = (message: string): boolean => {
  return /ERROR:\s*<[^>]+>:\d+:\d+:|failed to compile expression/i.test(message);
};

interface FormattedErrorDisplayProps {
  message: string;
}

/**
 * Component to display formatted error messages, with special handling for CEL/expression errors
 */
export const FormattedErrorDisplay = ({ message }: FormattedErrorDisplayProps) => {
  if (!isExpressionError(message)) {
    // Return simple formatted text for non-expression errors
    return (
      <Typography
        variant="body2"
        sx={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message}
      </Typography>
    );
  }

  const errors = parseExpressionErrors(message);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {errors.map((error, idx) => (
        <Box key={idx}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
            {error.message}
          </Typography>
          {error.expression && (
            <Box
              sx={{
                mt: 1,
                p: 1.5,
                backgroundColor: 'grey.900',
                borderRadius: 1,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                overflow: 'auto',
              }}
            >
              <Box sx={{ color: 'grey.300', whiteSpace: 'pre' }}>
                {error.expression}
              </Box>
              {error.column && (
                <Box sx={{ color: 'error.light', whiteSpace: 'pre' }}>
                  {' '.repeat(error.column - 1)}^
                </Box>
              )}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
};

export interface AttributeValueItem {
  ResourceType?: string;
  ResourceName?: string;
  ResourceIndex?: number;
  Path?: string;
  AttributeName?: string;
  DataType?: string;
  Value?: unknown;
  Comment?: string;
  Index?: number;
}

// Extended type with unit information for combined views
export interface AttributeValueItemWithUnit extends AttributeValueItem {
  unitSlug: string;
  unitId: string;
  spaceId?: string;
}

// Results view mode type
export type ResultsViewMode = 'individual' | 'combined-flat' | 'combined-tree';

export interface ResourceItem {
  ResourceType?: string;
  ResourceName?: string;
  ResourceBody?: string;
}

export const looksLikeJSON = (str: string): boolean => {
  const trimmed = str.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[{') || trimmed.startsWith('[');
};

export const formatValueForDisplay = (value: string): { content: string; language: 'JSON' | 'yaml' } => {
  const decoded = decodeBase64Value(value);

  if (looksLikeJSON(decoded)) {
    try {
      const parsed = JSON.parse(decoded);
      return {
        content: JSON.stringify(parsed, null, 2),
        language: 'JSON',
      };
    } catch {
      return {
        content: decoded,
        language: 'yaml',
      };
    }
  }

  return {
    content: decoded,
    language: 'yaml',
  };
};

interface ValidationResultDisplayProps {
  value: string;
}

export const ValidationResultDisplay = ({ value }: ValidationResultDisplayProps) => {
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const decoded = decodeBase64Value(value);

  let validationResults: ValidationResultItem[] = [];
  let parseError = false;

  try {
    if (looksLikeJSON(decoded)) {
      validationResults = JSON.parse(decoded);
      if (!Array.isArray(validationResults)) {
        validationResults = [validationResults];
      }
    } else {
      parseError = true;
    }
  } catch {
    parseError = true;
  }

  const formatted = formatValueForDisplay(value);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <ButtonGroup size="small" variant="outlined">
          <Button
            onClick={() => setViewMode('formatted')}
            variant={viewMode === 'formatted' ? 'contained' : 'outlined'}
            sx={{ textTransform: 'none', fontSize: '0.75rem', px: 1.5, py: 0.5 }}
          >
            Formatted
          </Button>
          <Button
            onClick={() => setViewMode('raw')}
            variant={viewMode === 'raw' ? 'contained' : 'outlined'}
            sx={{ textTransform: 'none', fontSize: '0.75rem', px: 1.5, py: 0.5 }}
          >
            Raw
          </Button>
        </ButtonGroup>
      </Box>

      {viewMode === 'raw' || parseError ? (
        <Box
          sx={{
            borderRadius: 0.5,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <CodeEditor
            value={formatted.content}
            language={formatted.language}
            height={200}
            readonly={true}
            canEdit={false}
          />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {validationResults.map((result, idx) => (
            <Alert
              key={idx}
              severity={result.Passed ? 'success' : 'error'}
              icon={result.Passed ? <CheckCircleIcon /> : <ErrorIcon />}
              sx={{
                '& .MuiAlert-message': {
                  width: '100%',
                },
              }}
            >
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {result.Passed ? 'Validation Passed' : 'Validation Failed'}
                </Typography>

                {(result.Message || result.Reason) && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {result.Message || result.Reason}
                  </Typography>
                )}

                {result.FailedAttributes && result.FailedAttributes.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" fontWeight={600} display="block">
                      Failed Attributes:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {result.FailedAttributes.map((attr, i) => (
                        <Chip
                          key={i}
                          label={attr}
                          size="small"
                          color="error"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem', height: 20 }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}

                {result.Details && result.Details.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" fontWeight={600} display="block">
                      Details:
                    </Typography>
                    <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 2 }}>
                      {result.Details.map((detail, i) => (
                        <Typography key={i} component="li" variant="caption">
                          {detail}
                        </Typography>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            </Alert>
          ))}
        </Box>
      )}
    </Box>
  );
};

interface AttributeValueListDisplayProps {
  value: string;
  editable?: boolean;
  onSave?: (values: AttributeValueItem[], changeDescription: string) => void | Promise<void>;
}

// Type for undo history entries
interface UndoEntry {
  index: number;
  previousValue: unknown;
}

export const AttributeValueListDisplay = ({ value, editable = false, onSave }: AttributeValueListDisplayProps) => {
  const [viewMode, setViewMode] = useState<'table' | 'raw'>('table');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<number, unknown>>(new Map());
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [showCommitMessage, setShowCommitMessage] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const commitInputRef = useRef<HTMLInputElement>(null);
  const decoded = decodeBase64Value(value);

  // Autofocus the commit message input when it becomes visible
  useEffect(() => {
    if (showCommitMessage && commitInputRef.current) {
      commitInputRef.current.focus();
    }
  }, [showCommitMessage]);

  const { attributeValues, parseError } = useMemo(() => {
    let values: AttributeValueItem[] = [];
    let error = false;

    try {
      if (looksLikeJSON(decoded)) {
        values = JSON.parse(decoded);
        if (!Array.isArray(values)) {
          values = [values];
        }
      } else {
        error = true;
      }
    } catch {
      error = true;
    }

    return { attributeValues: values, parseError: error };
  }, [decoded]);

  const formatted = formatValueForDisplay(value);
  const isDirty = pendingChanges.size > 0;

  const handleStartEdit = useCallback((index: number) => {
    setEditingIndex(index);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null);
  }, []);

  const handleSaveEdit = useCallback((index: number, newValue: unknown) => {
    // Get the previous value (either from pending changes or original)
    const previousValue = pendingChanges.has(index)
      ? pendingChanges.get(index)
      : attributeValues[index]?.Value;

    // Add to undo stack
    setUndoStack((prev) => [...prev, { index, previousValue }]);

    // Update pending changes
    setPendingChanges((prev) => {
      const newChanges = new Map(prev);
      newChanges.set(index, newValue);
      return newChanges;
    });
    setEditingIndex(null);
  }, [pendingChanges, attributeValues]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    const lastEntry = undoStack[undoStack.length - 1];

    // Remove from undo stack
    setUndoStack((prev) => prev.slice(0, -1));

    // Restore the previous value
    setPendingChanges((prev) => {
      const newChanges = new Map(prev);
      // If the previous value was the original, remove from pending changes
      if (lastEntry.previousValue === attributeValues[lastEntry.index]?.Value) {
        newChanges.delete(lastEntry.index);
      } else {
        newChanges.set(lastEntry.index, lastEntry.previousValue);
      }
      return newChanges;
    });
  }, [undoStack, attributeValues]);

  const handleSaveClick = () => {
    if (!showCommitMessage) {
      // First click: show commit message input
      setShowCommitMessage(true);
    } else {
      // Second click: actually save
      handleConfirmSave();
    }
  };

  const handleConfirmSave = async () => {
    if (onSave) {
      const modifiedValues = attributeValues.map((item, index) => {
        if (pendingChanges.has(index)) {
          return { ...item, Value: pendingChanges.get(index) };
        }
        return item;
      });
      setSaveStatus('saving');
      try {
        await onSave(modifiedValues, commitMessage || 'Updated attributes via function invoker');
        setSaveStatus('saved');
        setPendingChanges(new Map());
        setShowCommitMessage(false);
        setCommitMessage('');
        // Auto-hide the "Saved" message after a delay
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch {
        setSaveStatus('idle');
      }
    }
  };

  const handleDiscardAll = () => {
    setPendingChanges(new Map());
    setUndoStack([]);
    setEditingIndex(null);
    setShowCommitMessage(false);
    setCommitMessage('');
  };

  const handleCommitMessageKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmSave();
    } else if (e.key === 'Escape') {
      setShowCommitMessage(false);
      setCommitMessage('');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        {editable && isDirty ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleUndo}
              disabled={saveStatus === 'saving' || undoStack.length === 0}
              startIcon={<UndoIcon sx={{ fontSize: 14 }} />}
              sx={{ textTransform: 'none', fontSize: '0.75rem', px: 1.5, py: 0.5 }}
            >
              Undo
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={handleDiscardAll}
              disabled={saveStatus === 'saving'}
              sx={{ textTransform: 'none', fontSize: '0.75rem', px: 1.5, py: 0.5 }}
            >
              Discard All
            </Button>
            {showCommitMessage && (
              <TextField
                inputRef={commitInputRef}
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={handleCommitMessageKeyDown}
                placeholder="Change description (optional)"
                size="small"
                disabled={saveStatus === 'saving'}
                sx={{
                  minWidth: 200,
                  '& .MuiInputBase-input': {
                    fontSize: '0.75rem',
                    py: 0.5,
                    px: 1,
                  },
                }}
              />
            )}
            <Button
              size="small"
              variant="contained"
              onClick={handleSaveClick}
              disabled={saveStatus === 'saving'}
              sx={{ textTransform: 'none', fontSize: '0.75rem', px: 1.5, py: 0.5 }}
            >
              {saveStatus === 'saving' ? 'Saving...' : showCommitMessage ? 'Confirm Save' : 'Save Changes'}
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
          <Box />
        )}
        <ButtonGroup size="small" variant="outlined">
          <Button
            onClick={() => setViewMode('table')}
            variant={viewMode === 'table' ? 'contained' : 'outlined'}
            sx={{ textTransform: 'none', fontSize: '0.75rem', px: 1.5, py: 0.5 }}
          >
            Table
          </Button>
          <Button
            onClick={() => setViewMode('raw')}
            variant={viewMode === 'raw' ? 'contained' : 'outlined'}
            sx={{ textTransform: 'none', fontSize: '0.75rem', px: 1.5, py: 0.5 }}
          >
            Raw
          </Button>
        </ButtonGroup>
      </Box>

      {viewMode === 'raw' || parseError ? (
        <Box
          sx={{
            borderRadius: 0.5,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <CodeEditor
            value={formatted.content}
            language={formatted.language}
            height={200}
            readonly={true}
            canEdit={false}
          />
        </Box>
      ) : (
        <AttributeValueDataGrid
          attributeValues={attributeValues}
          editable={editable}
          editingIndex={editingIndex}
          pendingChanges={pendingChanges}
          undoStack={undoStack}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onUndo={handleUndo}
        />
      )}
    </Box>
  );
};

interface ResourceListDisplayProps {
  value: string;
}

// Utility functions for combining results across units

/**
 * Combines attribute value results from multiple unit responses into a flat array
 * Each item is tagged with its unit information for display/sorting
 */
export const combineAttributeResultsFlat = (
  responses: { UnitID?: string; SpaceID?: string; Outputs?: Record<string, string> | null }[],
  unitIdToSlugMap: Record<string, string>,
): AttributeValueItemWithUnit[] => {
  const combined: AttributeValueItemWithUnit[] = [];

  for (const response of responses) {
    if (!response.Outputs) continue;

    const unitId = response.UnitID || '';
    const unitSlug = unitIdToSlugMap[unitId] || unitId || 'Unknown';
    const spaceId = response.SpaceID;

    // Find attribute value list outputs
    for (const [key, value] of Object.entries(response.Outputs)) {
      const isAttributeValueList =
        key === 'AttributeValueList' || key.toLowerCase().includes('attribute');

      if (!isAttributeValueList) continue;

      try {
        const decoded = decodeBase64Value(value);
        if (!looksLikeJSON(decoded)) continue;

        const parsed = JSON.parse(decoded);
        const items: AttributeValueItem[] = Array.isArray(parsed) ? parsed : [parsed];

        // Verify it's actually an attribute list
        if (items.length === 0 || (items[0].AttributeName === undefined && items[0].Path === undefined)) {
          continue;
        }

        for (const item of items) {
          combined.push({
            ...item,
            unitSlug,
            unitId,
            spaceId,
          });
        }
      } catch {
        // Skip invalid data
      }
    }
  }

  return combined;
};

// Extended type for validation results with unit information
export interface ValidationResultItemWithUnit extends ValidationResultItem {
  unitSlug: string;
  unitId: string;
  spaceId?: string;
}

/**
 * Combines validation results from multiple unit responses into a flat array
 * Each item is tagged with its unit information for display/sorting
 */
export const combineValidationResultsFlat = (
  responses: { UnitID?: string; SpaceID?: string; Outputs?: Record<string, string> | null }[],
  unitIdToSlugMap: Record<string, string>,
): ValidationResultItemWithUnit[] => {
  const combined: ValidationResultItemWithUnit[] = [];

  for (const response of responses) {
    if (!response.Outputs) continue;

    const unitId = response.UnitID || '';
    const unitSlug = unitIdToSlugMap[unitId] || unitId || 'Unknown';
    const spaceId = response.SpaceID;

    // Find validation result outputs
    for (const [key, value] of Object.entries(response.Outputs)) {
      const isValidationResult =
        key === 'ValidationResult' || key === 'ValidationResultList';

      if (!isValidationResult) continue;

      try {
        const decoded = decodeBase64Value(value);
        if (!looksLikeJSON(decoded)) continue;

        const parsed = JSON.parse(decoded);
        const items: ValidationResultItem[] = Array.isArray(parsed) ? parsed : [parsed];

        // Verify it's actually a validation result
        if (items.length === 0 || items[0].Passed === undefined) {
          continue;
        }

        for (const item of items) {
          combined.push({
            ...item,
            unitSlug,
            unitId,
            spaceId,
          });
        }
      } catch {
        // Skip invalid data
      }
    }
  }

  return combined;
};

// Type for pivot view rows for validation results
export interface ValidationPivotRow {
  id: string;
  testName: string; // Identifier for the validation test
  // Dynamic keys for unit values: [unitSlug]: { passed, message, details, unitId, spaceId }
  unitValues: Record<string, {
    passed: boolean;
    message?: string;
    reason?: string;
    details?: string[];
    failedAttributes?: string[];
    unitId: string;
    spaceId?: string;
  }>;
}

/**
 * Combines validation results into pivot format
 * Each validation test becomes a row, with columns for each unit's result
 */
export const combineValidationResultsPivot = (
  responses: { UnitID?: string; SpaceID?: string; Outputs?: Record<string, string> | null }[],
  unitIdToSlugMap: Record<string, string>,
): { pivotRows: ValidationPivotRow[]; unitSlugs: string[] } => {
  const validationMap = new Map<string, ValidationPivotRow>();
  const unitSlugsSet = new Set<string>();

  for (const response of responses) {
    if (!response.Outputs) continue;

    const unitId = response.UnitID || '';
    const unitSlug = unitIdToSlugMap[unitId] || unitId || 'Unknown';
    const spaceId = response.SpaceID;

    unitSlugsSet.add(unitSlug);

    // Find validation result outputs
    for (const [key, value] of Object.entries(response.Outputs)) {
      const isValidationResult =
        key === 'ValidationResult' || key === 'ValidationResultList';

      if (!isValidationResult) continue;

      try {
        const decoded = decodeBase64Value(value);
        if (!looksLikeJSON(decoded)) continue;

        const parsed = JSON.parse(decoded);
        const items: ValidationResultItem[] = Array.isArray(parsed) ? parsed : [parsed];

        // Verify it's actually a validation result
        if (items.length === 0 || items[0].Passed === undefined) {
          continue;
        }

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          // Create a unique key for this validation test
          // Use index and message/reason to identify each test
          const testIdentifier = item.Message || item.Reason || `Validation ${i + 1}`;
          const validationKey = `${key}_${i}_${testIdentifier}`;

          if (!validationMap.has(validationKey)) {
            validationMap.set(validationKey, {
              id: validationKey,
              testName: testIdentifier,
              unitValues: {},
            });
          }

          const pivotRow = validationMap.get(validationKey)!;
          pivotRow.unitValues[unitSlug] = {
            passed: item.Passed,
            message: item.Message,
            reason: item.Reason,
            details: item.Details,
            failedAttributes: item.FailedAttributes,
            unitId,
            spaceId,
          };
        }
      } catch {
        // Skip invalid data
      }
    }
  }

  const unitSlugs = Array.from(unitSlugsSet).sort();
  const pivotRows = Array.from(validationMap.values());

  return { pivotRows, unitSlugs };
};

export const ResourceListDisplay = ({ value }: ResourceListDisplayProps) => {
  const [viewMode, setViewMode] = useState<'table' | 'raw'>('table');
  const decoded = decodeBase64Value(value);

  let resources: ResourceItem[] = [];
  let parseError = false;

  try {
    if (looksLikeJSON(decoded)) {
      resources = JSON.parse(decoded);
      if (!Array.isArray(resources)) {
        resources = [resources];
      }
    } else {
      parseError = true;
    }
  } catch {
    parseError = true;
  }

  const formatted = formatValueForDisplay(value);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <ButtonGroup size="small" variant="outlined">
          <Button
            onClick={() => setViewMode('table')}
            variant={viewMode === 'table' ? 'contained' : 'outlined'}
            sx={{ textTransform: 'none', fontSize: '0.75rem', px: 1.5, py: 0.5 }}
          >
            Table
          </Button>
          <Button
            onClick={() => setViewMode('raw')}
            variant={viewMode === 'raw' ? 'contained' : 'outlined'}
            sx={{ textTransform: 'none', fontSize: '0.75rem', px: 1.5, py: 0.5 }}
          >
            Raw
          </Button>
        </ButtonGroup>
      </Box>

      {viewMode === 'raw' || parseError ? (
        <Box
          sx={{
            borderRadius: 0.5,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <CodeEditor
            value={formatted.content}
            language={formatted.language}
            height={200}
            readonly={true}
            canEdit={false}
          />
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{
            maxHeight: 400,
            '& .MuiTableCell-root': {
              fontSize: '0.75rem',
              py: 0.75,
            },
          }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Resource Type</TableCell>
                <TableCell>Resource Name</TableCell>
                <TableCell>Resource Body</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {resources.map((item, idx) => {
                const resourceBodyDisplay = (() => {
                  if (!item.ResourceBody) return '-';
                  try {
                    const parsed = JSON.parse(item.ResourceBody);
                    return JSON.stringify(parsed, null, 2);
                  } catch {
                    return item.ResourceBody;
                  }
                })();

                return (
                  <TableRow key={idx} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                        {item.ResourceType || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.75rem',
                          fontFamily: 'var(--font-mono)',
                          wordBreak: 'break-word',
                        }}
                      >
                        {item.ResourceName || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          maxWidth: 500,
                          maxHeight: 200,
                          overflow: 'auto',
                        }}
                      >
                        <Typography
                          variant="body2"
                          component="pre"
                          sx={{
                            fontSize: '0.7rem',
                            fontFamily: 'var(--font-mono)',
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap',
                            margin: 0,
                          }}
                        >
                          {resourceBodyDisplay}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};
