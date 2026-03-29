/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./node-shims.d.ts" />

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { REGISTRY_LAYOUT } from '@cataloga/schemas';
import {
  IMPLEMENTATION_ORDER,
  type BuiltinEntityTypeName,
  type EntityRecord,
  type PolicyRecord,
  type RegistryDiagnostics,
  type RegistryGraph,
  type RelationRecord,
  type ViewRecord
} from '@cataloga/types';

export const packageName = '@cataloga/core';

type RecordLike = Record<string, unknown>;

const normalizePath = (filePath: string): string => filePath.replaceAll('\\', '/');

const REQUIRED_DIRECTORIES = [
  REGISTRY_LAYOUT.entitiesDirectory,
  REGISTRY_LAYOUT.relationsDirectory,
  REGISTRY_LAYOUT.viewsDirectory,
  REGISTRY_LAYOUT.policiesDirectory
] as const;

const isRecordLike = (value: unknown): value is RecordLike =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const asStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

const asBuiltinEntityType = (value: unknown): BuiltinEntityTypeName => {
  const normalized = asString(value);
  if (
    normalized === 'site' ||
    normalized === 'segment' ||
    normalized === 'vlan' ||
    normalized === 'prefix' ||
    normalized === 'allocation' ||
    normalized === 'host' ||
    normalized === 'service' ||
    normalized === 'dns_record'
  ) {
    return normalized;
  }

  return 'site';
};

const toAttributeRecord = (value: unknown): RecordLike => (isRecordLike(value) ? value : {});

const readStructuredFile = (filePath: string): unknown => {
  const content = readFileSync(filePath, 'utf8');
  const extension = extname(filePath).toLowerCase();

  return extension === '.json' ? JSON.parse(content) : loadYaml(content);
};

const listStructuredFiles = (directoryPath: string): string[] => {
  if (!existsSync(directoryPath)) {
    return [];
  }

  return readdirSync(directoryPath, { withFileTypes: true }).flatMap(
    (entry: { name: string; isDirectory: () => boolean }) => {
      const entryPath = join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return listStructuredFiles(entryPath);
      }

      const extension = extname(entry.name).toLowerCase();
      return extension === '.json' || extension === '.yaml' || extension === '.yml'
        ? [entryPath]
        : [];
    }
  );
};

const resolveRepositoryRoot = (registryRoot: string): string => resolve(registryRoot, '..');

const ensureCanonicalLayout = (registryRoot: string): void => {
  for (const directory of REQUIRED_DIRECTORIES) {
    if (!existsSync(join(registryRoot, directory))) {
      throw new Error(
        `Registry layout is invalid. Expected '${directory}' under '${normalizePath(registryRoot)}'.`
      );
    }
  }
};

const toEntityRecord = (value: unknown, sourceFilePath: string): EntityRecord => {
  const record = isRecordLike(value) ? value : {};

  return {
    kind: 'entity',
    id: asString(record.id) ?? '',
    type: asBuiltinEntityType(record.type),
    title: asString(record.title) ?? '',
    ...(asString(record.summary) === undefined ? {} : { summary: asString(record.summary) }),
    tags: asStringArray(record.tags),
    attributes: toAttributeRecord(record.attributes) as EntityRecord['attributes'],
    sourceFilePath
  } as EntityRecord;
};

const toRelationEndpoint = (value: unknown) => {
  const endpoint = isRecordLike(value) ? value : {};

  return {
    type: asBuiltinEntityType(endpoint.type),
    id: asString(endpoint.id) ?? ''
  };
};

const toRelationRecord = (value: unknown, sourceFilePath: string): RelationRecord => {
  const record = isRecordLike(value) ? value : {};
  const relation: RelationRecord = {
    kind: 'relation',
    id: asString(record.id) ?? '',
    type: asString(record.type) ?? '',
    source: toRelationEndpoint(record.source),
    target: toRelationEndpoint(record.target),
    sourceFilePath
  };

  const title = asString(record.title);
  const summary = asString(record.summary);
  if (title !== undefined) {
    relation.title = title;
  }
  if (summary !== undefined) {
    relation.summary = summary;
  }

  return relation;
};

const toViewRecord = (value: unknown, sourceFilePath: string): ViewRecord => {
  const record = isRecordLike(value) ? value : {};
  const entityTypes = asStringArray(record.entityTypes).map((entry) => asBuiltinEntityType(entry));
  const view: ViewRecord = {
    kind: 'view',
    id: asString(record.id) ?? '',
    title: asString(record.title) ?? '',
    entityTypes,
    sourceFilePath
  };
  const summary = asString(record.summary);
  const query = asString(record.query);
  if (summary !== undefined) {
    view.summary = summary;
  }
  if (query !== undefined) {
    view.query = query;
  }

  return view;
};

const toAllowedTargetTypes = (value: unknown): readonly BuiltinEntityTypeName[] =>
  asStringArray(value).map((entry) => asBuiltinEntityType(entry));

