// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The change panel: your ChangeSet as a pull request being written (D15). Its name and
 * description at the top, then the Units it applies to with a readable diff each, then Finish
 * and Create ChangeOrder. Its only job is to make the ChangeSet that becomes a ChangeOrder.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Popover from '@mui/material/Popover';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useBulkPatchUnitsMutation, usePatchChangeSetMutation } from '@confighub/rtk-query';
import { authFetch } from '@/auth/session';
import { getApiErrorMessage } from '@/utility/error-functions';
import { changeSetPath } from '@/pages/change-sets/changeSetAddress';
import { closeGatesOfAnswer, closePrerequisites, type CloseGate } from '@/pages/change-sets/changeSetCloseGates';
import { closeChangeSetDryRun } from '@/pages/change-sets/changeSetServerCalls';
import { ForceCloseChangeSetDialog } from '@/pages/change-sets/ChangeSetGatesSection';
import { StateChip } from '@/pages/change-orders/components/SummaryFacts';
import { changeOrderInk, changeOrderType } from '@/pages/change-orders/changeOrdersTokens';
import { DRAFT_PARAMS, DRAFT_ROUTE } from '@/pages/change-orders/draft/draftDecisions';
import { useDraftBases } from '@/pages/change-orders/draft/useDraftBases';
import { GateBody, GateMark, GateName, GateRow, GateWhy } from '@/pages/x/apps/change-order/ChangeOrderGateList';
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { useActiveChange } from './ActiveChangeProvider';
import { leaveActiveChange, readLeftChange, setActiveChange, setPendingChange } from './activeChange';
import { ChangeMenu, OpenChangesList } from './ChangeMenu';
import { VariantChanges } from './VariantChanges';
import { useVariantChanges } from './useVariantChanges';
import { ChangeIcon } from './ChangeIcon';
import { PanelLink, PanelNotice } from './ChangeTrackParts';
import { AddSelection, LivesIn, PageUnitRow, StartOnSelection } from './PanelSelection';
import { UnitsSection } from './UnitsSection';
import { monoSx } from './panelStyles';
import { useChangeStart } from './useChangeStart';
import { usePanelSelection } from './useSelection';

/** The server's limit on a ChangeSet's Description. */
const DESCRIPTION_MAX = 1024;

interface PanelProps {
  onClose: () => void;
}

const bodySx = { flex: 1, minHeight: 0, overflowY: 'auto' } as const;
const blockSx = { padding: '14px 16px' } as const;
const footSx = { flex: 'none', borderTop: `1px solid ${tokens.bd0}`, padding: '12px 16px', background: tokens.surface } as const;
const captionSx = { fontSize: 12, color: tokens.t2, marginTop: '6px' } as const;
// Off reads as the same button, faded, as the design draws it.
const finishSx = { height: 36, '&.Mui-disabled': { backgroundColor: tokens.rust, color: tokens.surface, opacity: 0.45 } } as const;

function chipSx(tone: 'open' | 'ok') {
  // Square corners, as the panel's chips are; the theme's StateChip is round.
  return {
    display: 'inline-flex',
    '& > span': {
      borderRadius: '3px',
      padding: '0 7px',
      height: 20,
      fontSize: changeOrderType.size.small,
      background: tone === 'open' ? tokens.blueBg : tokens.greenBg,
      borderColor: tone === 'open' ? tokens.blueBd : tokens.greenBd,
    },
  } as const;
}

