// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Fragment, type ReactNode } from 'react';

import Box from '@mui/material/Box';

import { markdownBlocks } from './reviewMarkdownBlocks';
import { changeOrderBorder, changeOrderFontMono, changeOrderInk, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';

/**
 * The Markdown a review comment is written in, as GitHub's comments take it: paragraphs (a line
 * break is a break), headings, quotes, lists, fenced code, inline code, bold, italic, links and
 * bare URLs. Rendered as React elements, never as HTML, so a comment cannot put markup on the page.
 */

/** Only web links are links: a `javascript:` URL in a comment is text. */
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);

// `_` makes italics only at a word's edges: `max_conn_pool` and `LOG_LEVEL_DEBUG` are names, as on GitHub.
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|(?<![\w])_[^_\s][^_]*_(?![\w]))|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [whole, code, bold, italic, link, url] = match;
    const key = `${at}`;
    if (code !== undefined)
      out.push(
        <Box key={key} component="code" sx={{ fontFamily: changeOrderFontMono, fontSize: '0.92em', background: changeOrderSurface.inset, borderRadius: '4px', padding: '1px 4px' }}>
          {code.slice(1, -1)}
        </Box>,
      );
    else if (bold !== undefined) out.push(<strong key={key}>{inline(bold.slice(2, -2))}</strong>);
    else if (italic !== undefined) out.push(<em key={key}>{inline(italic.slice(1, -1))}</em>);
    else if (link !== undefined) {
      const parts = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(link) as RegExpExecArray;
      const href = safeHref(parts[2]);
      out.push(
        href === undefined ? (
          whole
        ) : (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {/* The text as written: a URL in it must not become a link inside the link. */}
            {parts[1]}
          </a>
        ),
      );
    } else if (url !== undefined)
      out.push(
        <a key={key} href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>,
      );
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function linesWithBreaks(lines: readonly string[]): ReactNode[] {
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index === 0 ? null : <br />}
      {inline(line)}
    </Fragment>
  ));
}

export interface ReviewMarkdownProps {
  text: string;
}

export function ReviewMarkdown({ text }: ReviewMarkdownProps) {
  return (
    <Box
      sx={{
        fontSize: changeOrderType.size.prose,
        lineHeight: 1.55,
        color: changeOrderInk.default,
        overflowWrap: 'anywhere',
        '& > * + *': { marginTop: '8px' },
        '& p, & ul, & ol, & blockquote, & pre, & h3, & h4, & h5': { margin: 0 },
        '& ul, & ol': { paddingLeft: '22px' },
        '& a': { color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px' },
      }}
    >
      {markdownBlocks(text).map((block, index) => {
        switch (block.kind) {
          case 'code':
            return (
              <Box
                key={index}
                component="pre"
                sx={{
                  fontFamily: changeOrderFontMono,
                  fontSize: changeOrderType.size.small,
                  background: changeOrderSurface.sunk,
                  border: `1px solid ${changeOrderBorder.default}`,
                  borderRadius: '6px',
                  padding: '8px 10px',
                  overflowX: 'auto',
                  whiteSpace: 'pre',
                }}
              >
                <code>{block.text}</code>
              </Box>
            );
          case 'heading': {
            const Tag = (['h3', 'h4', 'h5'] as const)[block.level - 1];
            return (
              <Box key={index} component={Tag} sx={{ fontSize: changeOrderType.size.lead - block.level, fontWeight: changeOrderType.weight.semibold }}>
                {inline(block.text)}
              </Box>
            );
          }
          case 'quote':
            return (
              <Box key={index} component="blockquote" sx={{ borderLeft: `3px solid ${changeOrderBorder.strong}`, paddingLeft: '10px', color: changeOrderInk.muted }}>
                {linesWithBreaks(block.lines)}
              </Box>
            );
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{inline(item)}</li>
                ))}
              </Tag>
            );
          }
          default:
            return <p key={index}>{linesWithBreaks(block.lines)}</p>;
        }
      })}
    </Box>
  );
}
