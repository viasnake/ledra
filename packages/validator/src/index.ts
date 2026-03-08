import type { EntityRecord, ValidationIssue, ValidationResult } from '@ledra/types';

export const packageName = '@ledra/validator';

type EntityWithSource = Pick<EntityRecord, 'id' | 'sourceFilePath'>;

type ParsedCidr = {
  cidr: string;
  network: number;
  prefixLength: number;
  mask: number;
};

const CIDR_REGEX = /\b((?:\d{1,3}\.){3}\d{1,3})\/(\d{1,2})\b/;
const IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const GATEWAY_REGEX = /\bgate(?:way|)\s*[:=]?\s*((?:\d{1,3}\.){3}\d{1,3})\b/i;

const withSourcePath = (
  issue: Omit<ValidationIssue, 'sourceFilePath'>,
  sourceFilePath: string | undefined
): ValidationIssue =>
  sourceFilePath === undefined
    ? issue
    : {
        ...issue,
        sourceFilePath
      };

const normalizeText = (value: string | undefined): string => (value ?? '').trim().toLowerCase();

const pushIssue = (
  issues: ValidationIssue[],
  issue: Omit<ValidationIssue, 'sourceFilePath'>,
  entity: EntityWithSource
): void => {
  issues.push(withSourcePath(issue, entity.sourceFilePath));
};

const toIpv4Number = (ip: string): number | undefined => {
  const octets = ip.split('.').map((segment) => Number(segment));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined;
  }

  return octets.reduce((accumulator, octet) => (accumulator << 8) + octet, 0) >>> 0;
};

const parseCidr = (value: string | undefined): ParsedCidr | undefined => {
  if (!value) {
    return undefined;
  }

  const match = value.match(CIDR_REGEX);
  if (!match) {
    return undefined;
  }

  const baseAddress = match[1];
  const prefixLengthText = match[2];
  if (!baseAddress || !prefixLengthText) {
    return undefined;
  }

  const baseIp = toIpv4Number(baseAddress);
  const prefixLength = Number(prefixLengthText);
  if (baseIp === undefined || !Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
    return undefined;
  }

  const mask = prefixLength === 0 ? 0 : ((0xffffffff << (32 - prefixLength)) >>> 0);
  const network = baseIp & mask;

  return {
    cidr: `${baseAddress}/${prefixLength}`,
    network,
    prefixLength,
    mask
  };
};

const overlaps = (left: ParsedCidr, right: ParsedCidr): boolean => {
  const shortestMask = left.prefixLength <= right.prefixLength ? left.mask : right.mask;
  return (left.network & shortestMask) === (right.network & shortestMask);
};

const extractVlanId = (entity: EntityRecord): string | undefined => {
  const fromTypePrefix = entity.id.match(/(?:^|-)vlan-(\d+)$/i)?.[1];
  if (fromTypePrefix) {
    return fromTypePrefix;
  }

  const fromTitle = entity.title.match(/\bvlan\s*(\d+)\b/i)?.[1];
  return fromTitle;
};

const extractFirstIpv4 = (entity: EntityRecord): string | undefined => {
  const fields = [entity.title, entity.summary, ...entity.tags];
  for (const field of fields) {
    const match = field?.match(IPV4_REGEX);
    if (match) {
      return match[0];
    }
  }

  return undefined;
};

const extractGatewayIp = (entity: EntityRecord): string | undefined => {
  const fields = [entity.summary, ...entity.tags, entity.title];
  for (const field of fields) {
    const match = field?.match(GATEWAY_REGEX);
    if (match) {
      return match[1];
    }
  }

  return undefined;
};

const extractCidrFromEntity = (entity: EntityRecord): ParsedCidr | undefined => {
  const fields = [entity.title, entity.summary, ...entity.tags, entity.id];
  for (const field of fields) {
    const parsed = parseCidr(field);
    if (parsed) {
      return parsed;
    }
  }

  return undefined;
};

