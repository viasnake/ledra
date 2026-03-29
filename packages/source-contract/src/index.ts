import type {
  CanonicalEntity,
  CanonicalObservation,
  CanonicalRelation,
  SnapshotKind,
  SourceDefinition,
  SourceType
} from '@cataloga/schema';

export const packageName = '@cataloga/source-contract';

export type SourceCollectContext = {
  now: string;
  source: SourceDefinition;
  run_id: string;
};

export type SourceCollectResult = {
  source_type: SourceType;
  source_instance_id: string;
  scope: string;
  graph_kind: SnapshotKind;
  entities: readonly CanonicalEntity[];
  relations: readonly CanonicalRelation[];
  observations: readonly CanonicalObservation[];
  cursor?: string;
};

export interface SourceAdapter {
  readonly sourceType: SourceType;
  collect(context: SourceCollectContext): Promise<SourceCollectResult>;
}

export class SourceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceContractError';
  }
}

export const assertCollectResult = (result: SourceCollectResult): SourceCollectResult => {
  if (!result.source_type || !result.source_instance_id || !result.scope || !result.graph_kind) {
    throw new SourceContractError('Source collect result is missing required metadata.');
  }

  return result;
};

export const createAdapterRegistry = (adapters: readonly SourceAdapter[]) => {
  const map = new Map<SourceType, SourceAdapter>();
  for (const adapter of adapters) {
    map.set(adapter.sourceType, adapter);
  }

  return Object.freeze({
    get(sourceType: SourceType): SourceAdapter {
      const adapter = map.get(sourceType);
      if (!adapter) {
        throw new SourceContractError(`No adapter registered for source '${sourceType}'.`);
      }

      return adapter;
    },
    list(): readonly SourceType[] {
      return [...map.keys()].sort((left, right) => left.localeCompare(right));
    }
  });
};

export type SourceAdapterRegistry = ReturnType<typeof createAdapterRegistry>;
