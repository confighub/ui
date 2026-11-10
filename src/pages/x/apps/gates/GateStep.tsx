// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Fragment, useId, useState } from 'react';

import { parseGateName } from '@/utility/name-format-functions';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { Alert, Box, CircularProgress, Link, Skeleton } from '@mui/material';
import { styled } from '@mui/material/styles';

import { componentTheme } from '../componentTheme';
import { FixInOriginButton } from './FixInOriginButton';
import { GateFixRow, type RowOrigin } from './GateFixRow';
import { UnitLink } from './UnitLink';
import { isFixableKind } from './gateFixKinds';
import { type Gate, type GateField } from './gateModel';
import { type FieldOrigin } from './gateOrigin';
import { gateRuleText, ruleParts } from './gateRule';
import {
  Code,
  Hint,
  LinkButton,
  MonoBox,
  MutedLine,
  OutlinedButton,
  Pill,
  PrimaryButton,
  SUMMARY_BORDER,
  TextButton,
} from './gateStyles';
import { type StagedFix, typedValueProblem } from './gateWrites';
import {
  RELATION_LABEL,
  type SameFindingElsewhere,
  elsewhereSentence,
  elsewhereShowLabel,
} from './sameFindingElsewhere';

/** A gate with more fields than this shows SHOWN_FIELDS of them and "Show N more fields". */
const MANY_FIELDS = 10;
const SHOWN_FIELDS = 6;

export type GateStepState = 'open' | 'closed' | 'cleared';

const Step = styled(Box, { shouldForwardProp: (p) => p !== '$line' })<{ $line: boolean }>(
  ({ $line }) => ({
    display: 'grid',
    gridTemplateColumns: '26px minmax(0, 1fr)',
    columnGap: 12,
    position: 'relative',
    paddingBottom: 14,
    '&::before': $line
      ? {
          content: '""',
          position: 'absolute',
          left: 12,
          top: 28,
          bottom: 2,
          width: 2,
          background: componentTheme.borderDefault,
        }
      : undefined,
  }),
);

const Num = styled(Box, { shouldForwardProp: (p) => p !== '$state' && p !== '$warning' })<{
  $state: GateStepState;
  $warning: boolean;
}>(({ $state, $warning }) => {
  const ring = $warning ? componentTheme.borderEdge : componentTheme.attention;
  const fill =
    $state === 'cleared'
      ? componentTheme.success
      : $state === 'open'
        ? $warning
          ? componentTheme.fgMuted
          : componentTheme.attention
        : undefined;
  return {
    width: 26,
    height: 26,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 12,
    fontFamily: componentTheme.fontMono,
    color: fill
      ? componentTheme.fgOnEmphasis
      : $warning
        ? componentTheme.fgMuted
        : componentTheme.attention,
    boxShadow: fill ? 'none' : `inset 0 0 0 1.5px ${ring}`,
    background: fill ?? componentTheme.bgDefault,
    position: 'relative',
    zIndex: 1,
  };
});

const Card = styled(Box, { shouldForwardProp: (p) => p !== '$state' })<{
  $state: GateStepState;
}>(({ $state }) => ({
  border: `1px solid ${$state === 'open' ? componentTheme.borderEdge : componentTheme.borderDefault}`,
  borderRadius: componentTheme.radiusMd,
  background: $state === 'cleared' ? componentTheme.bgSubtle : componentTheme.bgDefault,
  boxShadow: $state === 'open' ? componentTheme.shadowSm : 'none',
  minWidth: 0,
}));

const Header = styled(Box)({
  padding: '10px 12px',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
});

const Title = styled(Box, { shouldForwardProp: (p) => p !== '$fallback' })<{
  $fallback: boolean;
}>(({ $fallback }) => ({
  fontSize: $fallback ? 12.5 : 13.5,
  fontWeight: $fallback ? 600 : 700,
  fontFamily: $fallback ? componentTheme.fontMono : componentTheme.fontSans,
  overflowWrap: 'anywhere',
  color: componentTheme.fgDefault,
}));

const MetaLine = styled(Box)({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginTop: 5,
  alignItems: 'center',
});

