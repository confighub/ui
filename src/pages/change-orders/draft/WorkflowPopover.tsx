// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import BlockIcon from '@mui/icons-material/Block';
import SchemaOutlinedIcon from '@mui/icons-material/SchemaOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';

import { changeOrderStatus } from '../changeOrdersTokens';
import { draftCopy } from './draftCopy';
import { DRAFT_NONE, type DraftWorkflowChoice } from './draftDecisions';
import { OPTION_SX } from './draftLook';
import { DraftPopover, FactSlot, LastTimeMark, OptionText, PopoverDivider, PopoverHeading } from './DraftPopover';
import type { DraftWorkflow } from './draftTypes';

/** The id the blocker focuses when the workflow holds the first problem. */
export const DRAFT_WORKFLOW_ID = 'draft-workflow';

export interface WorkflowPickerProps {
  value: DraftWorkflowChoice;
  workflows: readonly DraftWorkflow[];
  required: boolean;
  componentName: string;
  /** Last time's workflow, marked in the popover. `undefined` with no last ChangeOrder to compare. */
  last: DraftWorkflowChoice | undefined;
  /** This draft's workflow is not last time's: the slot says what it was, and offers the way back. */
  changed: boolean;
  /** The ids of the problems said about the workflow. */
  problemIds: readonly string[];
  /** A workflow slug, or `DRAFT_NONE`. */
  onPick: (wf: string) => void;
  /** Back to last time's workflow. */
  onRevert: () => void;
  /** Why a workflow cannot govern this kind of change, if it cannot: shown, and not chosen. */
  unusable?: (workflow: DraftWorkflow) => string | undefined;
}

/** A workflow choice as the slot says it: its slug, "No workflow", or "Pick one". */
function choiceLabel(choice: DraftWorkflowChoice): string {
  if (choice.kind === 'workflow') return choice.workflow.slug;
  return choice.kind === 'none' ? draftCopy.page.facts.noWorkflow : draftCopy.page.facts.unset;
}

/**
 * The Workflow fact, as a control: its slug, and the policy's choices under it. Only the
 * workflows the Component allows are offered; "No workflow" only where the policy does not
 * require one.
 */
export function WorkflowPicker({
  value,
  workflows,
  required,
  componentName,
  last,
  changed,
  problemIds,
  onPick,
  onRevert,
  unusable,
}: WorkflowPickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const pick = (wf: string) => {
    setAnchor(null);
    onPick(wf);
  };
  const title = draftCopy.page.workflow.title(componentName);
  const label = choiceLabel(value);
  const lastLabel = changed && last !== undefined ? choiceLabel(last) : undefined;
  const lastWorkflowId = last?.kind === 'workflow' ? last.workflow.workflowId : undefined;

  return (
    <>
      <FactSlot
        id={DRAFT_WORKFLOW_ID}
        testId="draft-workflow"
        term={draftCopy.page.facts.workflow}
        value={label}
        last={lastLabel}
        revert={lastLabel === undefined ? undefined : { label: draftCopy.page.facts.backTo(lastLabel), onClick: onRevert }}
        open={anchor !== null}
        mono={value.kind === 'workflow'}
        tone={value.kind === 'unset' ? changeOrderStatus.warn : undefined}
        problemIds={problemIds}
        onOpen={setAnchor}
      />
      <DraftPopover anchorEl={anchor} onClose={() => setAnchor(null)} label={draftCopy.page.facts.workflow}>
        <PopoverHeading icon={<VerifiedUserOutlinedIcon aria-hidden />}>{title}</PopoverHeading>
        <Box role="menu" aria-label={title}>
          {workflows.map((workflow) => {
            const reason = unusable?.(workflow);
            let sub: ReactNode = workflow.stageNames.length > 0 ? workflow.stageNames.join(' → ') : undefined;
            if (reason !== undefined) sub = <Box component="span" sx={{ color: changeOrderStatus.warn }}>{reason}</Box>;
            return (
              <Box
                key={workflow.workflowId}
                component="button"
                type="button"
                role="menuitemradio"
                data-draft-option
                // One this change cannot use is never shown as the choice: another is to be picked.
                aria-checked={reason === undefined && value.kind === 'workflow' && value.workflow.workflowId === workflow.workflowId}
                aria-disabled={reason === undefined ? undefined : true}
                onClick={() => {
                  if (reason === undefined) pick(workflow.slug);
                }}
                // Still reached by the arrows, so its reason is read; said at full ink, not faded.
                sx={{ ...OPTION_SX, '&[aria-disabled="true"]': { cursor: 'not-allowed' } }}
              >
                <SchemaOutlinedIcon aria-hidden />
                <OptionText
                  mono
                  title={<span translate="no">{workflow.slug}</span>}
                  sub={sub}
                />
                {workflow.workflowId === lastWorkflowId ? <LastTimeMark /> : null}
              </Box>
            );
          })}
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
                <OptionText title={draftCopy.page.facts.noWorkflow} />
                {last?.kind === 'none' ? <LastTimeMark /> : null}
              </Box>
            </>
          )}
        </Box>
      </DraftPopover>
    </>
  );
}
