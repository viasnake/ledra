export const packageName = '@ledra/types';

export const IMPLEMENTATION_ORDER = [
  'packages/types',
  'packages/schemas',
  'packages/core',
  'packages/validator',
  'packages/bundle',
  'packages/search',
  'apps/cli',
  'apps/api',
  'apps/web'
] as const;

export type ImplementationTarget = (typeof IMPLEMENTATION_ORDER)[number];

export const BUILTIN_ENTITY_TYPES = [
  'site',
  'segment',
  'vlan',
  'prefix',
  'allocation',
  'host',
  'service',
  'dns_record'
] as const;

export type BuiltinEntityTypeName = (typeof BUILTIN_ENTITY_TYPES)[number];

export type RegistryScalar = string | number | boolean | null;
export type RegistryValue =
  | RegistryScalar
  | readonly RegistryValue[]
  | { readonly [key: string]: RegistryValue };

export type SiteAttributes = {
  name: string;
  code?: string;
  region?: string;
};

export type SegmentAttributes = {
  name: string;
  siteId: string;
  role?: string;
};

export type VlanAttributes = {
  name: string;
  siteId: string;
  vlanId: number;
};

export type PrefixAttributes = {
  cidr: string;
  family: 'ipv4' | 'ipv6';
  siteId?: string;
  vlanId?: string;
  gateway?: string;
};

export type AllocationAttributes = {
  address: string;
  prefixId: string;
  hostId?: string;
  role?: string;
};

export type HostAttributes = {
  hostname: string;
  fqdn?: string;
  primaryAddress?: string;
  siteId?: string;
  os?: string;
};

export type ServiceAttributes = {
  name: string;
  hostId?: string;
  protocol?: string;
  port?: number;
  exposure?: 'internal' | 'external';
};

export type DnsRecordAttributes = {
  name: string;
  fqdn: string;
  recordType: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'PTR' | 'SRV';
  value: string;
  zone?: string;
};

export type EntityAttributesByType = {
  site: SiteAttributes;
  segment: SegmentAttributes;
  vlan: VlanAttributes;
  prefix: PrefixAttributes;
  allocation: AllocationAttributes;
  host: HostAttributes;
  service: ServiceAttributes;
  dns_record: DnsRecordAttributes;
};

type BaseEntityRecord<TType extends BuiltinEntityTypeName> = {
  kind: 'entity';
  id: string;
  type: TType;
  title: string;
  summary?: string;
  tags: readonly string[];
  attributes: EntityAttributesByType[TType];
  sourceFilePath: string;
};

export type EntityRecord = {
  [TType in BuiltinEntityTypeName]: BaseEntityRecord<TType>;
}[BuiltinEntityTypeName];

export type RelationEndpoint = {
  type: BuiltinEntityTypeName;
  id: string;
};

export type RelationRecord = {
  kind: 'relation';
  id: string;
  type: string;
  title?: string;
  summary?: string;
  source: RelationEndpoint;
  target: RelationEndpoint;
  sourceFilePath: string;
};

export type ViewRecord = {
  kind: 'view';
  id: string;
  title: string;
  summary?: string;
  entityTypes: readonly BuiltinEntityTypeName[];
  query?: string;
  sourceFilePath: string;
};

export type PolicyRule = {
  code: 'require-tag' | 'require-attribute' | 'allowed-relation';
  targetType?: BuiltinEntityTypeName;
  field?: string;
  value?: string;
  relationType?: string;
  allowedTargetTypes?: readonly BuiltinEntityTypeName[];
  message?: string;
};

export type PolicyRecord = {
  kind: 'policy';
  id: string;
  title: string;
  summary?: string;
  rules: readonly PolicyRule[];
  sourceFilePath: string;
};

export type DiagnosticSeverity = 'error' | 'warning';

export type DiagnosticSubject = {
  kind: 'registry' | 'entity' | 'relation' | 'view' | 'policy';
  id?: string;
  type?: string;
  sourceFilePath?: string;
};

export type DiagnosticCode =
  | 'invalid-registry-layout'
  | 'invalid-schema'
  | 'missing-id'
  | 'missing-type'
  | 'missing-title'
  | 'duplicate-entity-id'
  | 'duplicate-relation-id'
  | 'duplicate-view-id'
  | 'duplicate-policy-id'
  | 'missing-reference'
  | 'invalid-policy-rule'
  | 'prefix-overlap'
  | 'duplicate-allocation-ip'
  | 'duplicate-hostname'
  | 'duplicate-vlan-id-per-site'
  | 'gateway-outside-prefix';

export type Diagnostic = {
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  message: string;
  subject: DiagnosticSubject;
};

export type ValidationResult = {
  ok: boolean;
  diagnostics: readonly Diagnostic[];
};

export type RegistryGraph = {
  kind: 'registry-graph';
  schemaVersion: 1;
  entities: readonly EntityRecord[];
  relations: readonly RelationRecord[];
  views: readonly ViewRecord[];
  policies: readonly PolicyRecord[];
};

export type RegistryDiagnostics = {
  implementationOrder: readonly ImplementationTarget[];
  readOnly: true;
  schemaVersion: 1;
  counts: {
    entities: number;
    relations: number;
    views: number;
    policies: number;
  };
  sourceFilePaths: readonly string[];
};

export type LedraBundle = {
  kind: 'static-bundle';
  schemaVersion: 1;
  generatedAt: string;
  graph: RegistryGraph;
  diagnostics: RegistryDiagnostics;
};

export type RegistryRecord = EntityRecord | RelationRecord | ViewRecord | PolicyRecord;