const Status = styled('span', { shouldForwardProp: (p) => p !== '$tone' })<{
  $tone: 'attention' | 'success' | 'muted';
}>(({ $tone }) => ({
  fontSize: 11.5,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  color:
    $tone === 'success'
      ? componentTheme.success
      : $tone === 'muted'
        ? componentTheme.fgMuted
        : componentTheme.attention,
}));

const Description = styled(Box, { shouldForwardProp: (p) => p !== '$none' })<{
  $none: boolean;
}>(({ $none }) => ({
  padding: '0 12px 10px',
  color: $none ? componentTheme.fgSubtle : componentTheme.fgMuted,
  fontStyle: $none ? 'italic' : 'normal',
  lineHeight: 1.55,
  overflowWrap: 'anywhere',
}));

const Rule = styled(Box)({
  margin: '-2px 12px 10px',
  display: 'flex',
  gap: 8,
  alignItems: 'baseline',
  fontSize: 12,
  color: componentTheme.fgMuted,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
});

const RuleLabel = styled('span')({
  fontSize: 12,
  fontWeight: 700,
  color: componentTheme.fgSubtle,
  flexShrink: 0,
});

const OriginBox = styled(Box)({
  margin: '0 12px 10px',
  padding: '9px 10px',
  borderRadius: componentTheme.radiusSm,
  background: componentTheme.bgSubtle,
  border: `1px solid ${componentTheme.borderMuted}`,
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  lineHeight: 1.5,
  color: componentTheme.fgMuted,
  fontSize: 12,
  overflowWrap: 'anywhere',
  '& b': {
    color: componentTheme.fgDefault,
    fontWeight: 600,
    fontFamily: componentTheme.fontMono,
    fontSize: 11.5,
  },
});

const Elsewhere = styled(Box)({
  borderTop: `1px solid ${componentTheme.borderMuted}`,
  paddingTop: 8,
  marginTop: 12,
  fontSize: 12,
  lineHeight: 1.5,
});

/** The same-finding block on its own, for a gate with no field rows above it. */
const SOLO_ELSEWHERE = {
  m: '0 12px 10px',
  border: `1px solid ${componentTheme.borderMuted}`,
  background: componentTheme.bgSubtle,
  borderRadius: `${componentTheme.radiusSm}px`,
  p: '8px 10px',
};

const ElsewhereList = styled('ul')({
  listStyle: 'none',
  margin: '6px 0 0',
  padding: 0,
  display: 'grid',
  gap: 4,
});

const Fixes = styled(Box)({ borderTop: `1px solid ${componentTheme.borderMuted}` });

const More = styled('button')({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 0,
  background: 'none',
  cursor: 'pointer',
  fontFamily: componentTheme.fontSans,
  fontSize: 12.5,
  padding: '9px 12px',
  color: componentTheme.accent,
  fontWeight: 700,
  borderBottom: `1px solid ${componentTheme.borderSubtle}`,
});

const Footer = styled(Box, { shouldForwardProp: (p) => p !== '$sticky' })<{
  $sticky: boolean;
}>(({ $sticky }) => ({
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  padding: '10px 12px',
  flexWrap: 'wrap',
  ...($sticky
    ? {
        position: 'sticky',
        bottom: 0,
        background: componentTheme.bgDefault,
        borderTop: `1px solid ${componentTheme.borderMuted}`,
        borderRadius: `0 0 ${componentTheme.radiusMd}px ${componentTheme.radiusMd}px`,
        zIndex: 2,
      }
    : {}),
}));

const SaveHint = styled('span')({
  color: componentTheme.fgSubtle,
  fontSize: 11.5,
  // A whole-pixel line, so the sticky footer it wraps in has a whole-pixel height and sharp text.
  lineHeight: '15px',
  marginLeft: 'auto',
  overflowWrap: 'anywhere',
});

