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
    nameTaken: (slug: string) => `${slug} exists`,
    templateNotFound: (slug: string) => `No ChangeOrder ${slug} in this Space`,
    workflowRequired: (component: string) => `${component} requires a workflow`,
    workflowUnset: 'Pick a workflow',
    workflowNotAllowed: (slug: string) => `${slug} is not allowed here`,
    variantNotFound: (slug: string) => `No variant ${slug}`,
    scopeEmpty: 'No variant in scope',
    updateTypeUnknown: (value: string) => `Unknown update type ${value}`,
    kindUnknown: (value: string) => `Unknown kind of change ${value}`,
    /** A type none of whose Links reaches a variant in scope: also the option's tooltip. */
    updateTypeNoLink: (type: string) => `No ${type} Link to these variants`,
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
    noStart: 'No variant in scope takes from this Space',
    mergeUnits: 'MergeUnits resolves Links when promoted',
  },

  /** The buttons that clear a problem (`DraftProblem.fix`). */
  fixes: {
    endAtLatest: 'End at latest',
    lastChangeOrder: 'Use the last ChangeOrder',
    defaultWorkflow: 'Default workflow',
    dropVariant: (slug: string) => `Forget ${slug}`,
    leaveOut: 'Leave out',
    /** A variant whose name is not known here: never its id. */
    aVariant: 'a variant',
    leaveOutNamed: (variants: string) => `Leave out ${variants}`,
    clearStage: 'Default stage',
    defaultUpdateType: 'Default update type',
    defaultKind: 'Default kind',
    defaultContainer: 'First container',
    useUpdateType: (type: string) => `Use ${type}`,
  },

  /** The kinds of change, on the track under the facts. */
  kinds: {
    label: 'Kind of change',
    baseChanges: 'Base changes',
    invoke: 'Invoke',
    transformPaths: 'Transform paths',
    /** Why a kind cannot be chosen, on its segment. */
    noSharedSource: 'No variant reads a shared source',
    /** The track's peek: what choosing a kind starts from. */
    reAims: 'Re-aims',
    /** The undo beside the track: "Back to Base changes". */
    backTo: (kind: string) => `Back to ${kind}`,
  },

  /** An Invoke draft's rows, under the track: what runs, and its arguments or its container and tag. */
  invoke: {
    run: 'Run',
    container: 'Container',
    resources: 'Resources',
    function: 'Function',
    functions: 'Functions',
    savedInvocations: 'Saved Invocations',
    /** The recent few above the functions, to a screen reader. */
    recentInvocations: 'Recent saved Invocations',
    searchFunctions: 'Search functions and saved Invocations',
    /** The search's placeholder: its name says what it searches. */
    searchPlaceholder: 'Search…',
    noFunctionMatches: 'No function matches',
    /** The resources picker with nothing narrowed. */
    everyResource: 'Every resource',
    resourceCount: (n: number) => (n === 1 ? '1 resource' : `${n} resources`),
    moreResources: (n: number) => `+${n}`,
    /** The Unit selection the URL holds, when it is not a list of resources. */
    where: 'where',
    tagPlaceholder: 'new tag…',
    /** The tag input's name, to a screen reader: "Image tag of api". */
    tagLabel: (container: string) => (container === '' ? 'Image tag' : `Image tag of ${container}`),
    /** The tag input's chevron, which opens its suggestions. */
    showSuggestions: 'Show suggested tags',
    /** What the tag input suggests, and how each is hinted. */
    suggest: {
      /** Each group's heading, before the tag it follows. */
      variants: "After the variants'",
      base: "After the base's",
      inUse: 'Running in scope',
      patch: 'patch',
      minor: 'minor',
      major: 'major',
      inVariants: (n: number) => (n === 1 ? 'in 1 variant' : `in ${n} variants`),
      count: (n: number) => (n === 1 ? '1 suggested tag' : `${n} suggested tags`),
    },
    /** The warnings beside the tag: a chip's words, and the sentence its tooltip says. */
    warnings: {
      copied: 'copied · as last time',
      copiedShort: 'copied',
      copiedTip: (container: string) => `Last time's tag for ${container}`,
      downgrade: 'downgrade',
      downgradeTip: (tag: string, from: string) => `${tag} is lower than the ${from} the variants run now.`,
      baseIsOn: 'base is on',
      baseIsOnShort: 'base',
      baseIsOnTip: (base: string, from: string | undefined) =>
        from === undefined ? `The base runs ${base}.` : `The base runs ${base}; the variants run ${from}.`,
      notAPatch: 'Not a patch · base',
      notAPatchShort: 'Not a patch',
      notAPatchTip: (from: string, tag: string, bump: string, base: string) =>
        `${from} → ${tag} is a ${bump} move for the variants, though the base is on ${base}.`,
      /** One chip for them all, where the row has room for no more. */
      count: (n: number) => `${n} warnings`,
    },
    /** An empty value, to a screen reader: never a dash read aloud. */
    noneYet: 'empty',
    /** The function search's result count, said politely. */
    matchCount: (n: number) => (n === 1 ? '1 match' : `${n} matches`),
    /** The function slot's mark: what Create does with the call. */
    runsSaved: (slug: string) => `Runs the saved ${slug}`,
    savesOnCreate: 'Create saves this as an Invocation',
    /** The image function's mark in the function list: what a new Invoke draft runs. */
    isDefault: 'default',
    /** The resources picker: the last one ticked cannot be unticked. */
    oneResourceAtLeast: 'At least one resource',
    /** The rows while the functions and the base's configuration are read. */
    loadingRows: 'Reading the functions',
    /** "In 8 variants" before the dry run has said. */
    eachVariant: 'each variant',
    /** The outcome line before the call is whole: nothing runs yet. */
    nothingYet: 'Nothing changes yet',
    /** An argument's input, to a screen reader: "Run set-label: key". */
    argumentLabel: (fn: string, label: string) => `${fn}: ${label}`,
    /** The source node and the stage cards' heading for the change: the detail view's words. */
    changeDefined: 'Change defined',
    /** "In dev, staging-eu, …": which variants one "At the source" diff stands for. */
    groupCaption: (names: readonly string[]) => `In ${names.join(', ')}`,
    noFieldsDiffer: 'No fields differ here.',
    inVariants: (n: number) => (n === 1 ? '1 variant' : `${n} variants`),
    imageChange: 'Image change',
    /** What the parameter values the server or the function refuses are, in the row's words. */
    values: {
      required: 'Required',
      unknown: (name: string) => `${name} is not a parameter of this Invocation`,
      wholeNumber: 'A whole number',
      trueOrFalse: 'true or false',
      oneOf: (values: string) => `One of ${values}`,
      pattern: "Not a value this function takes",
      between: (min: number, max: number) => `${min} to ${max}`,
      atLeast: (min: number) => `${min} or more`,
      atMost: (max: number) => `${max} or less`,
    },
    problems: {
      tagEmpty: 'Type the new image tag',
      tagCopied: 'Same image tag as last time',
      tagFormat: 'Not an image tag',
      tagUnchanged: (tag: string) => `Every variant already runs ${tag}`,
      argEmpty: (label: string) => `Type the ${label}`,
      argPick: (label: string) => `Pick the ${label}`,
      argRefused: (label: string, why: string) => `${label}: ${why}`,
      containerUnknown: (name: string, base: string) => `No container ${name} in ${base}`,
      noContainer: (base: string) => `No container in ${base}`,
      functionUnknown: (name: string) => `No function ${name}`,
      noFunctions: (toolchain: string) => `No functions for ${toolchain}`,
      invocationUnknown: (ref: string) => `No Invocation ${ref}`,
      lastInvocationGone: "Could not read last time's Invocation",
      invocationNameTaken: (slug: string, base: string) => `${base} has an Invocation ${slug} that runs something else. Change the name.`,
      /** A 409 on the save: another Invocation took the name between the check and the write. */
      invocationNameRaced: (slug: string, base: string) => `${base} has just been given another Invocation ${slug}. Change the name.`,
      gatedFirstStage: (workflow: string) => `${workflow} gates its first stage; a function change cannot start there`,
      gatedBlocker: (workflow: string) => `${workflow} can't start this change`,
      nothingChanges: 'Nothing changes',
      nothingChangesBlocker: 'Nothing changes: change the call',
      noneEstablished: 'Could not establish the change in any variant',
      refused: (why: string) => why,
      /** The two-write Create, when its second write fails. */
      notCreated: 'The ChangeOrder was not created.',
      unknownCreated: 'Could not establish whether the ChangeOrder was created.',
      invocationRemoved: (slug: string) => `Invocation ${slug} was saved for it, and has been deleted again.`,
      invocationKept: (slug: string, base: string) => `Invocation ${slug} is saved in ${base}. Create uses it.`,
      invocationLeft: (slug: string, base: string) => `Invocation ${slug} is saved in ${base} and could not be deleted.`,
    },
    fixes: {
      useFunction: (name: string) => `Use ${name}`,
    },
  },

  /** A Transform paths draft: the shared source its variants' Links read, and where it ends. */
  fanOut: {
    /** The segment's name for the type chosen. */
    kindName: { TransformPaths: 'Transform paths', Upsert: 'Upsert', Insert: 'Insert' },
    /** What each type does, as its option's tooltip. */
    typeTip: {
      TransformPaths: 'Writes the values its Links read from the source',
      Upsert: "Writes the source's resources into each variant",
      Insert: "Adds the source's resources a variant does not hold",
    },
    typeLabel: 'Links',
    source: 'Source',
    changes: 'Changes',
    endAt: 'End at',
    latest: 'latest',
    endLatest: 'Latest',
    changeSets: 'Closed ChangeSets',
    revision: (n: number) => `rev ${n}`,
    took: (n: number) => (n === 0 ? 'never taken' : `taken to rev ${n}`),
    links: (n: number) => (n === 1 ? '1 Link' : `${n} Links`),
    noChanges: 'No change waiting',
    skip: { alreadyTaken: 'Already taken', notMarked: 'Not in the ChangeSet' },
    readsPaths: (paths: string) => `reads ${paths}`,
    loading: 'Reading the shared sources',
    problems: {
      noSharedSource: 'No variant in scope reads a shared source',
      noSharedSourceBlocker: 'No shared source',
      noLinkOfType: (type: string) => `No ${type} Link reads a shared source in this scope`,
      typeUnknown: (value: string) => `Unknown update type ${value}`,
      autoUpdate: (links: string, variants: string) => `${links} in ${variants} auto-update, so they take the change first`,
      pastEnd: (unit: string, links: string) => `${links} already took ${unit} past this end; promoting takes them back`,
      nothingToCarry: 'Nothing waiting at the source',
    },
  },

  /** Facts about one variant that the preview found, for its outlier chip. */
  outlier: {
    /** A variant the function runs in and changes nothing. */
    nothingHere: 'nothing to change here',
    lacks: (resource: string) => `no ${resource} here`,
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
    overBase: (base: string) => `Checked over ${base} on promote`,
  },

  /** The summary card: header, facts, right column, sticky bar. Labels are short nouns; more goes in a peek. */
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
    noBaseSpace: 'No Component has variants yet',
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
      links: 'Links',
    },
    notFound: (slug: string) => `No Space ${slug}`,
    noSpace: 'Open from a base Space',

    template: {
      from: 'from',
      reAim: 'Re-aim',
      peekEyebrow: 'Re-aimed from',
      policy: (component: string) => `${component} policy`,
    },

    /** The facts row, the dry run's outcome under it, and What and How much. */
    facts: {
      component: 'Component',
      baseSpace: 'Base Space',
      workflow: 'Workflow',
      opened: 'Opened',
      lastActivity: 'Last activity',
      /** The outcome line's name to a screen reader. */
      outcome: 'Dry run',
      /** What and How much, together, to a screen reader. */
      change: 'What and how much',
      baseChanges: 'Base changes',
      none: '—',
      ofSame: (total: number) => `of ${total} same`,
      noOutliers: 'No outliers',

      variants: (n: number) => (n === 1 ? '1 variant' : `${n} variants`),
      changesCount: (n: number) => (n === 1 ? '1 change' : `${n} changes`),
      noWorkflow: 'No workflow',
      unset: 'Pick one',
      undetermined: (n: number) => `${n} could not be established`,
      /** After a changed fact's value, to a screen reader: "Scope: 2 variants, was 3 variants". */
      was: (value: string) => `was ${value}`,
      /** The undo beside a changed fact, and beside a name that is not the default. */
      backTo: (value: string) => `Back to ${value}`,
      backToScope: (n: number) => (n === 1 ? 'Back to the 1 variant of last time' : `Back to the ${n} variants of last time`),
      /** Marks last time's option in a fact's popover. */
      lastTime: 'Last time',
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
      startEyebrow: 'Start',
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
      addsTail: 'is new here; it is cloned in.',
      /** An Invoke change that runs here and changes nothing, said in its popover. */
      nothingHere: 'Runs here and finds nothing to change.',
      /** A resource the change runs on elsewhere, which this variant does not have. */
      lacksTail: 'is not in this variant.',
      /** A path the merge protects: "`limits.memory` is kept on merge at `1Gi`". */
      keptOnMerge: 'is kept on merge',
      /** A value the variant set itself: "Local override keeps `limits.memory` at `1Gi`". */
      localOverrideKeeps: 'Local override keeps',
      /** Any other reason the server gives. */
      keeps: 'Keeps',
      moreLabel: (n: number) => `+${n}, ${n} more ${n === 1 ? 'variant' : 'variants'}`,
      outsideText: 'on no stage',
      outsideLine: 'is on no stage of',
      at: 'at',
      baseWrites: 'base writes',
      more: (n: number) => `${n} more ${n === 1 ? 'variant' : 'variants'}`,
    },

    workflow: {
      title: (component: string) => `${component} policy`,
      requiredMetric: 'Workflow required',
      allowed: (slugs: string) => `Allowed: ${slugs}`,
    },

    scope: {
      title: 'Scope',
      all: (n: number) => `All ${n}`,
      asLastTime: 'As last time',
      selected: (n: number) => `${n} selected`,
      noRegion: 'no Region label',
      /** The last variant in scope cannot be unticked. */
      oneAtLeast: 'At least one variant',
      noStage: 'no Stage label',
    },

    updateType: {
      title: 'Update type',
      UpgradeUnit: 'Clone lineage',
      MergeUnits: 'Any merge Link',
    },

    /** Beside Create, what holds the first problem: "↑ Fix the name". */
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
      /** What the live region says while there is no count to give: "Dry run: nothing changes yet". */
      sentenceIdle: (text: string) => `Dry run: ${text.charAt(0).toLowerCase()}${text.slice(1)}`,
      kindWord: {
        same: 'same change',
        differs: 'differs',
        adds: 'adds resources',
        unknown: 'could not be established',
        nothing: 'nothing to change here',
      },
      /** A stage bar with no outcome yet, read out: "dev, 1 variant, nothing yet". */
      stageIdle: (name: string, count: number) => `${name}, ${count === 1 ? '1 variant' : `${count} variants`}, nothing yet`,
    },
  },
} as const;
