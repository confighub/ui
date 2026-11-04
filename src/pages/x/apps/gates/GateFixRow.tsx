// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { Box, Checkbox, Skeleton, TextField } from '@mui/material';
import { styled } from '@mui/material/styles';

import { componentTheme } from '../componentTheme';
import { FixInOriginButton } from './FixInOriginButton';
import { UnitLink } from './UnitLink';
import {
  ACTION_LABEL,
  type FixKind,
  disruptionBefore,
  formatFindingValue,
} from './gateFixKinds';
import { type GateField, resourceShortLabel, valueText } from './gateModel';
import { type FieldOrigin, hopDescription, hopUnitLabel } from './gateOrigin';
import {
  Acts,
  Arrow,
  CurrentInline,
  EDIT_YELLOW,
  Hint,
  OutlinedSmallButton,
  PLACEHOLDER_TEXT,
  TextSmallButton,
  Vals,
  ValueBox,
  ValueLabel,
} from './gateStyles';
import { type StagedFix, quotedYaml, typedValueProblem } from './gateWrites';
import { useReleasedValue } from './useReleasedValue';

const Row = styled(Box, { shouldForwardProp: (p) => p !== '$staged' })<{ $staged: boolean }>(
  ({ $staged }) => ({
    padding: '10px 12px',
    borderBottom: `1px solid ${componentTheme.borderSubtle}`,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    rowGap: 6,
    position: 'relative',
    '&::before': $staged
      ? {
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: EDIT_YELLOW,
        }
      : undefined,
  }),
);

const Where = styled(Box)({
  display: 'flex',
  flexWrap: 'wrap',
  columnGap: 8,
  rowGap: 2,
  alignItems: 'baseline',
  minWidth: 0,
});

const Path = styled('span')({
  fontFamily: componentTheme.fontMono,
  fontSize: 11.5,
  fontWeight: 600,
  color: componentTheme.fgDefault,
  overflowWrap: 'anywhere',
  minWidth: 0,
  fontVariantLigatures: 'none',
});

const Resource = styled('span')({
  fontSize: 11,
  color: componentTheme.fgSubtle,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
});

const Origin = styled(Box, { shouldForwardProp: (p) => p !== '$none' })<{ $none?: boolean }>(
  ({ $none }) => ({
    fontSize: 11.5,
    color: $none ? componentTheme.fgSubtle : componentTheme.fgMuted,
    fontStyle: $none ? 'italic' : 'normal',
    lineHeight: 1.45,
    minWidth: 0,
    overflowWrap: 'anywhere',
    '& b': {
      fontWeight: 600,
      color: componentTheme.fgDefault,
      fontFamily: componentTheme.fontMono,
      fontSize: 11,
      fontVariantLigatures: 'none',
    },
  }),
);

const Issues = styled('ul')({ margin: 0, paddingLeft: 16, display: 'grid', gap: 4 });
const IssueItem = styled('li')({
  color: componentTheme.fgMuted,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
  fontSize: 12,
});

const Keep = styled('label')({
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  fontSize: 11.5,
  color: componentTheme.fgMuted,
  lineHeight: 1.45,
  cursor: 'pointer',
  '& b': { color: componentTheme.fgDefault, fontWeight: 600 },
});

const ValueInput = styled(TextField, {
  shouldForwardProp: (p) => p !== '$staged' && p !== '$invalid',
})<{
  $staged: boolean;
  $invalid: boolean;
}>(({ $staged, $invalid }) => ({
  minWidth: 0,
  '& .MuiOutlinedInput-root': {
    height: 34,
    fontFamily: componentTheme.fontMono,
    fontSize: 11.5,
    borderRadius: componentTheme.radiusSm,
    background: componentTheme.bgDefault,
    fontVariantLigatures: 'none',
  },
  // The typed text scrolls inside the input.
  '& .MuiOutlinedInput-input': { padding: '0 11px', height: 34, overflowX: 'auto' },
  '& .MuiOutlinedInput-input::placeholder': { color: PLACEHOLDER_TEXT, opacity: 1 },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: $invalid ? tokens.red : $staged ? EDIT_YELLOW : componentTheme.borderDefault,
  },
}));

