// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The question this page asks before it can answer coverage, and a state the
 * design never anticipated because it never asked this question.
 *
 * ⚠️ IT IS A BLOCK, NOT A PANE. It renders inside `DetailPane`'s existing panes --
 * beside the selector in an open Stage, in the coverage slot when nothing is
 * selected -- rather than replacing them. It used to be the pane itself, before
 * choosing a component moved from gating the editor to gating only coverage; it
 * must not carry `.detail`/`.detempty`/`id='det'` again, because a second element
 * bearing that id nests inside the real one and both `querySelector('#det')` and
 * any `.detail`-scoped style stop being able to tell them apart.
 *
 * It explains before it asks. A reader who does not already know that a
 * ChangeWorkflow carries no component will not understand why a page about one
 * workflow is asking them to name something else -- and a bare control with no
 * reason reads as a form to get past rather than a choice to make.
 *
 * ⚠️ IT DOES NOT RENDER THE PICKER ITSELF. It used to hold its own
 * `<ComponentPicker>`, gated by the same `component === null` check that chose
 * whether this block appeared at all -- so the first keystroke unmounted this
 * copy and mounted a second, different one elsewhere, which read as the field
 * jumping and dropped focus mid-type. `ComponentPicker` now mounts once,
 * reused as one element wherever this block's own caller (`StageDetail` or
 * `NoSelection`) places it -- always directly above this text, never inside
 * it -- so there is exactly one input for the life of a pane.
 *
 * ⚠️ IT ASKS EVERY TIME, AND DOES NOT REMEMBER THE LAST ANSWER. A component
 * carried over from a workflow the reader has closed would be applied to one
 * whose Stages may select on entirely different labels -- putting "No variant
 * here" on every tile, which reads as a broken definition to anyone who does not
 * notice the name in the header. The page would be telling the truth and the
 * reader would draw a false conclusion from it. Asking is a small visible cost;
 * remembering is an occasional silent wrong answer.
 *
 * A default taken from the workflow's OWN Space's `Component` label would be
 * about the thing on screen and is the better shape. It is not built because the
 * only evidence for it is one workflow whose Space happens to carry its own name,
 * and a single row cannot tell a convention from a coincidence. Worth revisiting
 * when there are enough workflows to see whether Spaces are organised that way.
 *
 * ⚠️ IT DOES NOT BLOCK EDITING. The Stages, their names, their selectors and every
 * prerequisite are the definition, and none of them depend on this. Only what a
 * selector RESOLVES TO does. So a reader who wants to write a workflow rather
 * than preview one is never made to answer first -- which this block being
 * reachable alongside an open Stage's fields is what actually keeps true, now
 * that it no longer replaces them.
 */

import { plural } from '../model';

interface NoComponentChosenProps {
  components: readonly string[];
  /** Spaces carrying no Component label at all, which no preview can reach. */
  withoutComponent: number;
}

export function NoComponentChosen({ components, withoutComponent }: NoComponentChosenProps) {
  return (
    <div className='cov'>
      <h3>Coverage</h3>
      <p className='lede'>
        {'A workflow names no component. Its Stages select Spaces by their labels, and which Spaces those turn out to be comes from the change order being promoted — which is what lets one definition be cloned to give another component the same shape of rollout.'}
      </p>
      <p className='lede' style={{ marginTop: 8 }}>
        {'So to show what a Stage covers, this page has to be told which component to look through. The choice is not saved, changes nothing about the workflow, and a different one would show different variants for the same unchanged Stages.'}
      </p>
      <p className='lede' style={{ marginTop: 8 }}>
        {'Type one into '}
        <strong>Preview with Component</strong>
        {`, above.${components.length > 0 ? ` ${plural(components.length, 'component', 'components')} to choose from.` : ''}`}
      </p>
      {withoutComponent > 0 ? (
        <p className='lede' style={{ marginTop: 8 }}>
          {`${plural(withoutComponent, 'Space carries', 'Spaces carry')} no Component label and belong to no component, so no choice here reaches ${withoutComponent === 1 ? 'it' : 'them'}.`}
        </p>
      ) : null}
      <p className='lede' style={{ marginTop: 8 }}>
        {'Editing does not wait for this. Names, selectors and prerequisites are the definition itself and can be written without choosing anything here.'}
      </p>
    </div>
  );
}
