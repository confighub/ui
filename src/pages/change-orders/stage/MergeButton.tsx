// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The stage's action: the main method as the one rust button, and beside it the
 * other method ("Promote only") as a neutral outlined button.
 *
 * ONE CLICK WHEN NOTHING IS WRONG (`oneClick`). The box already shows the dry
 * run's answer, so a click acts at once and the button it was says "Working…".
 * The action can still ask for a confirm (it resolves `false`): the dry run could
 * not answer, or the plan was refused as stale.
 *
 * Otherwise a click opens a confirm, and THE CONFIRM REPLACES THE BUTTONS IN
 * PLACE, Confirm first, so the second click lands where the main button was and
 * nothing on the page moves. The confirm is where a dry run that went stale is
 * run again, where an "…anyway" is acknowledged, and where the busy state shows.
 *
 * Keyboard: Escape cancels the confirm, and focus goes back to the button that
 * opened it.
 *
 * A gate can read satisfied while a skipped Unit never took the change. The
 * server checks the gates again when the promotion is applied, so the button
 * offers the action and the server's answer is what the box then says.
 */

import { useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha, type Theme } from '@mui/material/styles';

import { stageCardCopy } from './stageCardCopy';
import type { MergeMethod, MergeMethodOption } from './stageTypes';

const copy = stageCardCopy.merge;

/** Under this width the labels shorten and the buttons grow for touch. */
const NARROW = '@media (max-width: 759.98px)';

export interface MergeButtonProps {
  stageId: string;
  stageName: string;
  /** The methods offered (`methodsFor`): the default is the main button, each other one a plain button beside it. */
  methods: readonly MergeMethodOption[];
  /** The method the button starts on. Mount the button per stage, so a choice never carries over. */
  defaultMethod?: MergeMethod;
  /**
   * Nothing is wrong: a click acts at once, with no confirm. Ignored for an
   * "…anyway", an acknowledgement and a retry, which always confirm.
   */
  oneClick?: boolean;
  /** The change reaches some Space differently: outlined primary, and the label ends "anyway…". */
  anyway?: boolean;
  /** Labels for the retry and "release again" flows, which say more than the method does. */
  labels?: { main?: string; short?: string; confirm?: string };
  /** The confirm needs this acknowledged first. Confirm stays unavailable until it is ticked. */
  ack?: ReactNode;
  /** The confirm says "anyway", for a confirm the dry run could not check. */
  confirmAnyway?: boolean;
  /** Said above the confirm: what it writes, that the dry run runs again, or why it must be confirmed again. */
  confirmNote?: ReactNode;
  /** The confirm waits for the dry run to come back. */
  confirmWaiting?: boolean;
  /** The action is being written. */
  busy: boolean;
  gated?: boolean;
  /** The button retries a failed promotion. */
  retry?: boolean;
  /** The main button, for focus after an action. */
  mainRef?: Ref<HTMLButtonElement>;
  /** The confirm opened: the place to make sure the dry run is fresh. */
  onOpenConfirm?: (method: MergeMethod) => void;
  /**
   * Confirmed, or clicked with `oneClick`. Resolve to `false` to keep the confirm
   * open, or open it after a one-click (nothing was written).
   */
  onConfirm: (method: MergeMethod, how: { oneClick: boolean }) => Promise<boolean | void> | boolean | void;
  onCancel?: () => void;
}

/** The buttons as a status box offers them: everything but the stage. */
export type MergeControl = Omit<MergeButtonProps, 'stageId' | 'stageName'>;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref !== null && ref !== undefined) (ref as { current: T | null }).current = value;
}

/** MUI's disabled look, with the label kept readable; `aria-disabled` keeps the button focusable. */
const unavailableSx = {
  '&[aria-disabled="true"]': {
    cursor: 'not-allowed',
    color: (t: Theme) => alpha(t.palette.common.black, 0.38),
    borderColor: 'action.disabledBackground',
    bgcolor: 'background.paper',
  },
  '&.MuiButton-contained[aria-disabled="true"]': { bgcolor: 'action.disabledBackground', borderColor: 'transparent' },
  '&.MuiButton-text[aria-disabled="true"]': { bgcolor: 'transparent' },
} as const;

/** The button a one-click works on keeps its look and says "Working…"; the other one greys out. */
const busySx = { '&[aria-disabled="true"]': { cursor: 'progress' } } as const;

