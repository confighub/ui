// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { memo, useCallback, useRef } from 'react';

import Box from '@mui/material/Box';
import Slide from '@mui/material/Slide';

import { changeOrderBorder, changeOrderFontMono, changeOrderInk, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { draftCopy } from './draftCopy';
import { CouldNotEstablish } from './CouldNotEstablish';
import { scrollingAncestor } from './draftFocus';
import { STICKY_BAR_SHADOW } from './draftLook';
import { blockerRepeatsPreview, outlierActions } from './draftPageModel';
import { Blocker, CreateButton } from './DraftSideColumn';
import type { DraftProblem } from './draftTypes';
import { OutcomeSquare } from './OutlierChips';
import type { DraftPreview } from './useDraftPreview';

/** The bar's least height. */
const BAR_HEIGHT = 52;
/** Outliers named in the bar before the rest become a count. */
const NAMED = 2;
export const DRAFT_STICKY_BLOCKER_ID = 'draft-blocker-sticky';

export interface DraftStickyBarProps {
  open: boolean;
  preview: DraftPreview;
  name: string;
  blocker: DraftProblem | undefined;
  canCreate: boolean;
  isCreating: boolean;
  onCreate: () => void;
  onFocusBlocker: () => void;
  onRetryValidation?: () => void;
}

/**
 * Create, kept in reach once the right column's Create has scrolled away: the name, "N of M
 * same", the outliers, and the button. One line; it never wraps over the page.
 *
 * It sticks to the bottom of the page's own column, so it spans the content and leaves the app's
 * side rail alone. It takes no height in the page: it sits in a zero-height sticky holder.
 */
export const DraftStickyBar = memo(function DraftStickyBar({
  open,
  preview,
  name,
  blocker,
  canCreate,
  isCreating,
  onCreate,
  onFocusBlocker,
  onRetryValidation,
}: DraftStickyBarProps) {
  const items = preview.status === 'resolved' ? outlierActions(preview) : [];
  // While the bar is up, the pane that scrolls keeps its height clear: a control scrolled into
  // view (Tab, a focus move) lands above the bar, not under it.
  const padded = useRef<HTMLElement | null>(null);
  const keepClear = useCallback((bar: HTMLElement | null) => {
    if (padded.current !== null) padded.current.style.scrollPaddingBottom = '';
    padded.current = null;
    if (bar === null) return;
    const pane = scrollingAncestor(bar);
    pane.style.scrollPaddingBottom = `${bar.offsetHeight}px`;
    padded.current = pane;
  }, []);
  const named = items.slice(0, NAMED);
  const more = items.length - named.length;
  return (
    <Box sx={(theme) => ({ position: 'sticky', bottom: 0, height: 0, zIndex: theme.zIndex.appBar - 1, margin: '0 -22px' })}>
      <Slide direction="up" in={open} mountOnEnter unmountOnExit>
        <Box
          ref={keepClear}
          role="region"
          aria-label={draftCopy.page.side.create}
          data-testid="draft-sticky-bar"
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            minHeight: BAR_HEIGHT,
            boxSizing: 'border-box',
            background: changeOrderSurface.card,
            borderTop: `1px solid ${changeOrderBorder.default}`,
            boxShadow: STICKY_BAR_SHADOW,
          }}
        >
          <Box sx={{ padding: '10px 22px', display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
            <Box component="span" translate="no" sx={{ fontFamily: changeOrderFontMono, fontWeight: changeOrderType.weight.strong, fontSize: 14, whiteSpace: 'nowrap' }}>
              {name || draftCopy.page.ledger.none}
            </Box>
            <Box sx={{ display: 'flex', gap: '12px', fontSize: 12, color: changeOrderInk.muted, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {preview.status === 'failed' ? <CouldNotEstablish /> : null}
              {preview.status === 'resolved' && preview.totals !== undefined ? (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', flex: 'none' }}>
                  <Box component="b" sx={{ color: changeOrderInk.default, marginRight: '3px' }}>
                    {preview.totals.same}
                  </Box>
                  {draftCopy.page.ledger.ofSame(preview.totals.variants)}
                </Box>
              ) : null}
              {named.map((item, index) => (
                <Box key={index} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flex: 'none' }}>
                  <OutcomeSquare kind={item.kind} />
                  <Box component="b" translate="no" sx={{ color: changeOrderInk.default, fontWeight: changeOrderType.weight.semibold }}>
                    {item.outlier.name}
                  </Box>
                  {item.outlier.text}
                </Box>
              ))}
              {more > 0 ? (
                <Box component="span" sx={{ flex: 'none', fontWeight: changeOrderType.weight.semibold }}>
                  {draftCopy.page.outlier.more(more)}
                </Box>
              ) : null}
            </Box>
            <Box sx={{ flex: 1 }} />
            {blocker === undefined ? null : (
              <Blocker
                blocker={blocker}
                id={DRAFT_STICKY_BLOCKER_ID}
                onFocus={onFocusBlocker}
                onRetry={onRetryValidation}
                alreadySaid={blockerRepeatsPreview(blocker, preview)}
              />
            )}
            <CreateButton canCreate={canCreate} isCreating={isCreating} onCreate={onCreate} describedBy={blocker === undefined ? undefined : DRAFT_STICKY_BLOCKER_ID} />
          </Box>
        </Box>
      </Slide>
    </Box>
  );
});
