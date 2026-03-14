import type { ValidationIssue, ValidationResult } from './contracts.js';
import {
  DEFAULT_REF_PATTERN,
  REGISTRY_PATH_PATTERN,
  REPOSITORY_PATTERN,
  normalizeManagedHostingRegistryPath
} from './patterns.js';

export const GITHUB_APP_PERMISSION_LEVELS = ['none', 'read', 'write'] as const;
export const GITHUB_APP_EVENT_TYPES = [
  'installation',
  'installation_repositories',
  'push',
  'repository',
  'ping'
] as const;
export const GITHUB_APP_ACCESS_STATUSES = ['reachable', 'unreachable', 'revoked'] as const;
export const PREFLIGHT_RESULT_KINDS = ['ok', 'action_required', 'failed'] as const;

export type GitHubAppPermissionLevel = (typeof GITHUB_APP_PERMISSION_LEVELS)[number];
export type GitHubAppEventType = (typeof GITHUB_APP_EVENT_TYPES)[number];
export type GitHubAppAccessStatus = (typeof GITHUB_APP_ACCESS_STATUSES)[number];
export type PreflightResultKind = (typeof PREFLIGHT_RESULT_KINDS)[number];

export type GitHubAppPermissionSet = {
  contents: GitHubAppPermissionLevel;
  metadata: GitHubAppPermissionLevel;
  pullRequests?: GitHubAppPermissionLevel;
  checks?: GitHubAppPermissionLevel;
};

export type GitHubWebhookEnvelope = {
  provider: 'github';
  deliveryId: string;
  eventType: GitHubAppEventType;
  action?: string;
  installationId: number;
  repository: {
    fullName: string;
    nodeId: string;
    defaultBranch: string;
    isPrivate: boolean;
  };
};

export type GitHubRepositoryAccessBinding = {
  installationId: number;
  repositoryFullName: string;
  repositoryNodeId: string;
  defaultRef: string;
  registryPath: string;
  accessStatus: GitHubAppAccessStatus;
};

export type RepositoryAccessPreflight = {
  kind: PreflightResultKind;
  repositoryReachable: boolean;
  manifestPresent: boolean;
  registryPathPresent: boolean;
  validateDryRunSucceeded: boolean;
  reasonCodes: readonly string[];
};

type RecordLike = Record<string, unknown>;

const isRecordLike = (value: unknown): value is RecordLike =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pushIssue = (issues: ValidationIssue[], path: string, message: string): void => {
  issues.push({ path, message });
};

const readString = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  pattern?: RegExp,
  message = 'Expected a non-empty string.'
): string | undefined => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    pushIssue(issues, path, message);
    return undefined;
  }
  const normalized = value.trim();
  if (pattern !== undefined && !pattern.test(normalized)) {
    pushIssue(issues, path, 'Value does not match the required pattern.');
  }
  return normalized;
};

const readBoolean = (
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): boolean | undefined => {
  if (typeof value !== 'boolean') {
    pushIssue(issues, path, 'Expected a boolean.');
    return undefined;
  }
  return value;
};

const readInteger = (
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): number | undefined => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    pushIssue(issues, path, 'Expected an integer greater than or equal to 1.');
    return undefined;
  }
  return value;
};

const finish = <T>(issues: ValidationIssue[], value: T): ValidationResult<T> =>
  issues.length === 0 ? { ok: true, value } : { ok: false, issues };

export const normalizeGitHubRepositoryFullName = (repositoryFullName: string): string => {
  if (!REPOSITORY_PATTERN.test(repositoryFullName.trim())) {
    throw new Error('repositoryFullName: Expected owner/repository format.');
  }
  return repositoryFullName.trim().toLowerCase();
};

export const createGitHubWebhookDedupeKey = (
  envelope: Pick<GitHubWebhookEnvelope, 'provider' | 'deliveryId'>
): string => {
  if (envelope.provider !== 'github') {
    throw new Error('provider: Expected github.');
  }
  if (typeof envelope.deliveryId !== 'string' || envelope.deliveryId.trim().length === 0) {
    throw new Error('deliveryId: Expected a non-empty string.');
  }
  return `${envelope.provider}:${envelope.deliveryId.trim()}`;
};

