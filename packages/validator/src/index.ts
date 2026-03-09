import type { ReadOnlyRepository } from '@ledra/core';
import { BUILTIN_ENTITY_SCHEMAS } from '@ledra/schemas';
import type {
  BuiltinEntityTypeName,
  Diagnostic,
  DiagnosticCode,
  EntityRecord,
  PolicyRecord,
  RegistryGraph,
  RelationRecord,
  ValidationResult,
  ViewRecord
} from '@ledra/types';

export const packageName = '@ledra/validator';

type EntityReferenceRule = {
  field: string;
  targetType: BuiltinEntityTypeName;
};

type ParsedCidr = {
  cidr: string;
  network: number;
  prefixLength: number;
  mask: number;
};

const CIDR_REGEX = /^((?:\d{1,3}\.){3}\d{1,3})\/(\d{1,2})$/u;

const ENTITY_REFERENCE_RULES: Readonly<
  Record<BuiltinEntityTypeName, readonly EntityReferenceRule[]>
> = {
  site: [],
  segment: [{ field: 'siteId', targetType: 'site' }],
  vlan: [{ field: 'siteId', targetType: 'site' }],
  prefix: [
    { field: 'siteId', targetType: 'site' },
    { field: 'vlanId', targetType: 'vlan' }
  ],
  allocation: [
    { field: 'prefixId', targetType: 'prefix' },
    { field: 'hostId', targetType: 'host' }
  ],
  host: [{ field: 'siteId', targetType: 'site' }],
  service: [{ field: 'hostId', targetType: 'host' }],
  dns_record: []
};

const isRepository = (value: RegistryGraph | ReadOnlyRepository): value is ReadOnlyRepository =>
  typeof value === 'object' &&
  value !== null &&
  'graph' in value &&
  typeof value.graph === 'function';

const toGraph = (value: RegistryGraph | ReadOnlyRepository): RegistryGraph =>
  isRepository(value) ? value.graph() : value;

const pushDiagnostic = (
  diagnostics: Diagnostic[],
  code: DiagnosticCode,
  message: string,
  subject: Diagnostic['subject']
): void => {
  diagnostics.push({ severity: 'error', code, message, subject });
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const toIpv4Number = (ip: string): number | undefined => {
  const octets = ip.split('.').map((segment) => Number(segment));
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return undefined;
  }

  return octets.reduce((accumulator, octet) => (accumulator << 8) + octet, 0) >>> 0;
};

const parseCidr = (value: string | undefined): ParsedCidr | undefined => {
  if (!value) {
    return undefined;
  }

  const match = value.match(CIDR_REGEX);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  const baseIp = toIpv4Number(match[1]);
  const prefixLength = Number(match[2]);
  if (
    baseIp === undefined ||
    !Number.isInteger(prefixLength) ||
    prefixLength < 0 ||
    prefixLength > 32
  ) {
    return undefined;
  }

  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return {
    cidr: value,
    network: baseIp & mask,
    prefixLength,
    mask
  };
};

const overlaps = (left: ParsedCidr, right: ParsedCidr): boolean => {
  const shortestMask = left.prefixLength <= right.prefixLength ? left.mask : right.mask;
  return (left.network & shortestMask) === (right.network & shortestMask);
};

const getAttributeValue = (entity: EntityRecord, field: string): unknown =>
  (entity.attributes as Record<string, unknown>)[field];

