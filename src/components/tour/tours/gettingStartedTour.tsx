// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { TourCommand, TourCue } from '../TourCue';
import { defineTour } from '../registry';
import { EXPLORE_AND_INSPECT_TOUR_ID } from './chapters/exploreAndInspect';

export const GETTING_STARTED_TOUR_ID = 'getting-started';

/**
 * The create-component wizard is an MUI Dialog, which portals its Paper to
 * `document.body`. A bare selector would therefore reach outside the wizard and
 * can collide with the same testid elsewhere, so every in-wizard step scopes its
 * lookup to this container. The Paper carries `role="dialog"` plus the wizard's
 * own `aria-labelledby`, which no other dialog on the page uses.
 */
const wizard = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="create-component-title"]');

const inWizard = (css: string) => ({ kind: 'inModal', container: wizard, css }) as const;

/**
 * Chapter 1 — make the cubbychat component from a sample manifest.
 *
 * The tour deliberately never touches the deployment-variant picker. A variant
 * attaches a target, and a target with no live worker leaves the new component
 * with an "unapplied changes" badge that nothing can clear.
 */
export const gettingStartedTour = defineTour({
  id: GETTING_STARTED_TOUR_ID,
  nextTourId: EXPLORE_AND_INSPECT_TOUR_ID,
  title: 'Make your first component',
  steps: [
    {
      id: 'open-wizard',
      navigateTo: '/components',
      anchor: { kind: 'selector', css: '[data-testid="header-add-button"]' },
      title: 'Make a new component',
      body: (
        <>
          A component is a group of related configuration. It keeps one set of files for each of
          your environments. <TourCommand>Click</TourCommand> <TourCue>New component</TourCue> to
          start.
        </>
      ),
      advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="header-add-button"]' } },
    },
    {
      // `advance: 'next'` never checks that a name (or owner) was actually
      // entered before the user presses this step's own Next — considered
      // switching it to watch for the real app's Continue button becoming
      // enabled instead (`create-component-next-button` is genuinely
      // `disabled={activeStep === 0 && !step0Valid}` in CreateComponentPane.tsx,
      // so that signal exists and would be free). Left as `next` on purpose:
      // that data-testid is the very next step's own anchor too
      // (`continue-to-units`), which is a real click-advance and so already
      // cannot proceed while the field is empty — an unfilled name here only
      // strands the user one step later, on a button they can see is
      // disabled, not silently. Auto-advancing this step the instant a
      // one-character name is typed (before an owner choice is even
      // considered) would also fire mid-keystroke, moving the tooltip out
      // from under a user still typing "cubbychat" — worse than the mild
      // redundancy of asking them to also press this step's own Next.
      id: 'name-component',
      anchor: inWizard('[data-testid="create-component-name-input"]'),
      title: 'Give the component a name',
      body: (
        <>
          The name identifies the component everywhere in ConfigHub.{' '}
          <TourCommand>Type</TourCommand> <TourCue>cubbychat</TourCue>. An owner is already
          selected below — keep it, or pick another. Then{' '}
          <TourCommand>press</TourCommand> <TourCue>Next</TourCue> here to carry on.
        </>
      ),
      advance: { on: 'next' },
    },
    {
      id: 'continue-to-units',
      anchor: inWizard('[data-testid="create-component-next-button"]'),
      title: 'Go to the units step',
      body: (
        <>
          Once the name and owner are set, <TourCommand>click</TourCommand>{' '}
          <TourCue>Continue</TourCue>. If that button is greyed out, the name is still empty.
        </>
      ),
      advance: { on: 'click', anchor: inWizard('[data-testid="create-component-next-button"]') },
    },
    {
      id: 'insert-sample',
      anchor: inWizard('[data-testid="create-component-insert-sample-button"]'),
      title: 'Add the units',
      body: (
        <>
          A unit is one piece of configuration that ConfigHub stores, edits and applies. Paste
          YAML is already selected, and you do not need your own YAML for this tour.{' '}
          <TourCommand>Click</TourCommand> <TourCue>Insert a sample manifest</TourCue>. ConfigHub
          reads the resources and shows how many units it will make.
        </>
      ),
      advance: {
        on: 'click',
        anchor: inWizard('[data-testid="create-component-insert-sample-button"]'),
      },
    },
    {
      id: 'continue-to-review',
      anchor: inWizard('[data-testid="create-component-next-button"]'),
      // Titled for the payoff, not the navigation: this step narrates how
      // ConfigHub grouped the manifest, so "Go to the review step" both
      // undersold it and read as a near-duplicate of `continue-to-units`'
      // own "Go to the units step" two steps earlier.
      title: 'Three resources, two units',
      body: (
        <>
          ConfigHub read the manifest: <strong>3 resources</strong>, grouped into{' '}
          <strong>2 units</strong> — the ConfigMap gets its own, so config can change without
          touching the workload. <TourCue>minimal</TourCue> granularity is already selected;
          keep it. Nothing is written yet — <TourCommand>click</TourCommand>{' '}
          <TourCue>Continue</TourCue>.
        </>
      ),
      advance: { on: 'click', anchor: inWizard('[data-testid="create-component-next-button"]') },
    },
    {
      id: 'create-component',
      anchor: inWizard('[data-testid="create-component-submit-button"]'),
      title: 'Create the component',
      body: (
        <>
          The base has no target, so it never deploys by itself — leave any deployment options
          unchecked. <TourCommand>Click</TourCommand> <TourCue>Create</TourCue>. ConfigHub makes
          the base space and one unit for each group of resources.
        </>
      ),
      advance: { on: 'click', anchor: inWizard('[data-testid="create-component-submit-button"]') },
    },
    {
      // The wizard does not close itself on success — it shows its own
      // confirmation screen (component name, the units it made, a "Done"
      // button) that stays open until the user dismisses it. Without this
      // step the tour considered itself finished the instant Create was
      // clicked, while this screen sat there unaddressed: the user was left
      // looking at a dialog with no tour guidance on it, and — worse — that
      // dialog is a real MUI Dialog with its own focus trap, so once the
      // tour's own tooltip/completion screen closed, nothing behind it was
      // clickable until this was dismissed (confirmed live).
      id: 'confirm-created',
      anchor: inWizard('[data-testid="create-component-done-button"]'),
      title: 'The component is ready',
      body: (
        <>
          ConfigHub made the base space and its units. <TourCommand>Click</TourCommand>{' '}
          <TourCue>Done</TourCue> to close this and see it.
        </>
      ),
      advance: { on: 'click', anchor: inWizard('[data-testid="create-component-done-button"]') },
    },
  ],
});
