// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What became of a save.
 *
 * The arms exist so the page can never attribute a failure to the author's work
 * unless it knows that is what failed. Refused, superseded and unreachable are three
 * different situations with three different remedies -- edit it, decide whose version
 * wins, try again -- and collapsing them tells someone to go and fix an expression
 * that was never wrong.
 *
 * The discriminator is the HTTP status, never the message text. An error response
 * carries only `{"message": "..."}`: `errmap.HTTPErrorHandler` wraps the structured
 * `ResponseError` in an `echo.HTTPError` and serialises that instead, and
 * `echo.HTTPError` tags its `Code` `json:"-"`. So `ErrorCategory` -- which the server
 * does set to "conflict" -- never reaches us, and a branch on it could never be true.
 * Matching the message text instead is the fragility already living at
 * `confighubapi.ts:112`, and this file does not add a second instance of it.
 */

import { getApiErrorMessage } from '@/utility/error-functions';
import { SerializedError } from '@reduxjs/toolkit';
import { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import type { MappedWorkflow, WorkflowIdentity } from './mapping';

/** The version check is `vNew < vOld` in `internal/views/single_handlers.go:588`. */
const HTTP_CONFLICT = 409;

export type SaveOutcome =
  /**
   * `identity` carries the Version the server has now stored. Handing it back is what
   * begins the next edit session -- it is the only thing entitled to move a Version that
   * a draft is being saved against, and the reason it travels with the outcome rather
   * than being re-read is that a second read could return a different one.
   */
  | { kind: 'saved'; workflow: MappedWorkflow; identity: WorkflowIdentity }
  /**
   * The server understood the definition and refused it. Its message is specific and
   * already names the Stage it concerns -- `validateStageWhereSpace` attributes it --
   * so it is carried verbatim and rendered unframed.
   */
  | { kind: 'rejected'; message: string; status?: number }
  /**
   * Someone wrote after this copy was read. The definition may be perfectly good, so
   * this is a question about whose version survives and never an instruction to edit.
   */
  | { kind: 'conflict'; message: string; status?: number }
  /**
   * Nothing is known about the definition. The request did not arrive, did not
   * return, or returned something unreadable.
   */
  | { kind: 'failed'; message: string; status?: number };

/**
 * Whether the server reached a verdict about the CONTENT SENT, as opposed to failing to
 * reach one.
 *
 * A 400 or a 422 means it parsed the request and refused what was in it, which is the
 * author's to fix. Everything else -- a transport failure, a timeout, an unreadable
 * body, a server fault -- leaves the content UNJUDGED. Reporting those as a refusal
 * blames work that may be entirely correct, so nothing may treat them as one.
 *
 * THE CONSTRAINT THIS EXISTS TO HOLD: not every failure is a refusal, and only a
 * refusal may be attributed to the author's content. Collapsing this into a single
 * error branch is the DEFAULT SHAPE of the code -- it is what you get by treating "the
 * call did not succeed" as one category -- and it is wrong in the costly direction. A
 * transient failure read as a refusal accuses correct work, raises a fault, and blocks
 * a save that should have gone through, all without anything looking broken.
 *
 * Shared with selector resolution, which faces the same question and must answer it the
 * same way: one definition, so the two cannot drift into disagreeing about whether the
 * server actually said no.
 */
export function isContentRefusal(error: FetchBaseQueryError | SerializedError): boolean {
  if (!('status' in error) || typeof error.status !== 'number') return false;
  return error.status === 400 || error.status === 422;
}

/**
 * Classify a failed save.
 *
 * `status` is carried on every arm because it is the only structured thing an error
 * response has left by the time it reaches us, and discarding it would leave a caller
 * unable to tell cases apart that this function deliberately does not split.
 */
export function classifySaveError(error: FetchBaseQueryError | SerializedError): SaveOutcome {
  const message = getApiErrorMessage(error, 'The workflow could not be saved.');

  // A SerializedError, or one of RTK Query's own transport statuses -- FETCH_ERROR,
  // TIMEOUT_ERROR, PARSING_ERROR, CUSTOM_ERROR. None of them is a verdict on content.
  if (!('status' in error) || typeof error.status !== 'number') {
    return { kind: 'failed', message };
  }

  const status = error.status;
  if (status === HTTP_CONFLICT) return { kind: 'conflict', message, status };
  if (isContentRefusal(error)) return { kind: 'rejected', message, status };
  return { kind: 'failed', message, status };
}
