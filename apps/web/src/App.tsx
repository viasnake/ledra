import { useEffect, useMemo, useState } from 'react';
import './styles.css';

type Entity = {
  entity_id: string;
  entity_type: string;
  display_name: string;
  canonical_key: string;
  labels: string[];
  properties: Record<string, unknown>;
  status: string;
};

type Snapshot = {
  snapshot_id: string;
  kind: 'planned' | 'observed' | 'effective';
  scope: string;
  captured_at: string;
};

type Drift = {
  finding_id: string;
  drift_type: string;
  severity: string;
  summary: string;
  subject_id: string;
};

type TopologyProjection = {
  topology_id: string;
  snapshot_id: string;
  format: 'json' | 'svg' | 'html';
  view_type: string;
};

type QueryResponse = {
  observed_at: string;
  source: Array<{ source_type: string; source_instance_id: string }>;
  confidence: number;
  evidence_refs: string[];
  data: unknown;
};

type AppState = {
  loading: boolean;
  error?: string;
  entities: Entity[];
  snapshots: Snapshot[];
  drift: Drift[];
  topologies: TopologyProjection[];
  exposure?: QueryResponse;
};

const initialState: AppState = {
  loading: true,
  entities: [],
  snapshots: [],
  drift: [],
  topologies: []
};

const apiGet = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path} (${response.status})`);
  }
  return (await response.json()) as T;
};

const App = () => {
  const [state, setState] = useState<AppState>(initialState);

  useEffect(() => {
    void Promise.all([
      apiGet<Entity[]>('/api/v1/entities'),
      apiGet<Snapshot[]>('/api/v1/snapshots'),
      apiGet<Drift[]>('/api/v1/drift'),
      apiGet<TopologyProjection[]>('/api/v1/topologies'),
      apiGet<QueryResponse>('/api/v1/query/find-public-exposure')
    ])
      .then(([entities, snapshots, drift, topologies, exposure]) => {
        setState({ loading: false, entities, snapshots, drift, topologies, exposure });
      })
      .catch((error: unknown) => {
        setState({
          ...initialState,
          loading: false,
          error: error instanceof Error ? error.message : 'Unknown fetch error'
        });
      });
  }, []);

  const entityGroups = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const entity of state.entities) {
      grouped.set(entity.entity_type, (grouped.get(entity.entity_type) ?? 0) + 1);
    }
    return [...grouped.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  }, [state.entities]);

  if (state.loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1040px] items-center px-4 py-10 sm:px-6 lg:px-8">
        <section className="status-panel">
          <p className="eyebrow">loading</p>
          <h1>Cataloga v1.0 Topology Platform</h1>
          <p>Loading planned / observed / effective data from /api/v1.</p>
        </section>
      </main>
    );
  }

  if (state.error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1040px] items-center px-4 py-10 sm:px-6 lg:px-8">
        <section className="status-panel border-rose-200/80 bg-rose-50/80">
          <p className="eyebrow text-rose-700">api load error</p>
          <h1>Unable to load Cataloga API</h1>
          <p>{state.error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 lg:px-10">
      <section className="panel px-6 py-6 sm:px-8">
        <p className="eyebrow">Cataloga Topology Architecture Spec v1.0</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Planned / Observed / Effective / Drift Console
        </h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Canonical graph status from multi-source ingest with evidence-aware query APIs.
        </p>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="metric-card">
          <span>Entities</span>
          <strong>{state.entities.length}</strong>
          <p>Canonical entities in the current graph store.</p>
        </article>
        <article className="metric-card">
          <span>Snapshots</span>
          <strong>{state.snapshots.length}</strong>
          <p>Point-in-time planned, observed, and effective graph snapshots.</p>
        </article>
        <article className="metric-card">
          <span>Drift Findings</span>
          <strong>{state.drift.length}</strong>
          <p>Differences detected between planned and observed topology.</p>
        </article>
        <article className="metric-card">
          <span>Topologies</span>
          <strong>{state.topologies.length}</strong>
          <p>Deterministic topology projections generated from snapshots.</p>
        </article>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-900">Entity Types</h2>
          <div className="mt-4 space-y-2">
            {entityGroups.map(([type, count]) => (
              <div key={type} className="data-chip">
                <span>{type}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-900">Latest Snapshots</h2>
          <div className="mt-4 space-y-2">
            {state.snapshots
              .slice()
              .sort((left, right) => right.captured_at.localeCompare(left.captured_at))
              .slice(0, 8)
              .map((snapshot) => (
                <div key={snapshot.snapshot_id} className="data-chip">
                  <span>{snapshot.kind}</span>
                  <strong>{snapshot.snapshot_id}</strong>
                </div>
              ))}
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-900">Drift (recent)</h2>
          <div className="mt-4 space-y-3">
            {state.drift.slice(0, 10).map((finding) => (
              <div
                key={finding.finding_id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {finding.severity} / {finding.drift_type}
                </p>
                <p className="mt-1 text-sm text-slate-800">{finding.summary}</p>
                <p className="mt-1 text-xs text-slate-500">subject: {finding.subject_id}</p>
              </div>
            ))}
            {state.drift.length === 0 && (
              <p className="text-sm text-slate-500">No drift findings.</p>
            )}
          </div>
        </article>

        <article className="panel p-6">
          <h2 className="text-lg font-semibold text-slate-900">Public Exposure Query</h2>
          <p className="mt-3 text-xs text-slate-500">
            observed_at: {state.exposure?.observed_at ?? '-'}
          </p>
          <p className="text-xs text-slate-500">
            confidence: {String(state.exposure?.confidence ?? '-')}
          </p>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <pre className="overflow-auto text-xs text-slate-700">
              {JSON.stringify(state.exposure?.data ?? [], null, 2)}
            </pre>
          </div>
        </article>
      </section>
    </main>
  );
};

export default App;
