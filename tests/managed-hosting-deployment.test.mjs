import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeploymentMetadataV3,
  createDeploymentVerificationResult,
  createTenantRevisionId,
  selectRollbackPlan
} from '../packages/managed-hosting/dist/index.js';

test('managed-hosting deployment helpers create verification and rollback plans', () => {
  const verification = createDeploymentVerificationResult({
    validate: 'passed',
    package: 'passed',
    health: 'passed',
    metadata: 'passed'
  });
  const metadata = createDeploymentMetadataV3({
    product: 'Ledra',
    metadataSchemaVersion: 3,
    deploymentVersion: 'dep_1',
    generatedAt: '2026-03-14T12:00:00Z',
    tenant: {
      id: 'tnt_01HXYZABCDEFG',
      slug: 'acme'
    },
    engine: {
      version: 'v0.2.0',
      repo: 'viasnake/ledra',
      commitSha: 'abcdef1234567'
    },
    data: {
      repo: 'acme/infra-registry',
      ref: 'refs/heads/main',
      commitSha: '1234abc5678def',
      registryPath: 'registry'
    },
    control: {
      repo: 'operator/hosting-control',
      commitSha: 'fedcba7654321',
      overrideApplied: false
    },
    bundle: {
      path: '/bundle.json',
      schemaVersion: 1
    }
  });
  const plan = selectRollbackPlan({ kind: 'deployment', targetDeploymentId: 'dep_1' }, [
    {
      deploymentId: 'dep_1',
      tenantRevisionId: 'trv_1',
      status: 'healthy',
      artifactId: 'art_1',
      artifactLocation: 'r2://artifact-1',
      customerRepoCommitSha: '1234abc5678def',
      controlRepoCommitSha: 'fedcba7654321',
      platformVersion: 'v0.2.0'
    }
  ]);

  assert.equal(verification.ok, true);
  assert.equal(metadata.metadataSchemaVersion, 3);
  assert.equal(plan.strategy, 'redeploy_artifact');
  assert.equal(
    createTenantRevisionId({
      tenantId: 'tnt_01HXYZABCDEFG',
      customerRepoCommitSha: '1234abc5678def',
      controlRepoCommitSha: 'fedcba7654321',
      platformVersion: 'v0.2.0'
    }),
    'tnt_01HXYZABCDEFG:1234abc5678def:fedcba7654321:v0.2.0'
  );
});

test('managed-hosting deployment rollback falls back to rebuild when artifact is missing', () => {
  const plan = selectRollbackPlan({ kind: 'tenant_revision', targetTenantRevisionId: 'trv_2' }, [
    {
      deploymentId: 'dep_2',
      tenantRevisionId: 'trv_2',
      status: 'rolled_back',
      customerRepoCommitSha: '1234abc5678def',
      controlRepoCommitSha: 'fedcba7654321',
      platformVersion: 'v0.2.0'
    }
  ]);

  assert.equal(plan.strategy, 'rebuild_revision');
});