/** `onBack`: with a ChangeSet active, the back arrow left of the title leaves it, as the menu's Leave does (D43). */
function PanelHeader({ onClose, onBack, children }: PanelProps & { onBack?: () => void; children?: ReactNode }) {
  return (
    <Box
      data-testid="panel-head"
      sx={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 1, padding: '12px 16px', borderBottom: `1px solid ${tokens.bd0}`, color: tokens.t2 }}
    >
      {onBack ? (
        <Tooltip title="Leave this ChangeSet">
          <IconButton size="small" data-testid="change-back" aria-label="Leave this ChangeSet" onClick={onBack} sx={{ marginLeft: '-6px' }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
      <ChangeIcon sx={{ fontSize: 16 }} />
      <Box component="span" sx={{ fontWeight: 600, fontSize: changeOrderType.size.prose, color: tokens.t1 }}>
        Your ChangeSet
      </Box>
      <Box sx={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2px' }}>
        {children}
        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

/** Open page and the copy-link icon (D6); the icon copies the link and shows it in a light popover. */
function LinkTools({ space, slug }: { space: string; slug: string }) {
  const path = changeSetPath(space, slug);
  const url = `${window.location.origin}${path}`;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 3000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <>
      <PanelLink testId="open-page-link" href={path} title="Open the ChangeSet page">
        <OpenInNewIcon sx={{ fontSize: 15 }} />
        Open page
      </PanelLink>
      <Tooltip title="Copy link">
        <IconButton
          size="small"
          data-testid="copy-link"
          aria-label="Copy link"
          onClick={(event) => {
            setAnchor(event.currentTarget);
            void navigator.clipboard?.writeText(url).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          <ContentCopyOutlinedIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { 'data-testid': 'link-popover', sx: { width: 'min(400px, calc(100vw - 32px))', padding: 1.5, boxShadow: tokens.shMd, fontSize: changeOrderType.size.body } } as object }}
      >
        <Box sx={{ fontWeight: 600 }}>Link to this ChangeSet</Box>
        <Box sx={{ color: tokens.t2, fontSize: 12, marginTop: '2px' }}>Reviewers open it on the ChangeSet page.</Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginTop: 1, border: `1px solid ${tokens.bd0}`, borderRadius: `${tokens.rSm}px`, padding: '6px 8px', background: tokens.bg }}>
          <Box component="span" data-testid="link-url" sx={{ ...monoSx, flex: 1, minWidth: 0, fontSize: changeOrderType.size.small, overflowWrap: 'anywhere' }}>
            {url}
          </Box>
          {copied ? (
            <Box component="span" data-testid="link-copied" sx={chipSx('ok')}>
              <StateChip label="Copied" tone={tokens.green} />
            </Box>
          ) : null}
        </Box>
        <Box sx={{ marginTop: '10px' }}>
          <PanelLink testId="link-open" href={path}>
            Open the ChangeSet page <OpenInNewIcon sx={{ fontSize: 15 }} />
          </PanelLink>
        </Box>
      </Popover>
    </>
  );
}

/** No change yet (D2): Start a change, and where it will live. With Units ticked on a list, D9. */
function StartPanel({ onClose }: PanelProps) {
  const start = useChangeStart();
  // The change just left with "Leave this change" (D33), still open.
  const left = readLeftChange();
  // Open changes on the page's Variant come first and say what is going on (D35).
  const variant = useVariantChanges(undefined);
  const onVariant = variant.changes.length > 0;
  // The page-Unit row gives way only when an open change in the band holds the page's own Unit
  // (D35: the band then says it); a finished holder (D37) or other changes leave the row.
  const onVariantOpen = variant.changes.some((c) => !c.closed && c.hasPageUnit);
  const ps = usePanelSelection(undefined);
  return (
    <>
      <PanelHeader onClose={onClose} />
      {ps.mode === 'page' && ps.pageUnit && !onVariantOpen ? <PageUnitRow unit={ps.pageUnit} start={start} /> : null}
      <Box sx={bodySx} data-testid="empty-panel">
        <VariantChanges changes={variant.changes} isVariant={variant.isVariant} />
        {ps.mode === 'list' ? (
          <StartOnSelection ps={ps} start={start} />
        ) : (
          <Box sx={blockSx} data-testid="start-explainer">
            {onVariant ? null : left !== null ? (
              <PanelNotice severity="info" icon={<InfoOutlinedIcon fontSize="inherit" />} data-testid="left-change-note" sx={{ marginBottom: '12px' }}>
                You left <Box component="span" sx={monoSx}>{left}</Box>. It is still open. Saves go out as new Revisions until you pick a ChangeSet.
              </PanelNotice>
            ) : (
              <>
                <Box sx={{ fontWeight: 600, fontSize: changeOrderType.size.lead }}>Start a ChangeSet</Box>
                <Box component="p" sx={{ color: tokens.t2, fontSize: changeOrderType.size.body, margin: '6px 0 14px' }}>
                  A ChangeSet groups the Units you save, with a description, so they can become one ChangeOrder. Every Unit you save while it is open joins it.
                </Box>
              </>
            )}
            <Button variant="contained" fullWidth data-testid="start-button" disabled={start.busy} onClick={() => void start.start()} sx={{ height: 36 }}>
              Start a ChangeSet
            </Button>
            {left !== null || onVariant ? null : start.livesIn ? (
              <LivesIn testId="change-pending-lives-in" lead="It will live in" space={start.livesIn.space} why={start.livesIn.why} />
            ) : (
              <LivesIn testId="change-pending-lives-in" lead="It will live in" space="the Space of the first Unit you edit" />
            )}
            {start.error ? (
              <PanelNotice severity="error" sx={{ marginTop: 1.5 }}>
                {start.error}
              </PanelNotice>
            ) : null}
          </Box>
        )}
        {/* With no change active there is always a way into one you have (D34). */}
        <OpenChangesList exclude={variant.changes.map((c) => c.id)} />
      </Box>
    </>
  );
}

/** A pending change (D34): named, made by the first save in that Unit's Space. */
function PendingPanel({ onClose, name }: PanelProps & { name: string }) {
  return (
    <>
      <PanelHeader onClose={onClose} onBack={() => setPendingChange(null)} />
      <Box sx={bodySx}>
        <Box sx={blockSx}>
          <Box data-testid="change-name" sx={{ ...monoSx, fontWeight: 600, fontSize: 16, color: changeOrderInk.default, overflowWrap: 'anywhere' }}>
            {name}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', ...captionSx }}>
            <Box component="span" data-testid="change-pending-lives-in" sx={{ flex: 1 }}>
              Lives in: the Space of the first Unit you edit.
            </Box>
            <PanelLink muted testId="change-pending-drop" onClick={() => setPendingChange(null)}>
              Drop it
            </PanelLink>
          </Box>
        </Box>
        <UnitsSection rows={[]} openUnitIds={[]} baseSpace="" revisions={undefined} />
      </Box>
      <Box sx={footSx} data-testid="finish-area">
        <Box sx={{ ...captionSx, marginTop: 0 }}>Nothing is created until you save a Unit.</Box>
      </Box>
    </>
  );
}

function LoadingPanel({ onClose, space, slug }: PanelProps & { space: string; slug: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), 200);
    return () => window.clearTimeout(timer);
  }, []);
  const bar = (width: string, height = 12, marginTop = 8) => <Skeleton variant="rounded" height={height} sx={{ width, marginTop: `${marginTop}px` }} />;
  return (
    <>
      <PanelHeader onClose={onClose} onBack={() => setActiveChange(null)}>
        <LinkTools space={space} slug={slug} />
      </PanelHeader>
      <Box sx={bodySx}>
        <Box sx={blockSx} data-testid="loading-panel">
          {shown ? (
            <>
              {bar('55%', 16, 0)}
              {bar('40%')}
              {bar('90%', 12, 18)}
              {bar('70%')}
            </>
          ) : null}
        </Box>
      </Box>
      <Box sx={footSx} data-testid="finish-area">
        <Button variant="contained" fullWidth disabled data-testid="finish-button" sx={finishSx}>
          Finish ChangeSet
        </Button>
        <Box data-testid="finish-caption" sx={captionSx}>
          Closes the ChangeSet. Then you create the ChangeOrder from it.
        </Box>
      </Box>
    </>
  );
}

