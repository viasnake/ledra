import { searchEntities } from '@ledra/search';
import { VIEWER_POLICY } from '@ledra/schemas';
import type {
  EntityRecord,
  LedraBundle,
  RegistryGraph,
  RelationRecord,
  ViewRecord
} from '@ledra/types';

export const appName = '@ledra/web';
export const DEFAULT_BUNDLE_PATH = '/bundle.json';
export const viewerMode = VIEWER_POLICY.mode;

export type FilteredViewState = {
  entities: readonly EntityRecord[];
  selectedView?: ViewRecord;
};

export type EntityRelationEntry = {
  direction: 'outgoing' | 'incoming';
  relation: RelationRecord;
  relatedEntity: EntityRecord | undefined;
};

export type GraphOverviewNode = {
  id: string;
  type: EntityRecord['type'];
  title: string;
  degree: number;
};

export type GraphOverviewEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
};

export type GraphOverviewData = {
  nodes: readonly GraphOverviewNode[];
  edges: readonly GraphOverviewEdge[];
  totalNodes: number;
  totalEdges: number;
  truncated: boolean;
};

const intersectEntityLists = (
  left: readonly EntityRecord[],
  right: readonly EntityRecord[]
): readonly EntityRecord[] => {
  const rightIds = new Set(right.map((entity) => entity.id));
  return left.filter((entity) => rightIds.has(entity.id));
};

export const getSelectedView = (
  graph: RegistryGraph,
  viewId: string | undefined
): ViewRecord | undefined => graph.views.find((view) => view.id === viewId);

export const getEntityById = (
  bundle: LedraBundle,
  entityId: string | undefined
): EntityRecord | undefined => {
  if (!entityId) {
    return undefined;
  }

  return bundle.graph.entities.find((entity) => entity.id === entityId);
};

export const filterEntitiesForViewer = (
  bundle: LedraBundle,
  searchText: string,
  selectedViewId?: string
): FilteredViewState => {
  const graph = bundle.graph;
  const selectedView = getSelectedView(graph, selectedViewId);
  let entities: readonly EntityRecord[] = graph.entities;

  if (selectedView) {
    const scopedTypes = new Set(selectedView.entityTypes);
    entities = entities.filter((entity) => scopedTypes.has(entity.type));

    if (selectedView.query) {
      entities = intersectEntityLists(entities, searchEntities(selectedView.query, graph));
    }
  }

  if (searchText.trim()) {
    entities = intersectEntityLists(entities, searchEntities(searchText, graph));
  }

  return selectedView ? { entities, selectedView } : { entities };
};

export const getEntityRelations = (
  bundle: LedraBundle,
  entityId: string
): readonly EntityRelationEntry[] => {
  return bundle.graph.relations.flatMap((relation): readonly EntityRelationEntry[] => {
    if (relation.source.id === entityId) {
      return [
        {
          direction: 'outgoing' as const,
          relation,
          relatedEntity: getEntityById(bundle, relation.target.id)
        }
      ];
    }

    if (relation.target.id === entityId) {
      return [
        {
          direction: 'incoming' as const,
          relation,
          relatedEntity: getEntityById(bundle, relation.source.id)
        }
      ];
    }

    return [];
  });
};

export const getRelationDegreeMap = (bundle: LedraBundle): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();

  for (const relation of bundle.graph.relations) {
    counts.set(relation.source.id, (counts.get(relation.source.id) ?? 0) + 1);
    counts.set(relation.target.id, (counts.get(relation.target.id) ?? 0) + 1);
  }

  return counts;
};

export const buildGraphOverviewData = (
  bundle: LedraBundle,
  options?: {
    maxNodes?: number;
    maxEdges?: number;
  }
): GraphOverviewData => {
  const maxNodes = options?.maxNodes ?? 120;
  const maxEdges = options?.maxEdges ?? 240;
  const degrees = getRelationDegreeMap(bundle);
  const sortedNodes = [...bundle.graph.entities].sort((left, right) => {
    const degreeDiff = (degrees.get(right.id) ?? 0) - (degrees.get(left.id) ?? 0);
    if (degreeDiff !== 0) {
      return degreeDiff;
    }

    return left.id.localeCompare(right.id);
  });

  const selectedNodes = sortedNodes.slice(0, maxNodes);
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
  const selectedEdges = bundle.graph.relations
    .filter((relation) => {
      return selectedNodeIds.has(relation.source.id) && selectedNodeIds.has(relation.target.id);
    })
    .slice(0, maxEdges);

  return {
    nodes: selectedNodes.map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      degree: degrees.get(node.id) ?? 0
    })),
    edges: selectedEdges.map((edge) => ({
      id: edge.id,
      sourceId: edge.source.id,
      targetId: edge.target.id,
      type: edge.type
    })),
    totalNodes: bundle.graph.entities.length,
    totalEdges: bundle.graph.relations.length,
    truncated:
      selectedNodes.length < bundle.graph.entities.length ||
      selectedEdges.length < bundle.graph.relations.length
  };
};

export const loadBundleFromUrl = async (bundlePath = DEFAULT_BUNDLE_PATH): Promise<LedraBundle> => {
  const response = await fetch(bundlePath, {
    headers: {
      accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to load bundle from '${bundlePath}' (${response.status})`);
  }

  return (await response.json()) as LedraBundle;
};
