import { NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { getSelectedView, viewerMode } from '../index';
import { useViewerContext } from '../viewer-context';
import { formatGeneratedAt, uiCopy } from '../copy';
import { cn } from '../lib/cn';

const navClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition-colors',
    isActive
      ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/10'
      : 'text-slate-600 hover:bg-white hover:text-slate-950'
  );

export const AppLayout = () => {
  const { bundle, bundlePath } = useViewerContext();
  const { scopeId } = useParams();
  const [searchParams] = useSearchParams();
  const activeScopeId = scopeId ?? searchParams.get('scope') ?? undefined;
  const selectedScope = activeScopeId ? getSelectedView(bundle.graph, activeScopeId) : undefined;
  const firstScopeId = bundle.graph.views[0]?.id;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      <header className="topbar-blur sticky top-2 z-20 mb-5 overflow-hidden rounded-[24px] border border-white/70 bg-white/86 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <NavLink className="flex items-center gap-3" to="/">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-sm font-black tracking-[0.2em] text-white">
                L
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold tracking-tight text-slate-950">
                  {uiCopy.brand.title}
                </p>
                <p className="truncate text-xs text-slate-500">{uiCopy.brand.subtitle}</p>
              </div>
            </NavLink>
          </div>

          <nav className="flex items-center gap-2" aria-label="主要ナビゲーション">
            <NavLink className={navClassName} end to="/">
              {uiCopy.nav.list}
            </NavLink>
            {firstScopeId ? (
              <NavLink className={navClassName} to={`/scopes/${firstScopeId}`}>
                {uiCopy.nav.scopes}
              </NavLink>
            ) : null}
          </nav>

          {selectedScope ? (
            <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800">
              {uiCopy.labels.currentScope}: {selectedScope.title}
            </span>
          ) : (
            <span className="text-sm font-medium text-slate-500">{uiCopy.labels.allScopes}</span>
          )}
        </div>
      </header>

      <div className="flex-1">
        <Outlet />
      </div>

      <footer className="mt-6">
        <details className="rounded-2xl border border-slate-200/90 bg-white/70 px-4 py-3 text-sm text-slate-600">
          <summary className="cursor-pointer select-none font-semibold text-slate-700">
            {uiCopy.system.toggle}
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2">
              <span className="text-xs text-slate-500">{uiCopy.system.bundlePath}</span>
              <p className="mt-1 break-all font-mono text-xs text-slate-700">{bundlePath}</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2">
              <span className="text-xs text-slate-500">{uiCopy.system.generatedAt}</span>
              <p className="mt-1 font-medium text-slate-700">
                {formatGeneratedAt(bundle.generatedAt)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2">
              <span className="text-xs text-slate-500">{uiCopy.system.mode}</span>
              <p className="mt-1 font-medium text-slate-700">{viewerMode}</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2">
              <span className="text-xs text-slate-500">{uiCopy.system.entities}</span>
              <p className="mt-1 font-medium text-slate-700">
                {bundle.diagnostics.counts.entities}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2">
              <span className="text-xs text-slate-500">{uiCopy.system.relations}</span>
              <p className="mt-1 font-medium text-slate-700">
                {bundle.diagnostics.counts.relations}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2">
              <span className="text-xs text-slate-500">{uiCopy.system.scopes}</span>
              <p className="mt-1 font-medium text-slate-700">{bundle.diagnostics.counts.views}</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2">
              <span className="text-xs text-slate-500">{uiCopy.system.policies}</span>
              <p className="mt-1 font-medium text-slate-700">
                {bundle.diagnostics.counts.policies}
              </p>
            </div>
          </div>
        </details>
      </footer>
    </main>
  );
};
