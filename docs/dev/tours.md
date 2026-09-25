# Guided tours (agents-first guide)

> Read this before adding, editing, or reviewing steps in the in-app guided tour system. It is
> written for an AI agent editing this code cold. It is rule-dense on purpose. Paths and identifiers
> are real and verified against the tree; grep them.

## What it is

The guided tour walks a new user through the product via a spotlighted tooltip that tracks a live DOM
element (`TourHost.tsx`). A tour is a `TourDefinition` — an ordered list of `TourStep`s — registered by
calling `defineTour(...)` at **module scope** in a chapter file (`registry.ts`). Tours cannot live in
Redux (steps hold React nodes and closures, which break serializability); Redux keeps only the running
tour id and step index, and the host looks the definition up in an in-memory `Map`.

There are **six** independently-launchable tours, chained by `nextTourId` so the completion screen can
offer "Continue to the next one":

1. `getting-started` — `tours/gettingStartedTour.tsx` (note: at `tours/`, **not** `tours/chapters/` —
   the one inconsistent chapter location; grep `tours/index.ts` if a chapter seems to be missing)
2. `explore-and-inspect` — `tours/chapters/exploreAndInspect.tsx`
3. `deploy-and-release` — `tours/chapters/deployAndRelease.tsx`
4. `change-and-promote` — `tours/chapters/changeAndPromote.tsx`
5. `ownership-and-prod` — `tours/chapters/ownershipAndProd.tsx` (chapters 9-10, exports
   `ownershipAndProdTour`)
6. `prod-and-next` — also `tours/chapters/ownershipAndProd.tsx` (chapter 11, exports
   `prodAndNextTour`) — split out from #5 once that chapter grew to a quarter of the whole sequence
   with no stopping point

**This split is itself a hard-won lesson, not an accident.** `tours/index.ts`'s own comment: *"the
guided tour used to be one continuous 55-step flow, but users reacted badly to that."* Never propose
merging tours back into one long flow. Each new tour's first step should name the earlier tour to take
first, for a user who lands on it out of order.

---

## Read this before adding or editing tour steps (hard rules)

These come from real user feedback in this feature's build-out, not speculation. Numbered so you can
cite them in review.

