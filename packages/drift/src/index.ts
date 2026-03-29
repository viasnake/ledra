import type { CanonicalEntity, CanonicalRelation, DriftFinding } from '@cataloga/schema';

export const packageName = '@cataloga/drift';

const findingId = (prefix: string, subjectId: string): string =>
  `${prefix}_${subjectId.replace(/[^a-zA-Z0-9]/g, '_')}`;

export const computeDriftFindings = (
  plannedEntities: readonly CanonicalEntity[],
  observedEntities: readonly CanonicalEntity[],
  plannedRelations: readonly CanonicalRelation[],
  observedRelations: readonly CanonicalRelation[],
  snapshotId: string,
  detectedAt: string
): readonly DriftFinding[] => {
  const findings: DriftFinding[] = [];

  const plannedEntityKeys = new Set(plannedEntities.map((entity) => entity.canonical_key));
  const observedEntityKeys = new Set(observedEntities.map((entity) => entity.canonical_key));

  for (const entity of plannedEntities) {
    if (!observedEntityKeys.has(entity.canonical_key)) {
      findings.push({
        finding_id: findingId('missing_entity', entity.entity_id),
        snapshot_id: snapshotId,
        drift_type: 'missing_entity',
        severity: 'high',
        subject_id: entity.entity_id,
        summary: `Planned entity '${entity.display_name}' is missing in observed graph.`,
        details: { canonical_key: entity.canonical_key },
        detected_at: detectedAt
      });
    }
  }

  for (const entity of observedEntities) {
    if (!plannedEntityKeys.has(entity.canonical_key)) {
      findings.push({
        finding_id: findingId('extra_entity', entity.entity_id),
        snapshot_id: snapshotId,
        drift_type: 'extra_entity',
        severity: 'medium',
        subject_id: entity.entity_id,
        summary: `Observed entity '${entity.display_name}' is not present in planned graph.`,
        details: { canonical_key: entity.canonical_key },
        detected_at: detectedAt
      });
    }
  }

  const plannedRelationKeys = new Set(
    plannedRelations.map(
      (relation) => `${relation.relation_type}:${relation.from_entity_id}:${relation.to_entity_id}`
    )
  );
  const observedRelationKeys = new Set(
    observedRelations.map(
      (relation) => `${relation.relation_type}:${relation.from_entity_id}:${relation.to_entity_id}`
    )
  );

  for (const relation of plannedRelations) {
    const key = `${relation.relation_type}:${relation.from_entity_id}:${relation.to_entity_id}`;
    if (!observedRelationKeys.has(key)) {
      findings.push({
        finding_id: findingId('missing_relation', relation.relation_id),
        snapshot_id: snapshotId,
        drift_type: 'missing_relation',
        severity: 'high',
        subject_id: relation.relation_id,
        summary: `Planned relation '${relation.relation_type}' is missing in observed graph.`,
        details: { from: relation.from_entity_id, to: relation.to_entity_id },
        detected_at: detectedAt
      });
    }
  }

  for (const relation of observedRelations) {
    const key = `${relation.relation_type}:${relation.from_entity_id}:${relation.to_entity_id}`;
    if (!plannedRelationKeys.has(key)) {
      findings.push({
        finding_id: findingId('extra_relation', relation.relation_id),
        snapshot_id: snapshotId,
        drift_type: 'extra_relation',
        severity: 'low',
        subject_id: relation.relation_id,
        summary: `Observed relation '${relation.relation_type}' is not present in planned graph.`,
        details: { from: relation.from_entity_id, to: relation.to_entity_id },
        detected_at: detectedAt
      });
    }
  }

  return findings.sort((left, right) => left.finding_id.localeCompare(right.finding_id));
};
