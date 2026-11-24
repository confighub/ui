// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Whether a click on a link should go to a page of this app in the same tab.
 * Returns the address to go to, or null when the click is the browser's: a
 * modified click or a click of another button (new tab, new window, download),
 * a link to another site, a download, or a link that something else has handled.
 */
export function sameTabTarget(
  click: { defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  link: { href: string | null; download: boolean },
  origin: string,
  base: string,
): string | null {
  if (click.defaultPrevented || click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null;
  if (link.download || !link.href || link.href.startsWith('#')) return null;
  let url: URL;
  try {
    url = new URL(link.href, base);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  // The API can be served from the UI's origin; its addresses are not pages.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return null;
  return url.pathname + url.search + url.hash;
}

/**
 * Makes a plain click on any link to a page of this app open it in the same
 * tab, without a page load, whatever the link's `target`. A modified click
 * stays the browser's, so ⌘/Ctrl-click and middle-click open a new tab. Links
 * to other sites are left alone. `Layout` installs it once.
 *
 * It listens on the document, after React's handlers, so a link that handled
 * its own click (a router link, an in-place preview) is not handled twice.
 */
export function useSameTabLinks(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!anchor) return;
      const to = sameTabTarget(
        e,
        { href: anchor.getAttribute('href'), download: anchor.hasAttribute('download') },
        window.location.origin,
        window.location.href,
      );
      if (to === null) return;
      e.preventDefault();
      navigate(to);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate]);
}
