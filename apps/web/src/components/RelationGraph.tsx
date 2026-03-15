import { useMemo } from 'react';
import type { EntityRecord } from '@ledra/types';
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

const graphPalette = ['#0f766e', '#2563eb', '#0f766e', '#9333ea', '#ea580c', '#0284c7'];

const getTypeColor = (type: string) => {
  const hash = Array.from(type).reduce((acc, character) => acc + character.charCodeAt(0), 0);
  return graphPalette[hash % graphPalette.length];
};

const clampEntries = (entries: readonly GraphNode[]) => entries.slice(0, 4);

const distributeY = (index: number, total: number) => {
  if (total <= 1) {
    return 240;
  }

  const step = 300 / (total - 1);
  return 90 + index * step;
};

export const RelationGraph = ({
  entity,
  entries,
  activeRelationId,
  onActiveRelationChange,
  onNodeSelect,
  className
}: RelationGraphProps) => {
  const { incomingNodes, outgoingNodes } = useMemo(() => {
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

    return {
      incomingNodes: clampEntries(
        Array.from(groupedNodes.values()).filter((node) => node.direction === 'incoming')
      ),
      outgoingNodes: clampEntries(
        Array.from(groupedNodes.values()).filter((node) => node.direction === 'outgoing')
      )
    };
  }, [entries]);

  return (
    <div className={cn('graph-shell', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">{uiCopy.labels.graph}</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
            {entity.title}
          </h3>
        </div>
        <div className="flex flex-wrap justify-end gap-2 text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-teal-800">
            <span className="h-2 w-2 rounded-full bg-teal-600" />
            {uiCopy.labels.incoming}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-800">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            {uiCopy.labels.outgoing}
          </span>
        </div>
      </div>

      <svg
        aria-label={`${entity.title} の関係グラフ`}
        className="h-[260px] w-full"
        viewBox="0 0 820 480"
      >
        <defs>
          <radialGradient id="ledra-center-glow" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#bfdbfe" stopOpacity="0.15" />
          </radialGradient>
        </defs>

        <g opacity="0.9">
          <circle cx="410" cy="240" r="102" fill="url(#ledra-center-glow)" />
          <circle cx="410" cy="240" r="124" fill="none" stroke="#dbeafe" strokeDasharray="6 10" />
        </g>

        {[...incomingNodes, ...outgoingNodes].map((node, index) => {
          const incomingIndex = incomingNodes.findIndex(
            (candidate) => candidate.id === node.id && candidate.direction === node.direction
          );
          const outgoingIndex = outgoingNodes.findIndex(
            (candidate) => candidate.id === node.id && candidate.direction === node.direction
          );
          const isIncoming = node.direction === 'incoming';
          const x = isIncoming ? 155 : 665;
          const y = distributeY(
            isIncoming ? incomingIndex : outgoingIndex,
            isIncoming ? incomingNodes.length : outgoingNodes.length
          );
          const edgeColor = getTypeColor(node.relationTypes[0] ?? node.type);
          const isActive =
            activeRelationId !== undefined &&
            node.relationIds.some((relationId) => relationId === activeRelationId);
          const firstRelationId = node.relationIds[0];
          const edgeStartX = isIncoming ? 310 : 510;
          const edgeEndX = isIncoming ? x + 40 : x - 40;
          const edgePath = `M ${edgeStartX} 240 C ${isIncoming ? 270 : 550} 240, ${
            isIncoming ? 240 : 580
          } ${y}, ${edgeEndX} ${y}`;

          return (
            <g key={`${node.direction}-${node.id}-${index}`}>
              {node.relationIds.map((relationId, relationIndex) => (
                <path
                  key={relationId}
                  d={edgePath}
                  fill="none"
                  opacity={activeRelationId && activeRelationId !== relationId ? 0.2 : 0.8}
                  stroke={edgeColor}
                  strokeDasharray={node.direction === 'incoming' ? '0' : '8 6'}
                  strokeLinecap="round"
                  strokeWidth={
                    isActive || activeRelationId === relationId ? 3.8 : 2.4 - relationIndex * 0.12
                  }
                  onFocus={() => onActiveRelationChange?.(relationId)}
                  onMouseEnter={() => onActiveRelationChange?.(relationId)}
                  onMouseLeave={() => onActiveRelationChange?.(undefined)}
                />
              ))}

              <g
                className="cursor-pointer"
                role={onNodeSelect ? 'button' : undefined}
                tabIndex={onNodeSelect ? 0 : undefined}
                onClick={() => onNodeSelect?.(node.id)}
                onFocus={() => onActiveRelationChange?.(firstRelationId)}
                onKeyDown={(event) => {
                  if (!onNodeSelect) {
                    return;
                  }

                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onNodeSelect(node.id);
                  }
                }}
                onMouseEnter={() => onActiveRelationChange?.(firstRelationId)}
                onMouseLeave={() => onActiveRelationChange?.(undefined)}
              >
                <circle
                  cx={x}
                  cy={y}
                  fill="#ffffff"
                  r={isActive ? 35 : 30}
                  stroke={edgeColor}
                  strokeWidth={isActive ? 4 : 2.5}
                />
                <circle cx={x} cy={y} fill={edgeColor} fillOpacity="0.08" r={40} />
                <text
                  fill="#0f172a"
                  fontFamily="Manrope, sans-serif"
                  fontSize="12"
                  fontWeight="700"
                  textAnchor="middle"
                  x={x}
                  y={y - 2}
                >
                  {node.title.slice(0, 14)}
                </text>
                <text
                  fill="#475569"
                  fontFamily="IBM Plex Mono, monospace"
                  fontSize="9"
                  textAnchor="middle"
                  x={x}
                  y={y + 16}
                >
                  {formatEntityTypeLabel(node.type).slice(0, 12)}
                </text>
              </g>
            </g>
          );
        })}

        <g>
          <circle cx="410" cy="240" fill="#0f172a" r="52" />
          <circle
            cx="410"
            cy="240"
            fill="none"
            r="58"
            stroke="#0f172a"
            strokeOpacity="0.1"
            strokeWidth="36"
          />
          <text
            fill="#f8fafc"
            fontFamily="Manrope, sans-serif"
            fontSize="14"
            fontWeight="800"
            textAnchor="middle"
            x="410"
            y="235"
          >
            {entity.title.slice(0, 14)}
          </text>
          <text
            fill="#cbd5e1"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="10"
            textAnchor="middle"
            x="410"
            y="254"
          >
            {formatEntityTypeLabel(entity.type)}
          </text>
        </g>
      </svg>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
        <span>最大 8 ノードまで表示</span>
        <span className="text-slate-300">/</span>
        <span>{entries.length} 件の関係</span>
      </div>
    </div>
  );
};
