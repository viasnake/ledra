import { computeDriftFindings } from '@cataloga/drift';
import { resolveIdentity } from '@cataloga/identity';
import type {
  CanonicalEntity,
  CanonicalRelation,
  CollectorRun,
  GraphSnapshot,
  SnapshotKind,
  SourceDefinition
} from '@cataloga/schema';
import { assertCollectResult, type SourceAdapterRegistry } from '@cataloga/source-contract';
import type { CanonicalStore } from '@cataloga/storage';
import { createTopologyProjections } from '@cataloga/topology';

export const packageName = '@cataloga/ingest';

export type IngestRunRequest = {
  sourceIds?: readonly string[];
};

export type IngestRunResult = {
  run_ids: readonly string[];
  snapshot_ids: readonly string[];
  effective_snapshot_id?: string;
};

const nowIso = (): string => new Date().toISOString();

const randomId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const filterSources = (
  sources: readonly SourceDefinition[],
  request: IngestRunRequest
): readonly SourceDefinition[] => {
  const enabled = sources.filter((source) => source.enabled);
  if (!request.sourceIds || request.sourceIds.length === 0) {
    return enabled;
  }

  const allowed = new Set(request.sourceIds);
  return enabled.filter((source) => allowed.has(source.source_id));
};

const createSnapshot = (args: {
  kind: SnapshotKind;
  scope: string;
  graphVersion: string;
  entities: readonly CanonicalEntity[];
  relations: readonly CanonicalRelation[];
  capturedAt: string;
}): GraphSnapshot => ({
  snapshot_id: `snp_${args.kind}_${args.scope.replace(/[^a-zA-Z0-9]/g, '_')}_${args.capturedAt.replace(/[-:.TZ]/g, '')}`,
  kind: args.kind,
  scope: args.scope,
  captured_at: args.capturedAt,
  graph_version: args.graphVersion,
  entity_ids: args.entities
    .map((entity) => entity.entity_id)
    .sort((left, right) => left.localeCompare(right)),
  relation_ids: args.relations
    .map((relation) => relation.relation_id)
    .sort((left, right) => left.localeCompare(right))
});

const dedupeById = <T>(values: readonly T[], getId: (value: T) => string): readonly T[] => {
  const table = new Map<string, T>();
  for (const value of values) {
    table.set(getId(value), value);
  }
  return [...table.values()].sort((left, right) => getId(left).localeCompare(getId(right)));
};

const applyIdentityResolution = (
  entities: readonly CanonicalEntity[],
  relations: readonly CanonicalRelation[]
): { entities: readonly CanonicalEntity[]; relations: readonly CanonicalRelation[] } => {
  const resolution = resolveIdentity(entities);
  const mergedEntities = dedupeById(
    entities.map((entity) => {
      const canonical = resolution.resolved.get(entity.entity_id) ?? entity.entity_id;
      if (canonical === entity.entity_id) {
        return entity;
      }

      return {
        ...entity,
        entity_id: canonical,
        properties: {
          ...entity.properties,
          merged_from: entity.entity_id
        }
      };
    }),
    (entity) => entity.entity_id
  );

  const mergedRelations = dedupeById(
    relations.map((relation) => ({
      ...relation,
      from_entity_id: resolution.resolved.get(relation.from_entity_id) ?? relation.from_entity_id,
      to_entity_id: resolution.resolved.get(relation.to_entity_id) ?? relation.to_entity_id
    })),
    (relation) => relation.relation_id
  );

  return {
    entities: mergedEntities,
    relations: mergedRelations
  };
};

