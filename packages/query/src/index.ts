import type { CanonicalEntity, CanonicalQueryResponse } from '@cataloga/schema';
import type { CanonicalStore } from '@cataloga/storage';

export const packageName = '@cataloga/query';

const latestEvidence = (store: CanonicalStore, subjectId: string): readonly string[] => {
  const observations = [...store.observations.listBySubject(subjectId)].sort((left, right) =>
    right.observed_at.localeCompare(left.observed_at)
  );
  return [...new Set(observations.map((item) => item.raw_evidence_ref))];
};

const responseMeta = (
  store: CanonicalStore,
  subjects: readonly string[]
): Omit<CanonicalQueryResponse<unknown>, 'data'> => {
  const related = store.observations
    .listAll()
    .filter((observation) => subjects.includes(observation.subject_id))
    .sort((left, right) => right.observed_at.localeCompare(left.observed_at));
  const observedAt = related[0]?.observed_at ?? new Date(0).toISOString();
  const source = [
    ...new Set(related.map((item) => `${item.source_type}:${item.source_instance_id}`))
  ].map((entry) => {
    const [sourceType, sourceInstanceId] = entry.split(':');
    return {
      source_type: sourceType as CanonicalQueryResponse<unknown>['source'][number]['source_type'],
      source_instance_id: sourceInstanceId ?? 'unknown'
    };
  });
  const confidence =
    related.length === 0
      ? 1
      : related.reduce((sum, item) => sum + item.confidence, 0) / related.length;
  const evidenceRefs = [...new Set(related.map((item) => item.raw_evidence_ref))];

  return {
    observed_at: observedAt,
    source,
    confidence,
    evidence_refs: evidenceRefs
  };
};

export const findAssets = (
  store: CanonicalStore,
  text: string,
  type?: string
): CanonicalQueryResponse<readonly CanonicalEntity[]> => {
  const normalized = text.trim().toLowerCase();
  const assets = store.entities.list().filter((entity) => {
    if (type && entity.entity_type !== type) {
      return false;
    }

    if (!normalized) {
      return true;
    }

    const candidates = [
      entity.entity_id,
      entity.display_name,
      entity.canonical_key,
      ...entity.labels
    ];
    return candidates.some((candidate) => candidate.toLowerCase().includes(normalized));
  });

  return {
    ...responseMeta(
      store,
      assets.map((asset) => asset.entity_id)
    ),
    data: assets
  };
};

export const getNeighbors = (
  store: CanonicalStore,
  entityId: string
): CanonicalQueryResponse<{
  entity?: CanonicalEntity | undefined;
  neighbors: readonly CanonicalEntity[];
}> => {
  const entity = store.entities.find(entityId);
  const relationIds = store.relations
    .list()
    .filter(
      (relation) => relation.from_entity_id === entityId || relation.to_entity_id === entityId
    );
  const neighborIds = [
    ...new Set(relationIds.flatMap((relation) => [relation.from_entity_id, relation.to_entity_id]))
  ].filter((id) => id !== entityId);
  const neighbors = neighborIds.flatMap((id) => {
    const resolved = store.entities.find(id);
    return resolved ? [resolved] : [];
  });

  return {
    ...responseMeta(store, [entityId, ...neighborIds]),
    data: {
      entity,
      neighbors
    }
  };
};

export const findPublicExposure = (
  store: CanonicalStore
): CanonicalQueryResponse<readonly CanonicalEntity[]> => {
  const exposed = store.entities
    .list()
    .filter(
      (entity) => entity.labels.includes('public') || entity.labels.includes('internet-facing')
    );
  return {
    ...responseMeta(
      store,
      exposed.map((entity) => entity.entity_id)
    ),
    data: exposed
  };
};

export const diffSnapshots = (
  store: CanonicalStore,
  leftSnapshotId: string,
  rightSnapshotId: string
): CanonicalQueryResponse<{
  left_snapshot_id: string;
  right_snapshot_id: string;
  added_entities: readonly string[];
  removed_entities: readonly string[];
  added_relations: readonly string[];
  removed_relations: readonly string[];
}> => {
  const left = store.snapshots.get(leftSnapshotId);
  const right = store.snapshots.get(rightSnapshotId);

  const leftEntities = new Set(left?.entity_ids ?? []);
  const rightEntities = new Set(right?.entity_ids ?? []);
  const leftRelations = new Set(left?.relation_ids ?? []);
  const rightRelations = new Set(right?.relation_ids ?? []);

  const addedEntities = [...rightEntities].filter((id) => !leftEntities.has(id));
  const removedEntities = [...leftEntities].filter((id) => !rightEntities.has(id));
  const addedRelations = [...rightRelations].filter((id) => !leftRelations.has(id));
  const removedRelations = [...leftRelations].filter((id) => !rightRelations.has(id));

  return {
    ...responseMeta(store, [...addedEntities, ...removedEntities]),
    data: {
      left_snapshot_id: leftSnapshotId,
      right_snapshot_id: rightSnapshotId,
      added_entities: addedEntities,
      removed_entities: removedEntities,
      added_relations: addedRelations,
      removed_relations: removedRelations
    }
  };
};

export const getEvidence = (
  store: CanonicalStore,
  subjectId: string
): CanonicalQueryResponse<readonly string[]> => {
  const refs = latestEvidence(store, subjectId);
  return {
    ...responseMeta(store, [subjectId]),
    data: refs
  };
};