const validateEntitySchema = (entity: EntityRecord, diagnostics: Diagnostic[]): void => {
  if (!isNonEmptyString(entity.id)) {
    pushDiagnostic(diagnostics, 'missing-id', 'Entity id is required.', {
      kind: 'entity',
      type: entity.type,
      sourceFilePath: entity.sourceFilePath
    });
  }

  if (!isNonEmptyString(entity.title)) {
    pushDiagnostic(
      diagnostics,
      'missing-title',
      `Entity '${entity.id || '<unknown>'}' requires a title.`,
      {
        kind: 'entity',
        id: entity.id,
        type: entity.type,
        sourceFilePath: entity.sourceFilePath
      }
    );
  }

  const schema = BUILTIN_ENTITY_SCHEMAS[entity.type];
  for (const field of schema.requiredAttributes) {
    const value = getAttributeValue(entity, field);
    if (!isNonEmptyString(value) && typeof value !== 'number' && typeof value !== 'boolean') {
      pushDiagnostic(
        diagnostics,
        'invalid-schema',
        `Entity '${entity.id}' is missing required attribute '${field}'.`,
        { kind: 'entity', id: entity.id, type: entity.type, sourceFilePath: entity.sourceFilePath }
      );
    }
  }

  for (const [field, type] of Object.entries(schema.attributeTypes)) {
    const value = getAttributeValue(entity, field);
    if (value === undefined) {
      continue;
    }

    if (type === 'string' && typeof value !== 'string') {
      pushDiagnostic(
        diagnostics,
        'invalid-schema',
        `Entity '${entity.id}' attribute '${field}' must be a string.`,
        { kind: 'entity', id: entity.id, type: entity.type, sourceFilePath: entity.sourceFilePath }
      );
    }

    if (type === 'number' && typeof value !== 'number') {
      pushDiagnostic(
        diagnostics,
        'invalid-schema',
        `Entity '${entity.id}' attribute '${field}' must be a number.`,
        { kind: 'entity', id: entity.id, type: entity.type, sourceFilePath: entity.sourceFilePath }
      );
    }

    if (type === 'boolean' && typeof value !== 'boolean') {
      pushDiagnostic(
        diagnostics,
        'invalid-schema',
        `Entity '${entity.id}' attribute '${field}' must be a boolean.`,
        { kind: 'entity', id: entity.id, type: entity.type, sourceFilePath: entity.sourceFilePath }
      );
    }
  }

  if (entity.type === 'prefix') {
    const family = getAttributeValue(entity, 'family');
    if (family !== undefined && family !== 'ipv4' && family !== 'ipv6') {
      pushDiagnostic(
        diagnostics,
        'invalid-schema',
        `Entity '${entity.id}' attribute 'family' must be 'ipv4' or 'ipv6'.`,
        { kind: 'entity', id: entity.id, type: entity.type, sourceFilePath: entity.sourceFilePath }
      );
    }
  }

  if (entity.type === 'service') {
    const exposure = getAttributeValue(entity, 'exposure');
    if (exposure !== undefined && exposure !== 'internal' && exposure !== 'external') {
      pushDiagnostic(
        diagnostics,
        'invalid-schema',
        `Entity '${entity.id}' attribute 'exposure' must be 'internal' or 'external'.`,
        { kind: 'entity', id: entity.id, type: entity.type, sourceFilePath: entity.sourceFilePath }
      );
    }
  }

  if (entity.type === 'dns_record') {
    const recordType = getAttributeValue(entity, 'recordType');
    if (
      recordType !== undefined &&
      recordType !== 'A' &&
      recordType !== 'AAAA' &&
      recordType !== 'CNAME' &&
      recordType !== 'TXT' &&
      recordType !== 'PTR' &&
      recordType !== 'SRV'
    ) {
      pushDiagnostic(
        diagnostics,
        'invalid-schema',
        `Entity '${entity.id}' has unsupported DNS record type '${String(recordType)}'.`,
        { kind: 'entity', id: entity.id, type: entity.type, sourceFilePath: entity.sourceFilePath }
      );
    }
  }
};

const validateViewSchema = (view: ViewRecord, diagnostics: Diagnostic[]): void => {
  if (!isNonEmptyString(view.id)) {
    pushDiagnostic(diagnostics, 'missing-id', 'View id is required.', {
      kind: 'view',
      sourceFilePath: view.sourceFilePath
    });
  }

  if (!isNonEmptyString(view.title)) {
    pushDiagnostic(
      diagnostics,
      'missing-title',
      `View '${view.id || '<unknown>'}' requires a title.`,
      {
        kind: 'view',
        id: view.id,
        sourceFilePath: view.sourceFilePath
      }
    );
  }
};

