// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A Transform paths draft's rows, under the What track: the update type as Base changes has its
 * own (only the types whose Links reach the scope), then the shared source the variants' Links
 * read, the source's changes they have not taken, and where the change ends. Every control writes
 * the URL; last time's type has the way back beside it, as the facts do.
 */

import { useState } from 'react';

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import InventoryOutlinedIcon from '@mui/icons-material/Inventory2Outlined';

import {
  changeOrderBorder,
  changeOrderCardTokens,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { CouldNotEstablish } from './CouldNotEstablish';
import { draftCopy } from './draftCopy';
import type { DraftAddressPatch } from './draftDecisions';
import { type DraftFanOut, type DraftFanOutSource, type DraftFanOutType, FAN_OUT_IDS } from './draftFanOut';
import { DraftPeek, PeekCode } from './DraftPeek';
import { DraftPopover, OptionAside, OptionText, PopoverDivider, PopoverHeading, RevertButton } from './DraftPopover';
import { KeepTogether, Row } from './DraftRows';
import { LABEL_COLUMN, PICK_SX, ROWS_GRID_SX } from './draftRowsLook';
import { FOCUS_RING, OPTION_SX } from './draftLook';
import { dayMonth } from './draftPageModel';
import type { DraftReadStatus } from './draftTypes';
import type { DraftSkippedUnit } from './draftValidation';
import { FAN_OUT_ICON } from './kindIcons';
import { UpdateTypeBar } from './UpdateTypeBar';

const copy = draftCopy.fanOut;

const CHIP_SX = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: 20,
  padding: '0 7px 0 5px',
  borderRadius: `${changeOrderShape.radius.sm + 1}px`,
  fontFamily: changeOrderFontMono,
  fontSize: changeOrderType.size.small,
  color: changeOrderInk.default,
  background: changeOrderSurface.card,
  border: `1px solid ${changeOrderBorder.default}`,
  '& .MuiSvgIcon-root': { fontSize: 14, color: changeOrderInk.muted },
} as const;

interface TypeBarProps {
  fanOut: DraftFanOut;
  linksStatus: DraftReadStatus;
  onRetry: () => void;
  onChange: (patch: DraftAddressPatch) => void;
}

/** The update type: a choice where more than one type's Links reach the scope, else the one there is. */
function TypeBar({ fanOut, linksStatus, onRetry, onChange }: TypeBarProps) {
  const type = fanOut.type;
  if (fanOut.types.length <= 1) {
    const Icon = FAN_OUT_ICON[type.value];
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', minHeight: 24 }}>
        <Box
          id={FAN_OUT_IDS.type}
          tabIndex={-1}
          data-testid="draft-fan-out-type"
          role="img"
          aria-label={`${draftCopy.page.updateType.title}: ${type.value}`}
          sx={{ display: 'inline-flex', outline: 'none' }}
        >
          <Box component="span" sx={CHIP_SX} title={copy.typeTip[type.value]}>
            <Icon aria-hidden />
            {type.value}
          </Box>
        </Box>
      </Box>
    );
  }
  return (
    <UpdateTypeBar<DraftFanOutType>
      types={fanOut.types}
      value={type.value}
      last={type.last}
      changed={type.differsFromLast}
      availability={fanOut.availability}
      icons={FAN_OUT_ICON}
      tips={copy.typeTip}
      noLinkTip={copy.problems.noLinkOfType}
      id={FAN_OUT_IDS.type}
      testId="draft-fan-out-type"
      linksStatus={linksStatus}
      onRetryLinks={onRetry}
      problemIds={[]}
      onPick={(via) => onChange({ via })}
      onRevert={() => onChange({ via: null })}
    />
  );
}

interface SourceChipProps {
  source: DraftFanOutSource;
  /** Why the server passes it over, when its create dry run has said. */
  skipped: string | undefined;
}

