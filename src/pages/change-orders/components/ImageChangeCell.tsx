// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The "Image change" cell of one ChangeOrders console row.
 *
 * One image: one line, one size up. Two or three: one compact line each, with
 * the image tags in one column so the eye reads down. Four or more: the first
 * three and "+N more images". Other field changes: one dashed line at the foot
 * of the card. No image change: a quiet dashed placeholder with the field
 * summary, so the column does not jump.
 *
 * The diff is fetched only once the row has come near the screen, and never
 * polled. A ChangeOrder whose own Space does not hold its change (Invoke,
 * fan-out) is not read at all: its base Space diff is empty by construction,
 * and reading that as "No image change" would be false.
 *
 * Nothing in the cell is interactive: the row's link opens the ChangeOrder.
 */

import { memo, useMemo } from 'react';

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';

import { useInViewport } from '@/hooks/useInViewport';
import { componentTheme } from '../../x/apps/componentTheme';
import { CurrentPill, PillTooltipContent } from '../../x/apps/ValuePill';
import { tooltipSx } from '../../x/apps/valuePillTooltip';
import { NO_VALUE_LABEL } from '../../x/apps/componentValues';
import { getInlineDiff } from '../../x/apps/inlineDiff';
import { changeOrderOwnSpaceReached } from '../../x/apps/change-order/changeOrderStages';
import { ABOVE_ROW_LINK_SX } from '../consoleStyle';
import { changeOrderBorder, changeOrderInk, changeOrderSurface } from '../changeOrdersTokens';
import { shortDigest, versionPathOf, type ImageChanges, type FieldChangeDetail, type ImageChange } from '../imageChange';
import { useChangeOrderImageChanges } from '../useChangeOrderImageChanges';
import { useFanOutImageChanges } from '../useFanOutImageChanges';
import { ImageMark, ImageTag, RolePill, TagArrow } from './ImageChangeAtoms';

/** Start the fetch a little before the row scrolls in, so it has usually landed when it does. */
const NEAR_SCREEN = '200px 0px';
/** Image lines drawn before the rest collapse to "+N more images". */
const MAX_IMAGE_LINES = 3;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const QUIET_TEXT = {
  fontSize: 11.5,
  color: changeOrderInk.subtle,
  whiteSpace: 'nowrap',
} as const;

/**
 * One changed field, in the Components view's own diff language: the old value
 * struck, the new one with its changed tokens boxed in purple (`CurrentPill`,
 * reused as it is), and the full change in a hover.
 *
 * `CurrentPill` keeps its diff hidden until its review row reveals it; this
 * wrapper does the same reveal, so the pill itself is unchanged. The chip is
 * not focusable and handles no click. It sits above the row's stretched link,
 * so that its hover still shows.
 */
function FieldChip({ detail }: { detail: FieldChangeDetail }) {
  const segments = useMemo(() => getInlineDiff(detail.from, detail.to), [detail.from, detail.to]);
  return (
    <Tooltip
      placement="bottom"
      enterDelay={150}
      disableInteractive
      slotProps={{ tooltip: { sx: tooltipSx } }}
      title={<PillTooltipContent fullValue={`${detail.path}: ${detail.from || NO_VALUE_LABEL} → ${detail.to}`} />}
    >
      <Box
        component="span"
        data-testid="image-change-field-chip"
        sx={{
          flex: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          // Whole, or wrapped to the next line: only a path longer than the line itself may give way.
          maxWidth: '100%',
          fontFamily: componentTheme.fontMono,
          fontSize: 11,
          lineHeight: 1.6,
          background: changeOrderSurface.card,
          border: `1px solid ${changeOrderBorder.default}`,
          borderRadius: '4px',
          padding: '0 6px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          color: changeOrderInk.muted,
          cursor: 'default',
          position: 'relative',
          zIndex: 1,
          // The reveal the review row does: hide the plain value, show old → new.
          '& .current-text': { display: 'none' },
          '& .current-preview, & .current-old-preview': { display: 'inline' },
          // Sit in the chip's line rather than the review row's 20px one.
          '& .current-pill': { minHeight: 0, padding: 0, border: 0, fontSize: 11, flexWrap: 'nowrap', gap: '3px' },
        }}
      >
        <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {detail.label}
        </Box>
        <Box component="span" sx={{ flex: 'none' }}>
          <CurrentPill
          value={detail.to}
          filterText=""
          changeType="upgrade"
          previewSegments={segments}
          oldValueForPreview={detail.from === '' ? undefined : detail.from}
          />
        </Box>
      </Box>
    </Tooltip>
  );
}

