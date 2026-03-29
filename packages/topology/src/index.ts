import type { CanonicalEntity, CanonicalRelation, TopologyProjection } from '@cataloga/schema';

export const packageName = '@cataloga/topology';

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

type TopologyJson = {
  nodes: Array<{ id: string; type: string; label: string; group: string }>;
  edges: Array<{ id: string; type: string; from: string; to: string }>;
};

const groupFor = (entity: CanonicalEntity): string => {
  if (
    entity.entity_type === 'site' ||
    entity.entity_type === 'segment' ||
    entity.entity_type === 'vlan'
  ) {
    return entity.entity_type;
  }

  if (entity.entity_type === 'vpc' || entity.entity_type === 'subnet') {
    return entity.entity_type;
  }

  return 'resource';
};

export const buildTopologyJson = (
  entities: readonly CanonicalEntity[],
  relations: readonly CanonicalRelation[]
): TopologyJson => ({
  nodes: [...entities]
    .sort((left, right) => left.entity_id.localeCompare(right.entity_id))
    .map((entity) => ({
      id: entity.entity_id,
      type: entity.entity_type,
      label: entity.display_name,
      group: groupFor(entity)
    })),
  edges: [...relations]
    .sort((left, right) => left.relation_id.localeCompare(right.relation_id))
    .map((relation) => ({
      id: relation.relation_id,
      type: relation.relation_type,
      from: relation.from_entity_id,
      to: relation.to_entity_id
    }))
});

export const renderTopologySvg = (payload: TopologyJson): string => {
  const width = 1200;
  const height = Math.max(320, payload.nodes.length * 70 + 80);
  const nodeSpacing = 64;

  const nodeLines = payload.nodes
    .map((node, index) => {
      const y = 40 + index * nodeSpacing;
      return `<g id="${escapeXml(node.id)}"><rect x="40" y="${y}" width="300" height="44" rx="8" fill="#E5F0FF" stroke="#1F4E79"/><text x="54" y="${y + 26}" font-size="14" fill="#132A3E">${escapeXml(node.label)}</text></g>`;
    })
    .join('');

  const edgeLines = payload.edges
    .map((edge, index) => {
      const fromIndex = payload.nodes.findIndex((node) => node.id === edge.from);
      const toIndex = payload.nodes.findIndex((node) => node.id === edge.to);
      const y1 = 62 + Math.max(0, fromIndex) * nodeSpacing;
      const y2 = 62 + Math.max(0, toIndex) * nodeSpacing;
      return `<g id="${escapeXml(edge.id)}"><line x1="360" y1="${y1}" x2="640" y2="${y2}" stroke="#486581" stroke-width="2"/><text x="500" y="${Math.floor((y1 + y2) / 2) - 4}" font-size="12" fill="#243B53">${escapeXml(edge.type)}</text></g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#F8FAFC"/>${edgeLines}${nodeLines}</svg>`;
};

export const createTopologyProjections = (args: {
  snapshotId: string;
  viewType: TopologyProjection['view_type'];
  renderedAt: string;
  entities: readonly CanonicalEntity[];
  relations: readonly CanonicalRelation[];
}): readonly TopologyProjection[] => {
  const topologyJson = buildTopologyJson(args.entities, args.relations);
  const svg = renderTopologySvg(topologyJson);

  return [
    {
      topology_id: `${args.snapshotId}_${args.viewType}_json`,
      snapshot_id: args.snapshotId,
      view_type: args.viewType,
      format: 'json',
      rendered_at: args.renderedAt,
      payload: JSON.stringify(topologyJson)
    },
    {
      topology_id: `${args.snapshotId}_${args.viewType}_svg`,
      snapshot_id: args.snapshotId,
      view_type: args.viewType,
      format: 'svg',
      rendered_at: args.renderedAt,
      payload: svg
    }
  ];
};