/** One shared source: its Space and slug, how far the variants have taken it, and what its Links read. */
function SourceChip({ source, skipped }: SourceChipProps) {
  const reason = skipped ?? (source.skip === undefined ? undefined : copy.skip[source.skip]);
  const linkLines = source.links.map((link) => (
    <span key={link.linkId}>
      <PeekCode>{link.slug}</PeekCode> {copy.took(link.lastMergedRevisionNum)}
    </span>
  ));
  return (
    <KeepTogether>
      <DraftPeek
        spec={{
          eyebrow: copy.links(source.links.length),
          icon: <AltRouteIcon aria-hidden />,
          lines: [...linkLines, ...(source.paths === undefined ? [] : [copy.readsPaths(source.paths.join(', '))])],
        }}
      >
        <Box
          component="span"
          tabIndex={0}
          data-testid="draft-fan-out-source"
          data-source={`${source.unit.spaceSlug}/${source.unit.slug}`}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontFamily: changeOrderFontMono,
            fontSize: changeOrderType.size.body,
            color: changeOrderInk.default,
            borderRadius: '4px',
            outline: 'none',
            '&:focus-visible': FOCUS_RING,
          }}
        >
          <FolderOutlinedIcon aria-hidden sx={{ fontSize: 14, color: changeOrderInk.subtle }} />
          <Box component="span" translate="no">
            <Box component="span" sx={{ color: changeOrderInk.muted }}>
              {source.unit.spaceSlug}/
            </Box>
            <Box component="span" sx={{ fontWeight: changeOrderType.weight.semibold }}>
              {source.unit.slug}
            </Box>
          </Box>
        </Box>
      </DraftPeek>
      <Box component="span" sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
        {copy.revision(source.start)}
        {source.end === undefined ? null : ` → ${copy.revision(source.end)}`}
      </Box>
      {reason === undefined ? null : (
        <Box component="span" data-testid="draft-fan-out-skipped" sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, border: `1px solid ${changeOrderBorder.default}`, borderRadius: `${changeOrderShape.radius.pill}px`, padding: '0 7px' }}>
          {reason}
        </Box>
      )}
    </KeepTogether>
  );
}

interface RevisionCardsProps {
  fanOut: DraftFanOut;
}

