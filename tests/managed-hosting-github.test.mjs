import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGitHubAppDefaultPermissions,
  createGitHubWebhookDedupeKey,
  createRepositoryAccessBindingKey,
  evaluateRepositoryAccessPreflight,
  validateGitHubRepositoryAccessBinding,
  validateGitHubWebhookEnvelope
} from '../packages/managed-hosting/dist/index.js';

test('managed-hosting GitHub helpers validate webhook envelopes and preflight results', () => {
  const envelope = validateGitHubWebhookEnvelope({
    provider: 'github',
    deliveryId: 'del_123',
    eventType: 'installation',
    action: 'created',
    installationId: 123,
    repository: {
      fullName: 'Acme/Infra-Registry',
      nodeId: 'R_kgDOExample',
      defaultBranch: 'main',
      isPrivate: true
    }
  });
  const binding = validateGitHubRepositoryAccessBinding({
    installationId: 123,
    repositoryFullName: 'Acme/Infra-Registry',
    repositoryNodeId: 'R_kgDOExample',
    defaultRef: 'refs/heads/main',
    registryPath: './registry/',
    accessStatus: 'reachable'
  });
  const preflight = evaluateRepositoryAccessPreflight({
    repositoryReachable: true,
    manifestPresent: true,
    registryPathPresent: true,
    validateDryRunSucceeded: true
  });

  assert.equal(envelope.ok, true);
  assert.equal(binding.ok, true);
  assert.deepEqual(createGitHubAppDefaultPermissions(), { contents: 'read', metadata: 'read' });
  assert.equal(
    createGitHubWebhookDedupeKey({ provider: 'github', deliveryId: 'del_123' }),
    'github:del_123'
  );
  assert.equal(
    createRepositoryAccessBindingKey({
      installationId: 123,
      repositoryFullName: 'Acme/Infra-Registry',
      registryPath: './registry/'
    }),
    '123:acme/infra-registry:registry'
  );
  assert.deepEqual(preflight, {
    kind: 'ok',
    repositoryReachable: true,
    manifestPresent: true,
    registryPathPresent: true,
    validateDryRunSucceeded: true,
    reasonCodes: []
  });
});

test('managed-hosting GitHub validators reject invalid bindings', () => {
  const envelope = validateGitHubWebhookEnvelope({
    provider: 'github',
    deliveryId: '',
    eventType: 'unknown',
    installationId: 0,
    repository: {
      fullName: 'missing-slash',
      nodeId: '',
      defaultBranch: '',
      isPrivate: 'yes'
    }
  });

  assert.equal(envelope.ok, false);
  if (envelope.ok) {
    assert.fail('expected invalid webhook envelope');
  }
  assert.match(
    envelope.issues.map((issue) => `${issue.path}:${issue.message}`).join('\n'),
    /webhook\.eventType/u
  );
});
