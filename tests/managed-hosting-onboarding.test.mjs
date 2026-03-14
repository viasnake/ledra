import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOnboardingAttemptFromWebhook,
  createOnboardingStatusView,
  mapPreflightToOnboardingEvent,
  transitionOnboardingAttempt
} from '../packages/managed-hosting/dist/index.js';

test('managed-hosting onboarding state machine follows happy path', () => {
  const base = createOnboardingAttemptFromWebhook(
    {
      provider: 'github',
      deliveryId: 'del_1',
      eventType: 'installation',
      installationId: 123,
      repository: {
        fullName: 'acme/infra-registry',
        nodeId: 'R_kgDOExample',
        defaultBranch: 'main',
        isPrivate: true
      }
    },
    'acme',
    'onb_1'
  );

  const states = [
    transitionOnboardingAttempt(base, { kind: 'installation_detected' }),
    transitionOnboardingAttempt(
      transitionOnboardingAttempt(base, { kind: 'installation_detected' }),
      { kind: 'access_validated' }
    )
  ];

  let current = states[1];
  current = transitionOnboardingAttempt(
    current,
    mapPreflightToOnboardingEvent({
      kind: 'ok',
      repositoryReachable: true,
      manifestPresent: true,
      registryPathPresent: true,
      validateDryRunSucceeded: true,
      reasonCodes: []
    })
  );
  current = transitionOnboardingAttempt(current, { kind: 'uniqueness_validated' });
  current = transitionOnboardingAttempt(current, { kind: 'provisioning_completed' });
  current = transitionOnboardingAttempt(current, { kind: 'control_state_committed' });
  current = transitionOnboardingAttempt(current, { kind: 'initial_reconcile_queued' });

  assert.equal(current.state, 'active');
  assert.deepEqual(createOnboardingStatusView(current), {
    state: 'active',
    blocked: false,
    retriable: false,
    suggestedAction: 'none'
  });
});

test('managed-hosting onboarding produces blocked status for action required', () => {
  const attempt = {
    attemptId: 'onb_2',
    tenantSlug: 'acme',
    state: 'action_required',
    repositoryFullName: 'acme/infra-registry',
    installationId: 123,
    lastReasonCode: 'manifest_missing',
    retriable: true
  };

  assert.deepEqual(createOnboardingStatusView(attempt), {
    state: 'action_required',
    blocked: true,
    retriable: true,
    reasonCode: 'manifest_missing',
    suggestedAction: 'wait_for_customer'
  });
  assert.throws(
    () => transitionOnboardingAttempt(attempt, { kind: 'initial_reconcile_queued' }),
    /Invalid onboarding transition/u
  );
});

test('managed-hosting onboarding hides stale reason codes after recovery', () => {
  const retried = transitionOnboardingAttempt(
    {
      attemptId: 'onb_3',
      tenantSlug: 'acme',
      state: 'action_required',
      repositoryFullName: 'acme/infra-registry',
      installationId: 123,
      lastReasonCode: 'manifest_missing',
      retriable: true
    },
    { kind: 'retry_requested' }
  );

  const recovered = {
    ...retried,
    state: 'active',
    retriable: false
  };

  assert.deepEqual(createOnboardingStatusView(recovered), {
    state: 'active',
    blocked: false,
    retriable: false,
    suggestedAction: 'none'
  });
});
