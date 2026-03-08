import type { Diagnostics, EntityRecord } from '@ledra/types';
import { IMPLEMENTATION_ORDER } from '@ledra/types';

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
  const frozen = entities.map((entity) => Object.freeze({ ...entity, relations: [...entity.relations], tags: [...entity.tags] }));

  return Object.freeze({
    listTypes: (): readonly string[] => [...new Set(frozen.map((entry) => entry.type))],
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
      entityCount: frozen.length
    })
  });
};

export type ReadOnlyRepository = ReturnType<typeof createReadOnlyRepository>;
