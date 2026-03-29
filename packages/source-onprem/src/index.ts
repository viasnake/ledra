import type { CanonicalObservation, SourceType } from '@cataloga/schema';
import type {
  SourceAdapter,
  SourceCollectContext,
  SourceCollectResult
} from '@cataloga/source-contract';

export const packageName = '@cataloga/source-onprem';

type OnPremSourceType = 'onprem_scan' | 'snmp' | 'dns' | 'dhcp';

export class ManualSourceAdapter implements SourceAdapter {
  public readonly sourceType = 'manual' as const;

  public async collect(context: SourceCollectContext): Promise<SourceCollectResult> {
    const configured = context.source.config.records;
    const records = Array.isArray(configured)
      ? configured.filter(
          (item): item is { id: string; type: 'service' | 'host' | 'segment'; name?: string } => {
            if (typeof item !== 'object' || item === null) {
              return false;
            }

            const object = item as Record<string, unknown>;
            return (
              typeof object.id === 'string' &&
              (object.type === 'service' || object.type === 'host' || object.type === 'segment')
            );
          }
        )
      : [];

    const entities = records.map((record) => ({
      entity_id: `ent_manual_${record.type}_${record.id}`,
      entity_type: record.type,
      canonical_key: `manual:${record.type}/${record.id}`,
      display_name: record.name ?? record.id,
      labels: ['manual'],
      properties: {},
      status: 'active' as const,
      created_at: context.now,
      updated_at: context.now
    }));

    const observations: CanonicalObservation[] = entities.map((entity) => ({
      observation_id: `obs_entity_${entity.entity_id}_${context.run_id}`,
      subject_kind: 'entity',
      subject_id: entity.entity_id,
      source_type: 'manual',
      source_instance_id: context.source.source_instance_id,
      source_ref: { scope: context.source.scope },
      observed_at: context.now,
      collector_run_id: context.run_id,
      confidence: 1,
      raw_evidence_ref: `manual://${context.source.source_instance_id}/${entity.entity_id}`
    }));

    return {
      source_type: 'manual',
      source_instance_id: context.source.source_instance_id,
      scope: context.source.scope,
      graph_kind: 'planned',
      entities,
      relations: [],
      observations,
      cursor: context.now
    };
  }
}

export class OnPremSourceAdapter implements SourceAdapter {
  public readonly sourceType: SourceType;

  constructor(sourceType: OnPremSourceType) {
    this.sourceType = sourceType;
  }

  public async collect(context: SourceCollectContext): Promise<SourceCollectResult> {
    const hostEntityId = `ent_${this.sourceType}_${context.source.scope}_probe-host`;
    const networkEntityId = `ent_${this.sourceType}_${context.source.scope}_network`;
    const relationId = `rel_${this.sourceType}_${context.source.scope}_connected`;

    const observations: CanonicalObservation[] = [
      {
        observation_id: `obs_entity_${hostEntityId}_${context.run_id}`,
        subject_kind: 'entity',
        subject_id: hostEntityId,
        source_type: this.sourceType,
        source_instance_id: context.source.source_instance_id,
        source_ref: { scope: context.source.scope },
        observed_at: context.now,
        collector_run_id: context.run_id,
        confidence: 0.6,
        raw_evidence_ref: `${this.sourceType}://${context.source.source_instance_id}/${hostEntityId}`
      },
      {
        observation_id: `obs_entity_${networkEntityId}_${context.run_id}`,
        subject_kind: 'entity',
        subject_id: networkEntityId,
        source_type: this.sourceType,
        source_instance_id: context.source.source_instance_id,
        source_ref: { scope: context.source.scope },
        observed_at: context.now,
        collector_run_id: context.run_id,
        confidence: 0.55,
        raw_evidence_ref: `${this.sourceType}://${context.source.source_instance_id}/${networkEntityId}`
      },
      {
        observation_id: `obs_relation_${relationId}_${context.run_id}`,
        subject_kind: 'relation',
        subject_id: relationId,
        source_type: this.sourceType,
        source_instance_id: context.source.source_instance_id,
        source_ref: { scope: context.source.scope },
        observed_at: context.now,
        collector_run_id: context.run_id,
        confidence: 0.5,
        raw_evidence_ref: `${this.sourceType}://${context.source.source_instance_id}/${relationId}`
      }
    ];

    return {
      source_type: this.sourceType,
      source_instance_id: context.source.source_instance_id,
      scope: context.source.scope,
      graph_kind: 'observed',
      entities: [
        {
          entity_id: hostEntityId,
          entity_type: 'host',
          canonical_key: `${this.sourceType}:${context.source.scope}:host/probe-host`,
          display_name: `probe-host (${this.sourceType})`,
          labels: ['onprem', this.sourceType, 'hint'],
          properties: {
            hint_kind: this.sourceType,
            scope: context.source.scope
          },
          status: 'active',
          created_at: context.now,
          updated_at: context.now
        },
        {
          entity_id: networkEntityId,
          entity_type: 'segment',
          canonical_key: `${this.sourceType}:${context.source.scope}:segment/network`,
          display_name: `network (${this.sourceType})`,
          labels: ['onprem', this.sourceType, 'hint'],
          properties: {
            hint_kind: this.sourceType,
            scope: context.source.scope
          },
          status: 'active',
          created_at: context.now,
          updated_at: context.now
        }
      ],
      relations: [
        {
          relation_id: relationId,
          relation_type: 'connected_to',
          from_entity_id: hostEntityId,
          to_entity_id: networkEntityId,
          properties: { inferred: true },
          status: 'active',
          created_at: context.now,
          updated_at: context.now
        }
      ],
      observations,
      cursor: context.now
    };
  }
}
