// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { FunctionSignature } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import {
  HoverCard,
  HoverCardBadge,
  HoverCardHeader,
  HoverCardMetadataLabel,
  HoverCardMetadataRow,
  HoverCardMetadataValue,
  HoverCardSection,
  HoverCardSubtitle,
  HoverCardTitle,
  ParamItem,
  ParamName,
  ParamType,
} from '../../components/hover-card/HoverCard';

// ============================================================================
// TYPES
// ============================================================================

interface FunctionHoverCardProps {
  /** The function signature to display details for */
  func: FunctionSignature & { category?: string };
  children: React.ReactElement;
}

// ============================================================================
// CONTENT COMPONENT
// ============================================================================

const FunctionHoverCardContent = ({
  func,
}: {
  func: FunctionSignature & { category?: string };
}) => {
  const hasParameters = func.Parameters && func.Parameters.length > 0;
  const properties = [
    func.Mutating && 'Mutating',
    func.Hermetic && 'Hermetic',
    func.Idempotent && 'Idempotent',
    func.Validating && 'Validating',
  ].filter(Boolean);

  return (
    <>
      {/* Header: function name + toolchain badge */}
      <HoverCardHeader>
        <Box sx={{ overflow: 'hidden' }}>
          <HoverCardTitle variant='subtitle2'>{func.FunctionName}</HoverCardTitle>
          {func.FunctionType && <HoverCardSubtitle>{func.FunctionType}</HoverCardSubtitle>}
        </Box>
        {func.category && <HoverCardBadge>{func.category}</HoverCardBadge>}
      </HoverCardHeader>

      {/* Description */}
      {func.Description && (
        <Typography
          sx={{
            fontSize: '0.75rem',
            color: 'text.secondary',
            lineHeight: 1.4,
            mb: 0.5,
          }}
        >
          {func.Description}
        </Typography>
      )}

      {/* Metadata rows */}
      <Box>
        {properties.length > 0 && (
          <HoverCardMetadataRow>
            <HoverCardMetadataLabel>Properties</HoverCardMetadataLabel>
            <HoverCardMetadataValue>{properties.join(', ')}</HoverCardMetadataValue>
          </HoverCardMetadataRow>
        )}
        {func.OutputInfo?.OutputType && (
          <HoverCardMetadataRow>
            <HoverCardMetadataLabel>Output</HoverCardMetadataLabel>
            <HoverCardMetadataValue>{func.OutputInfo.OutputType}</HoverCardMetadataValue>
          </HoverCardMetadataRow>
        )}
      </Box>

      {/* Parameters */}
      {hasParameters && (
        <HoverCardSection>
          <Typography
            sx={{
              fontSize: '0.625rem',
              fontWeight: 600,
              color: 'text.secondary',
              letterSpacing: '0.04em',
              mb: 0.5,
            }}
          >
            Parameters ({func.Parameters?.length})
          </Typography>
          {func.Parameters?.slice(0, 5).map((param, index) => (
            <ParamItem key={param.ParameterName || index}>
              <ParamName>
                {param.ParameterName}
                {index < (func.RequiredParameters ?? 0) ? '*' : ''}
              </ParamName>
              <Tooltip
                title={param.Description || ''}
                placement='top'
                arrow
                disableHoverListener={!param.Description}
              >
                <ParamType>{param.DataType}</ParamType>
              </Tooltip>
            </ParamItem>
          ))}
          {func.Parameters && func.Parameters.length > 5 && (
            <Typography
              sx={{
                fontSize: '0.625rem',
                color: 'text.secondary',
                fontStyle: 'italic',
                mt: 0.5,
              }}
            >
              +{func.Parameters.length - 5} more parameters
            </Typography>
          )}
        </HoverCardSection>
      )}
    </>
  );
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Hover card that displays function signature details in a popover.
 */
export const FunctionHoverCard = ({ func, children }: FunctionHoverCardProps) => {
  return (
    <HoverCard content={<FunctionHoverCardContent func={func} />} placement='left-start'>
      {children}
    </HoverCard>
  );
};
