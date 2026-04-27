import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  createSearchParams,
  useParams,
  useSearchParams
} from 'react-router-dom';
import { formatEntityTypeLabel, uiCopy } from '../copy';
import {
  filterEntitiesForViewer,
  getRelationDegreeMap,
  getSelectedView
} from '../index';
import { useViewerContext } from '../viewer-context';

const TABLE_ROW_HEIGHT = 72;
const TABLE_OVERSCAN = 8;

export const EntityListPage = () => {
  const { bundle } = useViewerContext();
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
    <div className="space-y-3">
      <section className="panel px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">ノード一覧</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              {selectedScope ? `${selectedScope.title} のノード` : 'すべてのノード'}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span>
              {filteredView.entities.length}
              {uiCopy.labels.visible}
            </span>
            {selectedScope ? (
              <span className="rounded-md bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                {selectedScope.title}
              </span>
            ) : null}
          </div>
        </div>

        <nav
          aria-label="スコープ"
          className="-mx-3 mt-3 flex gap-1 overflow-x-auto border-y border-slate-200 bg-slate-50 px-3 py-2 sm:-mx-4 sm:px-4"
        >
          <Link
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              scopeId
                ? 'text-slate-600 hover:bg-white hover:text-slate-950'
                : 'bg-white text-sky-700 shadow-sm ring-1 ring-sky-100'
            }`}
            to={searchText ? `/?q=${encodeURIComponent(searchText)}` : '/'}
          >
            {uiCopy.labels.allScopes}
          </Link>
          {availableScopes.map((scope) => (
            <Link
              key={scope.id}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                scopeId === scope.id
                  ? 'bg-white text-sky-700 shadow-sm ring-1 ring-sky-100'
                  : 'text-slate-600 hover:bg-white hover:text-slate-950'
              }`}
              to={`/scopes/${scope.id}${searchText ? `?q=${encodeURIComponent(searchText)}` : ''}`}
            >
              {scope.title}
            </Link>
          ))}
        </nav>

        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="space-y-1" htmlFor="entity-search">
            <span className="text-xs font-semibold text-slate-700">{uiCopy.labels.search}</span>
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
          <button
            className="secondary-button h-10"
            onClick={() => setSearchParams(new URLSearchParams())}
            type="button"
          >
            {uiCopy.actions.clearFilters}
          </button>
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
              className="min-w-[920px] border-separate border-spacing-0 text-sm"
              aria-label="ノード一覧テーブル"
              aria-rowcount={totalRows}
            >
              <thead className="bg-slate-50/85 text-left text-xs tracking-[0.12em] whitespace-nowrap text-slate-500 uppercase">
                <tr>
                  <th className="w-[320px] px-4 py-3 font-semibold">{uiCopy.table.node}</th>
                  <th className="w-[140px] px-4 py-3 font-semibold">{uiCopy.table.type}</th>
                  <th className="w-[260px] px-4 py-3 font-semibold">ID</th>
                  <th className="w-[96px] px-4 py-3 text-right font-semibold">
                    {uiCopy.table.relationCount}
                  </th>
                  <th className="w-[220px] px-4 py-3 font-semibold">{uiCopy.table.tags}</th>
                </tr>
              </thead>
              <tbody>
                {paddingTop > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={5} style={{ height: `${paddingTop}px`, padding: 0 }} />
                  </tr>
                ) : null}
                {visibleEntities.map((entity) => {
                  const relationCount = relationDegrees.get(entity.id) ?? 0;
                  const params = createSearchParams({
                    ...(scopeId ? { scope: scopeId } : {}),
                    ...(searchText ? { q: searchText } : {})
                  }).toString();

                  return (
                    <tr
                      key={entity.id}
                      className="border-t border-slate-200 text-sm text-slate-700 hover:bg-sky-50/50"
                      style={{ height: `${TABLE_ROW_HEIGHT}px` }}
                    >
                      <td className="px-4 py-3 align-top">
                        <Link
                          className="font-semibold whitespace-nowrap text-slate-900 hover:text-sky-700"
                          to={`/nodes/${entity.id}${params ? `?${params}` : ''}`}
                        >
                          {entity.title}
                        </Link>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                          {entity.summary ?? '概要は未設定です。'}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                          {formatEntityTypeLabel(entity.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-xs whitespace-nowrap text-slate-500">
                        {entity.id}
                      </td>
                      <td className="px-4 py-3 text-right align-top font-semibold text-slate-800">
                        {relationCount}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-nowrap gap-1">
                          {entity.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md bg-teal-50 px-2 py-0.5 text-xs whitespace-nowrap text-teal-700"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paddingBottom > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={5} style={{ height: `${paddingBottom}px`, padding: 0 }} />
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
