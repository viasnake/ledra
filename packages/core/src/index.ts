/// <reference path="./node-shims.d.ts" />
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import type { Diagnostics, EntityRecord } from '@ledra/types';
import { IMPLEMENTATION_ORDER } from '@ledra/types';

export const packageName = '@ledra/core';

type RelationRecord = {
  sourceType: string;
  sourceId: string;
  relationType: string;
  targetId: string;
  sourceFilePath?: string;
};

type RawRelationRecord = {
  sourceType?: unknown;
  sourceId?: unknown;
  relationType?: unknown;
  type?: unknown;
  targetId?: unknown;
};

type RepositoryInput = {
  entities: readonly EntityRecord[];
  relations?: readonly RelationRecord[];
};

const normalizePath = (filePath: string): string => filePath.replaceAll('\\', '/');

const resolveRegistryDirectory = (registryRoot: string): string => {
  const absoluteRoot = resolve(registryRoot);
  const directEntitiesPath = join(absoluteRoot, 'entities');
  const directRelationsPath = join(absoluteRoot, 'relations');

  if (existsSync(directEntitiesPath) || existsSync(directRelationsPath)) {
    return absoluteRoot;
  }

  const nestedRegistryPath = join(absoluteRoot, 'registry');
  if (
    existsSync(join(nestedRegistryPath, 'entities')) ||
    existsSync(join(nestedRegistryPath, 'relations'))
  ) {
    return nestedRegistryPath;
  }

  return absoluteRoot;
};

const findRepositoryRoot = (registryRoot: string): string => {
  let current = resolve(registryRoot);
  let bestMatch: string | undefined;

  while (true) {
    if (existsSync(join(current, '.git')) || existsSync(join(current, 'pnpm-workspace.yaml'))) {
      bestMatch = current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return bestMatch ?? resolve(registryRoot, '..');
    }

    current = parent;
  }
};

const findDataFiles = (directoryPath: string): string[] => {
  if (!existsSync(directoryPath)) {
    return [];
  }

  return readdirSync(directoryPath, { withFileTypes: true }).flatMap(
    (entry: { name: string; isDirectory: () => boolean }) => {
      const entryPath = join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return findDataFiles(entryPath);
      }

      const extension = extname(entry.name).toLowerCase();
      return extension === '.json' || extension === '.yaml' || extension === '.yml'
        ? [entryPath]
        : [];
    }
  );
};

const parseScalar = (value: string): unknown => {
  const trimmed = value.trim();
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (trimmed === 'null') {
    return null;
  }
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && trimmed !== '') {
    return numeric;
  }
  return trimmed;
};

const parseSimpleYaml = (content: string): unknown => {
  const lines = content
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0 && !line.trimStart().startsWith('#'));

  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; value: unknown }> = [{ indent: -1, value: root }];

  for (const line of lines) {
    const indent = line.search(/\S/u);
    const trimmed = line.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.value;

    if (trimmed.startsWith('- ')) {
      if (!Array.isArray(parent)) {
        continue;
      }

      const itemText = trimmed.slice(2);
      if (itemText.includes(': ')) {
        const [itemKey = '', ...rest] = itemText.split(': ');
        const item: Record<string, unknown> = { [itemKey]: parseScalar(rest.join(': ')) };
        parent.push(item);
        stack.push({ indent, value: item });
      } else if (itemText.endsWith(':')) {
        const item: Record<string, unknown> = { [itemText.slice(0, -1)]: [] };
        parent.push(item);
        stack.push({ indent, value: item[itemText.slice(0, -1)] });
      } else {
        parent.push(parseScalar(itemText));
      }

      continue;
    }

    if (typeof parent !== 'object' || parent === null || Array.isArray(parent)) {
      continue;
    }

    const parentRecord = parent as Record<string, unknown>;

    if (trimmed.endsWith(':')) {
      const key = trimmed.slice(0, -1);
      parentRecord[key] = [];
      stack.push({ indent, value: parentRecord[key] });
      continue;
    }

    const [key = '', ...rest] = trimmed.split(': ');
    if (key.length === 0) {
      continue;
    }

    parentRecord[key] = parseScalar(rest.join(': '));
  }

  return root;
};

const parseDataFile = (filePath: string): unknown => {
  const fileContent = readFileSync(filePath, 'utf8');
  const extension = extname(filePath).toLowerCase();

  if (extension === '.json') {
    return JSON.parse(fileContent);
  }

  return parseSimpleYaml(fileContent);
};

const toEntityRecord = (data: unknown, sourceFilePath: string): EntityRecord => {
  const value = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  const relationsRaw = Array.isArray(value.relations) ? value.relations : [];

  return {
    id: typeof value.id === 'string' ? value.id : '',
    type: typeof value.type === 'string' ? value.type : '',
    title: typeof value.title === 'string' ? value.title : '',
    ...(typeof value.summary === 'string' ? { summary: value.summary } : {}),
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    relations: relationsRaw
      .map((relation) => {
        if (typeof relation !== 'object' || relation === null) {
          return undefined;
        }

        const relationRecord = relation as Record<string, unknown>;
        if (
          typeof relationRecord.type !== 'string' ||
          typeof relationRecord.targetId !== 'string'
        ) {
          return undefined;
        }

        return { type: relationRecord.type, targetId: relationRecord.targetId };
      })
      .filter((relation): relation is { type: string; targetId: string } => relation !== undefined),
    sourceFilePath
  };
};

