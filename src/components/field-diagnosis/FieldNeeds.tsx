// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The "needs you" lines: only when something waits or blocks. One line each: tone icon, short text
// with its reference tokens, the action. Only the first need's action is contained (R2).
import { Fragment, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { FieldRefLink } from './FieldRefLink';
import { Sep } from './FieldSetByLine';
import { ToneIcon } from './ToneIcon';
import type { FieldNeed, FieldRef, FieldView, NeedKind } from './fieldDiagnosis.types';
import { needActionControl } from './fieldDetailsControls';
import { type FieldActions, actionButtonProps } from './fieldLinks';

/** The test id of each token kind inside a need's text. */
const TOKEN_TEST_ID: Partial<Record<NeedKind, Partial<Record<FieldRef['kind'], string>>>> = {
  conflict: { unit: 'fd-conflict-source', revision: 'fd-conflict-rev' },
  gate: { gate: 'fd-gate-trigger' },
  warning: { gate: 'fd-gate-trigger' },
  upgrade: { unit: 'fd-upgrade-value', revision: 'fd-upgrade-rev' },
};

const TEXT_TEST_ID: Partial<Record<NeedKind, string>> = {
  conflict: 'fd-conflict-text',
  gate: 'fd-gate-text',
  warning: 'fd-gate-text',
  upgrade: 'fd-upgrade-text',
};

/** Plain text, with " · " drawn as the light separator. */
function textPart(text: string, key: string): ReactNode {
  const pieces = text.split(' · ');
  return pieces.map((piece, i) => (
    <Fragment key={`${key}-${i}`}>
      {i > 0 && <Sep />}
      {piece}
    </Fragment>
  ));
}

/**
 * A need's text with its reference tokens (also the row card's attention line). The line's
 * meaning is a tooltip on its plain text only: a token has its own light peek, which the dark
 * tooltip must not cover (verify round 3).
 */
export function FieldNeedText({ need }: { need: FieldNeed }) {
  const ids = TOKEN_TEST_ID[need.kind] ?? {};
  return (
    <Typography variant="body2" data-testid={TEXT_TEST_ID[need.kind]} sx={{ flex: 1, minWidth: 0, fontWeight: 500, wordBreak: 'break-word' }}>
      {need.parts.map((part, i) =>
        typeof part === 'string' ? (
          <Tooltip key={i} title={need.meaning} enterDelay={500}>
            <span>{textPart(part, String(i))}</span>
          </Tooltip>
        ) : (
          <FieldRefLink
            key={i}
            refValue={part}
            testId={ids[part.kind]}
            color={part.kind === 'revision' && need.kind === 'conflict' ? 'inherit' : 'primary'}
          />
        ),
      )}
    </Typography>
  );
}

export interface FieldNeedsProps {
  view: FieldView;
  actions: FieldActions;
  /** The incoming upgrade of this field is staged in the pane (D9). */
  upgradeStaged?: boolean;
}

export function FieldNeeds({ view, actions, upgradeStaged }: FieldNeedsProps) {
  if (view.needs.length === 0) return null;
  return (
    <Box data-testid="fd-needs" sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {view.needs.map((need, i) => {
        const target = actions.needAction?.(need);
        const secondary = need.secondary ? actions.needSecondary?.(need) : undefined;
        const control = needActionControl(view, need, i, Boolean(target));
        const reason = control.reason ?? target?.disabled;
        const staged = need.kind === 'upgrade' && upgradeStaged;
        const button = control.shown && !staged && target && (
          <Button
            size="small"
            variant={control.contained ? 'contained' : 'text'}
            disableElevation
            disabled={control.disabled || Boolean(target.disabled)}
            {...actionButtonProps(target)}
            data-testid={`fd-need-action-${need.kind}`}
          >
            {need.action}
          </Button>
        );
        return (
          <Box key={need.key} data-testid={`fd-need-${need.kind}`} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ToneIcon tone={need.tone} />
            <FieldNeedText need={need} />
            {button && reason ? (
              <Tooltip title={reason}>
                <span>{button}</span>
              </Tooltip>
            ) : (
              button
            )}
            {staged && (
              <Typography variant="body2" color="text.secondary" data-testid="fd-need-upgrade-staged" sx={{ flexShrink: 0 }}>
                Staged{' '}
                <Box component="span" sx={{ color: 'success.main', fontWeight: 600 }}>
                  ✓
                </Box>
              </Typography>
            )}
            {secondary && (
              <Button
                size="small"
                variant="text"
                disabled={control.disabled}
                {...actionButtonProps(secondary)}
                data-testid={`fd-need-secondary-${need.kind}`}
              >
                {need.secondary}
              </Button>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