const focusSx = { '&.Mui-focusVisible, &:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } } as const;

const touchSx = { [NARROW]: { height: 38, fontSize: '13.5px', px: '18px' } } as const;

export function MergeButton({
  stageId,
  stageName,
  methods,
  defaultMethod,
  oneClick = false,
  anyway = false,
  labels,
  ack,
  confirmAnyway = false,
  confirmNote,
  confirmWaiting = false,
  busy,
  gated = false,
  retry = false,
  mainRef,
  onOpenConfirm,
  onConfirm,
  onCancel,
}: MergeButtonProps) {
  const narrow = useMediaQuery(NARROW.replace('@media ', ''));
  const enabled = methods.filter((m) => !m.disabled);
  /** The method the open confirm is for. */
  const [chosen, setChosen] = useState<MergeMethod | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [acked, setAcked] = useState(false);
  /** The method a one-click is doing: its button says "Working…" until the action resolves. */
  const [acting, setActing] = useState<MergeMethod | null>(null);
  /**
   * Where focus goes next: a method's button after a cancel, or a part of the
   * confirm as it opens. `open`: the acknowledgement when there is one, else Confirm.
   */
  const focusNext = useRef<MergeMethod | 'confirm' | 'ack' | 'open' | null>(null);
  const hintId = useId();
  const fullLabelId = useId();

  // The main button does the default; a default the stage no longer offers (it was promoted meanwhile) falls back to the first.
  const method = enabled.find((m) => m.method === defaultMethod)?.method ?? enabled[0]?.method;
  if (method === undefined) return null;
  const others = enabled.filter((m) => m.method !== method);
  // The confirm is for the button that opened it, while the stage still offers it.
  const confirmMethod = enabled.find((m) => m.method === chosen)?.method ?? method;

  const mainLabel = labels?.main ?? copy.label(method, stageName, anyway);
  const shortLabel = labels?.short ?? copy.shortLabel(method, anyway);
  /*
   * On a phone only the long "…anyway" label is shortened: it would wrap the
   * button to three lines. The visible words stay the accessible name, so speech
   * input can say what it sees; the full label is the button's description, so a
   * screen reader still hears which method and stage it acts on.
   */
  const shortened = narrow && anyway && shortLabel !== mainLabel;
  const mainText = shortened ? shortLabel : mainLabel;
  const mainName = shortened ? { 'aria-describedby': fullLabelId } : {};
  const fullLabel = shortened ? (
    <Box component="span" id={fullLabelId} sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
      {mainLabel}
    </Box>
  ) : null;
  const confirmLabel = confirmMethod === method && labels?.confirm !== undefined ? labels.confirm : copy.confirm(confirmMethod, confirmAnyway);
  const needsAck = ack !== undefined;
  const blocked = (needsAck && !acked) || confirmWaiting;
  const direct = oneClick && !anyway && !needsAck && !retry;
  /** The method whose button says "Working…" outside the confirm. */
  const working = acting ?? (busy ? method : null);

  const open = (target: MergeMethod) => {
    setChosen(target);
    setAcked(false);
    focusNext.current = needsAck ? 'ack' : 'confirm';
    setConfirming(true);
    onOpenConfirm?.(target);
  };
  const cancel = () => {
    if (busy) return;
    focusNext.current = confirmMethod;
    setConfirming(false);
    onCancel?.();
  };
  /** A one-click: act now, and open the confirm only when the action asks for it. */
  const act = async (target: MergeMethod) => {
    if (busy || acting !== null) return;
    setChosen(target);
    setActing(target);
    try {
      const outcome = await onConfirm(target, { oneClick: true });
      if (outcome === false) {
        setAcked(false);
        focusNext.current = 'open';
        setConfirming(true);
      }
    } finally {
      setActing(null);
    }
  };
  const press = (target: MergeMethod) => {
    if (working !== null) return;
    if (direct) void act(target);
    else open(target);
  };
  const confirm = async () => {
    if (busy || blocked) return;
    const outcome = await onConfirm(confirmMethod, { oneClick: false });
    if (outcome === false) return;
    focusNext.current = null;
    setConfirming(false);
  };
  const onConfirmKeys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      cancel();
    }
  };

  const takeFocus = (target: MergeMethod, el: HTMLButtonElement | null) => {
    if (el !== null && focusNext.current === target) {
      focusNext.current = null;
      el.focus();
    }
  };
  const setMain = (el: HTMLButtonElement | null) => {
    assignRef(mainRef, el);
    takeFocus(method, el);
  };
  const setOther = (target: MergeMethod) => (el: HTMLButtonElement | null) => takeFocus(target, el);
  // The acknowledgement comes first in the confirm, so it takes `open` when there is one.
  const focusOnMount = (target: 'confirm' | 'ack') => (el: HTMLElement | null) => {
    if (el !== null && (focusNext.current === target || focusNext.current === 'open')) {
      focusNext.current = null;
      el.focus();
    }
  };

  if (confirming) {
    return (
      <Box onKeyDown={onConfirmKeys} data-testid="stage-merge-confirm" data-method={confirmMethod}>
        {needsAck ? (
          <Box
            component="label"
            data-testid="stage-ack"
            sx={{
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
              mt: '12px',
              p: '12px',
              maxWidth: 560,
              boxSizing: 'border-box',
              minWidth: 0,
              overflowWrap: 'anywhere',
              bgcolor: 'background.paper',
              border: '1px solid var(--amber-bd)',
              borderRadius: 'var(--r-sm)',
              cursor: 'pointer',
              typography: 'body2',
              color: 'text.primary',
            }}
          >
            <Checkbox
              size="small"
              checked={acked}
              disabled={busy}
              onChange={(event) => setAcked(event.target.checked)}
              inputRef={focusOnMount('ack')}
              sx={{
                p: 0,
                mt: '1px',
                // The unchecked box needs 3:1 against white to be seen at all.
                color: 'text.secondary',
                '& .MuiSvgIcon-root': { fontSize: 18 },
                '&.Mui-focusVisible': { outline: '2px solid var(--rust)', outlineOffset: '2px' },
              }}
            />
            <Box component="span">{ack}</Box>
          </Box>
        ) : null}
        {confirmNote !== undefined ? (
          <Typography component="p" variant="body2" sx={{ mt: '12px', color: 'inherit' }} data-testid="stage-confirm-note">
            {confirmNote}
          </Typography>
        ) : null}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', mt: '12px' }}>
          <Button
            variant="contained"
            color="primary"
            ref={focusOnMount('confirm')}
            aria-disabled={busy || blocked ? true : undefined}
            aria-describedby={blocked && !busy && !confirmWaiting ? hintId : undefined}
            onClick={() => void confirm()}
            data-confirm
            data-method={confirmMethod}
            startIcon={busy ? <CircularProgress size={14} color="inherit" aria-hidden /> : undefined}
            sx={{ ...unavailableSx, ...focusSx, ...touchSx }}
          >
            {busy ? copy.working : confirmLabel}
          </Button>
          <Button
            variant="text"
            aria-disabled={busy ? true : undefined}
            onClick={cancel}
            data-cancel
            sx={{ px: '10px', ...unavailableSx, ...focusSx, [NARROW]: { height: 38, fontSize: '13.5px', px: '12px' } }}
          >
            {copy.cancel}
          </Button>
          {blocked && !busy && !confirmWaiting ? (
            <Typography id={hintId} component="span" variant="body2" sx={{ color: 'text.secondary' }}>
              {copy.tickFirst}
            </Typography>
          ) : null}
        </Box>
      </Box>
    );
  }

  const mainData = {
    'data-testid': 'stage-merge',
    'data-method': method,
    'data-one-click': direct ? 'true' : 'false',
    ...(method === 'r'
      ? { 'data-release-stage': stageId }
      : { 'data-promote-stage': stageId, 'data-promote-gated': gated ? 'true' : 'false' }),
    ...(retry ? { 'data-retry': 'true' } : {}),
  };

  return (
    <Box sx={{ mt: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', maxWidth: '100%' }}>
      <Button
        variant={anyway ? 'outlined' : 'contained'}
        color="primary"
        ref={setMain}
        onClick={() => press(method)}
        aria-disabled={working !== null ? true : undefined}
        startIcon={working === method ? <CircularProgress size={14} color="inherit" aria-hidden /> : undefined}
        {...mainData}
        {...mainName}
        sx={{ bgcolor: anyway ? 'background.paper' : undefined, ...(working !== null && working !== method ? unavailableSx : busySx), ...focusSx, ...touchSx, [NARROW]: { ...touchSx[NARROW], whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.3 } }}
      >
        {working === method ? copy.working : mainText}
      </Button>
      {fullLabel}
      {others.map((option) => (
        <Button
          key={option.method}
          variant="outlined"
          color="inherit"
          ref={setOther(option.method)}
          onClick={() => press(option.method)}
          aria-disabled={working !== null ? true : undefined}
          startIcon={working === option.method ? <CircularProgress size={14} color="inherit" aria-hidden /> : undefined}
          data-testid="stage-merge-other"
          data-method={option.method}
          data-one-click={direct ? 'true' : 'false'}
          sx={{ bgcolor: 'background.paper', ...(working !== null && working !== option.method ? unavailableSx : busySx), ...focusSx, ...touchSx }}
        >
          {working === option.method ? copy.working : copy.otherLabel(option.method, anyway)}
        </Button>
      ))}
    </Box>
  );
}
