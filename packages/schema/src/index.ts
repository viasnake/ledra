export const packageName = '@cataloga/schema';

export const SOURCE_TYPES = [
  'git',
  'aws',
  'manual',
  'onprem_scan',
  'snmp',
  'dns',
  'dhcp',
  'proxmox',
  'docker',
  'kubernetes',
  'route53',
  'cloudtrail',
  'agent_observation'
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const ENTITY_TYPES = [
  'site',
  'segment',
  'vlan',
  'prefix',
  'allocation',
  'host',
  'service',
  'dns_record',
  'cloud_account',
  'cloud_region',
  'vpc',
  'subnet',
  'route_table',
  'internet_gateway',
  'nat_gateway',
  'security_group',
  'network_interface',
  'load_balancer',
  'target_group',
  'listener',
  'compute_instance',
  'container_cluster',
  'container_service',
  'container_task'
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const RELATION_TYPES = [
  'contains',
  'attached_to',
  'runs_on',
  'resolves_to',
  'forwards_to',
  'targets',
  'member_of',
  'protected_by',
  'connected_to',
  'exposed_via',
  'observed_from',
  'planned_equivalent_of',
  'observed_equivalent_of'
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export type SnapshotKind = 'planned' | 'observed' | 'effective';

export type DriftType =
  | 'missing_entity'
  | 'extra_entity'
  | 'missing_relation'
  | 'extra_relation'
  | 'property_mismatch'
  | 'identity_ambiguity';

export type DriftSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type CanonicalEntity = {
  entity_id: string;
  entity_type: EntityType;
  canonical_key: string;
  display_name: string;
  labels: readonly string[];
  properties: Readonly<Record<string, unknown>>;
  status: 'active' | 'inactive' | 'deleted';
  created_at: string;
  updated_at: string;
};

export type CanonicalRelation = {
  relation_id: string;
  relation_type: RelationType;
  from_entity_id: string;
  to_entity_id: string;
  properties: Readonly<Record<string, unknown>>;
  status: 'active' | 'inactive' | 'deleted';
  created_at: string;
  updated_at: string;
};

export type CanonicalObservation = {
  observation_id: string;
  subject_kind: 'entity' | 'relation';
  subject_id: string;
  source_type: SourceType;
  source_instance_id: string;
  source_ref: Readonly<Record<string, string>>;
  observed_at: string;
  collector_run_id: string;
  confidence: number;
  raw_evidence_ref: string;
};

export type GraphSnapshot = {
  snapshot_id: string;
  kind: SnapshotKind;
  scope: string;
  captured_at: string;
  graph_version: string;
  entity_ids: readonly string[];
  relation_ids: readonly string[];
};

export type SourceDefinition = {
  source_id: string;
  source_type: SourceType;
  source_instance_id: string;
  scope: string;
  credentials_ref?: string;
  enabled: boolean;
  poll_mode: 'full' | 'incremental';
  last_success_at?: string;
  last_cursor?: string;
  config: Readonly<Record<string, unknown>>;
};

export type CollectorRun = {
  collector_run_id: string;
  source_id: string;
  started_at: string;
  ended_at?: string;
  status: 'running' | 'success' | 'failed';
  message?: string;
};

export type TopologyProjection = {
  topology_id: string;
  snapshot_id: string;
  view_type:
    | 'site-overview'
    | 'aws-vpc-overview'
    | 'internet-ingress'
    | 'service-dependency'
    | 'drift-view';
  format: 'json' | 'svg' | 'html';
  rendered_at: string;
  payload: string;
};

export type DriftFinding = {
  finding_id: string;
  snapshot_id: string;
  drift_type: DriftType;
  severity: DriftSeverity;
  subject_id: string;
  summary: string;
  details: Readonly<Record<string, unknown>>;
  detected_at: string;
};

export type CanonicalGraphSlice = {
  entities: readonly CanonicalEntity[];
  relations: readonly CanonicalRelation[];
  observations: readonly CanonicalObservation[];
};

export type CanonicalQueryResponse<T> = {
  observed_at: string;
  source: readonly { source_type: SourceType; source_instance_id: string }[];
  confidence: number;
  evidence_refs: readonly string[];
  data: T;
};