function NameRow({
  slug,
  onRename,
  state,
  changeSetId,
  onStartNew,
}: {
  slug: string;
  onRename: (slug: string) => void;
  state: 'Open' | 'Finished';
  changeSetId: string;
  onStartNew: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const next = (draft ?? '').trim();
    setDraft(null);
    if (next !== '' && next !== slug) onRename(next);
  };
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '6px', minWidth: 0 }}>
      {draft === null ? (
        // The name opens the change menu: your other changes, a new one, or none (D33), also
        // once the change is finished.
        <ChangeMenu slug={slug} activeId={changeSetId} onStartNew={onStartNew} finished={state === 'Finished'} />
      ) : (
        <InputBase
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            if (event.key === 'Escape') setDraft(null);
          }}
          inputProps={{ 'aria-label': 'ChangeSet name', spellCheck: false, 'data-testid': 'change-name' }}
          sx={{ ...monoSx, fontWeight: 600, fontSize: 16, flex: 1, minWidth: 0, borderBottom: `1px solid ${tokens.rust}` }}
        />
      )}
      <Tooltip title="Rename">
        <IconButton size="small" data-testid="rename-button" aria-label="Rename" onClick={() => setDraft(slug)} sx={{ padding: '3px', color: tokens.t3 }}>
          <EditOutlinedIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      <Box component="span" data-testid="change-state" sx={{ marginLeft: 'auto', marginTop: '2px', ...chipSx(state === 'Open' ? 'open' : 'ok') }}>
        <StateChip label={state} tone={state === 'Open' ? tokens.blue : tokens.green} />
      </Box>
    </Box>
  );
}