/** What the origin line shows: still loading, an origin, or no single origin. */
export interface RowOrigin {
  loading: boolean;
  /** The Blame read failed. */
  failed?: boolean;
  origin?: FieldOrigin;
}

export interface GateFixRowProps {
  /** `<gate>-<row>`, for the test ids. */
  id: string;
  field: GateField;
  kind: FixKind;
  origin: RowOrigin;
  staged?: StagedFix;
  fixHereOpen: boolean;
  keep: boolean;
  readOnly: boolean;
  /** The Unit's last released Revision, for "Restore released value" (vet-immutable). */
  releasedRevisionNum?: number;
  onFixHere: () => void;
  onStage: (fix: StagedFix | undefined) => void;
  onKeepChange: (keep: boolean) => void;
  onFixInOrigin: (origin: FieldOrigin) => void;
  isComponentSpace: (spaceId: string | undefined) => boolean;
  onOpenConfiguration: () => void;
}

const PodSecurityPrefix = /^violates PodSecurity "[^"]+": /;

const OriginLine = ({
  id,
  field,
  origin,
}: {
  id: string;
  field: GateField;
  origin: RowOrigin;
}) => {
  if (origin.loading) {
    return (
      <Origin data-testid={`fix-origin-${id}`}>
        <Skeleton
          variant='rounded'
          animation={false}
          sx={{ width: '58%', height: 10, my: '3px', bgcolor: componentTheme.bgInset }}
        />
      </Origin>
    );
  }
  const o = origin.origin;
  if (origin.failed) {
    return (
      <Origin $none data-testid={`fix-origin-${id}`}>
        Could not read where this value came from.
      </Origin>
    );
  }
  if (!o) {
    const block = field.attributeName === 'none' && field.path === 'spec.template.spec';
    return (
      <Origin $none data-testid={`fix-origin-${id}`}>
        {block
          ? 'This check names a whole block, which has no single origin.'
          : 'No record of where this value came from.'}
      </Origin>
    );
  }
  const { text, date } = hopDescription(o.from);
  const tail = (
    <>
      {text}
      {date && (
        <>
          , <span style={{ whiteSpace: 'nowrap' }}>{date}</span>
        </>
      )}
    </>
  );
  if (!o.upstream) {
    return (
      <Origin data-testid={`fix-origin-${id}`}>
        Set here by {tail}
        {o.protected ? '. Kept on merge' : ''}
      </Origin>
    );
  }
  return (
    <Origin data-testid={`fix-origin-${id}`}>
      From{' '}
      <b>
        <UnitLink
          spaceId={o.from.SpaceID}
          unitId={o.from.UnitID}
          testId={`fix-origin-unit-link-${id}`}
        >
          {hopUnitLabel(o.from)}
        </UnitLink>
      </b>
      {o.via.length > 0 ? ` via ${o.via.join(', ')}` : ''}: {tail}
    </Origin>
  );
};

