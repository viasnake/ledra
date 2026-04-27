import { useMemo } from 'react';
import type { EntityRecord } from '@cataloga/types';
import type { EntityRelationEntry } from '../index';
import { cn } from '../lib/cn';
import { formatEntityTypeLabel, uiCopy } from '../copy';

type RelationGraphProps = {
  entity: EntityRecord;
  entries: readonly EntityRelationEntry[];
  activeRelationId?: string | undefined;
  onActiveRelationChange?: (relationId?: string) => void;
  onNodeSelect?: (entityId: string) => void;
  className?: string;
};

type GraphNode = {
  id: string;
  title: string;
  type: string;
  direction: 'incoming' | 'outgoing';
  relationIds: string[];
  relationTypes: string[];
};

const graphPalette = ['#0f766e', '#2563eb', '#9333ea', '#ea580c', '#0284c7', '#4f46e5'];

const getTypeColor = (type: string) => {
  const hash = Array.from(type).reduce((acc, character) => acc + character.charCodeAt(0), 0);
  return graphPalette[hash % graphPalette.length] ?? '#2563eb';
};

const clampEntries = (entries: readonly GraphNode[]) => entries.slice(0, 6);

const RelationNodeCard = ({
  node,
  activeRelationId,
  onActiveRelationChange,
  onNodeSelect
}: {
  node: GraphNode;
  activeRelationId?: string | undefined;
  onActiveRelationChange?: (relationId?: string) => void;
  onNodeSelect?: (entityId: string) => void;
}) => {
  const firstRelationId = node.relationIds[0];
  const color = getTypeColor(node.relationTypes[0] ?? node.type);
  const isActive =
    activeRelationId !== undefined &&
    node.relationIds.some((relationId) => relationId === activeRelationId);
  const relationLabel = node.relationTypes.join(' / ');

  return (
    <button
      className={cn(
        'w-full rounded-md border bg-white px-3 py-2 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50/40',
        isActive ? 'border-sky-300 bg-sky-50/70' : 'border-slate-200'
      )}
      onBlur={() => onActiveRelationChange?.(undefined)}
      onClick={() => onNodeSelect?.(node.id)}
      onFocus={() => onActiveRelationChange?.(firstRelationId)}
      onMouseEnter={() => onActiveRelationChange?.(firstRelationId)}
      onMouseLeave={() => onActiveRelationChange?.(undefined)}
      type="button"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="min-w-0">
          <span className="block break-words text-sm font-semibold leading-5 text-slate-950">
            {node.title}
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            {formatEntityTypeLabel(node.type)}
          </span>
          <span className="mt-1 block break-words font-mono text-[11px] leading-4 text-slate-500">
            {relationLabel}
          </span>
        </span>
      </div>
    </button>
  );
};

export const RelationGraph = ({
  entity,
  entries,
  activeRelationId,
  onActiveRelationChange,
  onNodeSelect,
  className
}: RelationGraphProps) => {
  const { incomingNodes, outgoingNodes, hiddenCount } = useMemo(() => {
    const groupedNodes = entries.reduce<Map<string, GraphNode>>((map, entry) => {
      const fallbackId =
        entry.direction === 'outgoing' ? entry.relation.target.id : entry.relation.source.id;
      const key = `${entry.direction}:${fallbackId}`;
      const current = map.get(key);
      const relationType = entry.relation.type;
      const nextNode: GraphNode = current
        ? {
            ...current,
            relationIds: [...current.relationIds, entry.relation.id],
            relationTypes: current.relationTypes.includes(relationType)
              ? current.relationTypes
              : [...current.relationTypes, relationType]
          }
        : {
            id: fallbackId,
            title: entry.relatedEntity?.title ?? fallbackId,
            type: entry.relatedEntity?.type ?? 'unknown',
            direction: entry.direction,
            relationIds: [entry.relation.id],
            relationTypes: [relationType]
          };

      map.set(key, nextNode);
      return map;
    }, new Map());

    const allIncoming = Array.from(groupedNodes.values()).filter(
      (node) => node.direction === 'incoming'
    );
    const allOutgoing = Array.from(groupedNodes.values()).filter(
      (node) => node.direction === 'outgoing'
    );

    return {
      incomingNodes: clampEntries(allIncoming),
      outgoingNodes: clampEntries(allOutgoing),
      hiddenCount:
        Math.max(0, allIncoming.length - clampEntries(allIncoming).length) +
        Math.max(0, allOutgoing.length - clampEntries(allOutgoing).length)
    };
  }, [entries]);

  const renderColumn = (title: string, nodes: readonly GraphNode[]) => (
    <section className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
          {nodes.length}
        </span>
      </div>
      {nodes.length > 0 ? (
        <div className="space-y-2">
          {nodes.map((node) => (
            <RelationNodeCard
              key={`${node.direction}-${node.id}`}
              node={node}
              {...(activeRelationId !== undefined ? { activeRelationId } : {})}
              {...(onActiveRelationChange ? { onActiveRelationChange } : {})}
              {...(onNodeSelect ? { onNodeSelect } : {})}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
          {uiCopy.status.noRelationsBody}
        </div>
      )}
    </section>
  );

  return (
    <div className={cn('graph-shell', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">{uiCopy.labels.graph}</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
            {entity.title}
          </h3>
        </div>
        <div className="flex flex-wrap justify-end gap-2 text-xs font-medium text-slate-600">
          <span className="rounded-md bg-teal-50 px-2.5 py-1 text-teal-800">
            {uiCopy.labels.incoming}
          </span>
          <span className="rounded-md bg-blue-50 px-2.5 py-1 text-blue-800">
            {uiCopy.labels.outgoing}
          </span>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_220px_minmax(220px,1fr)]">
        {renderColumn(uiCopy.labels.incoming, incomingNodes)}

        <section className="flex min-w-0 items-center">
          <div className="w-full rounded-md border border-slate-900 bg-slate-950 px-4 py-4 text-center text-white shadow-sm">
            <p className="text-xs font-semibold text-slate-300">
              {formatEntityTypeLabel(entity.type)}
            </p>
            <p className="mt-2 break-words text-base font-semibold leading-6">{entity.title}</p>
            <p className="mt-2 break-all font-mono text-[11px] leading-4 text-slate-300">
              {entity.id}
            </p>
            <p className="mt-3 rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-slate-200">
              {entries.length} relations
            </p>
          </div>
        </section>

        {renderColumn(uiCopy.labels.outgoing, outgoingNodes)}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
        <span>最大 12 ノードまで表示</span>
        <span className="text-slate-300">/</span>
        <span>{entries.length} 件の関係</span>
        {hiddenCount > 0 ? (
          <>
            <span className="text-slate-300">/</span>
            <span>{hiddenCount} 件は関連ノード一覧で確認</span>
          </>
        ) : null}
      </div>
    </div>
  );
};