const toPolicyRecord = (value: unknown, sourceFilePath: string): PolicyRecord => {
  const record = isRecordLike(value) ? value : {};
  const rawRules = Array.isArray(record.rules) ? record.rules : [];
  const policy: PolicyRecord = {
    kind: 'policy',
    id: asString(record.id) ?? '',
    title: asString(record.title) ?? '',
    rules: rawRules.flatMap((rule) => {
      if (!isRecordLike(rule)) {
        return [];
      }

      const normalizedCode = asString(rule.code);
      const normalizedRule: PolicyRecord['rules'][number] = {
        code:
          normalizedCode === 'require-tag' ||
          normalizedCode === 'require-attribute' ||
          normalizedCode === 'allowed-relation'
            ? normalizedCode
            : 'require-tag'
      };
      const targetType = asString(rule.targetType);
      const field = asString(rule.field);
      const valueText = asString(rule.value);
      const relationType = asString(rule.relationType);
      const allowedTargetTypes = toAllowedTargetTypes(rule.allowedTargetTypes);
      const message = asString(rule.message);

      if (targetType !== undefined) {
        normalizedRule.targetType = asBuiltinEntityType(targetType);
      }
      if (field !== undefined) {
        normalizedRule.field = field;
      }
      if (valueText !== undefined) {
        normalizedRule.value = valueText;
      }
      if (relationType !== undefined) {
        normalizedRule.relationType = relationType;
      }
      if (allowedTargetTypes.length > 0) {
        normalizedRule.allowedTargetTypes = allowedTargetTypes;
      }
      if (message !== undefined) {
        normalizedRule.message = message;
      }

      return [normalizedRule];
    }),
    sourceFilePath
  };
  const summary = asString(record.summary);
  if (summary !== undefined) {
    policy.summary = summary;
  }

  return policy;
};

const createDiagnostics = (graph: RegistryGraph): RegistryDiagnostics => ({
  implementationOrder: IMPLEMENTATION_ORDER,
  readOnly: true,
  schemaVersion: 1,
  counts: {
    entities: graph.entities.length,
    relations: graph.relations.length,
    views: graph.views.length,
    policies: graph.policies.length
  },
  sourceFilePaths: [
    ...new Set(
      [...graph.entities, ...graph.relations, ...graph.views, ...graph.policies]
        .map((record) => record.sourceFilePath)
        .sort((left, right) => left.localeCompare(right))
    )
  ]
});

const sortGraph = (graph: RegistryGraph): RegistryGraph => ({
  ...graph,
  entities: [...graph.entities].sort((left, right) =>
    left.type === right.type ? left.id.localeCompare(right.id) : left.type.localeCompare(right.type)
  ),
  relations: [...graph.relations].sort((left, right) => left.id.localeCompare(right.id)),
  views: [...graph.views].sort((left, right) => left.id.localeCompare(right.id)),
  policies: [...graph.policies].sort((left, right) => left.id.localeCompare(right.id))
});

export const createRegistryGraph = (
  graph: Omit<RegistryGraph, 'kind' | 'schemaVersion'>
): RegistryGraph =>
  sortGraph({
    kind: 'registry-graph',
    schemaVersion: 1,
    entities: graph.entities,
    relations: graph.relations,
    views: graph.views,
    policies: graph.policies
  });

export const loadRegistryFromFs = (registryRoot: string) => {
  const absoluteRegistryRoot = resolve(registryRoot);
  ensureCanonicalLayout(absoluteRegistryRoot);
  const repositoryRoot = resolveRepositoryRoot(absoluteRegistryRoot);

  const toSourceFilePath = (filePath: string) => normalizePath(relative(repositoryRoot, filePath));
  const graph = createRegistryGraph({
    entities: listStructuredFiles(
      join(absoluteRegistryRoot, REGISTRY_LAYOUT.entitiesDirectory)
    ).map((filePath) => toEntityRecord(readStructuredFile(filePath), toSourceFilePath(filePath))),
    relations: listStructuredFiles(
      join(absoluteRegistryRoot, REGISTRY_LAYOUT.relationsDirectory)
    ).map((filePath) => toRelationRecord(readStructuredFile(filePath), toSourceFilePath(filePath))),
    views: listStructuredFiles(join(absoluteRegistryRoot, REGISTRY_LAYOUT.viewsDirectory)).map(
      (filePath) => toViewRecord(readStructuredFile(filePath), toSourceFilePath(filePath))
    ),
    policies: listStructuredFiles(
      join(absoluteRegistryRoot, REGISTRY_LAYOUT.policiesDirectory)
    ).map((filePath) => toPolicyRecord(readStructuredFile(filePath), toSourceFilePath(filePath)))
  });

  return createReadOnlyRepository(graph);
};

export const createReadOnlyRepository = (graph: RegistryGraph) => {
  const diagnostics = createDiagnostics(graph);
  const frozenGraph = Object.freeze({
    ...graph,
    entities: Object.freeze([...graph.entities]),
    relations: Object.freeze([...graph.relations]),
    views: Object.freeze([...graph.views]),
    policies: Object.freeze([...graph.policies])
  });

  return Object.freeze({
    graph: (): RegistryGraph => frozenGraph,
    listTypes: (): readonly BuiltinEntityTypeName[] =>
      [...new Set(frozenGraph.entities.map((entity) => entity.type))].sort((left, right) =>
        left.localeCompare(right)
      ) as readonly BuiltinEntityTypeName[],
    listEntities: (): readonly EntityRecord[] => frozenGraph.entities,
    findEntity: (type: BuiltinEntityTypeName, id: string): EntityRecord | undefined =>
      frozenGraph.entities.find((entity) => entity.type === type && entity.id === id),
    listRelations: (): readonly RelationRecord[] => frozenGraph.relations,
    listViews: (): readonly ViewRecord[] => frozenGraph.views,
    listPolicies: (): readonly PolicyRecord[] => frozenGraph.policies,
    diagnostics: (): RegistryDiagnostics => diagnostics
  });
};

export type ReadOnlyRepository = ReturnType<typeof createReadOnlyRepository>;

export {
  createCatalogaRuntime,
  defaultConfigPath,
  loadRuntimeConfig,
  type CatalogaRuntime,
  type CatalogaRuntimeConfig
} from './runtime.js';
