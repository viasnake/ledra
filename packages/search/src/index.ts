import { createReadOnlyRepository, type ReadOnlyRepository } from '@ledra/core';
import type { EntityRecord } from '@ledra/types';

export const packageName = '@ledra/search';

export const searchEntities = (
  query: string,
  repository: ReadOnlyRepository = createReadOnlyRepository()
): readonly EntityRecord[] => {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return repository.listEntities();
  }

  return repository.listEntities().filter((entity) => {
    const haystacks = [entity.id, entity.title, entity.summary ?? '', ...entity.tags];
    return haystacks.some((part) => part.toLowerCase().includes(normalized));
  });
};
