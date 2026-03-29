import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import type {
  CanonicalEntity,
  CanonicalObservation,
  CanonicalRelation,
  CollectorRun,
  DriftFinding,
  GraphSnapshot,
  SnapshotKind,
  SourceDefinition,
  TopologyProjection
} from '@cataloga/schema';

export const packageName = '@cataloga/storage';

export type StorageDriver = 'postgres' | 'mysql' | 'sqlite' | 'd1';

export type StorageAdapterConfig = {
  driver: StorageDriver;
  dsn?: string;
  filePath?: string;
};

type StoreState = {
  sources: SourceDefinition[];
  collector_runs: CollectorRun[];
  entities: CanonicalEntity[];
  relations: CanonicalRelation[];
  observations: CanonicalObservation[];
  snapshots: GraphSnapshot[];
  drift_findings: DriftFinding[];
  topology_projections: TopologyProjection[];
};

const createEmptyState = (): StoreState => ({
  sources: [],
  collector_runs: [],
  entities: [],
  relations: [],
  observations: [],
  snapshots: [],
  drift_findings: [],
  topology_projections: []
});

const byString = <T>(left: T, right: T, getKey: (value: T) => string): number =>
  getKey(left).localeCompare(getKey(right));

export interface SourceRepository {
  upsert(source: SourceDefinition): void;
  list(): readonly SourceDefinition[];
  get(sourceId: string): SourceDefinition | undefined;
}

export interface CollectorRunRepository {
  start(run: CollectorRun): void;
  finish(runId: string, status: CollectorRun['status'], message?: string): void;
  list(): readonly CollectorRun[];
}

export interface EntityRepository {
  upsertMany(entities: readonly CanonicalEntity[]): void;
  list(): readonly CanonicalEntity[];
  find(entityId: string): CanonicalEntity | undefined;
}

export interface RelationRepository {
  upsertMany(relations: readonly CanonicalRelation[]): void;
  list(): readonly CanonicalRelation[];
}

export interface ObservationRepository {
  insertMany(observations: readonly CanonicalObservation[]): void;
  listBySubject(subjectId: string): readonly CanonicalObservation[];
  listAll(): readonly CanonicalObservation[];
}

export interface SnapshotRepository {
  create(snapshot: GraphSnapshot): void;
  list(kind?: SnapshotKind): readonly GraphSnapshot[];
  get(snapshotId: string): GraphSnapshot | undefined;
  latest(kind: SnapshotKind, scope?: string): GraphSnapshot | undefined;
}

export interface DriftRepository {
  replaceForSnapshot(snapshotId: string, findings: readonly DriftFinding[]): void;
  list(snapshotId?: string): readonly DriftFinding[];
}

export interface TopologyProjectionRepository {
  upsert(projection: TopologyProjection): void;
  list(snapshotId?: string): readonly TopologyProjection[];
  get(topologyId: string): TopologyProjection | undefined;
}

export interface CanonicalStore {
  readonly driver: StorageDriver;
  readonly sources: SourceRepository;
  readonly collectorRuns: CollectorRunRepository;
  readonly entities: EntityRepository;
  readonly relations: RelationRepository;
  readonly observations: ObservationRepository;
  readonly snapshots: SnapshotRepository;
  readonly drifts: DriftRepository;
  readonly topologies: TopologyProjectionRepository;
  flush(): void;
}

type JsonRecord = Record<string, unknown>;

const escapeSql = (value: string): string => value.replaceAll("'", "''");

const sqlText = (value: string): string => `'${escapeSql(value)}'`;

const sqlNullableText = (value: string | undefined): string =>
  value === undefined ? 'NULL' : sqlText(value);

const sqlBoolean = (value: boolean): string => (value ? 'TRUE' : 'FALSE');

const sqlNumber = (value: number): string => `${value}`;

const sqlJson = (value: unknown): string => `${sqlText(JSON.stringify(value))}::jsonb`;

const parseJsonLines = <T>(output: string): T[] => {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line) => JSON.parse(line) as T);
};

class FileBackedCanonicalStore implements CanonicalStore {
  public readonly driver: StorageDriver;

  private state: StoreState;

  private readonly filePath: string;

  public readonly sources: SourceRepository;

  public readonly collectorRuns: CollectorRunRepository;

  public readonly entities: EntityRepository;

