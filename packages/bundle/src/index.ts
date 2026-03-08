import type { LedraBundle } from '@ledra/types';
import { createReadOnlyRepository, type ReadOnlyRepository } from '@ledra/core';

export const packageName = '@ledra/bundle';

export const buildBundle = (repository: ReadOnlyRepository = createReadOnlyRepository({ entities: [] })): LedraBundle => ({
  kind: 'static-bundle',
  generatedAt: new Date().toISOString(),
  types: repository.listTypes(),
  entities: repository.listEntities()
});