1. **Never gate a "type X" or "click Y" instruction step on `advance: { on: 'next' }` alone.** A real
   user, once shown the actual next control (a search result, an Invoke button, a Submit button),
   clicks or types into *that* — not the tour's own Next button. A `next`-gated step has no listener
   for that real action, so nothing happens: the tour sits frozen on stale copy while the app has
   already moved one or more steps ahead, and can get **permanently stranded** waiting for a click that
   already happened and will not come again. (User, verbatim: *"The use function steps in the tour
   should detect when the user clicks on things automatically and advance... right now I keep finding
   myself a couple of steps ahead of the tutorial."*) Use `click`, `input`, or `selector` — see the
   decision table below — for every step whose body instructs an action. Reserve `next` for a step that
   is pure explanation with nothing to do.
2. **An `input` advance must always specify the exact `value` to wait for.** It is not "advance on any
   keystroke." (User, verbatim, after an early version fired on the first character typed: *"It needs
   to wait for the right string, not just skip straight ahead."*) Checked as `target.value.trim() ===
   value` on every native `input` event inside the anchor (`useTourAdvance.ts`) — one character into
   "set-replicas" must not satisfy it.
3. **When the real completion signal is a *commit* distinct from the typed text, use `selector`, not
   `input`.** Example: `edit-type-value` in `ownershipAndProd.tsx` asks the user to type a value *and
   press Enter* to stage it. `input` would fire the instant the text matches — before Enter — jumping
   to a step whose anchor (a "Keep on merge" button that only renders once the edit is staged) does not
   exist yet. Advance on that button appearing instead (`{ on: 'selector', css: '...' }`); it is
   already the definitive proof the commit happened.
4. **When you fix one instance of a bug shape, grep for every other instance and fix them all in the
   same pass.** (User, verbatim, after the `input`-advance fix was scoped only to the Functions flow:
   *"There are other sections where we type as well, like 'type prod'."*) A per-step patch that
   addresses only the reported symptom leaves the same trap live elsewhere in the same file, or in a
   sibling chapter that copied the pattern.
5. **Tour copy must describe the app's *current*, real behavior — re-verify it, don't assume it's still
   true.** Nothing fails at build time when the app changes underneath a tour's copy or anchor.
   Example: a step's copy warned *"Its underlined name is a link — it opens a new tab, not needed
   yet"* about a `NodeName` link that a later, unrelated change had already removed; the user caught it
   live (*"This is no longer true. Clicking the node did not advance the step either"*) because the
   step's `click` advance was still anchored on the narrow workaround strip the now-gone link used to
   require. Whenever you touch a chapter file — or whenever the component it points at changes — grep
   the component for the behavior the copy claims and confirm it still holds.
6. **Teach the correct, scalable habit, not just whatever technically satisfies the step.** A step that
   told the user to click a unit row to expand it was replaced with one that teaches searching instead,
   at the user's explicit request (*"Can you encourage them to use the search in a step please?"*) —
   search scales to a component with many units; "click each row" does not.
7. **If a tour's claims aren't true yet, fix the underlying product bug — don't soften the copy around
   it.** A chapter once shipped with a comment reading *"THE OWNERSHIP CLAIMS BELOW DESCRIBE INTENDED
   BEHAVIOUR, NOT CURRENT BEHAVIOUR"* because Select-all could silently overwrite a field the user had
   just told ConfigHub to keep. The fix was the real product bug in `ComponentValuesSection.tsx`
   (exclude protected paths from `upgradablePaths`), not a rewrite of the tour to describe the broken
   behavior honestly. Prefer this whenever the gap is actually fixable in scope.
8. **Keep tour UI copy short.** A completion button that read `Continue to {nextTourTitle}` (wrapping,
   styled to wrap) was replaced with a plain `Continue` at the user's request (*"Just have the button
   say 'continue'"*) — the destination is already named on the screen the button leads to.
9. **A tour-chapter-file edit is not verified by `tsc`/`eslint` alone.** See *The module-load-time crash
   gotcha* below — it is a hard rule with its own section because the failure mode is severe (the
   entire app fails to boot) and invisible to both of those tools.

---

## Advance kinds — decision table

`Advance` (`types.ts`) is a closed union; `useTourAdvance.ts` has exactly one `useEffect` per kind,
each gated on `enabled` (the step being the active one) so switching advance kinds between steps tears
the old listener down cleanly.

| Kind | Fires when | Use for |
|---|---|---|
| `click` | A real click lands inside `anchor` (document-level, capture phase, `element.contains(event.target)`). | "Click X" instructions, and any step whose real next action is a click — including one a later step will also anchor on. |
| `input` | A native `input` event lands inside `anchor` **and** the element's trimmed value equals `value`. | "Type X" instructions where the field's final text *is* the completion signal (search boxes, name fields, function parameters). Always set `value` — see rule 2. |
| `selector` | An element matching `css` exists (`MutationObserver`, fires immediately if already present). | Waiting for a *result* of an action rather than the action itself — a search result appearing, a button becoming available, a commit landing. Prefer this over `input` whenever the target is a DOM element that only exists once the real thing happened (rule 3), and prefer it over `next` whenever there is anything detectable to watch for at all. |
| `next` | The user presses the tooltip's own Next button (only step kind that renders one — `TourHost.tsx`: `showNext={step.advance.on === 'next'}`). | Pure explanation steps with nothing to do. **Never** for a step whose body says "type" or "click" (rule 1). |
| `predicate` | A Redux selector (`(s: RootState) => boolean`) becomes true. | State that only exists in the store, not as a stable DOM signal. |
| `route` | The pathname changes to match a prefix, ignoring the pathname the step opened on. | Steps whose completion is a navigation. |

`anchor` vs `spotlightAnchor`: `anchor` drives click/input detection, Popper placement, and
`anchorMissing` (and therefore optional-skip / offer-a-skip). `spotlightAnchor` **only** widens what
the ring visually covers — set it when the safe-to-interact element is smaller than what a user would
think of as "the thing," but never let it change what can be clicked or how the step resolves.

---

## Architecture & file map

| Path | Responsibility |
|---|---|
| `types.ts` | `TourStep`, `TourDefinition`, `Advance`, `Anchor` types. Read the doc-comment on `Advance` first — it is the canonical decision table this doc summarizes. |
| `registry.ts` | `defineTour`/`getTour`/`listTours` — the in-memory `Map`, re-registration on Vite HMR. |
| `useTourAdvance.ts` | One `useEffect` per `Advance` kind. This is where a new advance kind would be added. |
| `anchor.ts` | `resolveAnchor` (selector/flowNode/inModal → element), `safeQuery` (never throws on a bad selector), `isMeasurable`. |
| `useAnchorElement.ts` / `useAnchorRect.ts` | Poll/resolve the current step's anchor into an element and a live viewport rect. |
| `TourHost.tsx` | Orchestration: step navigation, `anchorMissing`/optional-skip (`ANCHOR_RESOLVE_TIMEOUT_MS` = 5000ms, `constants.ts`), scroll-into-view (never for a React Flow node — the canvas is a programmatic scroll container, see its own comment), completion screen hookup. |
| `TourTooltip.tsx` / `TourSpotlight.tsx` / `TourCue.tsx` / `TourCompletion.tsx` | Presentation. `TourCue`/`TourCommand` (from `TourCue.tsx`) are the inline styled spans step bodies use for literal values and imperative verbs — import both or typecheck will not save you (see below). |
| `tours/index.ts` | The module-load registration list — the single place that decides which chapters exist. |
| `tours/gettingStartedTour.tsx`, `tours/chapters/*.tsx` | The actual step content. |

---

## The module-load-time crash gotcha

Chapter files are imported by `tours/index.ts` **purely for their `defineTour(...)` side effect** — the
import itself runs the module top to bottom. A `TourStep[]` array is a literal JSX expression evaluated
at that same **module load time**, not deferred until a tour actually runs.

**A `ReferenceError` in any step's `body` JSX crashes the entire app on boot — not just the tour.**
This actually happened in this session: a step used `<TourCue>` without importing it from
`../../TourCue`. `eslint` passed cleanly (this project's config does not flag an undefined JSX
component as an error). The app rendered a blank page and never even reached the Keycloak redirect. It
was caught only by loading the app in a real browser.

**`npx tsc --noEmit` alone does NOT catch this — and neither does it catch anything else.** Verified by
deliberately reproducing the exact bug: with `TourCue` unimported, `npx tsc --noEmit` from `ui/`
reports **zero errors**, every time, cache or no cache. This is not a JSX-resolution subtlety — it is
that the root `tsconfig.json` here is references-only (`"files": [], "references": [...]`), and a
project-references setup is only followed in **build mode**. Plain `tsc --noEmit` reads that file, sees
no root files to check, and exits 0 having typechecked **nothing at all**, regardless of any real error
in the codebase. Confirmed by running `npx tsc --noEmit -p tsconfig.app.json` directly against the same
broken file: `error TS2304: Cannot find name 'TourCue'`, twice, exactly where it's used.

**Always typecheck with `npx tsc -b`** (the same invocation `package.json`'s own `build` script uses:
`"build": "tsc -b && vite build ..."`) — this follows the references and genuinely checks the project.
Add `--force` to bypass incremental caching when you want a from-scratch check. A bare `tsc --noEmit`
with no `-p`/`-b` in this repo is worse than useless: it looks like a real, passing typecheck and is not
one.

**Required verification for any tour-chapter-file edit, every time, in this order:**

1. `npx tsc -b` (not bare `tsc --noEmit` — see above)
2. `npx eslint <touched files>`
3. A **live boot-check**: launch a headless browser, `page.on('pageerror', ...)`, `page.goto('/')`,
   confirm it redirects to Keycloak (or renders normally) with no errors. Steps 1-2 do not substitute
   for this — a missing-import crash passes both of them (eslint always; a bare `tsc --noEmit` always,
   for anything, in this repo).
4. The relevant `ui/tests/tour-*.spec.ts` suite (see below).

---

## Testing tour steps

- **Playwright only** — `ui/tests/tour-*.spec.ts`. No Jest, ever, in this repo.
- **`.fill()` dispatches a single `input` event with the final string already set.** An `input`-advance
  step reacts to it immediately. Do **not** follow a `.fill()` with
  `tooltip.getByRole('button', { name: 'Next' }).click()` if the step you just filled uses `input` or
  `selector` advance — the tour has very likely already moved past it by the time that click runs, and
  the Next button will not even be rendered for a non-`'next'` step (`TourHost.tsx`'s `showNext`).
- **Step-count changes ripple.** Adding, removing, or reordering steps in a tour means renumbering every
  `'N of M'` assertion across every spec that drives that tour — grep for the tour's title string across
  `ui/tests/tour-*.spec.ts` before considering the change done.
- **`tour-full-walkthrough.spec.ts` is intentionally `test.skip`'d** (too slow/flaky for routine CI) but
  chains all six tours back-to-back and must be **kept accurate** as living documentation of the intended
  full flow — update it in the same commit as any step content or advance-kind change, even though it
  will not run.
- A regression-style spec that drives a chapter through the **real tooltip** (clicking only what the
  tooltip itself points at, not raw `page.getByTestId(...).click()` calls that bypass the engine) is
  the only kind of test that can catch the "couple of steps ahead" bug class from rule 1. A spec that
  only proves the underlying feature works, driven via raw selectors, proves nothing about whether the
  *tour* gets stuck.

---

## Rejected approaches / anti-patterns

Do not re-propose these.

- **`advance: { on: 'next' }` on a step that instructs typing or clicking something.** The direct cause
  of the "couple of steps ahead" bug (rule 1). If a step's body says "Type" or "Click," it needs a
  listener for that specific action.
- **`{ on: 'input', anchor }` with no `value`.** Advances on the first keystroke, before the field holds
  anything close to the instructed text (rule 2).
- **Merging two steps into one just to dodge a `next` gate.** When a "type X" step and the following
  "click Y" step have genuinely separate teaching content (e.g. `change-fill-replicas` explaining *why*
  the value is a real change, then `change-invoke` explaining the blast radius of running it), fix the
  advance kind on the first step instead of collapsing them — an `input` advance on the first step lets
  both beats stay separate while still auto-detecting.
- **One continuous long tour.** Explicitly reacted against by users; tours are short and independently
  launchable, chained by `nextTourId` (see *What it is*).
- **Trusting `tsc`/`eslint` as sufficient sign-off for a chapter-file edit.** Neither catches a runtime
  `ReferenceError` in step JSX — and a bare `tsc --noEmit` (no `-b`/`-p`) catches nothing at all in this
  repo (module-load gotcha above). The live boot-check is not optional.
- **Running `npx tsc --noEmit` with no `-b`/`-p` and trusting a clean result.** It silently checks zero
  files here. Use `npx tsc -b`.

---

## Provenance

Grounded in the current code plus one Claude Code session that built the `input`-advance-kind feature,
fixed several real product bugs the tours had been narrating around, and received the direct user
feedback quoted above verbatim. This is a smaller evidence base than a multi-session mining pass — treat
the numbered rules as solid (they are first-person, verbatim user corrections) and the architecture
description as a read-only code map, current as of that session.