const validatePolicySchema = (policy: PolicyRecord, diagnostics: Diagnostic[]): void => {
  if (!isNonEmptyString(policy.id)) {
    pushDiagnostic(diagnostics, 'missing-id', 'Policy id is required.', {
      kind: 'policy',
      sourceFilePath: policy.sourceFilePath
    });
  }

  if (!isNonEmptyString(policy.title)) {
    pushDiagnostic(
      diagnostics,
      'missing-title',
      `Policy '${policy.id || '<unknown>'}' requires a title.`,
      { kind: 'policy', id: policy.id, sourceFilePath: policy.sourceFilePath }
    );
  }

  for (const rule of policy.rules) {
    if (rule.code === 'require-tag' && !isNonEmptyString(rule.value)) {
      pushDiagnostic(
        diagnostics,
        'invalid-policy-rule',
        `Policy '${policy.id}' require-tag rules need a non-empty 'value'.`,
        { kind: 'policy', id: policy.id, sourceFilePath: policy.sourceFilePath }
      );
    }

    if (rule.code === 'require-attribute' && !isNonEmptyString(rule.field)) {
      pushDiagnostic(
        diagnostics,
        'invalid-policy-rule',
        `Policy '${policy.id}' require-attribute rules need a non-empty 'field'.`,
        { kind: 'policy', id: policy.id, sourceFilePath: policy.sourceFilePath }
      );
    }

    if (
      rule.code === 'allowed-relation' &&
      (!isNonEmptyString(rule.relationType) || (rule.allowedTargetTypes?.length ?? 0) === 0)
    ) {
      pushDiagnostic(
        diagnostics,
        'invalid-policy-rule',
        `Policy '${policy.id}' allowed-relation rules need 'relationType' and 'allowedTargetTypes'.`,
        { kind: 'policy', id: policy.id, sourceFilePath: policy.sourceFilePath }
      );
    }
  }
};

const validateReferenceRules = (
  entity: EntityRecord,
  entityKeys: Set<string>,
  diagnostics: Diagnostic[]
): void => {
  for (const rule of ENTITY_REFERENCE_RULES[entity.type]) {
    const value = getAttributeValue(entity, rule.field);
    if (!isNonEmptyString(value)) {
      continue;
    }

    const referenceKey = `${rule.targetType}::${value}`;
    if (!entityKeys.has(referenceKey)) {
      pushDiagnostic(
        diagnostics,
        'missing-reference',
        `Entity '${entity.id}' references missing ${rule.targetType} '${value}' via '${rule.field}'.`,
        { kind: 'entity', id: entity.id, type: entity.type, sourceFilePath: entity.sourceFilePath }
      );
    }
  }
};

const validatePolicyBehavior = (
  policy: PolicyRecord,
  entities: readonly EntityRecord[],
  relations: readonly RelationRecord[],
  diagnostics: Diagnostic[]
): void => {
  for (const rule of policy.rules) {
    const scopedEntities = rule.targetType
      ? entities.filter((entity) => entity.type === rule.targetType)
      : entities;

    if (rule.code === 'require-tag' && rule.value) {
      for (const entity of scopedEntities) {
        if (!entity.tags.includes(rule.value)) {
          pushDiagnostic(
            diagnostics,
            'invalid-policy-rule',
            rule.message ?? `Policy '${policy.id}' requires tag '${rule.value}' on '${entity.id}'.`,
            {
              kind: 'entity',
              id: entity.id,
              type: entity.type,
              sourceFilePath: entity.sourceFilePath
            }
          );
        }
      }
    }

    if (rule.code === 'require-attribute' && rule.field) {
      for (const entity of scopedEntities) {
        const value = getAttributeValue(entity, rule.field);
        if (!isNonEmptyString(value) && typeof value !== 'number' && typeof value !== 'boolean') {
          pushDiagnostic(
            diagnostics,
            'invalid-policy-rule',
            rule.message ??
              `Policy '${policy.id}' requires attribute '${rule.field}' on '${entity.id}'.`,
            {
              kind: 'entity',
              id: entity.id,
              type: entity.type,
              sourceFilePath: entity.sourceFilePath
            }
          );
        }
      }
    }

    if (rule.code === 'allowed-relation' && rule.relationType && rule.allowedTargetTypes) {
      const allowed = new Set(rule.allowedTargetTypes);
      for (const relation of relations) {
        if (rule.targetType && relation.source.type !== rule.targetType) {
          continue;
        }

        if (relation.type !== rule.relationType) {
          continue;
        }

        if (!allowed.has(relation.target.type)) {
          pushDiagnostic(
            diagnostics,
            'invalid-policy-rule',
            rule.message ??
              `Policy '${policy.id}' disallows relation '${relation.type}' from '${relation.source.id}' to '${relation.target.type}'.`,
            {
              kind: 'relation',
              id: relation.id,
              type: relation.type,
              sourceFilePath: relation.sourceFilePath
            }
          );
        }
      }
    }
  }
};

