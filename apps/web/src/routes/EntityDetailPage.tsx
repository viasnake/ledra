import { useMemo, useState } from 'react';
import { Link, createSearchParams, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { RelationGraph } from '../components/RelationGraph';
import { formatAttributeValue, formatEntityTypeLabel, uiCopy } from '../copy';
import { getEntityById, getEntityRelations, getSelectedView } from '../index';
import { useViewerContext } from '../viewer-context';
import { cn } from '../lib/cn';

export const EntityDetailPage = () => {
  const { bundle } = useViewerContext();
  const navigate = useNavigate();
  const { entityId } = useParams();
  const [searchParams] = useSearchParams();
  const scopeId = searchParams.get('scope') ?? undefined;
  const searchText = searchParams.get('q') ?? undefined;
  const selectedScope = getSelectedView(bundle.graph, scopeId);
  const entity = getEntityById(bundle, entityId);
  const [activeRelationId, setActiveRelationId] = useState<string | undefined>(undefined);

  const returnPath = selectedScope ? `/scopes/${selectedScope.id}` : '/';
  const returnSearch = createSearchParams({
    ...(searchText ? { q: searchText } : {})
  }).toString();
  const relatedRelations = entity ? getEntityRelations(bundle, entity.id) : [];
  const relationSearch = createSearchParams({
    ...(scopeId ? { scope: scopeId } : {}),
    ...(searchText ? { q: searchText } : {})
  }).toString();

  const groupedRelations = useMemo(
    () => ({
      incoming: relatedRelations.filter((entry) => entry.direction === 'incoming'),
      outgoing: relatedRelations.filter((entry) => entry.direction === 'outgoing')
    }),
    [relatedRelations]
  );

  if (!entity) {
    return (
      <section className="status-panel">
        <p className="eyebrow">不明なノード</p>
        <h1>{uiCopy.status.nodeNotFoundTitle}</h1>
        <p>{uiCopy.status.nodeNotFoundBody}</p>
        <Link
          className="primary-button mt-6"
          to={`${returnPath}${returnSearch ? `?${returnSearch}` : ''}`}
        >
          {uiCopy.actions.backToResults}
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-sm text-slate-500"
      >
        <Link className="transition hover:text-slate-900" to="/">
          {uiCopy.routes.overview}
        </Link>
        {selectedScope ? (
          <>
            <span>/</span>
            <Link
              className="transition hover:text-slate-900"
              to={`${returnPath}${returnSearch ? `?${returnSearch}` : ''}`}
            >
              {selectedScope.title}
            </Link>
          </>
        ) : null}
        <span>/</span>
        <span className="font-medium text-slate-700">{entity.title}</span>
      </nav>

      <section className="panel px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex rounded-md bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
              {formatEntityTypeLabel(entity.type)}
            </span>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              {entity.title}
            </h1>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
              {entity.summary ?? 'このノードには説明文がまだありません。'}
            </p>
          </div>
          <Link
            className="secondary-button"
            to={`${returnPath}${returnSearch ? `?${returnSearch}` : ''}`}
          >
            {uiCopy.actions.backToResults}
          </Link>
        </div>

        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">ノード ID</dt>
            <dd className="mt-1 break-all font-mono text-xs text-slate-700">{entity.id}</dd>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">{uiCopy.labels.relations}</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-800">{relatedRelations.length}</dd>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <dt className="text-xs text-slate-500">{uiCopy.labels.sourceFile}</dt>
            <dd className="mt-1 break-all font-mono text-xs text-slate-700">
              {entity.sourceFilePath}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <RelationGraph
          activeRelationId={activeRelationId}
          className="min-h-[330px]"
          entity={entity}
          entries={relatedRelations}
          onActiveRelationChange={setActiveRelationId}
          onNodeSelect={(nodeId) => {
            navigate(`/nodes/${nodeId}${relationSearch ? `?${relationSearch}` : ''}`);
          }}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <article className="panel px-3 py-3 sm:px-4">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="eyebrow">属性</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
                主要な属性
              </h2>
            </div>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {Object.entries(entity.attributes).map(([key, value]) => (
              <div
                key={key}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <dt className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
                  {key}
                </dt>
                <dd className="mt-2 text-sm text-slate-700">{formatAttributeValue(value)}</dd>
              </div>
            ))}
          </dl>
        </article>

        <aside className="panel px-4 py-5 sm:px-6">
          <div className="mb-3">
            <p className="eyebrow">タグ</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">分類タグ</h2>
          </div>
          {entity.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {entity.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-md bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">タグは設定されていません。</p>
          )}
        </aside>
      </section>

      <section className="panel px-3 py-3 sm:px-4">
        <div className="mb-3">
          <p className="eyebrow">関係</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">関連ノード</h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {(['incoming', 'outgoing'] as const).map((direction) => {
            const entries = groupedRelations[direction];

            return (
              <section key={direction} className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  {direction === 'incoming' ? uiCopy.labels.incoming : uiCopy.labels.outgoing}
                </h3>
                {entries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                    {uiCopy.status.noRelationsBody}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {entries.map(({ direction: relationDirection, relation, relatedEntity }) => {
                      const targetId =
                        relationDirection === 'outgoing' ? relation.target.id : relation.source.id;

                      return (
                        <li key={`${relationDirection}-${relation.id}`}>
                          <div
                            className={cn(
                              'rounded-md border border-slate-200 bg-slate-50 px-3 py-2 transition',
                              activeRelationId === relation.id && 'border-sky-200 bg-sky-50/70'
                            )}
                            onMouseEnter={() => setActiveRelationId(relation.id)}
                            onMouseLeave={() => setActiveRelationId(undefined)}
                          >
                            <p className="text-xs text-slate-500">{relation.type}</p>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              {relatedEntity ? (
                                <Link
                                  className="font-semibold text-slate-900 hover:text-sky-700"
                                  to={`/nodes/${relatedEntity.id}${relationSearch ? `?${relationSearch}` : ''}`}
                                >
                                  {relatedEntity.title}
                                </Link>
                              ) : (
                                <span className="font-semibold text-slate-900">{targetId}</span>
                              )}
                              <span className="font-mono text-xs text-slate-500">
                                {relation.id}
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
};
