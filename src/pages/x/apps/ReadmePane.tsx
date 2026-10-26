// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * ReadmePane — the body of the component side pane's Readme tab: the Markdown
 * of the Space's README.md Unit, an AppConfig/Text Unit that `cub variant
 * upload` makes of a bundle's README.md.
 */

import { type ReactNode } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { componentTheme } from './componentTheme';
import { readmeBody } from './readme';

/**
 * Only web and mail links are followed. A relative link or image names a file
 * beside the README in the repository it came from, which the UI cannot reach,
 * and would otherwise resolve against the UI's own origin.
 */
const isAbsoluteUrl = (url: string | undefined): url is string => !!url && /^(https?:|mailto:)/i.test(url);

const components: Components = {
  a: ({ href, children }) =>
    isAbsoluteUrl(href) ? (
      <a href={href} target='_blank' rel='noopener noreferrer'>
        {children}
      </a>
    ) : (
      <>{children}</>
    ),
  img: ({ src, alt }) =>
    typeof src === 'string' && /^https?:/i.test(src) ? <img src={src} alt={alt ?? ''} /> : <>{alt}</>,
};

const markdownSx = {
  padding: '12px 20px 24px',
  fontFamily: componentTheme.fontSans,
  fontSize: 14,
  lineHeight: 1.6,
  color: componentTheme.fgDefault,
  overflowWrap: 'anywhere',
  '& > :first-child': { marginTop: 0 },
  '& h1, & h2, & h3, & h4, & h5, & h6': { fontWeight: 700, lineHeight: 1.3, margin: '20px 0 8px' },
  '& h1': { fontSize: 22, paddingBottom: '6px', borderBottom: `1px solid ${componentTheme.borderDefault}` },
  '& h2': { fontSize: 18, paddingBottom: '4px', borderBottom: `1px solid ${componentTheme.borderMuted}` },
  '& h3': { fontSize: 16 },
  '& h4, & h5, & h6': { fontSize: 14 },
  '& p, & ul, & ol, & blockquote, & pre, & table': { margin: '0 0 12px' },
  '& ul, & ol': { paddingLeft: '24px' },
  '& li + li': { marginTop: '2px' },
  '& a': { color: componentTheme.accent },
  '& code': {
    fontFamily: componentTheme.fontMono,
    fontSize: '0.88em',
    background: componentTheme.bgInset,
    borderRadius: '4px',
    padding: '1px 4px',
  },
  '& pre': {
    background: componentTheme.bgSubtle,
    border: `1px solid ${componentTheme.borderDefault}`,
    borderRadius: `${componentTheme.radiusSm}px`,
    padding: '10px 12px',
    overflowX: 'auto',
  },
  '& pre code': { background: 'transparent', padding: 0, fontSize: 12.5 },
  '& blockquote': {
    padding: '0 12px',
    color: componentTheme.fgMuted,
    borderLeft: `3px solid ${componentTheme.borderDefault}`,
  },
  '& table': { borderCollapse: 'collapse', display: 'block', overflowX: 'auto' },
  '& th, & td': { border: `1px solid ${componentTheme.borderDefault}`, padding: '4px 10px', textAlign: 'left' },
  '& th': { background: componentTheme.bgSubtle, fontWeight: 600 },
  '& hr': { border: 'none', borderTop: `1px solid ${componentTheme.borderDefault}`, margin: '16px 0' },
  '& img': { maxWidth: '100%' },
  '& input[type=checkbox]': { margin: '0 6px 0 0', verticalAlign: 'middle' },
  '& li:has(> input[type=checkbox])': { listStyle: 'none', marginLeft: '-20px' },
} as const;

function Notice({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ padding: '16px 20px', fontSize: 13, fontFamily: componentTheme.fontSans, color: componentTheme.fgSubtle }}>
      {children}
    </Typography>
  );
}

export interface ReadmePaneProps {
  /** The README.md Unit's configuration, frontmatter included. */
  data: string;
  /** Whether that configuration is still being read: until it is, `data` is empty. */
  loading: boolean;
}

export function ReadmePane({ data, loading }: ReadmePaneProps) {
  if (!data && loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
        <CircularProgress size={20} />
      </Box>
    );
  }
  const body = readmeBody(data);
  if (body.trim() === '') return <Notice>README.md is empty.</Notice>;
  return (
    <Box sx={markdownSx} data-testid='component-readme'>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </Markdown>
    </Box>
  );
}