export interface GateStepProps {
  gate: Gate;
  /** The step label and the test id suffix: `1`, `2`, ... or `w1` for a warning. */
  label: string;
  state: GateStepState;
  /** The line under a closed gate: when it opens. */
  closedNote: string;
  spaceSlug: string;
  /** Not the last step: the line down to the next one. */
  hasNext: boolean;
  onOpen: () => void;
  rowOrigin: (field: GateField) => RowOrigin;
  staged: ReadonlyMap<string, StagedFix>;
  fixHere: ReadonlySet<string>;
  keep: ReadonlyMap<string, boolean>;
  /** Rows a save could not write: they fall back to "Open in Configuration". */
  unwritable: ReadonlySet<string>;
  onStage: (field: GateField, fix: StagedFix | undefined) => void;
  onFixHere: (field: GateField) => void;
  onKeepChange: (field: GateField, keep: boolean) => void;
  showAllFields: boolean;
  onShowAllFields: () => void;
  elsewhere: { loading: boolean; found?: SameFindingElsewhere };
  elsewhereOpen: boolean;
  onToggleElsewhere: () => void;
  checking: boolean;
  /** A save or a re-check that did not happen, with its title. */
  saveError?: { title: string; message: string };
  /** The Revision a save wrote, when the Trigger still fails on it. */
  stillFailingRevision?: number;
  clearedRevision?: number;
  rechecking: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onRecheck: () => void;
  onOpenConfiguration: (unitId: string) => void;
  onFixInOrigin: (origin: FieldOrigin) => void;
  isComponentSpace: (spaceId: string | undefined) => boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One numbered gate: its Trigger, its Rule, and the rows to fix, with the save footer. */
export const GateStep = (props: GateStepProps) => {
  const {
    gate,
    label,
    state,
    closedNote,
    spaceSlug,
    hasNext,
    onOpen,
    rowOrigin,
    staged,
    unwritable,
    showAllFields,
    elsewhere,
    elsewhereOpen,
    checking,
  } = props;
  // Unset until the toggle is clicked, so the default can follow the Trigger as it loads.
  const [ruleToggled, setRuleToggled] = useState<boolean>();
  const ruleDetailsId = useId();
  const trigger = gate.trigger;
  // A gate's Trigger is in the Space its name starts with: the gate's own Space, unless the read
  // of the Trigger says otherwise.
  const triggerSpaceId =
    gate.triggerSpaceId ??
    (parseGateName(gate.gateName).spaceSlug === spaceSlug
      ? gate.units[0]?.spaceId
      : undefined);
  // A Trigger created without a display name gets its slug as one: that is no display name.
  const displayName =
    trigger?.DisplayName && trigger.DisplayName !== trigger.Slug
      ? trigger.DisplayName
      : undefined;
  const title = displayName || trigger?.Slug || gate.gateName.split('/')[1] || gate.gateName;
  const unitLabel = gate.units.map((u) => `${spaceSlug}/${u.slug}`).join(', ');
  // Each Unit of the gate as a link to its configuration page; ids `<prefix>-<gate>` for the
  // first, `<prefix>-<gate>-<n>` for the others.
  const unitLinks = (prefix: string) =>
    gate.units.map((u, i) => (
      <Fragment key={u.unitId}>
        {i > 0 && ', '}
        <UnitLink
          spaceId={u.spaceId}
          unitId={u.unitId}
          testId={i === 0 ? `${prefix}-${label}` : `${prefix}-${label}-${i + 1}`}
        >
          {spaceSlug}/{u.slug}
        </UnitLink>
      </Fragment>
    ));
  const kindOf = (field: GateField) => (unwritable.has(field.key) ? 'message' : field.kind);
  const fixable = gate.fields.filter((f) => isFixableKind(kindOf(f)));
  const stagedCount = gate.fields.filter((f) => staged.has(f.key)).length;
  // A typed value the field's type cannot take would be written as null: no save until it is fixed.
  const invalidCount = gate.fields.filter((f) => {
    const fix = staged.get(f.key);
    return fix?.op === 'set' && !!typedValueProblem(f, fix.value);
  }).length;
  const ruleText = gateRuleText(
    trigger?.Description,
    ruleParts(
      gate.functionName,
      trigger?.Arguments,
      gate.unitFindings.flatMap((u) => u.messages),
    ),
  );
  const warning = gate.warning;
  const statusTone = state === 'cleared' ? 'success' : warning ? 'muted' : 'attention';

  const header = (
    <Header
      onClick={state === 'closed' ? onOpen : undefined}
      sx={state === 'closed' ? { cursor: 'pointer' } : undefined}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Title $fallback={!displayName} data-testid={`gate-title-${label}`}>
          {title}
        </Title>
        <MetaLine>
          <Pill data-testid={`gate-unit-${label}`} title={unitLabel}>
            {unitLinks('gate-unit-link')}
          </Pill>
          {gate.functionName && (
            <Pill data-testid={`gate-function-${label}`} title={gate.functionName}>
              {gate.functionName}
            </Pill>
          )}
        </MetaLine>
      </Box>
      <Status $tone={statusTone} data-testid={`gate-status-${label}`}>
        {state === 'cleared' ? 'Cleared' : `${gate.findingCount} to fix`}
      </Status>
      {trigger?.TriggerID && triggerSpaceId && (
        <Link
          href={`/triggers/${triggerSpaceId}/${trigger.TriggerID}`}
          target='_blank'
          rel='noopener noreferrer'
          data-testid={`gate-trigger-link-${label}`}
          onClick={(e) => e.stopPropagation()}
          sx={{
            color: componentTheme.accent,
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            fontSize: 12,
            display: 'inline-flex',
            gap: '4px',
            alignItems: 'center',
          }}
        >
          Trigger <OpenInNewRoundedIcon sx={{ fontSize: 12 }} />
        </Link>
      )}
    </Header>
  );

  const num = (
    <Num $state={state} $warning={warning} data-testid={`gate-num-${label}`}>
      {state === 'cleared' ? (
        <CheckRoundedIcon sx={{ fontSize: 15 }} />
      ) : warning ? (
        '!'
      ) : (
        label
      )}
    </Num>
  );

  if (state === 'cleared') {
    return (
      <Step $line={hasNext} data-testid={`gate-step-${label}`}>
        {num}
        <Card $state={state}>
          {header}
          <MutedLine data-testid={`gate-cleared-${label}`}>
            Saved as Revision {props.clearedRevision}. The Trigger passed.
          </MutedLine>
        </Card>
      </Step>
    );
  }

  const description = (
    <Description $none={ruleText.noDescription} data-testid={`gate-description-${label}`}>
      {ruleText.lead}
    </Description>
  );
  // With no Description, the Rule is the only text that says what failed, so it starts open.
  const ruleOpen = ruleToggled ?? ruleText.noDescription;
  const ruleLine =
    ruleText.details.length > 0 ? (
      <Rule data-testid={`gate-rule-${label}`}>
        <RuleLabel>Rule</RuleLabel>
        <span>
          {/* Before the details, so the button stays under the pointer when they open. */}
          <LinkButton
            data-testid={`gate-rule-toggle-${label}`}
            aria-expanded={ruleOpen}
            aria-controls={ruleDetailsId}
            onClick={(e) => {
              // A closed gate opens on a click anywhere on its card; this click only shows the Rule.
              e.stopPropagation();
              setRuleToggled(!ruleOpen);
            }}
          >
            {ruleOpen ? 'Hide details' : 'Show details'}
          </LinkButton>
          <span
            id={ruleDetailsId}
            data-testid={`gate-rule-details-${label}`}
            style={{ display: ruleOpen ? 'block' : 'none' }}
          >
            {ruleText.details.map((part, i) =>
              'code' in part ? (
                <Code key={i}>{part.code}</Code>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </span>
        </span>
      </Rule>
    ) : null;

  if (state === 'closed') {
    const n = fixable.length;
    return (
      <Step $line={hasNext} data-testid={`gate-step-${label}`}>
        {num}
        <Card $state={state} onClick={onOpen} sx={{ cursor: 'pointer' }}>
          {header}
          {description}
          {ruleLine}
          <MutedLine data-testid={`gate-collapsed-${label}`}>
            {n > 0
              ? `${plural(n, 'field', 'fields')} to fix here`
              : 'Nothing can be fixed here. You change the configuration by hand'}
            . {closedNote}
          </MutedLine>
        </Card>
      </Step>
    );
  }

  // Open.
  const fields = gate.fields;
  const cut = fields.length > MANY_FIELDS && !showAllFields ? SHOWN_FIELDS : fields.length;
  const origins = fields.map((f) => rowOrigin(f));
  const allUpstream =
    fields.length > 0 &&
    origins.every(
      (o) =>
        !o.loading &&
        o.origin?.upstream &&
        o.origin.from.SpaceSlug === origins[0].origin?.from.SpaceSlug,
    );
  const gateOriginSpace = allUpstream ? (origins[0].origin!.from.SpaceSlug ?? '') : '';
  const found = elsewhere.found;
  const elsewhereBlock = elsewhere.loading ? (
    <Elsewhere data-testid={`gate-elsewhere-${label}`}>
      {/* Inline: the bar takes the place of the sentence it stands for. */}
      <Skeleton
        component='span'
        variant='rounded'
        animation={false}
        sx={{
          display: 'inline-block',
          width: '46%',
          height: 10,
          my: '2px',
          bgcolor: componentTheme.bgInset,
        }}
      />{' '}
      <Hint>Looking for the same finding in other Units…</Hint>
    </Elsewhere>
  ) : found ? (
    <Elsewhere
      data-testid={`gate-elsewhere-${label}`}
      sx={fields.length === 0 ? SOLO_ELSEWHERE : undefined}
    >
      <span>
        {elsewhereSentence(found).map((part, i) =>
          'text' in part ? (
            <Fragment key={i}>{part.text}</Fragment>
          ) : (
            <UnitLink
              key={i}
              spaceId={part.unit.spaceId}
              unitId={part.unit.unitId}
              testId={`gate-elsewhere-unit-link-${label}`}
            >
              {part.unit.label}
            </UnitLink>
          ),
        )}
      </span>{' '}
      <LinkButton
        data-testid={`gate-elsewhere-toggle-${label}`}
        onClick={props.onToggleElsewhere}
        sx={{ ml: '6px' }}
      >
        {elsewhereOpen ? 'Hide the Units' : elsewhereShowLabel(found)}
      </LinkButton>
      {elsewhereOpen && (
        <ElsewhereList data-testid={`gate-elsewhere-list-${label}`}>
          {found.units.map((u, i) => (
            <Box
              component='li'
              key={u.unitId}
              sx={{ display: 'flex', gap: 1, alignItems: 'baseline', minWidth: 0 }}
            >
              <Pill title={u.label}>
                <UnitLink
                  spaceId={u.spaceId}
                  unitId={u.spaceId ? u.unitId : undefined}
                  testId={`gate-elsewhere-list-unit-link-${label}-${i + 1}`}
                >
                  {u.label}
                </UnitLink>
              </Pill>
              <Hint>{RELATION_LABEL[u.relation]}</Hint>
            </Box>
          ))}
        </ElsewhereList>
      )}
    </Elsewhere>
  ) : null;

  const valuesWord =
    fields.length === 1
      ? 'This value was'
      : fields.length === 2
        ? 'Both values were'
        : `All ${fields.length} values were`;
  const firstOrigin = origins[0]?.origin;
  const hasFooterSave = fixable.length > 0;
  return (
    <Step $line={hasNext} data-testid={`gate-step-${label}`}>
      {num}
      <Card $state={state}>
        {header}
        {description}
        {ruleLine}
        {props.stillFailingRevision !== undefined && (
          <Box
            data-testid={`gate-still-failing-${label}`}
            sx={{
              m: '0 12px 10px',
              p: '9px 10px',
              borderRadius: `${componentTheme.radiusSm}px`,
              background: componentTheme.attentionMuted,
              border: `1px solid ${SUMMARY_BORDER}`,
              color: componentTheme.attention,
              lineHeight: 1.5,
              overflowWrap: 'anywhere',
            }}
          >
            <b>Saved as Revision {props.stillFailingRevision}.</b> The Trigger still fails on{' '}
            {plural(gate.fields.length || gate.findingCount, 'field', 'fields')}.
          </Box>
        )}
        {allUpstream && firstOrigin && (
          <OriginBox data-testid={`gate-origin-${label}`}>
            <Box sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span>
                {valuesWord} set in <b>{gateOriginSpace}</b> and copied here. Fix{' '}
                {fields.length === 1 ? 'it' : 'them'} there. A fix here changes only this
                Space.
              </span>
              <FixInOriginButton
                origin={firstOrigin}
                testId={`gate-origin-fix-${label}`}
                isComponentSpace={props.isComponentSpace}
                onFixInOrigin={props.onFixInOrigin}
                sx={{ flexShrink: 0 }}
              />
            </Box>
            {elsewhereBlock}
          </OriginBox>
        )}
        {fields.length > 0 && (
          <Fixes>
            {fields.slice(0, cut).map((field, i) => (
              <GateFixRow
                key={field.key}
                id={`${label}-${i + 1}`}
                field={field}
                kind={kindOf(field)}
                origin={origins[i]}
                staged={staged.get(field.key)}
                fixHereOpen={props.fixHere.has(field.key)}
                keep={props.keep.get(field.key) ?? true}
                readOnly={checking}
                releasedRevisionNum={
                  gate.units.find((u) => u.unitId === field.unitId)?.lastReleasedRevisionNum
                }
                onFixHere={() => props.onFixHere(field)}
                onStage={(fix) => props.onStage(field, fix)}
                onKeepChange={(v) => props.onKeepChange(field, v)}
                onFixInOrigin={props.onFixInOrigin}
                isComponentSpace={props.isComponentSpace}
                onOpenConfiguration={() => props.onOpenConfiguration(field.unitId)}
              />
            ))}
            {cut < fields.length && (
              <More data-testid={`gate-show-more-${label}`} onClick={props.onShowAllFields}>
                Show {fields.length - cut} more fields
              </More>
            )}
          </Fixes>
        )}
        {fields.length === 0 && elsewhereBlock}
        {gate.unitFindings.map((finding) => (
          <Box key={finding.key}>
            <Box
              data-testid={`gate-nopath-${label}`}
              sx={{ p: '0 12px 10px', color: componentTheme.fgMuted, lineHeight: 1.5 }}
            >
              This check names no field. Change the configuration by hand, or change the
              Trigger.
            </Box>
            <MonoBox data-testid={`gate-unit-finding-${label}`}>
              {finding.messages.map((m, i) => (
                <Box key={i}>{m}</Box>
              ))}
            </MonoBox>
          </Box>
        ))}
        {props.saveError && (
          <Alert
            severity='error'
            data-testid='save-error'
            sx={{ m: '0 12px 10px', overflowWrap: 'anywhere' }}
          >
            <b>{props.saveError.title}</b> {props.saveError.message}
          </Alert>
        )}
        {hasFooterSave ? (
          <Footer $sticky>
            <PrimaryButton
              data-testid={`gate-save-${label}`}
              disabled={!checking && (stagedCount === 0 || invalidCount > 0)}
              onClick={checking ? undefined : props.onSave}
            >
              {checking ? (
                <>
                  <CircularProgress size={12} color='inherit' />
                  Saving and checking
                </>
              ) : stagedCount > 0 ? (
                `Save ${plural(stagedCount, 'fix', 'fixes')} and re-check`
              ) : (
                'Save fixes and re-check'
              )}
            </PrimaryButton>
            <TextButton
              data-testid={`gate-discard-${label}`}
              onClick={props.onDiscard}
              disabled={checking}
            >
              Discard
            </TextButton>
            <SaveHint data-testid={`gate-save-hint-${label}`}>
              Saves a Revision of {unitLinks('gate-save-hint-unit-link')}
            </SaveHint>
          </Footer>
        ) : (
          <Footer $sticky={false}>
            <OutlinedButton
              data-testid={`gate-open-config-${label}`}
              onClick={() => gate.units[0] && props.onOpenConfiguration(gate.units[0].unitId)}
            >
              Open in Configuration
            </OutlinedButton>
            {trigger?.TriggerID && (
              <TextButton
                data-testid={`gate-recheck-${label}`}
                onClick={props.onRecheck}
                disabled={props.rechecking}
              >
                {props.rechecking ? <CircularProgress size={12} color='inherit' /> : null}
                Re-check
              </TextButton>
            )}
          </Footer>
        )}
      </Card>
    </Step>
  );
};