export const createIngestOrchestrator = (
  store: CanonicalStore,
  registry: SourceAdapterRegistry
) => ({
  async run(request: IngestRunRequest = {}): Promise<IngestRunResult> {
    const sources = filterSources(store.sources.list(), request);
    const runIds: string[] = [];
    const snapshotIds: string[] = [];

    for (const source of sources) {
      const startedAt = nowIso();
      const run: CollectorRun = {
        collector_run_id: randomId('run'),
        source_id: source.source_id,
        started_at: startedAt,
        status: 'running'
      };
      runIds.push(run.collector_run_id);
      store.collectorRuns.start(run);

      try {
        const adapter = registry.get(source.source_type);
        const result = assertCollectResult(
          await adapter.collect({
            now: startedAt,
            source,
            run_id: run.collector_run_id
          })
        );

        const merged = applyIdentityResolution(result.entities, result.relations);
        store.entities.upsertMany(merged.entities);
        store.relations.upsertMany(merged.relations);
        store.observations.insertMany(result.observations);

        const snapshot = createSnapshot({
          kind: result.graph_kind,
          scope: source.scope,
          graphVersion: '1',
          entities: merged.entities,
          relations: merged.relations,
          capturedAt: startedAt
        });
        store.snapshots.create(snapshot);
        snapshotIds.push(snapshot.snapshot_id);

        const projections = createTopologyProjections({
          snapshotId: snapshot.snapshot_id,
          viewType: result.graph_kind === 'planned' ? 'site-overview' : 'aws-vpc-overview',
          renderedAt: startedAt,
          entities: merged.entities,
          relations: merged.relations
        });
        for (const projection of projections) {
          store.topologies.upsert(projection);
        }

        store.collectorRuns.finish(run.collector_run_id, 'success');
        store.sources.upsert({
          ...source,
          last_success_at: startedAt,
          ...(result.cursor ? { last_cursor: result.cursor } : {})
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown ingest failure';
        store.collectorRuns.finish(run.collector_run_id, 'failed', message);
      }
    }

    const now = nowIso();
    const plannedSnapshot = store.snapshots.latest('planned');
    const observedSnapshot = store.snapshots.latest('observed');
    let effectiveSnapshotId: string | undefined;

    if (plannedSnapshot || observedSnapshot) {
      const allEntities = store.entities.list();
      const allRelations = store.relations.list();
      const effective = createSnapshot({
        kind: 'effective',
        scope: 'global',
        graphVersion: '1',
        entities: allEntities,
        relations: allRelations,
        capturedAt: now
      });
      store.snapshots.create(effective);
      effectiveSnapshotId = effective.snapshot_id;
      snapshotIds.push(effective.snapshot_id);

      const projections = createTopologyProjections({
        snapshotId: effective.snapshot_id,
        viewType: 'site-overview',
        renderedAt: now,
        entities: allEntities,
        relations: allRelations
      });
      for (const projection of projections) {
        store.topologies.upsert(projection);
      }

      if (plannedSnapshot && observedSnapshot) {
        const plannedEntitySet = new Set(plannedSnapshot.entity_ids);
        const observedEntitySet = new Set(observedSnapshot.entity_ids);
        const plannedRelationSet = new Set(plannedSnapshot.relation_ids);
        const observedRelationSet = new Set(observedSnapshot.relation_ids);

        const plannedEntities = allEntities.filter((entity) =>
          plannedEntitySet.has(entity.entity_id)
        );
        const observedEntities = allEntities.filter((entity) =>
          observedEntitySet.has(entity.entity_id)
        );
        const plannedRelations = allRelations.filter((relation) =>
          plannedRelationSet.has(relation.relation_id)
        );
        const observedRelations = allRelations.filter((relation) =>
          observedRelationSet.has(relation.relation_id)
        );

        const findings = computeDriftFindings(
          plannedEntities,
          observedEntities,
          plannedRelations,
          observedRelations,
          effective.snapshot_id,
          now
        );
        store.drifts.replaceForSnapshot(effective.snapshot_id, findings);
      }
    }

    store.flush();

    return {
      run_ids: runIds,
      snapshot_ids: snapshotIds,
      ...(effectiveSnapshotId ? { effective_snapshot_id: effectiveSnapshotId } : {})
    };
  }
});
