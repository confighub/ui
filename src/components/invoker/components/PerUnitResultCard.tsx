// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type CSSProperties } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';

import { TreeDiffSection } from '@/pages/x/apps/TreeDiffSection';
import { componentTheme } from '@/pages/x/apps/componentTheme';
import type { FunctionInvocationsResponse } from '@confighub/rtk-query';

import {
  AttributeValueItem,
  AttributeValueListDisplay,
  ResourceListDisplay,
  ValidationResultDisplay,
  ValidationResultItem,
  looksLikeJSON,
} from '../utils/result-formatters';
import { decodeBase64Value } from '../utils/invocation-history.utils';
import type { UnitDiff } from '../utils/diff-from-revisions';

type StatusTone = 'success' | 'warning' | 'error' | 'neutral';

interface UnitSummary {
  tone: StatusTone;
  text: string;
}

/** Classify an invocation response into a single stoplight tone + one-line
 *  summary. Order of precedence: failure > validation-failure > mutation >
 *  outputs-only > no-op. */
const summarize = (
  response: FunctionInvocationsResponse,
  diff: UnitDiff | undefined,
): UnitSummary => {
  if (response.Error || response.Success === false) {
    const msg = response.Error?.Message?.trim();
    return {
      tone: 'error',
      text: msg ? `failed: ${truncate(msg, 80)}` : 'failed',
    };
  }

  const validationFailed = detectValidationFailure(response);
  const diffCount = diff?.diffs.length ?? 0;
  const outputCount = response.Outputs ? Object.keys(response.Outputs).length : 0;

  if (diffCount > 0) {
    const base = `${diffCount} field${diffCount === 1 ? '' : 's'} changed`;
    return {
      tone: validationFailed ? 'warning' : 'success',
      text: validationFailed ? `${base} · validation failed` : base,
    };
  }

  if (validationFailed) {
    return { tone: 'warning', text: 'validation failed' };
  }

  if (outputCount > 0) {
    // Distinguish a pure validation pass from other outputs.
    if (hasValidationOutput(response)) {
      return { tone: 'success', text: 'validation passed' };
    }
    return { tone: 'success', text: `${outputCount} output${outputCount === 1 ? '' : 's'}` };
  }

  return { tone: 'neutral', text: 'no changes' };
};

const detectValidationFailure = (response: FunctionInvocationsResponse): boolean => {
  const outputs = response.Outputs;
  if (!outputs) return false;
  const key = Object.keys(outputs).find(
    (k) => k === 'ValidationResult' || k === 'ValidationResultList',
  );
  if (!key) return false;
  try {
    const decoded = decodeBase64Value(outputs[key]);
    if (!looksLikeJSON(decoded)) return false;
    const parsed = JSON.parse(decoded);
    const results: ValidationResultItem[] = Array.isArray(parsed) ? parsed : [parsed];
    return results.some((r) => r?.Passed === false);
  } catch {
    return false;
  }
};

const hasValidationOutput = (response: FunctionInvocationsResponse): boolean => {
  const outputs = response.Outputs;
  if (!outputs) return false;
  return Object.keys(outputs).some(
    (k) => k === 'ValidationResult' || k === 'ValidationResultList',
  );
};

const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const toneColor = (tone: StatusTone): string => {
  switch (tone) {
    case 'success':
      return '#2e7d32';
    case 'warning':
      return '#ed6c02';
    case 'error':
      return '#d32f2f';
    case 'neutral':
    default:
      return '#9e9e9e';
  }
};

interface StatusDotProps {
  tone: StatusTone;
}

const StatusDot = ({ tone }: StatusDotProps) => (
  <Box
    component="span"
    aria-hidden
    sx={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      flexShrink: 0,
      backgroundColor: toneColor(tone),
    }}
  />
);

export interface PerUnitResultCardProps {
  response: FunctionInvocationsResponse;
  diff?: UnitDiff;
  /** Human-readable slug; falls back to UnitID when unknown. */
  unitDisplay: string;
  /** Diff-tree column state, shared across cards so the columns align. */
  columnStyle: CSSProperties;
  onDividerMouseDown: (columnIndex: 0 | 1, e: React.MouseEvent) => void;
  isDragging?: boolean;
  /** When provided, AttributeValueListDisplay renders in editable mode. */
  onSaveAttributes?: (
    unitId: string,
    spaceId: string,
    attributes: AttributeValueItem[],
    changeDescription: string,
  ) => Promise<void>;
}

