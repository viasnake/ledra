import type { EntityRecord, ValidationIssue, ValidationResult } from '@ledra/types';

export const packageName = '@ledra/validator';

export const validateEntities = (entities: readonly EntityRecord[]): ValidationResult => {
  const issues: ValidationIssue[] = [];
  const ids = new Set(entities.map((entity) => entity.id));

  for (const entity of entities) {
    if (!entity.id.trim()) {
      issues.push({ code: 'missing-id', message: 'Entity id is required.' });
    }

    if (!entity.type.trim()) {
      issues.push({ code: 'missing-type', message: `Entity ${entity.id || '<unknown>'} requires a type.`, entityId: entity.id });
    }

    for (const relation of entity.relations) {
      if (!ids.has(relation.targetId)) {
        issues.push({
          code: 'invalid-relation-target',
          message: `Relation target '${relation.targetId}' does not exist.`,
          entityId: entity.id
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues
  };
};