/** The Description (D3): read in place, written in place; it becomes the ChangeOrder description. */
function DescriptionBlock({ text, onSave }: { text: string; onSave: (text: string) => Promise<string | undefined> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  // One line "Description" with the rename pencil's pen beside it (D41): no box until written in.
  // With no description yet, the line reads quieter, as a placeholder does (D42).
  const head = (edit: boolean, muted = false) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '16px 0 6px' }}>
      <Box component="span" sx={{ fontSize: changeOrderType.size.body, fontWeight: 600, color: muted ? tokens.t3 : changeOrderInk.default }}>
        Description
      </Box>
      {edit ? (
        <Tooltip title="Edit description">
          <IconButton
            size="small"
            data-testid="description-edit"
            aria-label="Edit description"
            onClick={() => setDraft(text)}
            // The theme's keyboard focus outline, so the quiet pen still shows where focus is.
            sx={{ padding: '3px', color: tokens.t3, '&.Mui-focusVisible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '1px' } }}
          >
            <EditOutlinedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      ) : null}
    </Box>
  );
  if (draft !== null) {
    return (
      <>
        {head(false)}
        <TextField
          multiline
          fullWidth
          autoFocus
          minRows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          slotProps={{ htmlInput: { maxLength: DESCRIPTION_MAX, 'aria-label': 'Description' } }}
          data-testid="description-input"
          sx={{
            '& .MuiInputBase-root': { fontSize: changeOrderType.size.prose, lineHeight: changeOrderType.lineHeight.loose, minHeight: 96, alignItems: 'flex-start' },
            // The box is being written in: it keeps the focused look of the theme (D23), also under
            // the pointer, where the theme's hover rule would otherwise win over its focus rule.
            '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline, & .MuiOutlinedInput-root:hover:not(.Mui-disabled) .MuiOutlinedInput-notchedOutline': {
              borderColor: tokens.rust,
            },
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginTop: 1 }}>
          <Box component="span" sx={{ flex: 1 }} />
          <Box component="span" data-testid="description-count" sx={{ ...captionSx, marginTop: 0, whiteSpace: 'nowrap' }}>
            {`${draft.length}/${DESCRIPTION_MAX}`}
          </Box>
          <Button size="small" variant="outlined" color="inherit" onClick={() => setDraft(null)} disabled={saving} sx={{ borderColor: tokens.bd0, color: tokens.t1 }}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            data-testid="description-save"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onSave(draft.trim()).then((failure) => {
                setSaving(false);
                setError(failure);
                if (failure === undefined) setDraft(null);
              });
            }}
          >
            Save
          </Button>
        </Box>
        {error ? (
          <PanelNotice severity="error" sx={{ marginTop: 1 }}>
            {error}
          </PanelNotice>
        ) : null}
      </>
    );
  }
  if (text.trim() === '') return head(true, true);
  return (
    <>
      {head(true)}
      <Box
        data-testid="description-text"
        role="button"
        tabIndex={0}
        title="Edit description"
        onClick={() => setDraft(text)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') setDraft(text);
        }}
        sx={{ fontSize: changeOrderType.size.prose, lineHeight: changeOrderType.lineHeight.loose, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', cursor: 'text' }}
      >
        {text}
      </Box>
    </>
  );
}

