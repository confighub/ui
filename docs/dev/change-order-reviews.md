# Reviews on the ChangeOrder stage cards

> Read this before you change how a stage card on the ChangeOrder page shows a review. The code is
> in `src/pages/change-orders/` (`stage/` and `reviews/`). These rules are not a side effect of a
> filter or a layout. Keep them when you change the card, and keep the specs that test them:
> `tests/change-order-test-to-public-review.pure.spec.ts` and `tests/change-order-stage-rail.pure.spec.ts`.

The spec uses a two-stage workflow, Test → Public. The entry gate of Public needs Test to be
Released and Healthy, and an approval on the Test Revisions. The release gate of Public needs a
second approval, on the Public Revisions. These Revisions exist only after the promotion.

1. **A promotion review is on the card of the stage it gates.** The Public entry review is on the
   Public card, although its approvals are recorded in the Test Spaces. The reviewer approves
   where the promotion waits. The Test card shows the review read-only, with a link
   (`subjectReviews`). When the gated stage is promoted or released, no card shows the promotion
   review any more (`reviewActionStageId`, `PROMOTION_DONE`). One gate has one form on one card,
   so one person cannot record two decisions on the same Revisions.
2. **An open review comes before the other gates.** If a review is not yet satisfied, the card
   shows Approve and Reject before Healthy, Released or Promoted. The review box shows those
   other gates as context (`deriveStageCardState`). The server records an Attestation at any time,
   so the approval runs in parallel with the other gates. Do not make the reviewer wait for them.
   When the review is satisfied and other gates still hold the stage, the review box stays
   (`reviewApproved`). Its headline starts with "Approved." and names the gate that waits or
   failed. It says who approved, and for the viewer's own approval it offers "Change my
   decision". The state comes from the server's records, not from this browser, so it is the
   same after a reload. Without it, the approval seems lost. The stage rail agrees: a gate that
   only waits is "Waiting on `check/healthy`", not red (`railGateWait`).
3. **Combine reviews only when they read the same Spaces.** `combineGateReviews` joins summaries
   only when they have the same target stage, and the result does not change with their order.
   The two reviews of Public read different Spaces: the promotion review reads Test, and the
   release review reads Public. If you combine them, the Test approval shows as the decision on
   the release, and "Change my decision" revokes it.
4. **A revocation touches only the review's own records.** "Change my decision" and "Withdraw
   rejection" revoke only the records in `reviewRecordIds`. `planRevocations` marks every other
   record, and a record with no listed Space, as `unrevocable`. Then `runRevocations` writes
   nothing, and the UI shows why (`reviewCopy.confirm.unrevocable`). Never report success when a
   record was not revoked: the old decision then counts with the new one, or a rejection still
   holds the stage.
5. **`Completed` does not mean that the release gates are satisfied.** The server sets a
   ChangeOrder to `Completed` when its last stage satisfies the workflow's Final. It does not
   read release gates. With no Final, the ChangeOrder is `Completed` immediately after the
   promotion into Public, and the release review of Public must stay open, with Approve.
   `gateServerRowsOf` reads the release dry run for each Space that is not released. A Space
   whose read is loading or failed does not count as approved.
