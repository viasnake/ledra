import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import type { CanonicalEntity, CanonicalObservation, CanonicalRelation } from '@cataloga/schema';
import type {
  SourceAdapter,
  SourceCollectContext,
  SourceCollectResult
} from '@cataloga/source-contract';

export const packageName = '@cataloga/source-git';

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;

const asStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const readStructuredFile = (filePath: string): Record<string, unknown> => {
  const content = readFileSync(filePath, 'utf8');
  if (extname(filePath).toLowerCase() === '.json') {
    return asRecord(JSON.parse(content));
  }
  return asRecord(loadYaml(content));
};

const listFiles = (root: string): string[] => {
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { withFileTypes: true }).flatMap(
    (entry: { isDirectory(): boolean; name: string }) => {
      const entryPath = join(root, entry.name);
      if (entry.isDirectory()) {
        return listFiles(entryPath);
      }

      const extension = extname(entry.name).toLowerCase();
      return extension === '.yaml' || extension === '.yml' || extension === '.json'
        ? [entryPath]
        : [];
    }
  );
};

const toEntityType = (value: string): CanonicalEntity['entity_type'] => {
  const normalized = value as CanonicalEntity['entity_type'];
  return normalized;
};

const toCanonicalEntity = (record: Record<string, unknown>, now: string): CanonicalEntity => {
  const id = asString(record.id);
  const type = asString(record.type, 'service');
  return {
    entity_id: `ent_git_${type}_${id}`,
    entity_type: toEntityType(type),
    canonical_key: `git:${type}/${id}`,
    display_name: asString(record.title, id || type),
    labels: asStringArray(record.tags),
    properties: asRecord(record.attributes),
    status: 'active',
    created_at: now,
    updated_at: now
  };
};

const toCanonicalRelation = (record: Record<string, unknown>, now: string): CanonicalRelation => {
  const relationId = asString(record.id);
  const relationType = asString(record.type, 'connected_to') as CanonicalRelation['relation_type'];
  const source = asRecord(record.source);
  const target = asRecord(record.target);
  const sourceType = asString(source.type);
  const sourceId = asString(source.id);
  const targetType = asString(target.type);
  const targetId = asString(target.id);

  return {
    relation_id: `rel_git_${relationId || `${sourceId}_${targetId}`}`,
    relation_type: relationType,
    from_entity_id: `ent_git_${sourceType}_${sourceId}`,
    to_entity_id: `ent_git_${targetType}_${targetId}`,
    properties: {},
    status: 'active',
    created_at: now,
    updated_at: now
  };
};

const toObservation = (args: {
  subjectKind: CanonicalObservation['subject_kind'];
  subjectId: string;
  context: SourceCollectContext;
  evidenceRef: string;
}): CanonicalObservation => ({
  observation_id: `obs_${args.subjectKind}_${args.subjectId}_${args.context.run_id}`,
  subject_kind: args.subjectKind,
  subject_id: args.subjectId,
  source_type: 'git',
  source_instance_id: args.context.source.source_instance_id,
  source_ref: {
    ref: String(args.context.source.config.ref ?? 'main'),
    path: String(args.context.source.config.path ?? 'registry/')
  },
  observed_at: args.context.now,
  collector_run_id: args.context.run_id,
  confidence: 1,
  raw_evidence_ref: args.evidenceRef
});

export class GitSourceAdapter implements SourceAdapter {
  public readonly sourceType = 'git' as const;

  public async collect(context: SourceCollectContext): Promise<SourceCollectResult> {
    const workspaceRoot = process.cwd();
    const configuredPath = String(context.source.config.path ?? 'packages/sample-data/registry');
    const basePath = resolve(configuredPath);
    if (!basePath.startsWith(workspaceRoot)) {
      throw new Error('Git source path must stay inside current workspace.');
    }
    const entitiesPath = join(basePath, 'entities');
    const relationsPath = join(basePath, 'relations');

    const entities = listFiles(entitiesPath).map((filePath) =>
      toCanonicalEntity(readStructuredFile(filePath), context.now)
    );
    const relations = listFiles(relationsPath).map((filePath) =>
      toCanonicalRelation(readStructuredFile(filePath), context.now)
    );

    const observations: CanonicalObservation[] = [
      ...entities.map((entity) =>
        toObservation({
          subjectKind: 'entity',
          subjectId: entity.entity_id,
          context,
          evidenceRef: `git://${context.source.source_instance_id}/${entity.entity_id}`
        })
      ),
      ...relations.map((relation) =>
        toObservation({
          subjectKind: 'relation',
          subjectId: relation.relation_id,
          context,
          evidenceRef: `git://${context.source.source_instance_id}/${relation.relation_id}`
        })
      )
    ];

    return {
      source_type: 'git',
      source_instance_id: context.source.source_instance_id,
      scope: context.source.scope,
      graph_kind: 'planned',
      entities,
      relations,
      observations,
      cursor: context.now
    };
  }
}
