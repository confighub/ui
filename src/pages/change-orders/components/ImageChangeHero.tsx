// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The image change at the top of a ChangeOrder's detail page, and the "Full
 * diff" disclosure that holds the source diff beneath it.
 *
 * Most ChangeOrders only move a container image to a new image tag. The hero
 * says that change in full (which image, from which image tag to which, how
 * big a bump, in how many Units), so the source diff below can stay shut when
 * it would only repeat it.
 */

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { kindsOf } from '../imageChangeCopy';
import { shortDigest, versionPathOf, type ChangeOrderImageChanges, type ImageChange } from '../imageChange';
import { BumpPill, ImageMark, ImageTag, RolePill, TagArrow } from './ImageChangeAtoms';
import { BUMP_TONE } from '../imageChangeTone';
import {
  changeOrderBorder,
  changeOrderCardTokens,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';

const FULL_DIFF_BODY_ID = 'change-order-full-diff';

/**
 * `Deployment/payments-api`, `payments-api` when only the name is known, or null
 * when neither is. The placeholder for a Unit with no resource is dropped upstream.
 */
function workloadLabel(image: ImageChange): string | null {
  const parts = [image.workload?.kind, image.workload?.name].filter((part): part is string => !!part);
  return parts.length === 0 ? null : parts.join('/');
}

function Code({ children }: { children: ReactNode }) {
  return (
    <Box
      component="code"
      sx={{
        fontFamily: changeOrderFontMono,
        fontSize: changeOrderType.size.small,
        background: changeOrderSurface.inset,
        borderRadius: `${changeOrderShape.radius.sm}px`,
        padding: '0 4px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

/**
 * What a side shows as its image tag. A ref with no image tag but a pinned
 * digest shows the digest; one with neither shows the ref as written, never an
 * assumed `latest`.
 */
function tagTextOf(side: ImageChange['from']): string {
  if (side.tag !== undefined) return side.tag;
  if (side.digest !== undefined) return shortDigest(side.digest);
  return side.ref;
}


/** One side of the From / To panel: a label, the image tag, and the digest only when the ref pins one. */
function TagPane({ image, side }: { image: ImageChange; side: 'from' | 'to' }) {
  const digest = image[side].digest;
  const isTo = side === 'to';
  const tag = tagTextOf(image[side]);
  // Same image tag, new pinned digest: the image tag is not part of the change, the digest is.
  const digestOnly = image.bump === 'digest';
  const tone = BUMP_TONE[image.bump];
  return (
    <Box
      sx={{
        padding: '9px 14px',
        minWidth: 0,
        background: isTo ? changeOrderSurface.card : 'transparent',
        boxShadow: isTo ? `inset ${changeOrderShape.accentEdge}px 0 0 ${BUMP_TONE[image.bump].ink}` : 'none',
      }}
    >
      <Box sx={{ fontSize: changeOrderType.size.small, lineHeight: changeOrderType.lineHeight.body, color: changeOrderInk.subtle, marginBottom: '2px' }}>
        {image.kind === 'version' ? (isTo ? 'To version' : 'From version') : isTo ? 'To image tag' : 'From image tag'}
      </Box>
      <Box sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {digestOnly ? (
          <Box
            component="span"
            sx={{
              fontFamily: changeOrderFontMono,
              fontSize: isTo ? 17 : 15,
              fontWeight: isTo ? changeOrderType.weight.strong : changeOrderType.weight.regular,
              color: isTo ? changeOrderInk.default : changeOrderInk.subtle,
            }}
          >
            {tag}
          </Box>
        ) : isTo ? (
          <ImageTag tag={tag} side="to" previous={tagTextOf(image.from)} bump={image.bump} size={17} />
        ) : (
          <ImageTag tag={tag} side="from" bump={image.bump} size={15} />
        )}
      </Box>
      {digest !== undefined ? (
        <Box
          title={digest}
          sx={{
            fontFamily: changeOrderFontMono,
            fontSize: digestOnly ? 12 : 11,
            color: digestOnly && isTo ? changeOrderInk.default : changeOrderInk.subtle,
            marginTop: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {digestOnly && isTo ? (
            <Box component="span" sx={{ color: tone.ink, background: tone.soft, borderRadius: '3px', padding: '0 2px', fontWeight: changeOrderType.weight.semibold }}>
              {shortDigest(digest)}
            </Box>
          ) : (
            shortDigest(digest)
          )}
        </Box>
      ) : null}
    </Box>
  );
}

function HeroRow({ image, stageNames, first }: { image: ImageChange; stageNames: readonly string[]; first: boolean }) {
  const workload = workloadLabel(image);
  const isVersion = image.kind === 'version';
  const unitsAtSource = `In ${image.unitCount} ${image.unitCount === 1 ? 'Unit' : 'Units'} at the source`;
  return (
    <Box
      data-testid="change-order-image-hero-row"
      data-change-kind={image.kind}
      data-image-key={image.key}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 1fr) minmax(320px, 1.5fr) minmax(170px, .8fr)',
        gap: '24px',
        alignItems: 'center',
        padding: '16px 18px',
        borderTop: first ? 'none' : `1px solid ${changeOrderBorder.default}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
        <ImageMark image={image} size="lg" />
        <Box sx={{ minWidth: 0 }}>
          {isVersion ? (
            <>
              {/* A version change names no image: its identity is the field path it sits at. */}
              <Box
                title={versionPathOf(image)}
                sx={{
                  fontFamily: changeOrderFontMono,
                  fontSize: changeOrderType.size.lead,
                  lineHeight: changeOrderType.lineHeight.tight,
                  fontWeight: changeOrderType.weight.semibold,
                  color: changeOrderInk.default,
                  overflowWrap: 'anywhere',
                }}
              >
                {versionPathOf(image)}
              </Box>
              <Box sx={{ fontSize: changeOrderType.size.body, lineHeight: changeOrderType.lineHeight.body, color: changeOrderInk.muted, marginTop: '6px' }}>
                {unitsAtSource}
                {workload !== null ? (
                  <>
                    {' '}· in <Code>{workload}</Code>
                  </>
                ) : null}
              </Box>
            </>
          ) : (
            <>
              <Box
                sx={{
                  fontSize: changeOrderType.size.lead,
                  lineHeight: changeOrderType.lineHeight.tight,
                  fontWeight: changeOrderType.weight.semibold,
                  color: changeOrderInk.default,
                  overflowWrap: 'anywhere',
                }}
              >
                {image.repository}
                <RolePill role={image.role} />
              </Box>
              <Box
                title={`${image.registryPath}/${image.repository}`}
                sx={{
                  fontFamily: changeOrderFontMono,
                  fontSize: changeOrderType.size.small,
                  color: changeOrderInk.subtle,
                  marginTop: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {image.registryPath ? `${image.registryPath}/${image.repository}` : image.repository}
              </Box>
              <Box sx={{ fontSize: changeOrderType.size.body, lineHeight: changeOrderType.lineHeight.body, color: changeOrderInk.muted, marginTop: '6px' }}>
                {image.container ? (
                  <>
                    Container <Code>{image.containerName}</Code>
                  </>
                ) : (
                  <>
                    Chart values <Code>{`${image.containerName}.repository`}</Code> + <Code>{`${image.containerName}.tag`}</Code>
                  </>
                )}
                {workload !== null ? (
                  <>
                    {' '}in <Code>{workload}</Code>
                  </>
                ) : null}
              </Box>
            </>
          )}
        </Box>
      </Box>

      <Box
        data-bump={image.bump}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
          alignItems: 'stretch',
          background: changeOrderSurface.sunk,
          border: `1px solid ${changeOrderBorder.default}`,
          borderRadius: `${changeOrderShape.radius.lg}px`,
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <TagPane image={image} side="from" />
        <Box sx={{ display: 'grid', placeItems: 'center', padding: '0 2px' }}>
          <TagArrow size={16} />
        </Box>
        <TagPane image={image} side="to" />
      </Box>

      <Box sx={{ display: 'grid', gap: '6px', justifyItems: 'start' }}>
        <BumpPill bump={image.bump} suffix="bump" size="md" />
        {/*
          The count is of Units in the ChangeOrder's own Space, where the change
          was made. It is not a count of Units in the stages, so the stages are a
          separate line that says only the order the change promotes through.
        */}
        {isVersion ? null : (
          <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
            In{' '}
            <Box component="b" sx={{ color: changeOrderInk.default, fontWeight: changeOrderType.weight.semibold }}>
              {image.unitCount} {image.unitCount === 1 ? 'Unit' : 'Units'}
            </Box>{' '}
            at the source
          </Box>
        )}
        {stageNames.length > 0 ? (
          <Box sx={{ fontSize: changeOrderType.size.small, lineHeight: changeOrderType.lineHeight.body, color: changeOrderInk.subtle }}>
            Promotes through {stageNames.join(' → ')}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function Panel({ children, testId, dashed = false }: { children: ReactNode; testId: string; dashed?: boolean }) {
  return (
    <Box
      data-testid={testId}
      sx={
        dashed
          ? {
              border: `1px dashed ${changeOrderBorder.strong}`,
              borderRadius: `${changeOrderCardTokens.radius}px`,
              marginTop: '14px',
            }
          : {
              // Inside the summary card: one frame, so a top line and the header band, not a second border.
              borderTop: `1px solid ${changeOrderBorder.default}`,
              marginTop: '14px',
            }
      }
    >
      {children}
    </Box>
  );
}

/** The hero: one row per image change, with a header that says what else the diff below holds. */
function ImageChangeHero({
  images,
  fieldChangeCount,
  stageNames,
}: {
  images: readonly ImageChange[];
  fieldChangeCount: number;
  stageNames: readonly string[];
}) {
  const n = images.length;
  const kinds = kindsOf(images);
  const title =
    kinds === 'both' ? 'Image and version changes' : kinds === 'versions' ? (n === 1 ? 'Version change' : 'Version changes') : n === 1 ? 'Image change' : 'Image changes';
  const count = kinds === 'both' ? `${n} changes` : kinds === 'versions' ? `${n} version changes` : `${n} image changes`;
  return (
    <Panel testId="change-order-image-hero">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '10px 16px',
          background: changeOrderSurface.sunk,
          borderBottom: `1px solid ${changeOrderBorder.default}`,
        }}
      >
        <Box component="h3" sx={{ margin: 0, fontSize: changeOrderType.size.lead, lineHeight: changeOrderType.lineHeight.heading, fontWeight: changeOrderType.weight.strong }}>
          {title}
          {n > 1 ? (
            <Box component="span" sx={{ color: changeOrderInk.subtle, fontWeight: changeOrderType.weight.regular, marginLeft: '4px' }}>
              {count}
            </Box>
          ) : null}
        </Box>
        <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>
          {fieldChangeCount > 0
            ? `and ${fieldChangeCount} other field ${fieldChangeCount === 1 ? 'change' : 'changes'} in the diff below`
            : 'No other field changes'}
        </Box>
      </Box>
      {images.map((image, i) => (
        <HeroRow key={image.key} image={image} stageNames={stageNames} first={i === 0} />
      ))}
    </Panel>
  );
}

function QuietNote({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <Panel testId={testId} dashed>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 26,
            height: 26,
            borderRadius: `${changeOrderShape.radius.md}px`,
            background: changeOrderSurface.inset,
            display: 'grid',
            placeItems: 'center',
            color: changeOrderInk.subtle,
            flex: 'none',
          }}
        >
          ≡
        </Box>
        <span>{children}</span>
      </Box>
    </Panel>
  );
}

/**
 * What the top of the page says about images, by the hook's status.
 *
 * ⚠️ `unavailable` NEVER READS AS "No image change". A diff that could not be
 * read says nothing about the change, so it gets its own sentence; and while
 * loading, nothing at all rather than a placeholder that might be wrong.
 */
export function ImageChangeSummary({
  changes,
  stageNames,
}: {
  changes: ChangeOrderImageChanges;
  stageNames: readonly string[];
}) {
  switch (changes.status) {
    case 'some':
      return <ImageChangeHero images={changes.images} fieldChangeCount={changes.fieldChanges.count} stageNames={stageNames} />;
    case 'none':
      return (
        <QuietNote testId="change-order-no-image-change">
          <Box component="b" sx={{ color: changeOrderInk.default, fontWeight: changeOrderType.weight.semibold }}>
            No image change.
          </Box>
          {changes.fieldChanges.count > 0 ? ' This ChangeOrder changes configuration fields only.' : null}
        </QuietNote>
      );
    case 'unavailable':
      return (
        <QuietNote testId="change-order-image-changes-unavailable">
          The image changes could not be read. The full diff below shows everything this ChangeOrder changes.
        </QuietNote>
      );
    default:
      return null;
  }
}

/**
 * "Full diff · N changes in M Units", around the existing "At the source"
 * sections. The body is a render function so a shut disclosure mounts no tree.
 */
export function FullDiffDisclosure({
  changeCount,
  unitCount,
  imagesOnly,
  hintText = 'Only images change, as shown above.',
  expanded,
  onToggle,
  renderBody,
}: {
  changeCount: number;
  unitCount: number;
  /** The change is images and nothing else, so the hero above already says all of it. */
  imagesOnly: boolean;
  /** What a shut disclosure says the card above already covers. */
  hintText?: string;
  expanded: boolean;
  onToggle: () => void;
  renderBody: () => ReactNode;
}) {
  const count = `${changeCount} ${changeCount === 1 ? 'change' : 'changes'} in ${unitCount} ${unitCount === 1 ? 'Unit' : 'Units'}`;
  return (
    <Box
      data-testid="change-order-full-diff"
      data-expanded={expanded}
      sx={{
        background: changeOrderSurface.card,
        border: `1px solid ${changeOrderBorder.default}`,
        borderRadius: `${changeOrderCardTokens.radius}px`,
        boxShadow: changeOrderCardTokens.shadow,
        overflow: 'hidden',
        marginTop: '14px',
      }}
    >
      <Box
        component="button"
        type="button"
        aria-expanded={expanded}
        aria-controls={FULL_DIFF_BODY_ID}
        onClick={onToggle}
        sx={{
          all: 'unset',
          boxSizing: 'border-box',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '10px 16px',
          background: changeOrderSurface.sunk,
          borderBottom: expanded ? `1px solid ${changeOrderBorder.default}` : 'none',
          '&:hover': { background: changeOrderSurface.inset },
          '&:focus-visible': { outline: `2px solid ${changeOrderBorder.strong}`, outlineOffset: '-2px' },
        }}
      >
        <ExpandMoreIcon
          aria-hidden="true"
          sx={{
            fontSize: 18,
            color: changeOrderInk.subtle,
            transform: expanded ? 'none' : 'rotate(-90deg)',
            transition: 'transform .15s ease',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
        <Box component="span" sx={{ fontSize: changeOrderType.size.lead, fontWeight: changeOrderType.weight.strong, color: changeOrderInk.default }}>
          Full diff
        </Box>
        <Box component="span" sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>
          {count}
        </Box>
        <Box component="span" sx={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center', fontSize: changeOrderType.size.body }}>
          {!expanded && imagesOnly ? (
            <Box component="span" sx={{ color: changeOrderInk.subtle }}>
              {hintText}
            </Box>
          ) : null}
          <Box component="span" sx={{ color: changeOrderStatus.accent, fontWeight: changeOrderType.weight.semibold }}>
            {expanded ? 'Hide diff' : 'Show diff'}
          </Box>
        </Box>
      </Box>
      {expanded ? (
        <Box id={FULL_DIFF_BODY_ID} sx={{ padding: '0 16px 12px' }}>
          {renderBody()}
        </Box>
      ) : null}
    </Box>
  );
}
