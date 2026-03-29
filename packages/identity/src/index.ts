import type { CanonicalEntity } from '@cataloga/schema';

export const packageName = '@cataloga/identity';

export type IdentityResolution = {
  resolved: Map<string, string>;
  unresolved: readonly string[];
};

const identityCandidates = (entity: CanonicalEntity): readonly string[] => {
  const properties = entity.properties as Record<string, unknown>;
  const ip = typeof properties.ip === 'string' ? properties.ip : '';
  const mac = typeof properties.mac === 'string' ? properties.mac : '';
  const subnet = typeof properties.subnet === 'string' ? properties.subnet : '';
  const networkTuple = ip && mac && subnet ? `${ip}:${mac}:${subnet}` : '';
  const keys = [
    properties.external_id,
    properties.cloud_id,
    properties.arn,
    properties.resource_id,
    networkTuple,
    properties.dns_name,
    entity.canonical_key,
    entity.display_name
  ];

  return keys
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter((value) => value.length > 0);
};

export const resolveIdentity = (entities: readonly CanonicalEntity[]): IdentityResolution => {
  const keyToCanonical = new Map<string, string>();
  const resolved = new Map<string, string>();
  const unresolved = new Set<string>();

  for (const entity of entities) {
    const candidates = identityCandidates(entity);
    if (candidates.length === 0) {
      unresolved.add(entity.entity_id);
      continue;
    }

    let matchedCanonical: string | undefined;
    for (const candidate of candidates) {
      const existing = keyToCanonical.get(candidate);
      if (existing) {
        matchedCanonical = existing;
        break;
      }
    }

    const canonicalEntityId = matchedCanonical ?? entity.entity_id;
    resolved.set(entity.entity_id, canonicalEntityId);

    for (const candidate of candidates) {
      keyToCanonical.set(candidate, canonicalEntityId);
    }
  }

  return {
    resolved,
    unresolved: [...unresolved].sort((left, right) => left.localeCompare(right))
  };
};