export const validateGitHubWebhookEnvelope = (
  value: unknown
): ValidationResult<GitHubWebhookEnvelope> => {
  const issues: ValidationIssue[] = [];
  if (!isRecordLike(value)) {
    return { ok: false, issues: [{ path: 'webhook', message: 'Expected an object.' }] };
  }

  const provider = value.provider;
  if (provider !== 'github') {
    pushIssue(issues, 'webhook.provider', 'Expected github.');
  }

  const deliveryId = readString(value.deliveryId, 'webhook.deliveryId', issues);
  const rawEventType = readString(value.eventType, 'webhook.eventType', issues);
  const eventType = GITHUB_APP_EVENT_TYPES.includes(rawEventType as GitHubAppEventType)
    ? (rawEventType as GitHubAppEventType)
    : undefined;
  if (rawEventType !== undefined && eventType === undefined) {
    pushIssue(issues, 'webhook.eventType', 'Expected a supported GitHub App event type.');
  }

  const installationId = readInteger(value.installationId, 'webhook.installationId', issues) ?? 0;
  const action =
    value.action === undefined ? undefined : readString(value.action, 'webhook.action', issues);

  const repository = isRecordLike(value.repository) ? value.repository : undefined;
  if (repository === undefined) {
    pushIssue(issues, 'webhook.repository', 'Expected an object.');
  }

  const fullName = repository
    ? readString(repository.fullName, 'webhook.repository.fullName', issues, REPOSITORY_PATTERN)
    : undefined;
  const nodeId = repository
    ? readString(repository.nodeId, 'webhook.repository.nodeId', issues)
    : undefined;
  const defaultBranch = repository
    ? readString(repository.defaultBranch, 'webhook.repository.defaultBranch', issues)
    : undefined;
  const isPrivate = repository
    ? readBoolean(repository.isPrivate, 'webhook.repository.isPrivate', issues)
    : undefined;

  return finish(issues, {
    provider: 'github',
    deliveryId: deliveryId ?? '',
    eventType: eventType ?? 'ping',
    ...(action === undefined ? {} : { action }),
    installationId,
    repository: {
      fullName: fullName ?? '',
      nodeId: nodeId ?? '',
      defaultBranch: defaultBranch ?? '',
      isPrivate: isPrivate ?? false
    }
  });
};

export const validateGitHubRepositoryAccessBinding = (
  value: unknown
): ValidationResult<GitHubRepositoryAccessBinding> => {
  const issues: ValidationIssue[] = [];
  if (!isRecordLike(value)) {
    return { ok: false, issues: [{ path: 'binding', message: 'Expected an object.' }] };
  }

  const installationId = readInteger(value.installationId, 'binding.installationId', issues) ?? 0;
  const repositoryFullName =
    readString(
      value.repositoryFullName,
      'binding.repositoryFullName',
      issues,
      REPOSITORY_PATTERN
    ) ?? '';
  const repositoryNodeId =
    readString(value.repositoryNodeId, 'binding.repositoryNodeId', issues) ?? '';
  const defaultRef =
    readString(value.defaultRef, 'binding.defaultRef', issues, DEFAULT_REF_PATTERN) ?? '';
  const registryPath =
    readString(value.registryPath, 'binding.registryPath', issues, REGISTRY_PATH_PATTERN) ?? '';
  const rawAccessStatus = readString(value.accessStatus, 'binding.accessStatus', issues);
  const accessStatus = GITHUB_APP_ACCESS_STATUSES.includes(rawAccessStatus as GitHubAppAccessStatus)
    ? (rawAccessStatus as GitHubAppAccessStatus)
    : undefined;
  if (rawAccessStatus !== undefined && accessStatus === undefined) {
    pushIssue(issues, 'binding.accessStatus', 'Expected a supported access status.');
  }

  return finish(issues, {
    installationId,
    repositoryFullName: repositoryFullName.toLowerCase(),
    repositoryNodeId,
    defaultRef,
    registryPath: normalizeManagedHostingRegistryPath(registryPath),
    accessStatus: accessStatus ?? 'reachable'
  });
};

export const createRepositoryAccessBindingKey = (
  binding: Pick<
    GitHubRepositoryAccessBinding,
    'installationId' | 'repositoryFullName' | 'registryPath'
  >
): string => {
  const repositoryFullName = normalizeGitHubRepositoryFullName(binding.repositoryFullName);
  if (!Number.isInteger(binding.installationId) || binding.installationId < 1) {
    throw new Error('installationId: Expected an integer greater than or equal to 1.');
  }
  if (!REGISTRY_PATH_PATTERN.test(binding.registryPath)) {
    throw new Error(
      'registryPath: Expected a relative path without parent traversal or duplicate separators.'
    );
  }
  return `${binding.installationId}:${repositoryFullName}:${normalizeManagedHostingRegistryPath(binding.registryPath)}`;
};

export const createRepositoryNodeIdentityKey = (repositoryNodeId: string): string => {
  if (typeof repositoryNodeId !== 'string' || repositoryNodeId.trim().length === 0) {
    throw new Error('repositoryNodeId: Expected a non-empty string.');
  }
  return repositoryNodeId.trim();
};

export const evaluateRepositoryAccessPreflight = (
  checks: Omit<RepositoryAccessPreflight, 'kind' | 'reasonCodes'>
): RepositoryAccessPreflight => {
  const reasonCodes: string[] = [];
  if (!checks.repositoryReachable) {
    reasonCodes.push('repository_unreachable');
  }
  if (!checks.manifestPresent) {
    reasonCodes.push('manifest_missing');
  }
  if (!checks.registryPathPresent) {
    reasonCodes.push('registry_path_missing');
  }
  if (!checks.validateDryRunSucceeded) {
    reasonCodes.push('validate_preflight_failed');
  }

  if (reasonCodes.length === 0) {
    return { kind: 'ok', ...checks, reasonCodes };
  }

  return {
    kind: checks.repositoryReachable ? 'action_required' : 'failed',
    ...checks,
    reasonCodes
  };
};

export const createGitHubAppDefaultPermissions = (): GitHubAppPermissionSet => ({
  contents: 'read',
  metadata: 'read'
});
