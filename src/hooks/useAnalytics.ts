// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';
import { ANALYTICS_EVENTS } from '../utility/analytics-constants';
import type {
  EntityCreatedProperties,
  EntityBulkCreatedProperties,
  FeedbackSurveySubmittedProperties,
} from '../types/analytics';

/**
 * Custom hook for PostHog analytics
 * Provides type-safe event tracking methods
 *
 * NOTE: Tracking is disabled in development and test environments
 */
export function useAnalytics() {
  const posthog = usePostHog();

  // Disable tracking in development and test environments
  const isTrackingEnabled = import.meta.env.MODE === 'production';

  /**
   * Track entity creation event
   * @param properties - Event properties (non-sensitive data only)
   */
  const trackEntityCreated = useCallback(
    (properties: EntityCreatedProperties) => {
      if (isTrackingEnabled) {
        posthog.capture(ANALYTICS_EVENTS.ENTITY_CREATED, properties);
      }
    },
    [posthog, isTrackingEnabled]
  );

  /**
   * Track bulk entity creation event
   * @param properties - Event properties (non-sensitive data only)
   */
  const trackEntityBulkCreated = useCallback(
    (properties: EntityBulkCreatedProperties) => {
      if (isTrackingEnabled) {
        posthog.capture(ANALYTICS_EVENTS.ENTITY_BULK_CREATED, properties);
      }
    },
    [posthog, isTrackingEnabled]
  );

  const trackFeedbackSurveySubmitted = useCallback(
    (properties: FeedbackSurveySubmittedProperties) => {
      if (isTrackingEnabled) {
        posthog.capture(ANALYTICS_EVENTS.FEEDBACK_SURVEY_SUBMITTED, properties);
      }
    },
    [posthog, isTrackingEnabled]
  );

  return {
    trackEntityCreated,
    trackEntityBulkCreated,
    trackFeedbackSurveySubmitted,
  };
}