const collectRelatedPrefixes = (
  entity: EntityRecord,
  entitiesById: Map<string, EntityRecord>,
  incomingByTarget: Map<string, EntityRecord[]>
): EntityRecord[] => {
  const prefixes: EntityRecord[] = [];

  for (const relation of entity.relations) {
    const target = entitiesById.get(relation.targetId);
    if (target?.type === 'prefix') {
      prefixes.push(target);
    }
  }

  for (const source of incomingByTarget.get(entity.id) ?? []) {
    if (source.type === 'prefix') {
      prefixes.push(source);
    }
  }

  return prefixes;
};

const collectRelatedSites = (
  entity: EntityRecord,
  entitiesById: Map<string, EntityRecord>,
  incomingByTarget: Map<string, EntityRecord[]>
): string[] => {
  const siteIds = new Set<string>();

  const addSiteIfPresent = (candidateId: string): void => {
    const candidate = entitiesById.get(candidateId);
    if (candidate?.type === 'site') {
      siteIds.add(candidate.id);
    }
  };

  for (const relation of entity.relations) {
    addSiteIfPresent(relation.targetId);
  }

  for (const incoming of incomingByTarget.get(entity.id) ?? []) {
    if (incoming.type === 'site') {
      siteIds.add(incoming.id);
    }

    for (const relation of incoming.relations) {
      addSiteIfPresent(relation.targetId);
    }

    for (const upstream of incomingByTarget.get(incoming.id) ?? []) {
      if (upstream.type === 'site') {
        siteIds.add(upstream.id);
      }
    }
  }

  return [...siteIds];
};