/** One failing field: where it is, where its value came from, and the fix for its kind. */
export const GateFixRow = ({
  id,
  field,
  kind,
  origin,
  staged,
  fixHereOpen,
  keep,
  readOnly,
  releasedRevisionNum,
  onFixHere,
  onStage,
  onKeepChange,
  onFixInOrigin,
  isComponentSpace,
  onOpenConfiguration,
}: GateFixRowProps) => {
  const released = useReleasedValue(field, releasedRevisionNum, kind === 'restore');
  // The value a write puts back: the released value, or, for vet-disruption, the value before the
  // change, which only its message names.
  const before = kind === 'undo' ? disruptionBefore(field.issues[0]?.message) : undefined;
  const previousValue = kind === 'restore' ? released.value : before;
  // The message names the old value as plain text; it is written back as YAML, so a string field
  // gets it quoted and it stays a string.
  const undoYaml =
    before === undefined
      ? undefined
      : typeof field.value === 'string'
        ? quotedYaml(before)
        : before;
  const o = origin.origin;
  const upstream = !origin.loading && !!o?.upstream;
  const current = valueText(field.value);
  const primary =
    upstream && o ? (
      <FixInOriginButton
        origin={o}
        testId={`fix-origin-link-${id}`}
        isComponentSpace={isComponentSpace}
        onFixInOrigin={onFixInOrigin}
      />
    ) : null;
  const typedText = staged?.op === 'set' ? staged.value : '';
  const problem = typedText ? typedValueProblem(field, typedText) : undefined;
  const input = (placeholder: string, extraSx?: object) => (
    <ValueInput
      size='small'
      placeholder={placeholder}
      value={typedText}
      $staged={!!typedText}
      $invalid={!!problem}
      onChange={(e) =>
        onStage(e.target.value === '' ? undefined : { op: 'set', value: e.target.value })
      }
      slotProps={{
        htmlInput: {
          'data-testid': `fix-input-${id}`,
          readOnly,
          'aria-label': `New value for ${field.path}`,
          'aria-invalid': !!problem,
        },
      }}
      sx={extraSx}
    />
  );
  const actionButton = (label: string, fix: StagedFix | 'config' | undefined) => {
    const on = !!fix && fix !== 'config' && !!staged && staged.op === fix.op;
    return (
      <OutlinedSmallButton
        data-testid={`fix-action-${id}`}
        disabled={readOnly || !fix}
        aria-pressed={fix === 'config' ? undefined : on}
        onClick={() =>
          fix === 'config' ? onOpenConfiguration() : fix && onStage(on ? undefined : fix)
        }
        sx={
          on
            ? { boxShadow: `inset 0 0 0 1px ${EDIT_YELLOW}`, color: componentTheme.fgDefault }
            : undefined
        }
      >
        {label}
      </OutlinedSmallButton>
    );
  };

  let body: React.ReactNode = null;
  if (kind === 'set' && upstream && !fixHereOpen) {
    body = (
      <Acts>
        {primary}
        <TextSmallButton data-testid={`fix-here-${id}`} onClick={onFixHere}>
          Fix here instead
        </TextSmallButton>
        <Hint>
          Current value{' '}
          <CurrentInline data-testid={`fix-current-${id}`}>{current}</CurrentInline>
        </Hint>
      </Acts>
    );
  } else if (kind === 'set') {
    body = (
      <>
        {upstream && (
          <Acts>
            {primary}
            <TextSmallButton $on data-testid={`fix-here-${id}`} onClick={onFixHere}>
              Fix here instead
            </TextSmallButton>
          </Acts>
        )}
        <Vals>
          <ValueBox $tone='current' data-testid={`fix-current-${id}`}>
            {current}
          </ValueBox>
          <Arrow>→</Arrow>
          {input('New value')}
        </Vals>
        {upstream && o && !o.protected && (
          <Keep data-testid={`fix-keep-${id}`}>
            <Checkbox
              size='small'
              checked={keep && !!typedText}
              disabled={!typedText || readOnly}
              onChange={(e) => onKeepChange(e.target.checked)}
              sx={{
                p: 0,
                mt: '1px',
                // A 14px box: the icon draws its square inside 17px, so the label lines up with the row text.
                width: 14,
                height: 14,
                '& .MuiSvgIcon-root': { fontSize: 17 },
              }}
            />
            <span>
              <b>Keep on merge.</b> Without it, the next upgrade from {o.from.SpaceSlug} can
              overwrite a fix made here.
            </span>
          </Keep>
        )}
      </>
    );
  } else if (kind === 'restore') {
    body = (
      <>
        <Vals>
          <ValueBox $tone='current' data-testid={`fix-current-${id}`}>
            {current}
          </ValueBox>
          <Arrow>→</Arrow>
          <ValueBox $tone='good' data-testid={`fix-previous-${id}`}>
            <ValueLabel>Released value</ValueLabel>
            {previousValue ?? (released.isLoading ? 'Reading…' : 'No released value')}
          </ValueBox>
        </Vals>
        <Acts>
          {primary}
          {actionButton(
            ACTION_LABEL.restore!,
            previousValue !== undefined
              ? { op: 'yaml', value: previousValue, label: 'restore' }
              : undefined,
          )}
        </Acts>
      </>
    );
  } else if (kind === 'undo') {
    body = (
      <>
        <Vals>
          <ValueBox $tone='good' data-testid={`fix-previous-${id}`}>
            <ValueLabel>Before</ValueLabel>
            {previousValue ?? 'Not named by the finding'}
          </ValueBox>
          <Arrow>→</Arrow>
          <ValueBox $tone='current' data-testid={`fix-current-${id}`}>
            {current}
          </ValueBox>
        </Vals>
        <Acts>
          {primary}
          {actionButton(
            ACTION_LABEL.undo!,
            undoYaml !== undefined
              ? { op: 'yaml', value: undoYaml, label: 'undo' }
              : undefined,
          )}
          <Hint>
            To keep it, change it in a ChangeOrder that allows a restart, or change the
            Trigger.
          </Hint>
        </Acts>
      </>
    );
  } else if (kind === 'duplicate') {
    body = (
      <>
        <Vals $one>
          <ValueBox $tone='current' data-testid={`fix-current-${id}`}>
            name: {current}
          </ValueBox>
        </Vals>
        <Acts>
          {primary}
          {actionButton(ACTION_LABEL.duplicate!, { op: 'delete' })}
          <Hint>or rename it</Hint>
          {input('New name', { flex: 1, minWidth: 140 })}
        </Acts>
      </>
    );
  } else if (kind === 'quote' || kind === 'null') {
    const found =
      kind === 'null' ? '(empty)' : (formatFindingValue(field.issues[0]?.message) ?? current);
    const proposed = kind === 'null' ? 'null' : quotedYaml(found);
    body = (
      <>
        <Vals>
          <ValueBox $tone='current' data-testid={`fix-current-${id}`}>
            {found}
          </ValueBox>
          <Arrow>→</Arrow>
          <ValueBox $tone='good' data-testid={`fix-proposed-${id}`}>
            {proposed}
          </ValueBox>
        </Vals>
        <Acts>
          {primary}
          {actionButton(ACTION_LABEL[kind]!, { op: 'yaml', value: proposed, label: kind })}
        </Acts>
      </>
    );
  } else if (kind === 'duplicate-key') {
    body = (
      <Acts>
        {primary}
        {actionButton(ACTION_LABEL['duplicate-key']!, 'config')}
        <Hint>Remove one of the two keys by hand.</Hint>
      </Acts>
    );
  } else if (kind === 'schema') {
    body = (
      <Vals>
        <ValueBox $tone='current' data-testid={`fix-current-${id}`}>
          (missing)
        </ValueBox>
        <Arrow>→</Arrow>
        {input('Value to add')}
      </Vals>
    );
  }

  const isFormat = kind === 'quote' || kind === 'null' || kind === 'duplicate-key';
  const resource = resourceShortLabel(field);
  return (
    <Row $staged={!!staged} data-testid={`fix-row-${id}`} data-action={kind}>
      <Where>
        <Path title={field.path} data-testid={`fix-path-${id}`}>
          {field.path}
        </Path>
        {resource && (
          <Resource title={resource} data-testid={`fix-resource-${id}`}>
            {resource}
          </Resource>
        )}
      </Where>
      <OriginLine id={id} field={field} origin={origin} />
      {body}
      {problem && (
        <Hint data-testid={`fix-problem-${id}`} role='alert' sx={{ color: tokens.red }}>
          {problem}
        </Hint>
      )}
      {field.issues.length > 0 && (
        <Issues data-testid={`fix-issues-${id}`}>
          {field.issues.map((issue, i) => (
            <IssueItem key={i}>
              {isFormat ? issue.message : issue.message.replace(PodSecurityPrefix, '')}
            </IssueItem>
          ))}
        </Issues>
      )}
    </Row>
  );
};
