// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The words of the "create a ChangeOrder" draft.
 *
 * No "Unit" in anything a reader sees: a Unit is a resource, or is named by its slug. A
 * container's tag is an "image tag". Sentence case.
 */

export const draftCopy = {
  /** The detail view's word for a value nobody could read. Never "no changes". */
  couldNotEstablish: 'Could not establish',
  /** A retry's name, for what it asks again: "Retry dry run". */
  retry: (what: string) => (what === '' ? 'Retry' : `Retry ${what}`),

  problems: {
    nameEmpty: 'Type a name.',
    nameFormat: "Use letters, digits, '-', '_' or '.'.",
    nameTooLong: (max: number) => `At most ${max} characters`,
    nameTaken: (slug: string) => `${slug} exists. Change the date or add a suffix.`,
    templateNotFound: (slug: string) => `No ChangeOrder ${slug} in this Space`,
    workflowRequired: (component: string) => `${component} requires a workflow`,
    workflowUnset: 'Pick a workflow',
    workflowNotAllowed: (slug: string) => `${slug} is not allowed here`,
    variantNotFound: (slug: string) => `No variant ${slug}`,
    scopeEmpty: 'No variant in scope',
    updateTypeUnknown: (value: string) => `Unknown update type ${value}`,
    endNotFound: (slug: string) => `No closed ChangeSet ${slug} here`,
    startDisagrees: (resource: string) =>
      `Variants have taken different revisions of ${resource}`,
    nothingToCarry: 'Nothing waiting',
    mergeUnitsPreview: 'MergeUnits is not previewed',
    passedOverByServer: (resources: string) => `Passed over: ${resources}`,
    carriedByServer: (resources: string) => `Also carried: ${resources}`,
    stageNotFound: (stage: string, workflow: string) => `No stage ${stage} in ${workflow}`,
    outsideEveryStage: (variants: string, workflow: string) =>
      `${variants} outside every stage of ${workflow}`,
  },

  /** Why a value is `undetermined`: said beside "Could not establish". */
  undetermined: {
    noScope: 'No variant in scope to start from',
    noStart: 'No variant in scope takes the change from this Space',
    mergeUnits: 'MergeUnits resolves Links when promoted',
  },

  /** The buttons that clear a problem (`DraftProblem.fix`). */
  fixes: {
    endAtLatest: 'End at latest',
    lastChangeOrder: 'Start from the last ChangeOrder',
    defaultWorkflow: 'Use the default workflow',
    dropVariant: (slug: string) => `Forget ${slug}`,
    leaveOut: 'Leave out',
    /** A variant whose name is not known here: never its id. */
    aVariant: 'a variant',
    leaveOutNamed: (variants: string) => `Leave out ${variants}`,
    clearStage: 'Show the default stage',
    defaultUpdateType: 'Use the default update type',
  },

  /** Facts about one variant that the preview found, for its outlier chip. */
  outlier: {
    adds: (resource: string) => `adds ${resource}`,
    keeps: (field: string, value: string | undefined) =>
      value === undefined ? `keeps ${field}` : `keeps ${field} ${value}`,
    /** A variant whose only difference is one kept value reads as a fact about the field. */
    stays: (field: string, value: string) => `${field} stays ${value}`,
    separator: ' · ',
  },

  /** The promotion path and the selected stage's card, below the summary. */
  path: {
    heading: 'Promotion path',
    /** The source node: how many waiting changes the draft carries. */
    sourceSummary: (count: number) => `${count} ${count === 1 ? 'change' : 'changes'}`,
    dryRun: 'Dry run',
    variants: (count: number) => `${count} ${count === 1 ? 'variant' : 'variants'}`,
    writes: 'What this promotion writes',
    noVariants: 'No variant in this stage',
    /** A resource the promotion clones into a variant that does not hold it yet. */
    added: 'added',
    /** The source node's card: the change itself. */
    source: 'source',
    sourceFoot: 'Full diff, above.',
    /** The stage card's heading for a draft with no workflow: every variant in scope at once. */
    scopeStage: 'scope',
    /** "Passed over" names a base resource it has no slug for this way. */
    baseResource: 'a resource of the base',
    dryRunPeek: 'Each promotion previewed. Nothing is written.',
    atTheSource: 'At the source',
    imageChanges: 'Image changes',
    passedOver: 'Passed over',
    /** What the image changes' retry asks again, for its name ("Retry image changes"). */
    retryImageChanges: 'image changes',
    outsideEveryStage: 'outside every stage of',
    outsideVariants: (count: number) => `${count} variants`,
    leaveOut: 'Leave out',
    /** A variant whose name is not known here: never its id. */
    aVariant: 'a variant',
    leaveOutNamed: (variants: string) => `Leave out ${variants}`,
    stageRegion: (stage: string) => `Stage ${stage}`,
  },

  gates: {
    summary: (count: number) => (count === 0 ? 'none' : `0 of ${count} · not evaluated`),
    /** A first stage's built-in check: the server evaluates it over the base Space. */
    overBase: (base: string) =>
      `Not evaluated. The server checks ${base} when the ChangeOrder is promoted.`,
  },

  /** The summary card: header, ledger, right column, sticky bar. Labels are short nouns; more goes in a peek. */
  page: {
    back: '← All ChangeOrders',
    newChangeOrder: 'New ChangeOrder',
    /** "New ChangeOrder"'s picker: one row per Component, at its base Space. */
    picker: {
      search: 'Search Components',
      noMatch: 'No Component matches',
      groups: {
        waiting: 'Changes waiting',
        level: 'Nothing waiting',
        unknown: 'Could not establish',
      },
      last: (slug: string, ago: string) => `last: ${slug} · ${ago}`,
      /** How long since, rounded down. */
      ago: {
        justNow: 'just now',
        minutes: (n: number) => `${n}m ago`,
        hours: (n: number) => `${n}h ago`,
        days: (n: number) => `${n}d ago`,
      },
      retryWhat: 'Components',
      retryWaiting: 'changes waiting',
    },
    noBaseSpace: 'No Component has variants to promote to yet',
    summaryLabel: 'ChangeOrder summary',
    draftChip: 'Draft',
    nameLabel: 'Name',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'Description…',
    loading: 'Loading',
    retry: 'Retry',
    /** What each retry asks again, for its name. */
    retryWhat: {
      dryRun: 'dry run',
      createDryRun: 'create dry run',
      howMuch: 'how much',
    },
    notFound: (slug: string) => `No Space ${slug}`,
    noSpace: 'Open a draft from a base Space',

    template: {
      from: 'from',
      reAim: 'Re-aim',
      policy: (component: string) => `${component} policy`,
      peekEyebrow: 'Re-aimed from',
      peekPolicyEyebrow: 'No ChangeOrder to re-aim',
      peekPolicyLine: (component: string) => `Defaults from the ${component} policy`,
    },

    ledger: {
      label: 'Compared with last time',
      decision: 'Decision',
      what: 'What',
      howMuch: 'How much',
      where: 'Where',
      path: 'Path',
      name: 'Name',
      scope: 'Scope',
      updateType: 'Update type',
      same: 'Same',
      baseChanges: 'Base changes',
      none: '—',
      ofSame: (total: number) => `of ${total} same`,
      noOutliers: 'No outliers',
      variants: (n: number) => (n === 1 ? '1 variant' : `${n} variants`),
      editName: (slug: string) => `Edit name ${slug}`,
      defaultName: 'Default name',
      datedLike: (slug: string) => `Dated like ${slug}`,
      variantsWord: (n: number) => (n === 1 ? 'variant' : 'variants'),
      changesCount: (n: number) => (n === 1 ? '1 change' : `${n} changes`),
      revert: 'As last time',
      revertLabel: (row: string) => `${row} as last time`,
      required: 'required',
      noWorkflow: 'No workflow',
      unset: 'Pick one',
      undetermined: (n: number) => `${n} could not be established`,
    },

    provenance: {
      last: 'As last time',
      policy: 'From the policy',
      you: 'Changed by you',
    },

    ribbon: {
      label: 'Changes waiting in the base',
      end: 'end',
      endAt: 'End at',
      endAtLatest: 'End at latest',
      leavesOut: 'Leaves out',
      takesIn: 'Takes in',
      changeSet: 'ChangeSet',
      changeSetNamed: (slug: string) => `${slug} ChangeSet`,
      changeSetEnd: 'Ends at its end Tag',
      startEyebrow: 'Start',
      startLine: 'Every variant took this; the new one starts where it ended.',
      change: 'Change',
      afterEnd: 'After the end',
      endHere: 'End here',
      nothing: 'Nothing waiting',
    },

    outlier: {
      show: 'Show',
      leaveOut: 'Leave out',
    /** A variant whose name is not known here: never its id. */
    aVariant: 'a variant',
    leaveOutNamed: (variants: string) => `Leave out ${variants}`,
      /** The toast after Leave out names what left: "Left out prod-apac." */
      leftOut: (names: string) => `Left out ${names}.`,
      undo: 'Undo',
      addsTail: 'is not there yet; it is cloned.',
      /** A path the merge protects: "`limits.memory` is kept on merge at `1Gi`". */
      keptOnMerge: 'is kept on merge',
      /** A value the variant set itself: "Local override keeps `limits.memory` at `1Gi`". */
      localOverrideKeeps: 'Local override keeps',
      /** Any other reason the server gives. */
      keeps: 'Keeps',
      moreLabel: (n: number) => `+${n}, ${n} more ${n === 1 ? 'variant' : 'variants'}`,
      outsideText: 'on no stage',
      outsideLine: 'is on no stage of',
      outsideTail: '; no promotion reaches it.',
      at: 'at',
      baseWrites: 'base writes',
      more: (n: number) => `${n} more ${n === 1 ? 'variant' : 'variants'}`,
    },

    workflow: {
      title: (component: string) => `${component} policy`,
      noneLine: 'Ungoverned',
      requiredMetric: 'Workflow required',
      allowed: (slugs: string) => `Allowed: ${slugs}`,
    },

    scope: {
      title: 'Scope',
      all: (n: number) => `All ${n}`,
      asLastTime: 'As last time',
      selected: (n: number) => `${n} selected`,
      noRegion: 'no Region label',
      noStage: 'no Stage label',
    },

    updateType: {
      title: 'Update type',
      UpgradeUnit: 'Clone lineage',
      MergeUnits: 'Any merge Link',
    },

    /** Beside Create, the row that holds the first problem: "↑ Fix the name". */
    blockers: {
      template: 'Fix the template',
      what: 'Fix what changes',
      howMuch: 'Fix how much',
      where: 'Fix the scope',
      path: 'Pick a workflow',
      name: 'Fix the name',
      description: 'Fix the description',
      same: 'Fix the update type',
      create: 'Create',
    },

    side: {
      label: 'Dry run summary',
      dryRun: 'Dry run',
      create: 'Create',
      creating: 'Creating…',
      sentenceSame: (same: number, total: number) => `Dry run: ${same} of ${total} same`,
      sentenceFailed: 'Dry run: could not establish',
      createTip: 'Nothing is promoted yet',
      kindWord: {
        same: 'same change',
        differs: 'differs',
        adds: 'adds resources',
        unknown: 'could not be established',
      },
    },
  },
} as const;
