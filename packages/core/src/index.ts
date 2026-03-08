/// <reference path="./node-shims.d.ts" />
import type { Diagnostics, EntityRecord } from '@ledra/types';
import { IMPLEMENTATION_ORDER } from '@ledra/types';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

export const packageName = '@ledra/core';

const DEFAULT_ENTITIES: readonly EntityRecord[] = [
  {
    id: 'intro',
    type: 'doc',
    title: 'Getting Started',
    summary: 'Entry point document.',
    tags: ['guide'],
    relations: [{ type: 'references', targetId: 'schema-overview' }]
  },
  {
    id: 'schema-overview',
    type: 'doc',
    title: 'Schema Overview',
    tags: ['reference'],
    relations: []
  }
];

export const createReadOnlyRepository = (
  entities: readonly EntityRecord[] = DEFAULT_ENTITIES
) => {
  const frozen = entities.map((entity) =>
    Object.freeze({
      ...entity,
      relations: [...entity.relations],
      tags: [...entity.tags]
    })
  );

  return Object.freeze({
    listTypes: (): readonly string[] => [...new Set(frozen.map((entry) => entry.type))].sort((a, b) => a.localeCompare(b)),
    listEntities: (): readonly EntityRecord[] => frozen,
    findEntity: (type: string, id: string): EntityRecord | undefined =>
      frozen.find((entry) => entry.type === type && entry.id === id),
    listRelations: () =>
      frozen.flatMap((source) =>
        source.relations.map((relation) => ({
          sourceType: source.type,
          sourceId: source.id,
          relationType: relation.type,
          targetId: relation.targetId
        }))
      ),
    diagnostics: (): Diagnostics => ({
      implementationOrder: IMPLEMENTATION_ORDER,
      readOnly: true,
      entityCount: frozen.length,
      sourceFilePaths: frozen
        .map((entity) => entity.sourceFilePath)
        .filter((path): path is string => typeof path === 'string')
    })
  });
};

const collectRegistryFiles = (registryPath: string): readonly string[] => {
  const queue = [registryPath];
  const files: string[] = [];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (currentPath === undefined) {
      continue;
    }

    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
      } else if (entry.isFile()) {
        const extension = extname(entry.name).toLowerCase();
        if (extension === '.json') {
          files.push(entryPath);
        }
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
};

const isEntityRecord = (value: unknown): value is Pick<EntityRecord, 'id' | 'type' | 'title'> & Partial<EntityRecord> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<EntityRecord>;
  return typeof candidate.id === 'string' && typeof candidate.type === 'string' && typeof candidate.title === 'string';
};

const normalizeEntity = (entity: Pick<EntityRecord, 'id' | 'type' | 'title'> & Partial<EntityRecord>): EntityRecord => {
  const normalized: EntityRecord = {
    id: entity.id,
    type: entity.type,
    title: entity.title,
    tags: Array.isArray(entity.tags) ? entity.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    relations: Array.isArray(entity.relations)
      ? entity.relations.filter(
          (relation): relation is { type: string; targetId: string } =>
            typeof relation === 'object' &&
            relation !== null &&
            typeof (relation as { type?: unknown }).type === 'string' &&
            typeof (relation as { targetId?: unknown }).targetId === 'string'
        )
      : []
  };

  if (typeof entity.summary === 'string') {
    normalized.summary = entity.summary;
  }

  if (typeof entity.sourceFilePath === 'string') {
    normalized.sourceFilePath = entity.sourceFilePath;
  }

  return normalized;
};

const parseEntityDocument = (document: unknown): readonly EntityRecord[] => {
  if (Array.isArray(document)) {
    return document.filter(isEntityRecord).map(normalizeEntity);
  }

  if (typeof document === 'object' && document !== null && 'entities' in document) {
    const entities = (document as { entities?: unknown }).entities;
    if (Array.isArray(entities)) {
      return entities.filter(isEntityRecord).map(normalizeEntity);
    }
  }

  return isEntityRecord(document) ? [normalizeEntity(document)] : [];
};

export const createReadOnlyRepositoryFromFileSystem = (registryPath: string) => {
  const entities = collectRegistryFiles(registryPath).flatMap((filePath) => {
    const document = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    const sourceFilePath = relative(registryPath, filePath);
    return parseEntityDocument(document).map((entity) => ({ ...entity, sourceFilePath }));
  });

  return createReadOnlyRepository(entities);
};

export type ReadOnlyRepository = ReturnType<typeof createReadOnlyRepository>;