/** The sources' Revisions the change carries, oldest first: what the variants have not taken. */
function RevisionCards({ fanOut }: RevisionCardsProps) {
  const cards = fanOut.sources.flatMap((source) => source.revisions.map((revision) => ({ source, revision })));
  if (cards.length === 0)
    return (
      <Box component="span" sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>
        {copy.noChanges}
      </Box>
    );
  return (
    <Box component="ol" sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px', listStyle: 'none', margin: 0, padding: 0 }}>
      {cards.map(({ source, revision }) => (
        <Box
          component="li"
          key={revision.revisionId}
          data-testid="draft-fan-out-change"
          sx={{
            boxSizing: 'border-box',
            width: 200,
            padding: '7px 10px',
            border: `1px solid ${changeOrderBorder.default}`,
            borderRadius: `${changeOrderCardTokens.radius}px`,
            background: changeOrderSurface.card,
            boxShadow: changeOrderCardTokens.shadow,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
            <Box component="span" translate="no" sx={{ fontFamily: changeOrderFontMono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {source.unit.slug}
            </Box>
            <Box component="span" sx={{ fontFamily: changeOrderFontMono, whiteSpace: 'nowrap' }}>
              {copy.revision(revision.revisionNum)}
            </Box>
          </Box>
          <Box
            title={revision.description}
            sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.default, marginTop: '2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {revision.description === '' ? draftCopy.page.facts.none : revision.description}
          </Box>
          {revision.createdAt === undefined ? null : (
            <Box sx={{ fontSize: changeOrderType.size.micro, color: changeOrderInk.subtle, marginTop: '2px' }}>{dayMonth(revision.createdAt)}</Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

interface EndPickProps {
  fanOut: DraftFanOut;
  onChange: (patch: DraftAddressPatch) => void;
}

/** Where the change ends: the sources' head, or a closed ChangeSet in a source's Space. */
function EndPick({ fanOut, onChange }: EndPickProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const end = fanOut.end;
  const shown = end.kind === 'head' ? copy.latest : end.changeSet.slug;
  const pick = (until: string | null) => {
    setAnchor(null);
    onChange({ until });
  };
  return (
    <>
      <Box
        component="button"
        type="button"
        id={FAN_OUT_IDS.end}
        data-testid="draft-fan-out-end"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-label={`${copy.endAt}: ${shown}`}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ ...PICK_SX, gap: '4px' }}
      >
        <FlagOutlinedIcon aria-hidden sx={{ '&&': { fontSize: 14 } }} />
        <span translate="no">{shown}</span>
        <ExpandMoreIcon aria-hidden />
      </Box>
      {end.kind === 'changeSet' ? <RevertButton label={draftCopy.page.facts.backTo(copy.latest)} onClick={() => onChange({ until: null })} /> : null}
      <DraftPopover anchorEl={anchor} onClose={() => setAnchor(null)} label={copy.endAt} wide>
        <PopoverHeading icon={<FlagOutlinedIcon aria-hidden />}>{copy.endAt}</PopoverHeading>
        <Box role="menu" aria-label={copy.endAt}>
          <Box component="button" type="button" role="menuitemradio" data-draft-option data-end="latest" aria-checked={end.kind === 'head'} onClick={() => pick(null)} sx={OPTION_SX}>
            <FlagOutlinedIcon aria-hidden />
            <OptionText title={copy.endLatest} />
          </Box>
          {fanOut.changeSets.length === 0 ? null : (
            <>
              <PopoverDivider />
              <PopoverHeading icon={<InventoryOutlinedIcon aria-hidden />}>{copy.changeSets}</PopoverHeading>
              {fanOut.changeSets.map((changeSet) => (
                <Box
                  key={`${changeSet.spaceId}/${changeSet.slug}`}
                  component="button"
                  type="button"
                  role="menuitemradio"
                  data-draft-option
                  data-end={changeSet.slug}
                  aria-checked={end.kind === 'changeSet' && end.changeSet.slug === changeSet.slug}
                  onClick={() => pick(changeSet.slug)}
                  sx={OPTION_SX}
                >
                  <InventoryOutlinedIcon aria-hidden />
                  <OptionText mono title={<span translate="no">{changeSet.slug}</span>} sub={changeSet.description || undefined} />
                  <OptionAside>
                    <span translate="no">{changeSet.spaceSlug}</span>
                  </OptionAside>
                </Box>
              ))}
            </>
          )}
        </Box>
      </DraftPopover>
    </>
  );
}

export interface FanOutRowsProps {
  fanOut: DraftFanOut | undefined;
  status: DraftReadStatus;
  onRetry: () => void;
  /** The create dry run's passed-over Units, by source Unit id; `answered` once it has said. */
  skippedUnits: readonly DraftSkippedUnit[];
  onChange: (patch: DraftAddressPatch) => void;
}

/** Why the server passes a source over, in the rows' words. */
const SKIP_WORDS: Readonly<Record<string, string>> = { AlreadyTaken: copy.skip.alreadyTaken, NotMarked: copy.skip.notMarked };

/**
 * The rows of a Transform paths draft. While the Links and the sources are read, the rows' shape;
 * if they cannot be, "Could not establish" with its retry.
 */
export function FanOutRows({ fanOut, status, onRetry, skippedUnits, onChange }: FanOutRowsProps) {
  if (status === 'failed') return <CouldNotEstablish onRetry={onRetry} retryWhat={draftCopy.page.retryWhat.links} />;
  if (fanOut === undefined || status === 'loading') {
    return (
      <Box role="status" aria-busy="true" aria-label={copy.loading} sx={{ display: 'flex', gap: '6px', marginTop: '10px', paddingLeft: `${LABEL_COLUMN + 14}px` }} data-testid="draft-fan-out-loading">
        <Skeleton variant="rounded" width={180} height={28} />
        <Skeleton variant="rounded" width={120} height={28} />
      </Box>
    );
  }
  const skippedBy = new Map(skippedUnits.map((skipped) => [skipped.unitId, SKIP_WORDS[skipped.reason] ?? skipped.reason]));
  return (
    <>
      <TypeBar fanOut={fanOut} linksStatus={status} onRetry={onRetry} onChange={onChange} />
      {fanOut.followed.length === 0 ? null : (
        <Box data-testid="draft-fan-out-rows" sx={ROWS_GRID_SX}>
          <Row label={copy.source} testId="draft-fan-out-sources">
            <Box id={FAN_OUT_IDS.sources} sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', minWidth: 0 }}>
              {fanOut.sources.map((source) => (
                <SourceChip key={source.unit.unitId} source={source} skipped={skippedBy.get(source.unit.unitId)} />
              ))}
            </Box>
          </Row>
          <Row label={copy.changes} testId="draft-fan-out-changes">
            <RevisionCards fanOut={fanOut} />
          </Row>
          <Row label={copy.endAt} testId="draft-fan-out-end-row">
            <EndPick fanOut={fanOut} onChange={onChange} />
          </Row>
        </Box>
      )}
    </>
  );
}