/**
 * The reason in a close refusal, without the sentence around it: "unable to close change set
 * 'x', Space 'y': requires payments-review: 1 Approval …" reads "requires payments-review".
 */
function gateReason(message: string): string {
  const reason = message.replace(/^unable to close change set '[^']*', Space '[^']*'(: |\s)/, '');
  const cut = reason.indexOf(': ');
  return cut > 0 ? reason.slice(0, cut) : reason;
}

/** "The server answered 500: failed to read entity." */
function readFailure(error: unknown): string {
  const status = (error as { status?: unknown } | undefined)?.status;
  const message = getApiErrorMessage(error).trim().replace(/[.\s]+$/, '');
  if (typeof status === 'number') return `The server answered ${status}${message ? `: ${message}` : ''}.`;
  return message ? `${message}.` : '';
}

type GateWorkflow = { AttestationPrerequisites?: { Name: string; Count?: number }[]; CustomPrerequisites?: { Name: string }[] } | undefined;

/** What a blocking gate needs, in plain words. */
function plainGate(workflow: GateWorkflow, name: string): string {
  const attest = workflow?.AttestationPrerequisites?.find((p) => p.Name === name);
  if (attest) {
    const n = attest.Count ?? 1;
    return `Needs ${n} review${n === 1 ? '' : 's'}`;
  }
  if (workflow?.CustomPrerequisites?.some((p) => p.Name === name)) return 'A check fails';
  return 'Validation finds problems';
}

