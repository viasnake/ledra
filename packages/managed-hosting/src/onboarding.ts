import { ONBOARDING_LIFECYCLE_STATES, type OnboardingLifecycleState } from './constants.js';
import type { GitHubWebhookEnvelope, RepositoryAccessPreflight } from './github.js';

export const ONBOARDING_REASON_CODES = [
  'installation_detected',
  'repository_unreachable',
  'manifest_missing',
  'registry_path_missing',
  'validate_preflight_failed',
  'slug_conflict',
  'repo_binding_conflict',
  'hostname_conflict',
  'cloudflare_target_conflict',
  'control_commit_failed',
  'internal_failure',
  'access_revoked'
] as const;

export const ONBOARDING_EVENT_KINDS = [
  'installation_detected',
  'access_validated',
  'manifest_validated',
  'uniqueness_validated',
  'provisioning_completed',
  'control_state_committed',
  'initial_reconcile_queued',
  'action_required',
  'conflict_detected',
  'failed',
  'access_revoked',
  'retry_requested'
] as const;

export type OnboardingReasonCode = (typeof ONBOARDING_REASON_CODES)[number];
export type OnboardingEventKind = (typeof ONBOARDING_EVENT_KINDS)[number];

export type OnboardingAttempt = {
  attemptId: string;
  tenantSlug: string;
  state: OnboardingLifecycleState;
  repositoryFullName: string;
  installationId: number;
  lastReasonCode?: OnboardingReasonCode;
  retriable: boolean;
};

export type OnboardingEvent = {
  kind: OnboardingEventKind;
  reasonCode?: OnboardingReasonCode;
};

export type OnboardingStatusView = {
  state: OnboardingLifecycleState;
  blocked: boolean;
  retriable: boolean;
  reasonCode?: OnboardingReasonCode;
  suggestedAction: 'retry' | 'wait_for_customer' | 'investigate' | 'none';
};

const RETRIABLE_STATES = new Set<OnboardingLifecycleState>([
  'action_required',
  'failed',
  'conflict'
]);

const EVENT_TRANSITIONS: Record<
  OnboardingLifecycleState,
  Partial<Record<OnboardingEventKind, OnboardingLifecycleState>>
> = {
  detected: {
    installation_detected: 'access_validating'
  },
  access_validating: {
    access_validated: 'manifest_validating',
    access_revoked: 'action_required',
    failed: 'failed'
  },
  manifest_validating: {
    manifest_validated: 'uniqueness_checking',
    action_required: 'action_required',
    failed: 'failed'
  },
  uniqueness_checking: {
    uniqueness_validated: 'provisioning',
    conflict_detected: 'conflict',
    failed: 'failed'
  },
  provisioning: {
    provisioning_completed: 'control_state_committing',
    failed: 'failed'
  },
  control_state_committing: {
    control_state_committed: 'initial_reconcile_pending',
    failed: 'failed'
  },
  initial_reconcile_pending: {
    initial_reconcile_queued: 'active',
    failed: 'failed'
  },
  active: {
    access_revoked: 'action_required'
  },
  action_required: {
    retry_requested: 'access_validating'
  },
  conflict: {
    retry_requested: 'uniqueness_checking'
  },
  failed: {
    retry_requested: 'access_validating'
  }
};

export const isOnboardingState = (value: string): value is OnboardingLifecycleState =>
  ONBOARDING_LIFECYCLE_STATES.includes(value as OnboardingLifecycleState);

export const createOnboardingAttemptFromWebhook = (
  envelope: GitHubWebhookEnvelope,
  tenantSlug: string,
  attemptId: string
): OnboardingAttempt => ({
  attemptId,
  tenantSlug,
  state: 'detected',
  repositoryFullName: envelope.repository.fullName.toLowerCase(),
  installationId: envelope.installationId,
  retriable: false
});

export const transitionOnboardingAttempt = (
  attempt: OnboardingAttempt,
  event: OnboardingEvent
): OnboardingAttempt => {
  const nextState = EVENT_TRANSITIONS[attempt.state][event.kind];
  if (nextState === undefined) {
    throw new Error(`Invalid onboarding transition: ${attempt.state} -> ${event.kind}`);
  }

  return {
    ...attempt,
    state: nextState,
    retriable: RETRIABLE_STATES.has(nextState),
    ...(event.reasonCode === undefined
      ? RETRIABLE_STATES.has(nextState)
        ? { lastReasonCode: attempt.lastReasonCode }
        : {}
      : { lastReasonCode: event.reasonCode })
  };
};

export const createOnboardingStatusView = (attempt: OnboardingAttempt): OnboardingStatusView => {
  const blocked =
    attempt.state === 'action_required' ||
    attempt.state === 'conflict' ||
    attempt.state === 'failed';
  const suggestedAction =
    attempt.state === 'action_required'
      ? 'wait_for_customer'
      : attempt.state === 'conflict' || attempt.state === 'failed'
        ? 'retry'
        : blocked
          ? 'investigate'
          : 'none';

  return {
    state: attempt.state,
    blocked,
    retriable: attempt.retriable,
    ...(blocked && attempt.lastReasonCode !== undefined
      ? { reasonCode: attempt.lastReasonCode }
      : {}),
    suggestedAction
  };
};

export const mapPreflightToOnboardingEvent = (
  preflight: RepositoryAccessPreflight
): OnboardingEvent => {
  if (preflight.kind === 'ok') {
    return { kind: 'manifest_validated' };
  }

  const reasonCode = (preflight.reasonCodes[0] ?? 'internal_failure') as OnboardingReasonCode;
  return {
    kind: preflight.kind === 'failed' ? 'failed' : 'action_required',
    reasonCode
  };
};
