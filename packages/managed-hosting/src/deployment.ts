import type { HostingControlOverride, TenantRevisionIdentity } from './contracts.js';

export const DEPLOYMENT_CHECK_KINDS = ['validate', 'package', 'health', 'metadata'] as const;
export const ROLLBACK_STRATEGIES = ['redeploy_artifact', 'rebuild_revision'] as const;
export const DEPLOYMENT_RECORD_STATUSES = ['pending', 'healthy', 'failed', 'rolled_back'] as const;

export type DeploymentCheckKind = (typeof DEPLOYMENT_CHECK_KINDS)[number];
export type RollbackStrategy = (typeof ROLLBACK_STRATEGIES)[number];
export type DeploymentRecordStatus = (typeof DEPLOYMENT_RECORD_STATUSES)[number];

export type TenantArtifactManifest = {
  artifactId: string;
  tenantId: string;
  tenantRevisionId: string;
  hash: string;
  location: string;
  createdAt: string;
};

export type DeploymentMetadataV3 = {
  product: 'Ledra';
  metadataSchemaVersion: 3;
  deploymentVersion: string;
  generatedAt: string;
  tenant: {
    id: string;
    slug: string;
  };
  engine: {
    version: string;
    repo: string;
    commitSha: string;
  };
  data: {
    repo: string;
    ref: string;
    commitSha: string;
    registryPath: string;
  };
  control: {
    repo: string;
    commitSha: string;
    overrideApplied: boolean;
  };
  bundle: {
    path: '/bundle.json';
    schemaVersion: number;
  };
};

export type DeploymentVerificationResult = {
  checks: Readonly<Record<DeploymentCheckKind, 'passed' | 'failed'>>;
  ok: boolean;
};

export type DeploymentRecord = {
  deploymentId: string;
  tenantRevisionId: string;
  customerRepoCommitSha: string;
  controlRepoCommitSha: string;
  platformVersion: string;
  status: DeploymentRecordStatus;
  artifactId?: string;
  overrideApplied: boolean;
};

export type RollbackCandidate = {
  deploymentId: string;
  tenantRevisionId: string;
  status: 'healthy' | 'failed' | 'rolled_back';
  artifactId?: string;
  artifactLocation?: string;
  customerRepoCommitSha: string;
  controlRepoCommitSha: string;
  platformVersion: string;
};

export type RollbackRequest =
  | {
      kind: 'deployment';
      targetDeploymentId: string;
    }
  | {
      kind: 'tenant_revision';
      targetTenantRevisionId: string;
    };

export type RollbackPlan = {
  strategy: RollbackStrategy;
  targetDeploymentId: string;
  targetTenantRevisionId: string;
  artifactId?: string;
  artifactLocation?: string;
};

export const createTenantRevisionId = (identity: TenantRevisionIdentity): string =>
  `${identity.tenantId}:${identity.customerRepoCommitSha}:${identity.controlRepoCommitSha}:${identity.platformVersion}`;

export const createDeploymentVerificationResult = (
  checks: Partial<Record<DeploymentCheckKind, 'passed' | 'failed'>>
): DeploymentVerificationResult => {
  const normalized: Record<DeploymentCheckKind, 'passed' | 'failed'> = {
    validate: checks.validate ?? 'failed',
    package: checks.package ?? 'failed',
    health: checks.health ?? 'failed',
    metadata: checks.metadata ?? 'failed'
  };

  return {
    checks: normalized,
    ok: Object.values(normalized).every((value) => value === 'passed')
  };
};

export const hasActiveOverride = (overrides: readonly HostingControlOverride[]): boolean =>
  overrides.length > 0;

export const createDeploymentMetadataV3 = (input: DeploymentMetadataV3): DeploymentMetadataV3 =>
  input;

export const selectRollbackPlan = (
  request: RollbackRequest,
  candidates: readonly RollbackCandidate[]
): RollbackPlan => {
  const target = candidates.find((candidate) =>
    request.kind === 'deployment'
      ? candidate.deploymentId === request.targetDeploymentId
      : candidate.tenantRevisionId === request.targetTenantRevisionId
  );

  if (target === undefined) {
    throw new Error('rollbackTarget: Unable to find a matching successful deployment candidate.');
  }
  if (target.status !== 'healthy' && target.status !== 'rolled_back') {
    throw new Error('rollbackTarget: Target deployment is not eligible for rollback.');
  }

  if (target.artifactId !== undefined && target.artifactLocation !== undefined) {
    return {
      strategy: 'redeploy_artifact',
      targetDeploymentId: target.deploymentId,
      targetTenantRevisionId: target.tenantRevisionId,
      artifactId: target.artifactId,
      artifactLocation: target.artifactLocation
    };
  }

  return {
    strategy: 'rebuild_revision',
    targetDeploymentId: target.deploymentId,
    targetTenantRevisionId: target.tenantRevisionId
  };
};