  public readonly relations: RelationRepository;

  public readonly observations: ObservationRepository;

  public readonly snapshots: SnapshotRepository;

  public readonly drifts: DriftRepository;

  public readonly topologies: TopologyProjectionRepository;

  constructor(config: StorageAdapterConfig) {
    this.driver = config.driver;
    this.filePath = resolve(config.filePath ?? '.cataloga/canonical-store.json');
    this.state = this.load();

    this.sources = {
      upsert: (source) => {
        const index = this.state.sources.findIndex((item) => item.source_id === source.source_id);
        if (index >= 0) {
          this.state.sources[index] = source;
        } else {
          this.state.sources.push(source);
        }
      },
      list: () =>
        [...this.state.sources].sort((left, right) => byString(left, right, (v) => v.source_id)),
      get: (sourceId) => this.state.sources.find((source) => source.source_id === sourceId)
    };

    this.collectorRuns = {
      start: (run) => {
        this.state.collector_runs.push(run);
      },
      finish: (runId, status, message) => {
        const current = this.state.collector_runs.find((run) => run.collector_run_id === runId);
        if (!current) {
          return;
        }

        current.status = status;
        current.ended_at = new Date().toISOString();
        if (message) {
          current.message = message;
        }
      },
      list: () =>
        [...this.state.collector_runs].sort((left, right) =>
          byString(left, right, (value) => value.started_at)
        )
    };

    this.entities = {
      upsertMany: (entities) => {
        const table = new Map(this.state.entities.map((entity) => [entity.entity_id, entity]));
        for (const entity of entities) {
          table.set(entity.entity_id, entity);
        }

        this.state.entities = [...table.values()].sort((left, right) =>
          byString(left, right, (value) => value.entity_id)
        );
      },
      list: () => [...this.state.entities],
      find: (entityId) => this.state.entities.find((entity) => entity.entity_id === entityId)
    };

    this.relations = {
      upsertMany: (relations) => {
        const table = new Map(
          this.state.relations.map((relation) => [relation.relation_id, relation])
        );
        for (const relation of relations) {
          table.set(relation.relation_id, relation);
        }

        this.state.relations = [...table.values()].sort((left, right) =>
          byString(left, right, (value) => value.relation_id)
        );
      },
      list: () => [...this.state.relations]
    };

    this.observations = {
      insertMany: (observations) => {
        this.state.observations.push(...observations);
        this.state.observations.sort((left, right) =>
          byString(left, right, (value) => value.observed_at)
        );
      },
      listBySubject: (subjectId) =>
        this.state.observations.filter((observation) => observation.subject_id === subjectId),
      listAll: () => [...this.state.observations]
    };

    this.snapshots = {
      create: (snapshot) => {
        const table = new Map(this.state.snapshots.map((item) => [item.snapshot_id, item]));
        table.set(snapshot.snapshot_id, snapshot);
        this.state.snapshots = [...table.values()].sort((left, right) =>
          byString(left, right, (value) => value.captured_at)
        );
      },
      list: (kind) =>
        (kind
          ? this.state.snapshots.filter((snapshot) => snapshot.kind === kind)
          : this.state.snapshots
        ).map((snapshot) => ({ ...snapshot })),
      get: (snapshotId) =>
        this.state.snapshots.find((snapshot) => snapshot.snapshot_id === snapshotId),
      latest: (kind, scope) => {
        const snapshots = this.state.snapshots
          .filter((snapshot) => snapshot.kind === kind && (scope ? snapshot.scope === scope : true))
          .sort((left, right) => right.captured_at.localeCompare(left.captured_at));
        return snapshots[0];
      }
    };

    this.drifts = {
      replaceForSnapshot: (snapshotId, findings) => {
        this.state.drift_findings = this.state.drift_findings.filter(
          (finding) => finding.snapshot_id !== snapshotId
        );
        this.state.drift_findings.push(...findings);
      },
      list: (snapshotId) =>
        snapshotId
          ? this.state.drift_findings.filter((finding) => finding.snapshot_id === snapshotId)
          : [...this.state.drift_findings]
    };

    this.topologies = {
      upsert: (projection) => {
        const table = new Map(
          this.state.topology_projections.map((item) => [item.topology_id, item] as const)
        );
        table.set(projection.topology_id, projection);
        this.state.topology_projections = [...table.values()].sort((left, right) =>
          byString(left, right, (value) => value.topology_id)
        );
      },
      list: (snapshotId) =>
        snapshotId
          ? this.state.topology_projections.filter(
              (projection) => projection.snapshot_id === snapshotId
            )
          : [...this.state.topology_projections],
      get: (topologyId) =>
        this.state.topology_projections.find((projection) => projection.topology_id === topologyId)
    };
  }

