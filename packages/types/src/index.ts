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
};

export type EntityRelation = {
  type: string;
  targetId: string;
};

export type LedraBundle = {
  generatedAt: string;
  types: readonly string[];
  entities: readonly EntityRecord[];
};

export type ValidationIssue = {
  code: 'missing-id' | 'missing-type' | 'invalid-relation-target';
  message: string;
  entityId?: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: readonly ValidationIssue[];
};

export type Diagnostics = {
  implementationOrder: readonly ImplementationTarget[];
  readOnly: true;
  entityCount: number;
};
