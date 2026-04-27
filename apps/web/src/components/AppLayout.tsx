import { NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { getSelectedView, viewerMode } from '../index';
import { useViewerContext } from '../viewer-context';
import { formatGeneratedAt, uiCopy } from '../copy';
import { cn } from '../lib/cn';

const navClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold transition-colors',
    isActive
      ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-100'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
  );

export const AppLayout = () => {
  const { bundle, bundlePath } = useViewerContext();
  const { scopeId } = useParams();
  const [searchParams] = useSearchParams();
  const activeScopeId = scopeId ?? searchParams.get('scope') ?? undefined;
  const selectedScope = activeScopeId ? getSelectedView(bundle.graph, activeScopeId) : undefined;
  const firstScopeId = bundle.graph.views[0]?.id;

  const systemItems = [
    [uiCopy.system.bundlePath, bundlePath],
    [uiCopy.system.generatedAt, formatGeneratedAt(bundle.generatedAt)],
    [uiCopy.system.mode, viewerMode],
    [uiCopy.system.entities, String(bundle.diagnostics.counts.entities)],
    [uiCopy.system.relations, String(bundle.diagnostics.counts.relations)],
    [uiCopy.system.scopes, String(bundle.diagnostics.counts.views)],
    [uiCopy.system.policies, String(bundle.diagnostics.counts.policies)]
  ] as const;

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200 bg-white lg:block">
          <div className="sticky top-0 flex h-screen flex-col">
            <NavLink className="border-b border-slate-200 px-5 py-4" to="/">
              <p className="truncate text-base font-semibold tracking-tight text-slate-950">
                {uiCopy.brand.title}
              </p>
            </NavLink>

            <nav className="space-y-1 px-3 py-4" aria-label="主要ナビゲーション">
              <NavLink className={navClassName} end to="/">
                <span>{uiCopy.nav.list}</span>
                <span className="text-xs font-medium text-slate-400">
                  {bundle.diagnostics.counts.entities}
                </span>
              </NavLink>
              <NavLink className={navClassName} to="/graph">
                <span>{uiCopy.nav.graph}</span>
                <span className="text-xs font-medium text-slate-400">
                  {bundle.diagnostics.counts.relations}
                </span>
              </NavLink>
              {firstScopeId ? (
                <NavLink className={navClassName} to={`/scopes/${firstScopeId}`}>
                  <span>{uiCopy.nav.scopes}</span>
                  <span className="text-xs font-medium text-slate-400">
                    {bundle.diagnostics.counts.views}
                  </span>
                </NavLink>
              ) : null}
            </nav>

            <div className="mt-auto border-t border-slate-200 p-3">
              <details className="group text-xs text-slate-600">
                <summary className="cursor-pointer select-none rounded-md px-2 py-2 font-semibold text-slate-700 hover:bg-slate-50">
                  {uiCopy.system.toggle}
                </summary>
                <dl className="mt-2 max-h-64 space-y-2 overflow-auto px-2 pb-1">
                  {systemItems.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[11px] text-slate-400">{label}</dt>
                      <dd className="mt-0.5 break-all font-mono text-[11px] text-slate-600">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 lg:px-6">
              <div className="min-w-0 lg:hidden">
                <NavLink className="block" to="/">
                  <p className="truncate text-base font-semibold text-slate-950">
                    {uiCopy.brand.title}
                  </p>
                </NavLink>
              </div>

              <div className="hidden min-w-0 lg:block">
                <p className="text-sm font-semibold text-slate-950">
                  {selectedScope ? selectedScope.title : uiCopy.labels.allNodes}
                </p>
                <p className="text-xs text-slate-500">
                  {bundle.diagnostics.counts.entities} nodes / {bundle.diagnostics.counts.relations}{' '}
                  relations
                </p>
              </div>

              <nav className="flex items-center gap-2 lg:hidden" aria-label="モバイルナビゲーション">
                <NavLink className={navClassName} end to="/">
                  {uiCopy.nav.list}
                </NavLink>
                <NavLink className={navClassName} to="/graph">
                  {uiCopy.nav.graph}
                </NavLink>
                {firstScopeId ? (
                  <NavLink className={navClassName} to={`/scopes/${firstScopeId}`}>
                    {uiCopy.nav.scopes}
                  </NavLink>
                ) : null}
              </nav>

              {selectedScope ? (
                <span className="inline-flex min-w-0 max-w-full items-center truncate rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-800">
                  {uiCopy.labels.currentScope}: {selectedScope.title}
                </span>
              ) : (
                <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600">
                  {uiCopy.labels.allScopes}
                </span>
              )}
            </div>
          </header>

          <div className="px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
            <Outlet />
          </div>
        </div>
      </div>
    </main>
  );
};