  public flush(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
  }

  private load(): StoreState {
    if (!existsSync(this.filePath)) {
      return createEmptyState();
    }

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<StoreState>;
      return {
        ...createEmptyState(),
        ...parsed,
        sources: parsed.sources ?? [],
        collector_runs: parsed.collector_runs ?? [],
        entities: parsed.entities ?? [],
        relations: parsed.relations ?? [],
        observations: parsed.observations ?? [],
        snapshots: parsed.snapshots ?? [],
        drift_findings: parsed.drift_findings ?? [],
        topology_projections: parsed.topology_projections ?? []
      };
    } catch {
      return createEmptyState();
    }
  }
}

class PostgresCanonicalStore implements CanonicalStore {
  public readonly driver: StorageDriver = 'postgres';

  private readonly dsn: string;

  public readonly sources: SourceRepository;

  public readonly collectorRuns: CollectorRunRepository;

  public readonly entities: EntityRepository;

  public readonly relations: RelationRepository;

  public readonly observations: ObservationRepository;

  public readonly snapshots: SnapshotRepository;

  public readonly drifts: DriftRepository;

  public readonly topologies: TopologyProjectionRepository;

  constructor(dsn: string) {
    this.dsn = dsn;
    this.migrate();

    this.sources = {
      upsert: (source) => {
        this.exec(`
          INSERT INTO sources (
            source_id, source_type, source_instance_id, scope,
            credentials_ref, enabled, poll_mode, last_success_at, last_cursor, config_json
          ) VALUES (
            ${sqlText(source.source_id)},
            ${sqlText(source.source_type)},
            ${sqlText(source.source_instance_id)},
            ${sqlText(source.scope)},
            ${sqlNullableText(source.credentials_ref)},
            ${sqlBoolean(source.enabled)},
            ${sqlText(source.poll_mode)},
            ${sqlNullableText(source.last_success_at)},
            ${sqlNullableText(source.last_cursor)},
            ${sqlJson(source.config)}
          )
          ON CONFLICT (source_id) DO UPDATE SET
            source_type = EXCLUDED.source_type,
            source_instance_id = EXCLUDED.source_instance_id,
            scope = EXCLUDED.scope,
            credentials_ref = EXCLUDED.credentials_ref,
            enabled = EXCLUDED.enabled,
            poll_mode = EXCLUDED.poll_mode,
            last_success_at = EXCLUDED.last_success_at,
            last_cursor = EXCLUDED.last_cursor,
            config_json = EXCLUDED.config_json
        `);
      },
      list: () =>
        this.query<{
          source_id: string;
          source_type: SourceDefinition['source_type'];
          source_instance_id: string;
          scope: string;
          credentials_ref: string | null;
          enabled: boolean;
          poll_mode: SourceDefinition['poll_mode'];
          last_success_at: string | null;
          last_cursor: string | null;
          config_json: JsonRecord;
        }>(
          `
          SELECT row_to_json(t)
          FROM (
            SELECT
              source_id,
              source_type,
              source_instance_id,
              scope,
              credentials_ref,
              enabled,
              poll_mode,
              last_success_at,
              last_cursor,
              config_json
            FROM sources
            ORDER BY source_id
          ) t
        `
        ).map((row) => ({
          source_id: row.source_id,
          source_type: row.source_type,
          source_instance_id: row.source_instance_id,
          scope: row.scope,
          ...(row.credentials_ref ? { credentials_ref: row.credentials_ref } : {}),
          enabled: row.enabled,
          poll_mode: row.poll_mode,
          ...(row.last_success_at ? { last_success_at: row.last_success_at } : {}),
          ...(row.last_cursor ? { last_cursor: row.last_cursor } : {}),
          config: row.config_json
        })),
      get: (sourceId) => this.sources.list().find((source) => source.source_id === sourceId)
    };

    this.collectorRuns = {
      start: (run) => {
        this.exec(`
          INSERT INTO collector_runs (collector_run_id, source_id, started_at, ended_at, status, message)
          VALUES (
            ${sqlText(run.collector_run_id)},
            ${sqlText(run.source_id)},
            ${sqlText(run.started_at)},
            ${sqlNullableText(run.ended_at)},
            ${sqlText(run.status)},
            ${sqlNullableText(run.message)}
          )
        `);
      },
      finish: (runId, status, message) => {
        this.exec(`
          UPDATE collector_runs
          SET
            status = ${sqlText(status)},
            ended_at = NOW()::text,
            message = ${sqlNullableText(message)}
          WHERE collector_run_id = ${sqlText(runId)}
        `);
      },
      list: () =>
        this.query<CollectorRun>(`
          SELECT row_to_json(t)
          FROM (
            SELECT collector_run_id, source_id, started_at, ended_at, status, message
            FROM collector_runs
            ORDER BY started_at
          ) t
        `)
    };

    this.entities = {
      upsertMany: (entities) => {
        for (const entity of entities) {
          this.exec(`
            INSERT INTO entities (
              entity_id, entity_type, canonical_key, display_name,
              labels_json, properties_json, status, created_at, updated_at
            ) VALUES (
              ${sqlText(entity.entity_id)},
              ${sqlText(entity.entity_type)},
              ${sqlText(entity.canonical_key)},
              ${sqlText(entity.display_name)},
              ${sqlJson(entity.labels)},
              ${sqlJson(entity.properties)},
              ${sqlText(entity.status)},
              ${sqlText(entity.created_at)},
              ${sqlText(entity.updated_at)}
            )
            ON CONFLICT (entity_id) DO UPDATE SET
              entity_type = EXCLUDED.entity_type,
              canonical_key = EXCLUDED.canonical_key,
              display_name = EXCLUDED.display_name,
              labels_json = EXCLUDED.labels_json,
              properties_json = EXCLUDED.properties_json,
              status = EXCLUDED.status,
              updated_at = EXCLUDED.updated_at
          `);
        }
      },
      list: () =>
        this.query<{
          entity_id: string;
          entity_type: CanonicalEntity['entity_type'];
          canonical_key: string;
          display_name: string;
          labels_json: string[];
          properties_json: JsonRecord;
          status: CanonicalEntity['status'];
          created_at: string;
          updated_at: string;
        }>(
          `
          SELECT row_to_json(t)
          FROM (
            SELECT
              entity_id,
              entity_type,
              canonical_key,
              display_name,
              labels_json,
              properties_json,
              status,
              created_at,
              updated_at
            FROM entities
            ORDER BY entity_id
          ) t
        `
        ).map((row) => ({
          entity_id: row.entity_id,
          entity_type: row.entity_type,
          canonical_key: row.canonical_key,
          display_name: row.display_name,
          labels: row.labels_json,
          properties: row.properties_json,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at
        })),
      find: (entityId) => this.entities.list().find((entity) => entity.entity_id === entityId)
    };

    this.relations = {
      upsertMany: (relations) => {
        for (const relation of relations) {
          this.exec(`
            INSERT INTO relations (
              relation_id, relation_type, from_entity_id, to_entity_id,
              properties_json, status, created_at, updated_at
            ) VALUES (
              ${sqlText(relation.relation_id)},
              ${sqlText(relation.relation_type)},
              ${sqlText(relation.from_entity_id)},
              ${sqlText(relation.to_entity_id)},
              ${sqlJson(relation.properties)},
              ${sqlText(relation.status)},
              ${sqlText(relation.created_at)},
              ${sqlText(relation.updated_at)}
            )
            ON CONFLICT (relation_id) DO UPDATE SET
              relation_type = EXCLUDED.relation_type,
              from_entity_id = EXCLUDED.from_entity_id,
              to_entity_id = EXCLUDED.to_entity_id,
              properties_json = EXCLUDED.properties_json,
              status = EXCLUDED.status,
              updated_at = EXCLUDED.updated_at
          `);
        }
      },
      list: () =>
        this.query<{
          relation_id: string;
          relation_type: CanonicalRelation['relation_type'];
          from_entity_id: string;
          to_entity_id: string;
          properties_json: JsonRecord;
          status: CanonicalRelation['status'];
          created_at: string;
          updated_at: string;
        }>(
          `
          SELECT row_to_json(t)
          FROM (
            SELECT
              relation_id,
              relation_type,
              from_entity_id,
              to_entity_id,
              properties_json,
              status,
              created_at,
              updated_at
            FROM relations
            ORDER BY relation_id
          ) t
        `
        ).map((row) => ({
          relation_id: row.relation_id,
          relation_type: row.relation_type,
          from_entity_id: row.from_entity_id,
          to_entity_id: row.to_entity_id,
          properties: row.properties_json,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at
        }))
    };

    this.observations = {
      insertMany: (observations) => {
        for (const observation of observations) {
          this.exec(`
            INSERT INTO observations (
              observation_id,
              subject_kind,
              subject_id,
              source_type,
              source_instance_id,
              source_ref_json,
              observed_at,
              collector_run_id,
              confidence,
              raw_evidence_ref
            ) VALUES (
              ${sqlText(observation.observation_id)},
              ${sqlText(observation.subject_kind)},
              ${sqlText(observation.subject_id)},
              ${sqlText(observation.source_type)},
              ${sqlText(observation.source_instance_id)},
              ${sqlJson(observation.source_ref)},
              ${sqlText(observation.observed_at)},
              ${sqlText(observation.collector_run_id)},
              ${sqlNumber(observation.confidence)},
              ${sqlText(observation.raw_evidence_ref)}
            )
            ON CONFLICT (observation_id) DO NOTHING
          `);
        }
      },
      listBySubject: (subjectId) =>
        this.query<{
          observation_id: string;
          subject_kind: CanonicalObservation['subject_kind'];
          subject_id: string;
          source_type: CanonicalObservation['source_type'];
          source_instance_id: string;
          source_ref_json: JsonRecord;
          observed_at: string;
          collector_run_id: string;
          confidence: number;
          raw_evidence_ref: string;
        }>(
          `
          SELECT row_to_json(t)
          FROM (
            SELECT
              observation_id,
              subject_kind,
              subject_id,
              source_type,
              source_instance_id,
              source_ref_json,
              observed_at,
              collector_run_id,
              confidence,
              raw_evidence_ref
            FROM observations
            WHERE subject_id = ${sqlText(subjectId)}
            ORDER BY observed_at DESC
          ) t
        `
        ).map((row) => ({
          observation_id: row.observation_id,
          subject_kind: row.subject_kind,
          subject_id: row.subject_id,
          source_type: row.source_type,
          source_instance_id: row.source_instance_id,
          source_ref: row.source_ref_json as Record<string, string>,
          observed_at: row.observed_at,
          collector_run_id: row.collector_run_id,
          confidence: row.confidence,
          raw_evidence_ref: row.raw_evidence_ref
        })),
      listAll: () =>
        this.query<{
          observation_id: string;
          subject_kind: CanonicalObservation['subject_kind'];
          subject_id: string;
          source_type: CanonicalObservation['source_type'];
          source_instance_id: string;
          source_ref_json: JsonRecord;
          observed_at: string;
          collector_run_id: string;
          confidence: number;
          raw_evidence_ref: string;
        }>(
          `
          SELECT row_to_json(t)
          FROM (
            SELECT
              observation_id,
              subject_kind,
              subject_id,
              source_type,
              source_instance_id,
              source_ref_json,
              observed_at,
              collector_run_id,
              confidence,
              raw_evidence_ref
            FROM observations
            ORDER BY observed_at DESC
          ) t
        `
        ).map((row) => ({
          observation_id: row.observation_id,
          subject_kind: row.subject_kind,
          subject_id: row.subject_id,
          source_type: row.source_type,
          source_instance_id: row.source_instance_id,
          source_ref: row.source_ref_json as Record<string, string>,
          observed_at: row.observed_at,
          collector_run_id: row.collector_run_id,
          confidence: row.confidence,
          raw_evidence_ref: row.raw_evidence_ref
        }))
    };

    this.snapshots = {
      create: (snapshot) => {
        this.exec(`
          INSERT INTO snapshots (snapshot_id, kind, scope, captured_at, graph_version)
          VALUES (
            ${sqlText(snapshot.snapshot_id)},
            ${sqlText(snapshot.kind)},
            ${sqlText(snapshot.scope)},
            ${sqlText(snapshot.captured_at)},
            ${sqlText(snapshot.graph_version)}
          )
          ON CONFLICT (snapshot_id) DO UPDATE SET
            kind = EXCLUDED.kind,
            scope = EXCLUDED.scope,
            captured_at = EXCLUDED.captured_at,
            graph_version = EXCLUDED.graph_version
        `);
        this.exec(
          `DELETE FROM snapshot_entities WHERE snapshot_id = ${sqlText(snapshot.snapshot_id)}`
        );
        this.exec(
          `DELETE FROM snapshot_relations WHERE snapshot_id = ${sqlText(snapshot.snapshot_id)}`
        );
        for (const entityId of snapshot.entity_ids) {
          this.exec(`
            INSERT INTO snapshot_entities (snapshot_id, entity_id)
            VALUES (${sqlText(snapshot.snapshot_id)}, ${sqlText(entityId)})
            ON CONFLICT (snapshot_id, entity_id) DO NOTHING
          `);
        }
        for (const relationId of snapshot.relation_ids) {
          this.exec(`
            INSERT INTO snapshot_relations (snapshot_id, relation_id)
            VALUES (${sqlText(snapshot.snapshot_id)}, ${sqlText(relationId)})
            ON CONFLICT (snapshot_id, relation_id) DO NOTHING
          `);
        }
      },
      list: (kind) =>
        this.query<{
          snapshot_id: string;
          kind: SnapshotKind;
          scope: string;
          captured_at: string;
          graph_version: string;
          entity_ids_json: string[];
          relation_ids_json: string[];
        }>(
          `
          SELECT row_to_json(t)
          FROM (
            SELECT
              s.snapshot_id,
              s.kind,
              s.scope,
              s.captured_at,
              s.graph_version,
              (
                SELECT COALESCE(json_agg(se.entity_id ORDER BY se.entity_id), '[]'::json)
                FROM snapshot_entities se
                WHERE se.snapshot_id = s.snapshot_id
              ) AS entity_ids_json,
              (
                SELECT COALESCE(json_agg(sr.relation_id ORDER BY sr.relation_id), '[]'::json)
                FROM snapshot_relations sr
                WHERE sr.snapshot_id = s.snapshot_id
              ) AS relation_ids_json
            FROM snapshots s
            ${kind ? `WHERE s.kind = ${sqlText(kind)}` : ''}
            ORDER BY s.captured_at
          ) t
        `
        ).map((row) => ({
          snapshot_id: row.snapshot_id,
          kind: row.kind,
          scope: row.scope,
          captured_at: row.captured_at,
          graph_version: row.graph_version,
          entity_ids: row.entity_ids_json,
          relation_ids: row.relation_ids_json
        })),
      get: (snapshotId) =>
        this.snapshots.list().find((snapshot) => snapshot.snapshot_id === snapshotId),
      latest: (kind, scope) => {
        const all = this.snapshots
          .list(kind)
          .filter((snapshot) => (scope ? snapshot.scope === scope : true))
          .sort((left, right) => right.captured_at.localeCompare(left.captured_at));
        return all[0];
      }
    };

    this.drifts = {
      replaceForSnapshot: (snapshotId, findings) => {
        this.exec(`DELETE FROM drift_findings WHERE snapshot_id = ${sqlText(snapshotId)}`);
        for (const finding of findings) {
          this.exec(`
            INSERT INTO drift_findings (
              finding_id, snapshot_id, drift_type, severity,
              subject_id, summary, details_json, detected_at
            ) VALUES (
              ${sqlText(finding.finding_id)},
              ${sqlText(finding.snapshot_id)},
              ${sqlText(finding.drift_type)},
              ${sqlText(finding.severity)},
              ${sqlText(finding.subject_id)},
              ${sqlText(finding.summary)},
              ${sqlJson(finding.details)},
              ${sqlText(finding.detected_at)}
            )
          `);
        }
      },
      list: (snapshotId) =>
        this.query<{
          finding_id: string;
          snapshot_id: string;
          drift_type: DriftFinding['drift_type'];
          severity: DriftFinding['severity'];
          subject_id: string;
          summary: string;
          details_json: JsonRecord;
          detected_at: string;
        }>(
          `
          SELECT row_to_json(t)
          FROM (
            SELECT
              finding_id,
              snapshot_id,
              drift_type,
              severity,
              subject_id,
              summary,
              details_json,
              detected_at
            FROM drift_findings
            ${snapshotId ? `WHERE snapshot_id = ${sqlText(snapshotId)}` : ''}
            ORDER BY detected_at DESC
          ) t
        `
        ).map((row) => ({
          finding_id: row.finding_id,
          snapshot_id: row.snapshot_id,
          drift_type: row.drift_type,
          severity: row.severity,
          subject_id: row.subject_id,
          summary: row.summary,
          details: row.details_json,
          detected_at: row.detected_at
        }))
    };

    this.topologies = {
      upsert: (projection) => {
        this.exec(`
          INSERT INTO topology_projections (
            topology_id, snapshot_id, view_type, format, rendered_at, payload
          ) VALUES (
            ${sqlText(projection.topology_id)},
            ${sqlText(projection.snapshot_id)},
            ${sqlText(projection.view_type)},
            ${sqlText(projection.format)},
            ${sqlText(projection.rendered_at)},
            ${sqlText(projection.payload)}
          )
          ON CONFLICT (topology_id) DO UPDATE SET
            snapshot_id = EXCLUDED.snapshot_id,
            view_type = EXCLUDED.view_type,
            format = EXCLUDED.format,
            rendered_at = EXCLUDED.rendered_at,
            payload = EXCLUDED.payload
        `);
      },
      list: (snapshotId) =>
        this.query<TopologyProjection>(`
          SELECT row_to_json(t)
          FROM (
            SELECT topology_id, snapshot_id, view_type, format, rendered_at, payload
            FROM topology_projections
            ${snapshotId ? `WHERE snapshot_id = ${sqlText(snapshotId)}` : ''}
            ORDER BY topology_id
          ) t
        `),
      get: (topologyId) =>
        this.topologies.list().find((projection) => projection.topology_id === topologyId)
    };
  }