function ActivePanel({ onClose }: PanelProps) {
  const ac = useActiveChange()!;
  const { detail } = ac;
  const changeSet = detail.changeSet!;
  const changeSetId = changeSet.ChangeSetID ?? '';
  const spaceSlug = changeSet.SpaceSlug ?? ac.ref?.space ?? '';
  const closed = changeSet.State === 'Closed';
  const ps = usePanelSelection(closed ? undefined : changeSetId);
  const variant = useVariantChanges(changeSetId);
  const { bases } = useDraftBases();
  const base = bases.find((b) => b.spaceSlug === spaceSlug);
  const [patchChangeSet] = usePatchChangeSetMutation();
  const [bulkPatchUnits] = useBulkPatchUnitsMutation();
  const [blocked, setBlocked] = useState<CloseGate[] | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string>();
  const [forceOpen, setForceOpen] = useState(false);
  const [renameError, setRenameError] = useState<string>();

  const unitCount = useMemo(
    () => new Set([...detail.diff.rows.map((r) => r.unit.unitId), ...detail.openUnitIds]).size,
    [detail.diff.rows, detail.openUnitIds],
  );
  const isBlocked = blocked !== null && blocked.length > 0;

  const patch = async (body: Record<string, string>): Promise<string | undefined> => {
    try {
      await patchChangeSet({
        spaceId: changeSet.SpaceID ?? '',
        changeSetId,
        // @ts-expect-error RTK Query merge-patch+json content type requires pre-stringified body
        body: JSON.stringify(body),
      }).unwrap();
      detail.refetch();
      return undefined;
    } catch (error) {
      return getApiErrorMessage(error);
    }
  };

  const rename = async (slug: string) => {
    const failure = await patch({ Slug: slug });
    setRenameError(failure);
    if (failure === undefined) ac.setActive({ space: spaceSlug, slug });
  };

  const close = async (forceReason?: string) => {
    await bulkPatchUnits({
      where: `ChangeSetID = '${changeSetId}'`,
      changeSetId,
      ...(forceReason !== undefined ? { forceClose: true, forceReason } : {}),
      // @ts-expect-error RTK Query merge-patch+json content type requires pre-stringified body
      body: JSON.stringify({ ChangeSetID: null }),
    }).unwrap();
    setBlocked(null);
    setForceOpen(false);
    detail.refetch();
  };

  /**
   * Reads the gates again while Finish is blocked: after the description is saved, after a save
   * into the change, or on "Check again". A gate that now holds no longer blocks.
   */
  const [checking, setChecking] = useState(false);
  const checkGates = async () => {
    setChecking(true);
    setFinishError(undefined);
    try {
      const answer = await closeChangeSetDryRun(authFetch, changeSetId);
      const gates = closeGatesOfAnswer(answer, closePrerequisites(changeSet), changeSet.InScopeSpaceIDs?.length ?? 0);
      if (gates.status === 'unknown') setFinishError(gates.message);
      else if (gates.status === 'held') setBlocked(gates.gates.filter((g) => g.failures.length > 0));
      else setBlocked(null);
    } catch (error) {
      setFinishError(getApiErrorMessage(error));
    } finally {
      setChecking(false);
    }
  };
  const lastSaveAt = ac.lastSave;
  useEffect(() => {
    if (lastSaveAt !== undefined && blocked !== null) void checkGates();
    // Only a new save into the change re-reads the gates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSaveAt]);

  /** Finish reads the gates now, with a dry run of the close (D10), and closes only when they hold. */
  const finish = async (forceReason?: string) => {
    setFinishing(true);
    setFinishError(undefined);
    try {
      if (forceReason === undefined && changeSet.ChangeWorkflow !== undefined) {
        const answer = await closeChangeSetDryRun(authFetch, changeSetId);
        const gates = closeGatesOfAnswer(answer, closePrerequisites(changeSet), changeSet.InScopeSpaceIDs?.length ?? 0);
        if (gates.status === 'held') {
          setBlocked(gates.gates.filter((g) => g.failures.length > 0));
          return;
        }
        if (gates.status === 'unknown') {
          setFinishError(gates.message);
          return;
        }
      }
      await close(forceReason);
    } catch (error) {
      setFinishError(getApiErrorMessage(error));
    } finally {
      setFinishing(false);
    }
  };

  const query = new URLSearchParams();
  query.set(DRAFT_PARAMS.space, spaceSlug);
  query.set(DRAFT_PARAMS.end, changeSet.Slug);
  query.set(DRAFT_PARAMS.name, changeSet.Slug);
  if (changeSet.Description) query.set(DRAFT_PARAMS.desc, changeSet.Description);
  const draftHref = `${DRAFT_ROUTE}?${query.toString().replace(/\+/g, '%20')}`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <PanelHeader
        onClose={onClose}
        // As the menu's Leave: an open ChangeSet stays open, with the "You left" note; a finished one is just left.
        onBack={() => (closed ? setActiveChange(null) : leaveActiveChange(changeSet.Slug))}
      >
        <LinkTools space={spaceSlug} slug={changeSet.Slug} />
      </PanelHeader>
      {ps.mode === 'page' && ps.pageUnit && !closed ? <PageUnitRow unit={ps.pageUnit} changeSetId={changeSetId} /> : null}
      <Box sx={bodySx}>
        <VariantChanges changes={variant.changes} isVariant={variant.isVariant} activeChangeSetId={changeSetId} />
        {ps.mode === 'list' && !closed ? <AddSelection selection={ps.selection} changeSetId={changeSetId} /> : null}
        <Box sx={{ ...blockSx, paddingBottom: '4px' }}>
          <NameRow
            slug={changeSet.Slug}
            onRename={(slug) => void rename(slug)}
            state={closed ? 'Finished' : 'Open'}
            changeSetId={changeSetId}
            onStartNew={() => ac.setActive(null)}
          />
          {renameError ? (
            <PanelNotice severity="error" sx={{ marginTop: 1 }}>
              {renameError}
            </PanelNotice>
          ) : null}
          <LivesIn testId="change-lives-in" lead="In" space={spaceSlug} why={base ? `the base of ${base.componentSlug || base.componentName}` : undefined} />
          {ac.refused ? (
            <PanelNotice severity="error" sx={{ marginTop: 1 }}>
              {`Not saved. ${ac.refused.message.replace(/^\s*not saved[.:]?\s*/i, '')}`}
            </PanelNotice>
          ) : null}
          <DescriptionBlock
            text={changeSet.Description ?? ''}
            onSave={async (text) => {
              const failure = await patch({ Description: text });
              // A description can be what a gate asked for (has-description): read them again.
              if (failure === undefined && blocked !== null) void checkGates();
              return failure;
            }}
          />
        </Box>
        <UnitsSection rows={detail.diff.rows} openUnitIds={detail.openUnitIds} baseSpace={base ? spaceSlug : ''} revisions={detail.revisions} finished={closed} />
      </Box>
      <Box sx={footSx} data-testid="finish-area">
        {closed ? (
          <>
            <Button variant="contained" color="secondary" fullWidth data-testid="create-changeorder" href={draftHref} sx={{ height: 36 }}>
              Create ChangeOrder
            </Button>
            <Box data-testid="create-changeorder-caption" sx={captionSx}>
              Opens the ChangeOrder draft from <Box component="span" sx={{ ...monoSx, color: tokens.t1 }}>{spaceSlug}</Box>, ending at this ChangeSet, with its name and description filled in.
            </Box>
            <Box sx={{ marginTop: 1 }}>
              <PanelLink testId="start-new-button" onClick={() => ac.setActive(null)}>
                Start a new ChangeSet
              </PanelLink>
            </Box>
          </>
        ) : (
          <>
            {isBlocked ? (
              <PanelNotice severity="warning" icon={false} data-testid="finish-blocked" sx={{ marginBottom: 1.5, '& .MuiAlert-message': { width: '100%' } }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, marginBottom: '4px' }}>
                  <Box sx={{ fontWeight: 600, color: tokens.t1, flex: 1 }}>Finish is blocked</Box>
                  <PanelLink testId="finish-check-again" small onClick={() => void checkGates()}>
                    {checking ? 'Checking…' : 'Check again'}
                  </PanelLink>
                </Box>
                {blocked.map((gate) => (
                  <GateRow key={gate.prerequisite} data-testid={`gate-${gate.prerequisite}`} sx={{ padding: '8px 0', borderBottom: 0 }}>
                    <GateMark $tone="no" aria-hidden>
                      !
                    </GateMark>
                    <GateBody>
                      <Box sx={{ display: 'flex', gap: '7px', alignItems: 'baseline', flexWrap: 'wrap', fontSize: changeOrderType.size.body, fontWeight: 600, color: tokens.t1 }}>
                        {plainGate(changeSet.ChangeWorkflow, gate.prerequisite)}
                        <GateName sx={{ display: 'inline-flex' }}>{gate.prerequisite}</GateName>
                      </Box>
                      {/* One line per reason: the same reason in several Spaces is said once. */}
                      {[...new Map(gate.failures.map((f) => [gateReason(f.message), f])).values()].map((f) => (
                        <GateWhy key={f.spaceSlug}>{`${f.spaceSlug}/${gate.prerequisite}: ${gateReason(f.message)}`}</GateWhy>
                      ))}
                    </GateBody>
                    <Box sx={{ alignSelf: 'center' }}>
                      <PanelLink testId={`gate-fix-${gate.prerequisite}`} href={changeSetPath(spaceSlug, changeSet.Slug)}>
                        {changeSet.ChangeWorkflow?.AttestationPrerequisites?.some((p) => p.Name === gate.prerequisite) ? 'Request review' : 'Open findings'}
                      </PanelLink>
                    </Box>
                  </GateRow>
                ))}
              </PanelNotice>
            ) : null}
            {finishError ? (
              <PanelNotice severity="error" icon={<InfoOutlinedIcon fontSize="inherit" />} sx={{ marginBottom: 1.5 }}>
                {finishError}
              </PanelNotice>
            ) : null}
            <Button
              variant="contained"
              fullWidth
              data-testid="finish-button"
              disabled={finishing || unitCount === 0 || isBlocked}
              onClick={() => void finish()}
              sx={finishSx}
            >
              Finish ChangeSet
            </Button>
            {isBlocked ? (
              <Box sx={{ textAlign: 'center', marginTop: 1 }}>
                <PanelLink muted testId="force-finish" onClick={() => setForceOpen(true)}>
                  Force finish with a reason…
                </PanelLink>
              </Box>
            ) : (
              <Box data-testid="finish-caption" sx={captionSx}>
                Closes the ChangeSet. Then you create the ChangeOrder from it.
              </Box>
            )}
          </>
        )}
      </Box>
      {forceOpen && blocked !== null ? (
        <ForceCloseChangeSetDialog
          slug={changeSet.Slug}
          gates={blocked}
          error={finishError}
          closing={finishing}
          onCancel={() => setForceOpen(false)}
          onConfirm={(reason) => void finish(reason)}
        />
      ) : null}
    </Box>
  );
}

