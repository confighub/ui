// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import BlockIcon from '@mui/icons-material/Block';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SchemaOutlinedIcon from '@mui/icons-material/SchemaOutlined';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';

import { changeOrderFontMono, changeOrderInk, changeOrderStatus, changeOrderType } from '../changeOrdersTokens';
import { draftCopy } from './draftCopy';
import { DRAFT_NONE, DRAFT_UPDATE_TYPES, type DraftWorkflowChoice } from './draftDecisions';
import { FIELD_BUTTON_SX, NOW_VALUE_SX, OPTION_SX, PILL_SX } from './draftLook';
import { DraftPopover, OptionText, PopoverDivider, PopoverHeading } from './DraftPopover';
import type { DraftUpdateType, DraftWorkflow } from './draftTypes';

/** The ids the blocker focuses when Path or Same holds the first problem. */
export const DRAFT_WORKFLOW_ID = 'draft-workflow';
export const DRAFT_UPDATE_TYPE_ID = 'draft-update-type';

export interface WorkflowPickerProps {
  value: DraftWorkflowChoice;
  workflows: readonly DraftWorkflow[];
  required: boolean;
  componentName: string;
  /** A workflow slug, or `DRAFT_NONE`. */
  onPick: (wf: string) => void;
}

/**
 * The Path row's workflow, as a control: its slug, and the policy's choices under it. Only the
 * workflows the Component allows are offered; "No workflow" only where the policy does not
 * require one.
 */
export function WorkflowPicker({
  value,
  workflows,
  required,
  componentName,
  onPick,
}: WorkflowPickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const pick = (wf: string) => {
    setAnchor(null);
    onPick(wf);
  };
  const title = draftCopy.page.workflow.title(componentName);
  const label =
    value.kind === 'workflow'
      ? value.workflow.slug
      : value.kind === 'none'
        ? draftCopy.page.ledger.noWorkflow
        : draftCopy.page.ledger.unset;

  return (
    <>
      <Box
        component="button"
        type="button"
        id={DRAFT_WORKFLOW_ID}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-label={`${draftCopy.page.ledger.path}: ${label}`}
        onClick={(event) => setAnchor(event.currentTarget)}
        data-testid="draft-workflow"
        sx={FIELD_BUTTON_SX}
      >
        <Box
          component="span"
          translate="no"
          sx={{
            ...NOW_VALUE_SX,
            fontFamily: value.kind === 'workflow' ? changeOrderFontMono : 'inherit',
            color: value.kind === 'unset' ? changeOrderStatus.warn : changeOrderInk.default,
          }}
        >
          {label}
        </Box>
        <ExpandMoreIcon aria-hidden sx={{ fontSize: 16, color: changeOrderInk.subtle }} />
      </Box>
      <DraftPopover anchorEl={anchor} onClose={() => setAnchor(null)} label={title}>
        <PopoverHeading icon={<VerifiedUserOutlinedIcon aria-hidden />}>{title}</PopoverHeading>
        <Box role="menu" aria-label={title}>
          {workflows.map((workflow) => (
            <Box
              key={workflow.workflowId}
              component="button"
              type="button"
              role="menuitemradio"
              data-draft-option
              aria-checked={value.kind === 'workflow' && value.workflow.workflowId === workflow.workflowId}
              onClick={() => pick(workflow.slug)}
              sx={OPTION_SX}
            >
              <SchemaOutlinedIcon aria-hidden />
              <OptionText
                mono
                title={<span translate="no">{workflow.slug}</span>}
                sub={workflow.stageNames.length > 0 ? workflow.stageNames.join(' → ') : undefined}
              />
            </Box>
          ))}
          {required ? null : (
            <>
              <PopoverDivider />
              <Box
                component="button"
                type="button"
                role="menuitemradio"
                data-draft-option
                aria-checked={value.kind === 'none'}
                onClick={() => pick(DRAFT_NONE)}
                sx={OPTION_SX}
              >
                <BlockIcon aria-hidden />
                <OptionText title={draftCopy.page.ledger.noWorkflow} sub={draftCopy.page.workflow.noneLine} />
              </Box>
            </>
          )}
        </Box>
      </DraftPopover>
    </>
  );
}

export interface UpdateTypePickerProps {
  value: DraftUpdateType;
  onPick: (value: DraftUpdateType) => void;
  /** As a chip in the Same row; otherwise as the value in its own diff row. */
  asChip: boolean;
  /** Told when the popover opens and closes, so the ledger keeps the control where it was while it is open. */
  onOpenChange?: (open: boolean) => void;
}

/** The Same row's update type chip, and the two a "Base changes" draft can propagate by. */
export function UpdateTypePicker({
  value,
  onPick,
  asChip,
  onOpenChange,
}: UpdateTypePickerProps) {
  const [anchor, setAnchorState] = useState<HTMLElement | null>(null);
  const setAnchor = (next: HTMLElement | null) => {
    setAnchorState(next);
    onOpenChange?.(next !== null);
  };
  const copy = draftCopy.page.updateType;
  return (
    <>
      <Box
        component="button"
        type="button"
        id={DRAFT_UPDATE_TYPE_ID}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-label={`${copy.title}: ${value}`}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={asChip ? PILL_SX : FIELD_BUTTON_SX}
      >
        {asChip ? <SyncAltIcon aria-hidden /> : null}
        <Box
          component="span"
          translate="no"
          sx={
            asChip
              ? { fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.small, color: changeOrderInk.default }
              : NOW_VALUE_SX
          }
        >
          {value}
        </Box>
        <ExpandMoreIcon aria-hidden sx={asChip ? undefined : { fontSize: 16, color: changeOrderInk.subtle }} />
      </Box>
      <DraftPopover anchorEl={anchor} onClose={() => setAnchor(null)} label={copy.title}>
        <PopoverHeading icon={<SyncAltIcon aria-hidden />}>{copy.title}</PopoverHeading>
        <Box role="menu" aria-label={copy.title}>
          {DRAFT_UPDATE_TYPES.map((type) => (
            <Box
              key={type}
              component="button"
              type="button"
              role="menuitemradio"
              data-draft-option
              aria-checked={value === type}
              onClick={() => {
                setAnchor(null);
                onPick(type);
              }}
              sx={OPTION_SX}
            >
              <OptionText mono title={<span translate="no">{type}</span>} sub={copy[type]} />
            </Box>
          ))}
        </Box>
      </DraftPopover>
    </>
  );
}
