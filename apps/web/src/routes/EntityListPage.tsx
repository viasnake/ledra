import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  createSearchParams,
  useNavigate,
  useParams,
  useSearchParams
} from 'react-router-dom';
import { GlobalGraphOverview } from '../components/GlobalGraphOverview';
import { formatAttributeValue, formatEntityTypeLabel, uiCopy } from '../copy';
import {
  buildGraphOverviewData,
  filterEntitiesForViewer,
  getRelationDegreeMap,
  getSelectedView
} from '../index';
import { useViewerContext } from '../viewer-context';

const TABLE_ROW_HEIGHT = 88;
const TABLE_OVERSCAN = 8;

export const EntityListPage = () => {
  const { bundle } = useViewerContext();
  const navigate = useNavigate();
  const { scopeId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchText = searchParams.get('q') ?? '';
  const deferredSearchText = useDeferredValue(searchText);
  const tableScrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);

  const selectedScope = scopeId ? getSelectedView(bundle.graph, scopeId) : undefined;
  const filteredView = useMemo(
    () => filterEntitiesForViewer(bundle, deferredSearchText, scopeId),
    [bundle, scopeId, deferredSearchText]
  );
  const relationDegrees = useMemo(() => getRelationDegreeMap(bundle), [bundle]);
  const graphOverviewData = useMemo(
    () => buildGraphOverviewData(bundle, { maxNodes: 120, maxEdges: 240 }),
    [bundle]
  );
  const availableScopes = bundle.graph.views;
  const totalRows = filteredView.entities.length;

  useEffect(() => {
    const element = tableScrollerRef.current;
    if (!element) {
      return;
    }

    const applySize = () => {
      setViewportHeight(element.clientHeight || 640);
    };

    applySize();

    const observer = new ResizeObserver(applySize);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [totalRows]);

  useEffect(() => {
    const element = tableScrollerRef.current;
    if (!element) {
      return;
    }

    element.scrollTop = 0;
    setScrollTop(0);
  }, [scopeId, deferredSearchText]);

  const startIndex = Math.max(0, Math.floor(scrollTop / TABLE_ROW_HEIGHT) - TABLE_OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / TABLE_ROW_HEIGHT) + TABLE_OVERSCAN * 2;
  const endIndex = Math.min(totalRows, startIndex + visibleCount);
  const visibleEntities = filteredView.entities.slice(startIndex, endIndex);
  const paddingTop = startIndex * TABLE_ROW_HEIGHT;
  const paddingBottom = Math.max(0, (totalRows - endIndex) * TABLE_ROW_HEIGHT);

  if (scopeId && !selectedScope) {
    return (
      <section className="status-panel">
        <p className="eyebrow">不明なスコープ</p>
        <h1>{uiCopy.status.scopeNotFoundTitle}</h1>
        <p>{uiCopy.status.scopeNotFoundBody}</p>
        <Link className="primary-button mt-6" to="/">
          {uiCopy.labels.allNodes}
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="panel px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">全体関連グラフ</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
              ネットワーク全体のつながり
            </h2>
          </div>
          {selectedScope ? (
            <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-700">
              {selectedScope.title} を色で強調
            </span>
          ) : null}
        </div>
        <GlobalGraphOverview
          data={graphOverviewData}
          highlightedTypes={selectedScope ? new Set(selectedScope.entityTypes) : undefined}
          onNodeSelect={(entityId) => {
            const params = createSearchParams({
              ...(scopeId ? { scope: scopeId } : {}),
              ...(searchText ? { q: searchText } : {})
            }).toString();
            navigate(`/nodes/${entityId}${params ? `?${params}` : ''}`);
          }}
        />
      </section>

      <section className="panel px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">ノード一覧</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              {selectedScope ? `${selectedScope.title} のノード` : 'すべてのノード'}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span>
              {filteredView.entities.length}
              {uiCopy.labels.visible}
            </span>
            {selectedScope ? (
              <span className="rounded-full bg-teal-50 px-3 py-1 text-teal-700">
                {selectedScope.title}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_260px]">
          <label className="space-y-1" htmlFor="entity-search">
            <span className="text-sm font-semibold text-slate-700">{uiCopy.labels.search}</span>
            <input
              id="entity-search"
              className="field-input"
              placeholder={uiCopy.labels.searchPlaceholder}
              value={searchText}
              onChange={(event) => {
                const next = new URLSearchParams(searchParams);
                if (event.target.value) {
                  next.set('q', event.target.value);
                } else {
                  next.delete('q');
                }
                setSearchParams(next, { replace: true });
              }}
            />
          </label>

          <label className="space-y-1" htmlFor="scope-select">
            <span className="text-sm font-semibold text-slate-700">{uiCopy.routes.scopes}</span>
            <select
              className="field-input"
              id="scope-select"
              value={scopeId ?? ''}
              onChange={(event) => {
                const nextScopeId = event.target.value;
                const query = searchText ? `?q=${encodeURIComponent(searchText)}` : '';
                navigate(nextScopeId ? `/scopes/${nextScopeId}${query}` : `/${query}`);
              }}
            >
              <option value="">{uiCopy.labels.allScopes}</option>
              {availableScopes.map((scope) => (
                <option key={scope.id} value={scope.id}>
                  {scope.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel overflow-hidden px-0 py-0">
        {totalRows === 0 ? (
          <div className="empty-state-block m-4">
            <p>{uiCopy.status.noResultsBody}</p>
            <button
              className="secondary-button mt-4"
              onClick={() => setSearchParams(new URLSearchParams())}
              type="button"
            >
              {uiCopy.actions.clearFilters}
            </button>
          </div>
        ) : (
          <div
            className="max-h-[68vh] overflow-auto"
            onScroll={(event) => {
              setScrollTop(event.currentTarget.scrollTop);
            }}
            ref={tableScrollerRef}
          >
            <table
              className="min-w-full border-separate border-spacing-0"
              aria-label="ノード一覧テーブル"
              aria-rowcount={totalRows}
            >
              <thead className="bg-slate-50/85 text-left text-xs tracking-[0.12em] text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">{uiCopy.table.node}</th>
                  <th className="px-4 py-3 font-semibold">{uiCopy.table.type}</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">ID</th>
                  <th className="px-4 py-3 font-semibold text-right">
                    {uiCopy.table.relationCount}
                  </th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">
                    {uiCopy.table.tags}
                  </th>
                  <th className="hidden px-4 py-3 font-semibold xl:table-cell">
                    {uiCopy.table.attributes}
                  </th>
                  <th className="px-4 py-3 font-semibold text-right">{uiCopy.table.action}</th>
                </tr>
              </thead>
              <tbody>
                {paddingTop > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={7} style={{ height: `${paddingTop}px`, padding: 0 }} />
                  </tr>
                ) : null}
                {visibleEntities.map((entity) => {
                  const relationCount = relationDegrees.get(entity.id) ?? 0;
                  const params = createSearchParams({
                    ...(scopeId ? { scope: scopeId } : {}),
                    ...(searchText ? { q: searchText } : {})
                  }).toString();
                  const preview = Object.entries(entity.attributes).slice(0, 2);

                  return (
                    <tr
                      key={entity.id}
                      className="border-t border-slate-200/80 text-sm text-slate-700 hover:bg-sky-50/30"
                      style={{ height: `${TABLE_ROW_HEIGHT}px` }}
                    >
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold text-slate-900">{entity.title}</p>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                          {entity.summary ?? '概要は未設定です。'}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
                          {formatEntityTypeLabel(entity.type)}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 align-top font-mono text-xs text-slate-500 md:table-cell">
                        {entity.id}
                      </td>
                      <td className="px-4 py-3 text-right align-top font-semibold text-slate-800">
                        {relationCount}
                      </td>
                      <td className="hidden px-4 py-3 align-top lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {entity.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-700"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 align-top text-xs text-slate-500 xl:table-cell">
                        {preview.length > 0
                          ? preview
                              .map(([key, value]) => `${key}: ${formatAttributeValue(value)}`)
                              .join(' / ')
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <Link
                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-700"
                          to={`/nodes/${entity.id}${params ? `?${params}` : ''}`}
                        >
                          {uiCopy.table.openDetail}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {paddingBottom > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={7} style={{ height: `${paddingBottom}px`, padding: 0 }} />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