  public flush(): void {
    // no-op for transactional database backends
  }

  private migrate(): void {
    this.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        source_id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_instance_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        credentials_ref TEXT,
        enabled BOOLEAN NOT NULL,
        poll_mode TEXT NOT NULL,
        last_success_at TEXT,
        last_cursor TEXT,
        config_json JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS collector_runs (
        collector_run_id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        message TEXT
      );

      CREATE TABLE IF NOT EXISTS entities (
        entity_id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        canonical_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        labels_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        properties_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS relations (
        relation_id TEXT PRIMARY KEY,
        relation_type TEXT NOT NULL,
        from_entity_id TEXT NOT NULL,
        to_entity_id TEXT NOT NULL,
        properties_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS observations (
        observation_id TEXT PRIMARY KEY,
        subject_kind TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_instance_id TEXT NOT NULL,
        source_ref_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        observed_at TEXT NOT NULL,
        collector_run_id TEXT NOT NULL,
        confidence DOUBLE PRECISION NOT NULL,
        raw_evidence_ref TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        snapshot_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        scope TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        graph_version TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS snapshot_entities (
        snapshot_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        PRIMARY KEY (snapshot_id, entity_id)
      );

      CREATE TABLE IF NOT EXISTS snapshot_relations (
        snapshot_id TEXT NOT NULL,
        relation_id TEXT NOT NULL,
        PRIMARY KEY (snapshot_id, relation_id)
      );

      CREATE TABLE IF NOT EXISTS topology_projections (
        topology_id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        view_type TEXT NOT NULL,
        format TEXT NOT NULL,
        rendered_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS drift_findings (
        finding_id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        drift_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        detected_at TEXT NOT NULL
      );
    `);
  }

  private exec(sql: string): void {
    execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', this.dsn, '-c', sql], {
      encoding: 'utf8',
      stdio: 'pipe'
    });
  }

  private query<T>(sql: string): T[] {
    const output = execFileSync(
      'psql',
      ['-X', '-v', 'ON_ERROR_STOP=1', this.dsn, '-At', '-c', sql],
      {
        encoding: 'utf8',
        stdio: 'pipe'
      }
    );
    return parseJsonLines<T>(output);
  }
}

export const createCanonicalStore = (config: StorageAdapterConfig): CanonicalStore =>
  config.driver === 'postgres' && config.dsn && !config.dsn.includes('${')
    ? new PostgresCanonicalStore(config.dsn)
    : new FileBackedCanonicalStore(config);