export const validateEntities = (entities: readonly EntityRecord[]): ValidationResult => {
  const issues: ValidationIssue[] = [];
  const entitiesById = new Map<string, EntityRecord>();
  const incomingByTarget = new Map<string, EntityRecord[]>();
  const relationIds = new Set<string>();
  const prefixEntities: EntityRecord[] = [];
  const allocationByIp = new Map<string, EntityRecord>();
  const hostOrDnsByName = new Map<string, EntityRecord>();
  const vlanBySiteAndId = new Map<string, EntityRecord>();

  for (const entity of entities) {
    if (!entity.id.trim()) {
      pushIssue(issues, { code: 'missing-id', message: 'Entity id is required.' }, entity);
      continue;
    }

    if (entitiesById.has(entity.id)) {
      pushIssue(
        issues,
        {
          code: 'duplicate-entity-id',
          message: `Duplicate entity id '${entity.id}' detected.`,
          entityId: entity.id
        },
        entity
      );
    } else {
      entitiesById.set(entity.id, entity);
    }

    if (!entity.type.trim()) {
      pushIssue(
        issues,
        {
          code: 'missing-type',
          message: `Entity ${entity.id || '<unknown>'} requires a type.`,
          entityId: entity.id
        },
        entity
      );
    }

    if (entity.type === 'prefix') {
      prefixEntities.push(entity);
    }

    for (const relation of entity.relations) {
      const relationId = `${entity.id}::${relation.type}::${relation.targetId}`;
      if (relationIds.has(relationId)) {
        pushIssue(
          issues,
          {
            code: 'duplicate-relation-id',
            message: `Duplicate relation '${relation.type}' from '${entity.id}' to '${relation.targetId}' detected.`,
            entityId: entity.id
          },
          entity
        );
      } else {
        relationIds.add(relationId);
      }

      if (!relation.targetId.trim()) {
        pushIssue(
          issues,
          {
            code: 'missing-reference',
            message: `Relation '${relation.type}' on entity '${entity.id}' is missing a target id.`,
            entityId: entity.id
          },
          entity
        );
      }

      const incoming = incomingByTarget.get(relation.targetId) ?? [];
      incoming.push(entity);
      incomingByTarget.set(relation.targetId, incoming);
    }

    if (entity.type === 'allocation') {
      const allocationIp = extractFirstIpv4(entity);
      if (allocationIp) {
        const seenEntity = allocationByIp.get(allocationIp);
        if (seenEntity) {
          pushIssue(
            issues,
            {
              code: 'duplicate-allocation-ip',
              message: `Allocation IP '${allocationIp}' is already used by '${seenEntity.id}'.`,
              entityId: entity.id
            },
            entity
          );
        } else {
          allocationByIp.set(allocationIp, entity);
        }
      }
    }

    if (entity.type === 'host' || entity.type === 'dns_record') {
      const name = normalizeText(entity.title || entity.id);
      if (name) {
        const seenEntity = hostOrDnsByName.get(name);
        if (seenEntity) {
          pushIssue(
            issues,
            {
              code: 'duplicate-hostname',
              message: `Duplicate hostname/FQDN '${name}' detected (already used by '${seenEntity.id}').`,
              entityId: entity.id
            },
            entity
          );
        } else {
          hostOrDnsByName.set(name, entity);
        }
      }
    }
  }

  for (const entity of entities) {
    for (const relation of entity.relations) {
      if (!relation.targetId.trim()) {
        continue;
      }

      if (!entitiesById.has(relation.targetId)) {
        pushIssue(
          issues,
          {
            code: 'missing-reference',
            message: `Relation target '${relation.targetId}' does not exist for relation '${relation.type}'.`,
            entityId: entity.id
          },
          entity
        );
      }
    }

    if (entity.type === 'vlan') {
      const vlanId = extractVlanId(entity);
      if (!vlanId) {
        continue;
      }

      const siteIds = collectRelatedSites(entity, entitiesById, incomingByTarget);
      for (const siteId of siteIds) {
        const key = `${siteId}::${vlanId}`;
        const existing = vlanBySiteAndId.get(key);
        if (existing) {
          pushIssue(
            issues,
            {
              code: 'duplicate-vlan-id-per-site',
              message: `Duplicate VLAN id '${vlanId}' detected in site '${siteId}' (already used by '${existing.id}').`,
              entityId: entity.id
            },
            entity
          );
        } else {
          vlanBySiteAndId.set(key, entity);
        }
      }
    }

    if (entity.type === 'allocation') {
      const gatewayIp = extractGatewayIp(entity);
      if (!gatewayIp) {
        continue;
      }

      const gatewayNumber = toIpv4Number(gatewayIp);
      if (gatewayNumber === undefined) {
        continue;
      }

      const relatedPrefixes = collectRelatedPrefixes(entity, entitiesById, incomingByTarget);
      for (const prefixEntity of relatedPrefixes) {
        const parsedPrefix = extractCidrFromEntity(prefixEntity);
        if (!parsedPrefix) {
          continue;
        }

        if ((gatewayNumber & parsedPrefix.mask) !== parsedPrefix.network) {
          pushIssue(
            issues,
            {
              code: 'gateway-outside-prefix',
              message: `Gateway '${gatewayIp}' is outside assigned prefix '${parsedPrefix.cidr}' (${prefixEntity.id}).`,
              entityId: entity.id
            },
            entity
          );
        }
      }
    }
  }

  for (const [leftIndex, left] of prefixEntities.entries()) {
    const leftParsed = extractCidrFromEntity(left);
    if (!leftParsed) {
      continue;
    }

    for (const right of prefixEntities.slice(leftIndex + 1)) {
      const rightParsed = extractCidrFromEntity(right);
      if (!rightParsed) {
        continue;
      }

      if (overlaps(leftParsed, rightParsed)) {
        pushIssue(
          issues,
          {
            code: 'prefix-overlap',
            message: `Prefix '${leftParsed.cidr}' (${left.id}) overlaps with '${rightParsed.cidr}' (${right.id}).`,
            entityId: right.id
          },
          right
        );
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues
  };
};
