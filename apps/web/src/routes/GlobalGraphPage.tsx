import { Link, createSearchParams, useNavigate, useSearchParams } from 'react-router-dom';
import { GlobalGraphOverview } from '../components/GlobalGraphOverview';
import { buildGraphOverviewData, getSelectedView } from '../index';
import { uiCopy } from '../copy';
import { useMemo } from 'react';
import { useViewerContext } from '../viewer-context';

export const GlobalGraphPage = () => {
  const { bundle } = useViewerContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scopeId = searchParams.get('scope') ?? undefined;
  const selectedScope = getSelectedView(bundle.graph, scopeId);
  const graphOverviewData = useMemo(
    () => buildGraphOverviewData(bundle, { maxNodes: 160, maxEdges: 320 }),
    [bundle]
  );

  return (
    <div className="space-y-3">
      <section className="panel px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">{uiCopy.labels.graph}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              全体グラフ
            </h1>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {graphOverviewData.totalNodes} nodes / {graphOverviewData.totalEdges} relations
          </div>
        </div>

        <nav
          aria-label="グラフスコープ"
          className="-mx-3 mt-3 flex gap-1 overflow-x-auto border-y border-slate-200 bg-slate-50 px-3 py-2 sm:-mx-4 sm:px-4"
        >
          <Link
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              scopeId
                ? 'text-slate-600 hover:bg-white hover:text-slate-950'
                : 'bg-white text-sky-700 shadow-sm ring-1 ring-sky-100'
            }`}
            to="/graph"
          >
            {uiCopy.labels.allScopes}
          </Link>
          {bundle.graph.views.map((scope) => (
            <Link
              key={scope.id}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                scopeId === scope.id
                  ? 'bg-white text-sky-700 shadow-sm ring-1 ring-sky-100'
                  : 'text-slate-600 hover:bg-white hover:text-slate-950'
              }`}
              to={`/graph?scope=${encodeURIComponent(scope.id)}`}
            >
              {scope.title}
            </Link>
          ))}
        </nav>
      </section>

      <section className="panel px-3 py-3 sm:px-4">
        <GlobalGraphOverview
          data={graphOverviewData}
          highlightedTypes={selectedScope ? new Set(selectedScope.entityTypes) : undefined}
          onNodeSelect={(entityId) => {
            const params = createSearchParams({
              ...(scopeId ? { scope: scopeId } : {})
            }).toString();
            navigate(`/nodes/${entityId}${params ? `?${params}` : ''}`);
          }}
        />
      </section>
    </div>
  );
};
