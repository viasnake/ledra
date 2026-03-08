export const packageName = '@ledra/types';

export const IMPLEMENTATION_ORDER = [
  'packages/types',
  'packages/schemas',
  'packages/core',
  'packages/validator',
  'packages/bundle',
  'packages/search',
  'apps/cli',
  'apps/api',
  'apps/web'
] as const;

export type ImplementationTarget = (typeof IMPLEMENTATION_ORDER)[number];

export type EntityRecord = {
  id: string;
  type: string;
  title: string;
  summary?: string;
  tags: readonly string[];
  relations: readonly EntityRelation[];
  sourceFilePath?: string;
};

export type EntityRelation = {
  type: string;
  targetId: string;
};

export type LedraBundle = {
  kind: 'static-bundle';
  generatedAt: string;
  types: readonly string[];
  entities: readonly EntityRecord[];
};

export type ValidationIssueCode =
  | 'missing-id'
  | 'missing-type'
  | 'duplicate-entity-id'
  | 'duplicate-relation-id'
  | 'missing-reference'
  | 'invalid-relation-target'
  | 'prefix-overlap'
  | 'duplicate-allocation-ip'
  | 'duplicate-hostname'
  | 'duplicate-vlan-id-per-site'
  | 'gateway-outside-prefix';

export type ValidationIssue = {
  code: ValidationIssueCode;
  message: string;
  entityId?: string;
  sourceFilePath?: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: readonly ValidationIssue[];
};

export type Diagnostics = {
  implementationOrder: readonly ImplementationTarget[];
  readOnly: true;
  entityCount: number;
  sourceFilePaths: readonly string[];
};
