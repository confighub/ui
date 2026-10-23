// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Keys typed in the moment between "open a new view" and its input being on
 * screen must not be lost. `focusWithTypeahead` focuses the input at once when
 * it can; when it cannot yet (the column is still opening), it holds the
 * printable keys typed meanwhile, keeps trying each frame, and types them into
 * the input when it takes focus.
 */

const MAX_WAIT_MS = 1000;

/** Put `text` at the caret of a focused input in a way React's onChange sees. */
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next);
  el.setSelectionRange(start + text.length, start + text.length);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Focus with `focus()` now if it succeeds; otherwise hold typed keys until it does. */
export function focusWithTypeahead(focus: () => boolean): void {
  if (focus()) return;
  let buffer = '';
  const started = performance.now();
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    buffer += e.key;
  };
  window.addEventListener('keydown', onKey, true);
  const stop = () => window.removeEventListener('keydown', onKey, true);
  const tick = () => {
    if (focus()) {
      stop();
      const el = document.activeElement;
      if (buffer && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) typeInto(el, buffer);
      return;
    }
    if (performance.now() - started > MAX_WAIT_MS) {
      stop();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
