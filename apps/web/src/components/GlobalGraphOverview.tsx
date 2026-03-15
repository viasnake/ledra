import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { formatEntityTypeLabel } from '../copy';
import type { GraphOverviewData, GraphOverviewNode } from '../index';

type GlobalGraphOverviewProps = {
  data: GraphOverviewData;
  highlightedTypes?: ReadonlySet<string> | undefined;
  onNodeSelect?: (nodeId: string) => void;
};

type PositionedNode = GraphOverviewNode & {
  x: number;
  y: number;
  radius: number;
};

const NODE_COLORS: readonly string[] = [
  '#0f766e',
  '#2563eb',
  '#ea580c',
  '#7c3aed',
  '#0891b2',
  '#4f46e5'
];

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const colorForType = (type: string) =>
  NODE_COLORS[hashString(type) % NODE_COLORS.length] ?? '#2563eb';

const buildPositionedNodes = (
  nodes: readonly GraphOverviewNode[],
  width: number,
  height: number
): readonly PositionedNode[] => {
  const margin = 24;
  const innerWidth = Math.max(200, width - margin * 2);
  const innerHeight = Math.max(140, height - margin * 2);
  const typeGroups = new Map<string, GraphOverviewNode[]>();

  for (const node of nodes) {
    const bucket = typeGroups.get(node.type) ?? [];
    bucket.push(node);
    typeGroups.set(node.type, bucket);
  }

  const groupEntries = Array.from(typeGroups.entries()).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const centerX = margin + innerWidth / 2;
  const centerY = margin + innerHeight / 2;
  const ringRadius = Math.min(innerWidth, innerHeight) * 0.34;

  return groupEntries.flatMap(([, group], groupIndex) => {
    const groupAngle = (Math.PI * 2 * groupIndex) / Math.max(groupEntries.length, 1);
    const groupCenterX = centerX + Math.cos(groupAngle) * ringRadius;
    const groupCenterY = centerY + Math.sin(groupAngle) * ringRadius;

    return group.map((node, index) => {
      const localAngle = ((hashString(node.id) % 360) * Math.PI) / 180;
      const localRadius = 12 + (index % 5) * 8;
      const degreeRadius = Math.min(8, 3 + Math.log2(node.degree + 1));

      return {
        ...node,
        x: groupCenterX + Math.cos(localAngle) * localRadius,
        y: groupCenterY + Math.sin(localAngle) * localRadius,
        radius: degreeRadius
      };
    });
  });
};

export const GlobalGraphOverview = ({
  data,
  highlightedTypes,
  onNodeSelect
}: GlobalGraphOverviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 960, height: 320 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | undefined>();

  const positionedNodes = useMemo(
    () => buildPositionedNodes(data.nodes, size.width, size.height),
    [data.nodes, size.height, size.width]
  );

  const nodeById = useMemo(() => {
    return new Map(positionedNodes.map((node) => [node.id, node]));
  }, [positionedNodes]);

  const adjacentNodeIds = useMemo(() => {
    const map = new Map<string, Set<string>>();

    for (const edge of data.edges) {
      const left = map.get(edge.sourceId) ?? new Set<string>();
      const right = map.get(edge.targetId) ?? new Set<string>();
      left.add(edge.targetId);
      right.add(edge.sourceId);
      map.set(edge.sourceId, left);
      map.set(edge.targetId, right);
    }

    return map;
  }, [data.edges]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const parent = canvas.parentElement;
    if (!parent) {
      return;
    }

    const updateSize = () => {
      const nextWidth = Math.max(360, parent.clientWidth);
      const nextHeight = 320;
      setSize({ width: nextWidth, height: nextHeight });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(parent);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * ratio);
    canvas.height = Math.floor(size.height * ratio);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    const activeSet = hoveredNodeId
      ? new Set<string>([hoveredNodeId, ...(adjacentNodeIds.get(hoveredNodeId) ?? [])])
      : undefined;

    for (const edge of data.edges) {
      const source = nodeById.get(edge.sourceId);
      const target = nodeById.get(edge.targetId);
      if (!source || !target) {
        continue;
      }

      const sourceActive = activeSet?.has(source.id) ?? true;
      const targetActive = activeSet?.has(target.id) ?? true;

      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.lineWidth = sourceActive && targetActive ? 1.1 : 0.8;
      context.strokeStyle =
        sourceActive && targetActive ? 'rgba(71, 85, 105, 0.42)' : 'rgba(148, 163, 184, 0.2)';
      context.stroke();
    }

    for (const node of positionedNodes) {
      const color = colorForType(node.type);
      const inScope = highlightedTypes ? highlightedTypes.has(node.type) : true;
      const isHovered = hoveredNodeId === node.id;
      const isConnected = hoveredNodeId ? adjacentNodeIds.get(hoveredNodeId)?.has(node.id) : false;
      const visible = hoveredNodeId ? isHovered || isConnected : true;

      context.beginPath();
      context.arc(node.x, node.y, isHovered ? node.radius + 2.2 : node.radius, 0, Math.PI * 2);
      context.fillStyle = visible
        ? inScope
          ? `${color}cc`
          : '#94a3b8aa'
        : 'rgba(148, 163, 184, 0.16)';
      context.fill();

      if (isHovered) {
        context.beginPath();
        context.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
        context.strokeStyle = `${color}44`;
        context.lineWidth = 3;
        context.stroke();
      }
    }
  }, [
    adjacentNodeIds,
    data.edges,
    highlightedTypes,
    hoveredNodeId,
    nodeById,
    positionedNodes,
    size.height,
    size.width
  ]);

  const hoveredNode = hoveredNodeId ? nodeById.get(hoveredNodeId) : undefined;

  const resolveHoveredNode = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const rect = canvas.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    let nearest: PositionedNode | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const node of positionedNodes) {
      const dx = node.x - cursorX;
      const dy = node.y - cursorY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    }

    if (!nearest || nearestDistance > 12) {
      return undefined;
    }

    return nearest;
  };

  return (
    <div className="space-y-3">
      <div className="graph-canvas-shell">
        <canvas
          aria-label="全体関連グラフ"
          className="graph-canvas"
          onClick={(event) => {
            const hovered = resolveHoveredNode(event);
            if (hovered) {
              onNodeSelect?.(hovered.id);
            }
          }}
          onMouseLeave={() => {
            setHoveredNodeId(undefined);
          }}
          onMouseMove={(event) => {
            const hovered = resolveHoveredNode(event);
            setHoveredNodeId(hovered?.id);
          }}
          ref={canvasRef}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-1">ノード {data.nodes.length}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1">関係 {data.edges.length}</span>
          {data.truncated ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">
              全体 {data.totalNodes}/{data.totalEdges} から軽量表示
            </span>
          ) : null}
        </div>
        <div className="truncate text-right">
          {hoveredNode
            ? `${hoveredNode.title} (${formatEntityTypeLabel(hoveredNode.type)})`
            : 'ノードをポイントすると関連が強調されます'}
        </div>
      </div>
    </div>
  );
};