/** Up to `max` chips, then "+N more" for the rest of the true count. */
function FieldChips({ fields, max }: { fields: ImageChanges['fieldChanges']; max: number }) {
  const shown = fields.details.slice(0, max);
  const rest = fields.count - shown.length;
  return (
    <>
      {shown.map((detail, index) => (
        // The same path can change in two Units or resources, so the path alone is not a key.
        <FieldChip key={`${index}:${detail.path}`} detail={detail} />
      ))}
      {rest > 0 ? (
        <Box component="span" sx={QUIET_TEXT}>
          +{rest} more
        </Box>
      ) : null}
    </>
  );
}

/**
 * The image tags of one line. A digest-only move prints the image tag once and
 * moves the digests instead, because a struck `7.2.4 → 7.2.4` says nothing changed.
 */
function ImageTags({ image, solo }: { image: ImageChange; solo: boolean }) {
  const fromTag = image.from.tag ?? image.from.ref;
  const toTag = image.to.tag ?? image.to.ref;
  // A long pair steps down a size below 1400px, so the pill keeps its place.
  const long = fromTag.length + toTag.length > 20;
  const fromSize = solo ? 13.5 : 12.5;
  const toSize = solo ? 16 : 14;
  // Below 1400px a long old image tag steps down to 12px (79px for a sha), so a narrower box holds it.
  const narrow = {
    gridTemplateColumns: `minmax(${FROM_TRACK_NARROW}px, max-content) max-content max-content`,
    ...(long && { '& [data-side="from"]': { fontSize: 12 }, '& [data-side="to"]': { fontSize: 13.5 } }),
  };
  // One set of tracks for every line: the old image tag in a right-aligned box of at least FROM_TRACK
  // (it grows to its text only when there is room, and is cut before the new one is), then the arrow,
  // then the new image tag, which never shrinks. So the new image tags start at one x down the list.
  const tracks = {
    // Its title holds the full image tags and digests, which the line may cut.
    ...ABOVE_ROW_LINK_SX,
    display: 'grid',
    // `max-content`, never `auto`: an auto track stretches into the free space and moves the new image tag.
    gridTemplateColumns: `minmax(${FROM_TRACK}px, max-content) max-content max-content`,
    justifyContent: 'start',
    '@media (max-width: 1400px)': narrow,
    columnGap: '8px',
    alignItems: 'baseline',
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  } as const;

  if (image.bump === 'digest' && image.from.digest && image.to.digest) {
    // The image tag is the same on both sides and sits beside the name, so the digests take the two tag slots.
    const digestSx = {
      fontFamily: componentTheme.fontMono,
      fontSize: 12.5,
      whiteSpace: 'nowrap',
      '@media (max-width: 1400px)': { fontSize: 11.5 },
    } as const;
    return (
      <Box title={`${image.repository}:${toTag}  ${image.from.digest} → ${image.to.digest}`} data-testid="image-change-tags" sx={tracks}>
        <Box
          component="span"
          data-testid="image-change-tag"
          sx={{ ...digestSx, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right', color: changeOrderInk.subtle }}
        >
          {shortDigest(image.from.digest)}
        </Box>
        <TagArrow />
        <Box
          component="span"
          data-testid="image-change-tag"
          sx={{
            ...digestSx,
            fontWeight: 650,
            color: changeOrderInk.default,
            background: changeOrderSurface.inset,
            borderRadius: '3px',
            padding: '0 2px',
          }}
        >
          {shortDigest(image.to.digest)}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      title={`${image.kind === 'version' ? versionPathOf(image) : image.repository}: ${fromTag} → ${toTag}`}
      data-testid="image-change-tags"
      sx={tracks}
    >
      <Box
        component="span"
        data-side="from"
        data-testid="image-change-tag"
        sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right', fontSize: fromSize, '& > span': { fontSize: 'inherit' } }}
      >
        <ImageTag tag={fromTag} side="from" bump={image.bump} size={fromSize} />
      </Box>
      <TagArrow />
      <Box component="span" data-side="to" data-testid="image-change-tag" sx={{ fontSize: toSize, '& > span': { fontSize: 'inherit' } }}>
        <ImageTag tag={toTag} side="to" previous={fromTag} bump={image.bump} size={toSize} />
      </Box>
    </Box>
  );
}

/** The muted line under a version change's field path: how many Units carry it. */
const versionSubline = (image: ImageChange): string => `in ${plural(image.unitCount, 'Unit', 'Units')}`;

/** The hover title of an image's identity: its full path, or a version change's field. */
const identityTitle = (image: ImageChange): string =>
  image.kind === 'version' ? `${versionPathOf(image)} · ${versionSubline(image)}` : `${image.registryPath ? `${image.registryPath}/` : ''}${image.repository}`;

/** The least width of the old image tag's box. 11 characters of mono at 13.5px, so a sha tag fits without moving the new one. */
const FROM_TRACK = 90;
const FROM_TRACK_NARROW = 84;

/** The name track is one fixed width for single and multi rows, so the image tags start at one x down the list. */
const NAME_TRACK = 184;

function ImageLine({ image, solo }: { image: ImageChange; solo: boolean }) {
  return (
    <Box
      data-testid="image-change-line"
      sx={{
        display: 'grid',
        gridTemplateColumns: `${NAME_TRACK}px minmax(0, 1fr)`,
        gap: '10px',
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <ImageMark image={image} size={solo ? 'md' : 'sm'} />
        <Box sx={{ ...ABOVE_ROW_LINK_SX, minWidth: 0 }} title={identityTitle(image)}>
          {/* The role pill sits outside the part of the name that may be cut, so it is never cut itself. */}
          <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
            <Box
              component="span"
              sx={{
                minWidth: 0,
                fontSize: solo ? 13.5 : 13,
                fontWeight: 600,
                lineHeight: 1.25,
                color: changeOrderInk.default,
                // A version change is a path, which is data, so it is set in mono.
                ...(image.kind === 'version' && { fontFamily: componentTheme.fontMono, fontSize: solo ? 13 : 12.5, letterSpacing: '-0.01em' }),
                // One image: a long name wraps rather than truncating. Several: one line each.
                ...(solo
                  ? { whiteSpace: 'normal', overflowWrap: 'anywhere' }
                  : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
              }}
            >
              {image.kind === 'version' ? versionPathOf(image) : image.repository}
            </Box>
            <Box component="span" sx={{ flex: 'none' }}>
              <RolePill role={image.role} />
            </Box>
            {image.bump === 'digest' ? (
              // The same image tag on both sides: said once, here, so the digests can take the tag slots.
              <Box component="span" sx={{ flex: 'none', marginLeft: '6px', fontFamily: componentTheme.fontMono, fontSize: 11.5, color: changeOrderInk.subtle }}>
                {image.to.tag}
              </Box>
            ) : null}
          </Box>
          {solo && (image.kind === 'version' || image.registryPath !== '') ? (
            <Box
              component="span"
              sx={{
                display: 'block',
                fontSize: 11,
                lineHeight: 1.3,
                color: changeOrderInk.subtle,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {image.kind === 'version' ? versionSubline(image) : image.registryPath}
            </Box>
          ) : null}
        </Box>
      </Box>
      <ImageTags image={image} solo={solo} />
    </Box>
  );
}

function ImageCard({ changes }: { changes: ImageChanges }) {
  const solo = changes.images.length === 1;
  const shown = changes.images.slice(0, MAX_IMAGE_LINES);
  const hiddenImages = changes.images.length - shown.length;
  const fields = changes.fieldChanges;
  return (
    <Box
      data-testid="image-change-card"
      sx={{
        background: changeOrderSurface.sunk,
        border: `1px solid ${changeOrderBorder.default}`,
        borderRadius: '8px',
        // The same side padding for one line and several, so their image tags start at one x.
        padding: solo ? '10px 12px' : '8px 12px',
        display: 'grid',
        gap: '6px',
        minWidth: 0,
      }}
    >
      {shown.map((image) => (
        <ImageLine key={image.key} image={image} solo={solo} />
      ))}
      {hiddenImages > 0 ? (
        // On the names' left edge (monogram 26px + gap 8px), not the monogram's.
        <Box component="span" sx={{ ...QUIET_TEXT, fontSize: 12, paddingLeft: '34px' }}>
          +{plural(hiddenImages, 'more image', 'more images')}
        </Box>
      ) : null}
      {fields.count > 0 ? (
        <Box
          data-testid="image-change-fields"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px 6px',
            flexWrap: 'wrap',
            paddingTop: '6px',
            borderTop: `1px dashed ${changeOrderBorder.default}`,
            fontSize: 11.5,
            color: changeOrderInk.muted,
          }}
        >
          <Box component="b" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            + {plural(fields.count, 'field change', 'field changes')}
          </Box>
          <FieldChips fields={fields} max={2} />
        </Box>
      ) : null}
    </Box>
  );
}

function NoImageChange({ changes }: { changes: ImageChanges }) {
  const fields = changes.fieldChanges;
  return (
    <Box
      data-testid="image-change-none"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
        borderRadius: '8px',
        border: `1px dashed ${changeOrderBorder.strong}`,
        color: changeOrderInk.muted,
        fontSize: 12,
        minWidth: 0,
      }}
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          flex: 'none',
          width: 26,
          height: 26,
          borderRadius: '6px',
          background: changeOrderSurface.inset,
          display: 'grid',
          placeItems: 'center',
          color: changeOrderInk.subtle,
          fontSize: 13,
        }}
      >
        ≡
      </Box>
      <Box data-testid="image-change-fields" sx={{ minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: '2px 6px', alignItems: 'center' }}>
        <Box component="b" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          No image change
        </Box>
        {fields.count > 0 ? (
          <>
            <Box component="span" aria-hidden="true">
              ·
            </Box>
            <Box component="b" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
              {plural(fields.count, 'field change', 'field changes')}
            </Box>
            <FieldChips fields={fields} max={1} />
          </>
        ) : null}
      </Box>
    </Box>
  );
}

/**
 * A list row's image change, by the read's status: a placeholder while it loads,
 * a quiet line when it could not be read (never "No image change"), the field
 * summary when no image moved, and the image card otherwise.
 */
export function ImageChangesView({ changes }: { changes: ImageChanges }) {
  if (changes.status === 'loading') {
    return (
      <Skeleton
        data-testid="image-change-loading"
        variant="rounded"
        height={44}
        sx={{ borderRadius: '8px', bgcolor: changeOrderSurface.sunk }}
      />
    );
  }
  if (changes.status === 'unavailable') {
    return (
      <Box component="span" data-testid="image-change-unavailable" sx={{ ...QUIET_TEXT, fontSize: 12 }}>
        Image change unavailable
      </Box>
    );
  }
  if (changes.status === 'none') return <NoImageChange changes={changes} />;
  return <ImageCard changes={changes} />;
}

export interface ImageChangeCellProps {
  changeOrderId: string;
  /** The ChangeOrder's own Space. */
  baseSpaceId: string | undefined;
  updateType: string;
  /** A fan-out ChangeOrder's source Units are the ones these two Tags mark outside its scope. */
  startTagId?: string;
  endTagId?: string;
  inScopeSpaceIds?: readonly string[];
}

export const ImageChangeCell = memo(function ImageChangeCell({
  changeOrderId,
  baseSpaceId,
  updateType,
  startTagId,
  endTagId,
  inScopeSpaceIds,
}: ImageChangeCellProps) {
  const [ref, nearScreen] = useInViewport<HTMLDivElement>(NEAR_SCREEN);
  // Three kinds: the ChangeOrder's own Space holds the change (read there); a fan-out one made it in source
  // Units outside its scope (read from those); and Invoke, which has changed nothing anywhere yet (not read).
  const ownSpace = changeOrderOwnSpaceReached(updateType);
  const fansOut = !ownSpace && updateType !== 'Invoke';
  const readable = ownSpace || fansOut;
  const own = useChangeOrderImageChanges({ changeOrderId, baseSpaceId, skip: !nearScreen || !ownSpace });
  const fan = useFanOutImageChanges({ changeOrderId, startTagId, endTagId, inScopeSpaceIds, updateType, skip: !nearScreen || !fansOut });
  const changes = fansOut ? fan : own;

  const body: React.ReactNode = readable ? (
    <ImageChangesView changes={changes} />
  ) : (
    // An Invoke ChangeOrder has changed nothing anywhere until its Invocation runs.
    <Box
      component="span"
      sx={{ ...QUIET_TEXT, ...ABOVE_ROW_LINK_SX, fontSize: 12.5 }}
    >
      Runs when promoted
    </Box>
  );

  return (
    <Box ref={ref} data-testid="change-order-image-change" data-status={readable ? changes.status : 'not-read'} sx={{ minWidth: 0 }}>
      {body}
    </Box>
  );
});
