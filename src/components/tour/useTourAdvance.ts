// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useRef } from 'react';
import { matchPath, useLocation } from 'react-router-dom';

import { useAppSelector } from '@/hooks/useApp';

import { resolveAnchor, safeQuery } from './anchor';
import { Advance } from './types';

/**
 * Wire a step's {@link Advance} condition to `onAdvance`.
 *
 * Every branch is evaluated unconditionally (hooks cannot be conditional) and
 * gated on `enabled` inside, so switching a step from one advance kind to
 * another tears the old subscription down through normal effect cleanup.
 *
 * `onAdvance` is read through a ref so a changing callback identity never
 * re-subscribes a listener or restarts an observer.
 */
export const useTourAdvance = (
  advance: Advance | null,
  enabled: boolean,
  onAdvance: () => void,
): void => {
  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  // --- on: 'click' ---------------------------------------------------------
  const clickAnchor = advance?.on === 'click' ? advance.anchor : null;
  useEffect(() => {
    if (!enabled || !clickAnchor) return;

    // Capture phase: the app may stop propagation on its own handlers, and the
    // anchor is re-resolved per event because React can have swapped the node.
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const element = resolveAnchor(clickAnchor);
      if (element?.contains(target)) onAdvanceRef.current();
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [enabled, clickAnchor]);

  // --- on: 'input' -----------------------------------------------------------
  const inputAnchor = advance?.on === 'input' ? advance.anchor : null;
  const inputValue = advance?.on === 'input' ? advance.value : null;
  useEffect(() => {
    if (!enabled || !inputAnchor || inputValue === null) return;

    // Native `input` fires per keystroke and bubbles on its own, but capture
    // phase keeps this consistent with the `click` listener above — the app
    // may stop propagation on its own handlers before it reaches document.
    // Checked against the CURRENT value, not just "an input event happened
    // inside the anchor": firing on the first keystroke would jump the tour
    // ahead of a value that isn't actually right yet — e.g. one character
    // into "set-replicas", or the wrong function's name still on its way to
    // being backspaced out.
    const handleInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const element = resolveAnchor(inputAnchor);
      if (!element?.contains(target)) return;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
      if (target.value.trim() === inputValue) onAdvanceRef.current();
    };

    document.addEventListener('input', handleInput, true);
    return () => document.removeEventListener('input', handleInput, true);
  }, [enabled, inputAnchor, inputValue]);

  // --- on: 'route' ---------------------------------------------------------
  const routeMatch = advance?.on === 'route' ? advance.match : null;
  const { pathname } = useLocation();
  const stepEntryPathnameRef = useRef<string | null>(null);

  // Declared before the matcher effect so it always clears first when the step
  // changes; the matcher then re-seeds with the pathname the step opened on.
  useEffect(() => {
    stepEntryPathnameRef.current = null;
  }, [routeMatch, enabled]);

  useEffect(() => {
    if (!enabled || !routeMatch) return;
    if (stepEntryPathnameRef.current === null) {
      stepEntryPathnameRef.current = pathname;
      return;
    }
    if (pathname === stepEntryPathnameRef.current) return;
    if (matchPath({ path: routeMatch, end: false }, pathname)) onAdvanceRef.current();
  }, [enabled, routeMatch, pathname]);

  // --- on: 'selector' ------------------------------------------------------
  const selectorCss = advance?.on === 'selector' ? advance.css : null;
  useEffect(() => {
    if (!enabled || !selectorCss) return;

    const check = (): boolean => {
      if (!safeQuery(selectorCss)) return false;
      onAdvanceRef.current();
      return true;
    };

    if (check()) return;

    const observer = new MutationObserver(() => {
      check();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, [enabled, selectorCss]);

  // --- on: 'predicate' -----------------------------------------------------
  const predicateSelect = advance?.on === 'predicate' ? advance.select : null;
  const predicateValue = useAppSelector((state) => {
    if (!predicateSelect) return false;
    try {
      return predicateSelect(state);
    } catch {
      // A chapter's selector must never be able to crash the store subscription.
      return false;
    }
  });
  useEffect(() => {
    if (!enabled || !predicateSelect || !predicateValue) return;
    onAdvanceRef.current();
  }, [enabled, predicateSelect, predicateValue]);
};