export const validateRegistry = (value: RegistryGraph | ReadOnlyRepository): ValidationResult => {
  const graph = toGraph(value);
  const diagnostics: Diagnostic[] = [];
  const entityKeyToEntity = new Map<string, EntityRecord>();
  const entityIds = new Set<string>();
  const relationIds = new Set<string>();
  const viewIds = new Set<string>();
  const policyIds = new Set<string>();
  const prefixEntities: Array<{ entity: EntityRecord; parsed: ParsedCidr }> = [];
  const allocationByIp = new Map<string, EntityRecord>();
  const hostNameByName = new Map<string, EntityRecord>();
  const dnsNameByName = new Map<string, EntityRecord>();
  const vlanBySiteAndId = new Map<string, EntityRecord>();

  for (const entity of graph.entities) {
    validateEntitySchema(entity, diagnostics);

    if (entityIds.has(entity.id)) {
      pushDiagnostic(
        diagnostics,
        'duplicate-entity-id',
        `Duplicate entity id '${entity.id}' detected.`,
        { kind: 'entity', id: entity.id, type: entity.type, sourceFilePath: entity.sourceFilePath }
      );
    }

    entityIds.add(entity.id);
    entityKeyToEntity.set(`${entity.type}::${entity.id}`, entity);

    if (entity.type === 'prefix') {
      const parsed = parseCidr(getAttributeValue(entity, 'cidr') as string | undefined);
      if (parsed) {
        prefixEntities.push({ entity, parsed });
      }
    }

    if (entity.type === 'allocation') {
      const address = getAttributeValue(entity, 'address');
      if (isNonEmptyString(address)) {
        const existing = allocationByIp.get(address);
        if (existing) {
          pushDiagnostic(
            diagnostics,
            'duplicate-allocation-ip',
            `Allocation IP '${address}' is already used by '${existing.id}'.`,
            {
              kind: 'entity',
              id: entity.id,
              type: entity.type,
              sourceFilePath: entity.sourceFilePath
            }
          );
        } else {
          allocationByIp.set(address, entity);
        }
      }
    }

    if (entity.type === 'host') {
      const hostname = getAttributeValue(entity, 'fqdn') ?? getAttributeValue(entity, 'hostname');
      if (isNonEmptyString(hostname)) {
        const normalized = hostname.toLowerCase();
        const existing = hostNameByName.get(normalized);
        if (existing) {
          pushDiagnostic(
            diagnostics,
            'duplicate-hostname',
            `Duplicate hostname/FQDN '${normalized}' detected (already used by '${existing.id}').`,
            {
              kind: 'entity',
              id: entity.id,
              type: entity.type,
              sourceFilePath: entity.sourceFilePath
            }
          );
        } else {
          hostNameByName.set(normalized, entity);
        }
      }
    }

    if (entity.type === 'dns_record') {
      const fqdn = getAttributeValue(entity, 'fqdn');
      if (isNonEmptyString(fqdn)) {
        const normalized = fqdn.toLowerCase();
        const existing = dnsNameByName.get(normalized);
        if (existing) {
          pushDiagnostic(
            diagnostics,
            'duplicate-hostname',
            `Duplicate hostname/FQDN '${normalized}' detected (already used by '${existing.id}').`,
            {
              kind: 'entity',
              id: entity.id,
              type: entity.type,
              sourceFilePath: entity.sourceFilePath
            }
          );
        } else {
          dnsNameByName.set(normalized, entity);
        }
      }
    }

    if (entity.type === 'vlan') {
      const siteId = getAttributeValue(entity, 'siteId');
      const vlanId = getAttributeValue(entity, 'vlanId');
      if (isNonEmptyString(siteId) && typeof vlanId === 'number') {
        const key = `${siteId}::${String(vlanId)}`;
        const existing = vlanBySiteAndId.get(key);
        if (existing) {
          pushDiagnostic(
            diagnostics,
            'duplicate-vlan-id-per-site',
            `Duplicate VLAN id '${String(vlanId)}' detected in site '${siteId}' (already used by '${existing.id}').`,
            {
              kind: 'entity',
              id: entity.id,
              type: entity.type,
              sourceFilePath: entity.sourceFilePath
            }
          );
        } else {
          vlanBySiteAndId.set(key, entity);
        }
      }
    }
  }

  const entityKeys = new Set(entityKeyToEntity.keys());
  for (const entity of graph.entities) {
    validateReferenceRules(entity, entityKeys, diagnostics);

    if (entity.type === 'prefix') {
      const gateway = getAttributeValue(entity, 'gateway');
      const cidr = parseCidr(getAttributeValue(entity, 'cidr') as string | undefined);
      const gatewayNumber = isNonEmptyString(gateway) ? toIpv4Number(gateway) : undefined;
      if (cidr && gatewayNumber !== undefined && (gatewayNumber & cidr.mask) !== cidr.network) {
        pushDiagnostic(
          diagnostics,
          'gateway-outside-prefix',
          `Gateway '${gateway}' is outside prefix '${cidr.cidr}'.`,
          {
            kind: 'entity',
            id: entity.id,
            type: entity.type,
            sourceFilePath: entity.sourceFilePath
          }
        );
      }
    }
  }

  for (const [index, left] of prefixEntities.entries()) {
    for (const right of prefixEntities.slice(index + 1)) {
      if (overlaps(left.parsed, right.parsed)) {
        pushDiagnostic(
          diagnostics,
          'prefix-overlap',
          `Prefix '${left.parsed.cidr}' (${left.entity.id}) overlaps with '${right.parsed.cidr}' (${right.entity.id}).`,
          {
            kind: 'entity',
            id: right.entity.id,
            type: right.entity.type,
            sourceFilePath: right.entity.sourceFilePath
          }
        );
      }
    }
  }

  for (const relation of graph.relations) {
    if (!isNonEmptyString(relation.id)) {
      pushDiagnostic(diagnostics, 'missing-id', 'Relation id is required.', {
        kind: 'relation',
        type: relation.type,
        sourceFilePath: relation.sourceFilePath
      });
    }

    if (relationIds.has(relation.id)) {
      pushDiagnostic(
        diagnostics,
        'duplicate-relation-id',
        `Duplicate relation id '${relation.id}' detected.`,
        {
          kind: 'relation',
          id: relation.id,
          type: relation.type,
          sourceFilePath: relation.sourceFilePath
        }
      );
    }

    relationIds.add(relation.id);

    const sourceKey = `${relation.source.type}::${relation.source.id}`;
    const targetKey = `${relation.target.type}::${relation.target.id}`;
    if (!entityKeys.has(sourceKey)) {
      pushDiagnostic(
        diagnostics,
        'missing-reference',
        `Relation '${relation.id}' references missing source '${sourceKey}'.`,
        {
          kind: 'relation',
          id: relation.id,
          type: relation.type,
          sourceFilePath: relation.sourceFilePath
        }
      );
    }
    if (!entityKeys.has(targetKey)) {
      pushDiagnostic(
        diagnostics,
        'missing-reference',
        `Relation '${relation.id}' references missing target '${targetKey}'.`,
        {
          kind: 'relation',
          id: relation.id,
          type: relation.type,
          sourceFilePath: relation.sourceFilePath
        }
      );
    }
  }

  for (const view of graph.views) {
    validateViewSchema(view, diagnostics);
    if (viewIds.has(view.id)) {
      pushDiagnostic(diagnostics, 'duplicate-view-id', `Duplicate view id '${view.id}' detected.`, {
        kind: 'view',
        id: view.id,
        sourceFilePath: view.sourceFilePath
      });
    }
    viewIds.add(view.id);
  }

  for (const policy of graph.policies) {
    validatePolicySchema(policy, diagnostics);
    if (policyIds.has(policy.id)) {
      pushDiagnostic(
        diagnostics,
        'duplicate-policy-id',
        `Duplicate policy id '${policy.id}' detected.`,
        { kind: 'policy', id: policy.id, sourceFilePath: policy.sourceFilePath }
      );
    }
    policyIds.add(policy.id);
    validatePolicyBehavior(policy, graph.entities, graph.relations, diagnostics);
  }

  return {
    ok: diagnostics.length === 0,
    diagnostics
  };
};