export const PerUnitResultCard = ({
  response,
  diff,
  unitDisplay,
  columnStyle,
  onDividerMouseDown,
  isDragging,
  onSaveAttributes,
}: PerUnitResultCardProps) => {
  const summary = summarize(response, diff);
  const spaceId = response.SpaceID;
  const unitId = response.UnitID;
  const hasDiff = diff && diff.diffs.length > 0;
  const hasOutputs = response.Outputs && Object.keys(response.Outputs).length > 0;

  return (
    <Box
      sx={{
        py: 1.25,
        borderTop: `1px solid ${componentTheme.borderDefault}`,
        '&:last-of-type': { borderBottom: `1px solid ${componentTheme.borderDefault}` },
      }}
    >
      {/* Header — slug link · dot · summary text */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5 }}>
        {spaceId && unitId ? (
          <Link
            component={RouterLink}
            to={`/units/${spaceId}/${unitId}`}
            underline="hover"
            color="text.primary"
            sx={{
              fontFamily: componentTheme.fontSans,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {unitDisplay}
          </Link>
        ) : (
          <Typography
            sx={{
              fontFamily: componentTheme.fontSans,
              fontWeight: 600,
              fontSize: 13,
              color: 'text.primary',
            }}
          >
            {unitDisplay}
          </Typography>
        )}
        <StatusDot tone={summary.tone} />
        <Typography
          variant="caption"
          sx={{
            fontFamily: componentTheme.fontSans,
            color: summary.tone === 'error' ? toneColor('error') : 'text.secondary',
          }}
        >
          {summary.text}
        </Typography>
      </Box>

      {/* Error — only when the invocation failed */}
      {response.Error && (
        <Box sx={{ px: 1.5, pt: 0.5 }}>
          <Alert severity="error" sx={{ mt: 0.5 }}>
            <Typography variant="body2" fontWeight={600}>
              {response.Error.Message || 'An error occurred'}
            </Typography>
            {response.Error.Details && response.Error.Details.length > 0 && (
              <Box sx={{ mt: 1 }}>
                {response.Error.Details.map((detail, idx) => (
                  <Typography
                    key={idx}
                    variant="body2"
                    sx={{ fontSize: '0.85rem', mt: 0.5 }}
                  >
                    • {detail}
                  </Typography>
                ))}
              </Box>
            )}
            {response.Error.ErrorCategory && (
              <Typography
                variant="caption"
                sx={{ mt: 1, display: 'block', color: 'error.dark' }}
              >
                Category: {response.Error.ErrorCategory}
              </Typography>
            )}
          </Alert>
        </Box>
      )}

      {/* Diff tree — only when the invocation mutated data */}
      {hasDiff && (
        <Box sx={{ mt: 0.5 }}>
          <TreeDiffSection
            entry={{ unitId: diff!.unitId, fieldDiffs: diff!.diffs }}
            allPaths={diff!.allPaths}
            keyPrefix={`invoke-${diff!.unitId}`}
            label="invoke"
            variant="data"
            columnStyle={columnStyle}
            onDividerMouseDown={onDividerMouseDown}
            isDragging={isDragging}
            hideLabel
          />
        </Box>
      )}

      {/* Outputs — validation / attribute / resource renderers, with a
          muted fallback for any other key so custom function outputs are
          still visible without accordion chrome. */}
      {hasOutputs && (
        <Box sx={{ px: 1.5, pt: hasDiff || response.Error ? 1 : 0.5, pb: 0.5 }}>
          {Object.entries(response.Outputs!).map(([key, value]) => {
            const isValidation = key === 'ValidationResult' || key === 'ValidationResultList';
            const isAttributeList =
              key === 'AttributeValueList' || key.toLowerCase().includes('attribute');
            const isResourceList =
              key === 'ResourceList' || key.toLowerCase().includes('resourcelist');

            if (isValidation) {
              return (
                <OutputBlock key={key} label={key}>
                  <ValidationResultDisplay value={value} />
                </OutputBlock>
              );
            }

            if (isAttributeList) {
              const decoded = decodeBase64Value(value);
              let isActuallyAttributeList = false;
              try {
                if (looksLikeJSON(decoded)) {
                  const parsed = JSON.parse(decoded);
                  const arr = Array.isArray(parsed) ? parsed : [parsed];
                  isActuallyAttributeList =
                    arr.length > 0 &&
                    arr[0] &&
                    (arr[0].AttributeName !== undefined || arr[0].Path !== undefined);
                }
              } catch {
                // not an attribute list — fall through to generic
              }
              if (isActuallyAttributeList) {
                const canEdit = !!(onSaveAttributes && unitId && spaceId);
                return (
                  <OutputBlock key={key} label={key}>
                    <AttributeValueListDisplay
                      value={value}
                      editable={canEdit}
                      onSave={
                        canEdit
                          ? (attributes, changeDescription) => {
                              onSaveAttributes!(unitId!, spaceId!, attributes, changeDescription);
                            }
                          : undefined
                      }
                    />
                  </OutputBlock>
                );
              }
            }

            if (isResourceList) {
              const decoded = decodeBase64Value(value);
              let isActuallyResourceList = false;
              try {
                if (looksLikeJSON(decoded)) {
                  const parsed = JSON.parse(decoded);
                  const arr = Array.isArray(parsed) ? parsed : [parsed];
                  isActuallyResourceList =
                    arr.length > 0 &&
                    arr[0] &&
                    (arr[0].ResourceType !== undefined ||
                      arr[0].ResourceName !== undefined ||
                      arr[0].ResourceBody !== undefined);
                }
              } catch {
                // not a resource list — fall through to generic
              }
              if (isActuallyResourceList) {
                return (
                  <OutputBlock key={key} label={key}>
                    <ResourceListDisplay value={value} />
                  </OutputBlock>
                );
              }
            }

            // Generic fallback — preserves visibility of custom output keys.
            const decoded = decodeBase64Value(value);
            return (
              <OutputBlock key={key} label={key}>
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1,
                    backgroundColor: 'action.hover',
                    borderRadius: 0.5,
                    overflow: 'auto',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                  }}
                >
                  {decoded}
                </Typography>
              </OutputBlock>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

interface OutputBlockProps {
  label: string;
  children: React.ReactNode;
}

const OutputBlock = ({ label, children }: OutputBlockProps) => (
  <Box sx={{ mb: 1.25, '&:last-child': { mb: 0 } }}>
    <Typography
      variant="caption"
      sx={{
        display: 'block',
        mb: 0.5,
        fontFamily: componentTheme.fontSans,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: 'text.secondary',
        fontSize: 10,
      }}
    >
      {label}
    </Typography>
    {children}
  </Box>
);