const toRelationRecord = (data: unknown, sourceFilePath: string): RelationRecord | undefined => {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }

  const value = data as RawRelationRecord;
  const relationType =
    typeof value.relationType === 'string'
      ? value.relationType
      : typeof value.type === 'string'
        ? value.type
        : undefined;

  if (
    typeof value.sourceType !== 'string' ||
    typeof value.sourceId !== 'string' ||
    typeof relationType !== 'string' ||
    typeof value.targetId !== 'string'
  ) {
    return undefined;
  }

  return {
    sourceType: value.sourceType,
    sourceId: value.sourceId,
    relationType,
    targetId: value.targetId,
    sourceFilePath
  };
};

const normalizeCollections = ({
  entities,
  relations = []
}: RepositoryInput): Required<RepositoryInput> => {
  const entityMap = new Map<string, EntityRecord>();
  const relationMap = new Map<string, RelationRecord>();

  for (const entity of entities) {
    const entityKey = `${entity.type}::${entity.id}`;
    const dedupedRelations = entity.relations.filter(
      (candidate, index, allRelations) =>
        allRelations.findIndex(
          (entry) => entry.type === candidate.type && entry.targetId === candidate.targetId
        ) === index
    );

    const normalizedEntity: EntityRecord = {
      ...entity,
      tags: [...new Set(entity.tags)],
      relations: dedupedRelations
    };

    entityMap.set(entityKey, normalizedEntity);

    for (const relation of dedupedRelations) {
      relationMap.set(`${entity.type}::${entity.id}::${relation.type}::${relation.targetId}`, {
        sourceType: entity.type,
        sourceId: entity.id,
        relationType: relation.type,
        targetId: relation.targetId,
        ...(entity.sourceFilePath === undefined ? {} : { sourceFilePath: entity.sourceFilePath })
      });
    }
  }

  for (const relation of relations) {
    relationMap.set(
      `${relation.sourceType}::${relation.sourceId}::${relation.relationType}::${relation.targetId}`,
      relation
    );

    const entityKey = `${relation.sourceType}::${relation.sourceId}`;
    const existing = entityMap.get(entityKey);
    if (existing === undefined) {
      continue;
    }

    entityMap.set(entityKey, {
      ...existing,
      relations: [
        ...existing.relations,
        { type: relation.relationType, targetId: relation.targetId }
      ].filter(
        (candidate, index, allRelations) =>
          allRelations.findIndex(
            (entry) => entry.type === candidate.type && entry.targetId === candidate.targetId
          ) === index
      )
    });
  }

  return {
    entities: [...entityMap.values()].sort((left, right) =>
      left.type === right.type
        ? left.id.localeCompare(right.id)
        : left.type.localeCompare(right.type)
    ),
    relations: [...relationMap.values()].sort((left, right) =>
      left.sourceType === right.sourceType
        ? left.sourceId === right.sourceId
          ? left.relationType === right.relationType
            ? left.targetId.localeCompare(right.targetId)
            : left.relationType.localeCompare(right.relationType)
          : left.sourceId.localeCompare(right.sourceId)
        : left.sourceType.localeCompare(right.sourceType)
    )
  };
};

export const loadRegistryFromFs = (registryRoot: string) => {
  const absoluteRegistryRoot = resolveRegistryDirectory(registryRoot);
  const repositoryRoot = findRepositoryRoot(absoluteRegistryRoot);

  const entities = findDataFiles(join(absoluteRegistryRoot, 'entities')).map((filePath) =>
    toEntityRecord(parseDataFile(filePath), normalizePath(relative(repositoryRoot, filePath)))
  );
  const relations = findDataFiles(join(absoluteRegistryRoot, 'relations'))
    .map((filePath) =>
      toRelationRecord(parseDataFile(filePath), normalizePath(relative(repositoryRoot, filePath)))
    )
    .filter((relation): relation is RelationRecord => relation !== undefined);

  return createReadOnlyRepository(normalizeCollections({ entities, relations }));
};

export const createReadOnlyRepository = ({ entities, relations }: RepositoryInput) => {
  const normalizedRelations =
    relations ??
    entities.flatMap((entity) =>
      entity.relations.map((relation) => ({
        sourceType: entity.type,
        sourceId: entity.id,
        relationType: relation.type,
        targetId: relation.targetId,
        ...(entity.sourceFilePath === undefined ? {} : { sourceFilePath: entity.sourceFilePath })
      }))
    );

  const frozenEntities = entities.map((entity) =>
    Object.freeze({
      ...entity,
      relations: Object.freeze(entity.relations.map((relation) => Object.freeze({ ...relation }))),
      tags: Object.freeze([...entity.tags])
    })
  );
  const frozenRelations = normalizedRelations.map((relation) => Object.freeze({ ...relation }));

  return Object.freeze({
    listTypes: (): readonly string[] =>
      [...new Set(frozenEntities.map((entry) => entry.type))].sort((a, b) => a.localeCompare(b)),
    listEntities: (): readonly EntityRecord[] => frozenEntities,
    findEntity: (type: string, id: string): EntityRecord | undefined =>
      frozenEntities.find((entry) => entry.type === type && entry.id === id),
    listRelations: () => frozenRelations,
    diagnostics: (): Diagnostics => ({
      implementationOrder: IMPLEMENTATION_ORDER,
      readOnly: true,
      entityCount: frozenEntities.length,
      sourceFilePaths: [
        ...new Set(
          [...frozenEntities, ...frozenRelations]
            .map((entry) => entry.sourceFilePath)
            .filter((path): path is string => typeof path === 'string')
        )
      ]
    })
  });
};

export type ReadOnlyRepository = ReturnType<typeof createReadOnlyRepository>;
