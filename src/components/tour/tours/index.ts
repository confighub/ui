// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Tour content. Each chapter module calls `defineTour` at module scope, so
 * listing it here is what registers it.
 *
 * Six tours are launched independently — the guided tour used to be one
 * continuous 55-step flow, but users reacted badly to that, so it is split
 * back into chapter 1 (`getting-started`) plus one short tour per remaining
 * chapter group, with "field ownership + a prod variant" later split again
 * into its own two (chapters 9-10, then chapter 11) once it had grown to a
 * quarter of the whole sequence with no stopping point. Each later tour
 * picks up state the previous one left behind (e.g. the "cubbychat"
 * component), so its first step names the earlier tour to take if the
 * anchors it needs are not there yet.
 */
export { GETTING_STARTED_TOUR_ID, gettingStartedTour } from './gettingStartedTour';
export { EXPLORE_AND_INSPECT_TOUR_ID, exploreAndInspectTour } from './chapters/exploreAndInspect';
export { DEPLOY_AND_RELEASE_TOUR_ID, deployAndReleaseTour } from './chapters/deployAndRelease';
export { CHANGE_AND_PROMOTE_TOUR_ID, changeAndPromoteTour } from './chapters/changeAndPromote';
export { OWNERSHIP_AND_PROD_TOUR_ID, ownershipAndProdTour } from './chapters/ownershipAndProd';
export { PROD_AND_NEXT_TOUR_ID, prodAndNextTour } from './chapters/ownershipAndProd';