export function ChangePanel({ onClose }: PanelProps) {
  const ac = useActiveChange();
  if (ac !== null && ac.ref === null && ac.pending !== null) return <PendingPanel onClose={onClose} name={ac.pending} />;
  if (ac === null || ac.ref === null) return <StartPanel onClose={onClose} />;
  // A rename elsewhere reads as "not found" by the old name until the new name is taken over.
  const settling = !ac.gone && ac.detail.status === 'notFound' && (ac.following || ac.idPending);
  if (ac.detail.status === 'loading' || settling || (ac.detail.status === 'found' && ac.detail.changeSet === undefined)) return <LoadingPanel onClose={onClose} space={ac.ref.space} slug={ac.ref.slug} />;
  if (ac.detail.status === 'notFound' || ac.gone) {
    // Deleted, or never there: no dead end. Leave it, or pick one of your open changes.
    return (
      <>
        <PanelHeader onClose={onClose} onBack={() => ac.setActive(null)} />
        <Box sx={bodySx}>
          <Box sx={blockSx}>
            <PanelNotice severity="error" icon={<InfoOutlinedIcon fontSize="inherit" />} data-testid="error-note">
              Your ChangeSet <Box component="span" sx={monoSx}>{ac.ref.slug}</Box> was not found. It may have been deleted. Saves go out as new Revisions until you pick a ChangeSet.
              <Box sx={{ marginTop: 1, display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" color="inherit" data-testid="not-found-leave" onClick={() => ac.setActive(null)} sx={{ borderColor: tokens.bd0, color: tokens.t1, background: tokens.surface }}>
                  Leave this ChangeSet
                </Button>
              </Box>
            </PanelNotice>
          </Box>
          <OpenChangesList exclude={ac.ref.id ? [ac.ref.id] : []} />
        </Box>
      </>
    );
  }
  if (ac.detail.status !== 'found') {
    return (
      <>
        <PanelHeader onClose={onClose} onBack={() => ac.setActive(null)}>
          <LinkTools space={ac.ref.space} slug={ac.ref.slug} />
        </PanelHeader>
        <Box sx={bodySx}>
          <Box sx={blockSx}>
            <PanelNotice severity="error" icon={<InfoOutlinedIcon fontSize="inherit" />} data-testid="error-note">
              {ac.detail.status === 'error' ? (
                <>
                  Could not read your ChangeSet <Box component="span" sx={monoSx}>{ac.ref.slug}</Box>. {readFailure(ac.detail.error)} Your saves still go into it.
                </>
              ) : null}
              <Box sx={{ marginTop: 1, display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" data-testid="error-retry" onClick={ac.detail.refetch}>
                  Try again
                </Button>
              </Box>
            </PanelNotice>
          </Box>
        </Box>
      </>
    );
  }
  return <ActivePanel onClose={onClose} />;
}
