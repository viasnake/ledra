import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  CanonicalEntity,
  CanonicalObservation,
  CanonicalRelation,
  EntityType
} from '@cataloga/schema';
import type {
  SourceAdapter,
  SourceCollectContext,
  SourceCollectResult
} from '@cataloga/source-contract';

export const packageName = '@cataloga/source-aws';

type AwsFixtureResource = {
  id: string;
  type: EntityType;
  name?: string;
  account_id?: string;
  region?: string;
  labels?: string[];
  properties?: Record<string, unknown>;
};

type AwsFixtureRelation = {
  id: string;
  type: CanonicalRelation['relation_type'];
  from: string;
  to: string;
};

type AwsFixture = {
  resources: AwsFixtureResource[];
  relations: AwsFixtureRelation[];
};

const loadFixture = (pathValue: string): AwsFixture => {
  const workspaceRoot = process.cwd();
  const filePath = resolve(pathValue);
  if (!filePath.startsWith(workspaceRoot)) {
    throw new Error('AWS fixture path must stay inside current workspace.');
  }
  if (!existsSync(filePath)) {
    return { resources: [], relations: [] };
  }

  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<AwsFixture>;
  return {
    resources: parsed.resources ?? [],
    relations: parsed.relations ?? []
  };
};

const toObservation = (args: {
  subjectKind: CanonicalObservation['subject_kind'];
  subjectId: string;
  context: SourceCollectContext;
  evidenceRef: string;
}): CanonicalObservation => ({
  observation_id: `obs_${args.subjectKind}_${args.subjectId}_${args.context.run_id}`,
  subject_kind: args.subjectKind,
  subject_id: args.subjectId,
  source_type: 'aws',
  source_instance_id: args.context.source.source_instance_id,
  source_ref: {
    account_id: String(args.context.source.config.account_id ?? ''),
    regions: String((args.context.source.config.regions as string[] | undefined)?.join(',') ?? '')
  },
  observed_at: args.context.now,
  collector_run_id: args.context.run_id,
  confidence: 1,
  raw_evidence_ref: args.evidenceRef
});

export class AwsSourceAdapter implements SourceAdapter {
  public readonly sourceType = 'aws' as const;

  public async collect(context: SourceCollectContext): Promise<SourceCollectResult> {
    const fixture = loadFixture(
      String(context.source.config.fixture_path ?? 'examples/aws-fixture.json')
    );
    const entities: CanonicalEntity[] = fixture.resources.map((resource) => ({
      entity_id: `ent_aws_${resource.type}_${resource.id}`,
      entity_type: resource.type,
      canonical_key: `aws:${resource.account_id ?? context.source.config.account_id ?? 'unknown'}:${resource.region ?? 'global'}:${resource.type}/${resource.id}`,
      display_name: resource.name ?? resource.id,
      labels: resource.labels ?? ['aws'],
      properties: resource.properties ?? {},
      status: 'active',
      created_at: context.now,
      updated_at: context.now
    }));

    const entityByFixtureId = new Map(
      fixture.resources.map((resource, index) => [resource.id, entities[index]!])
    );
    const relations: CanonicalRelation[] = fixture.relations.flatMap((relation) => {
      const from = entityByFixtureId.get(relation.from);
      const to = entityByFixtureId.get(relation.to);
      if (!from || !to) {
        return [];
      }

      return [
        {
          relation_id: `rel_aws_${relation.id}`,
          relation_type: relation.type,
          from_entity_id: from.entity_id,
          to_entity_id: to.entity_id,
          properties: {},
          status: 'active',
          created_at: context.now,
          updated_at: context.now
        }
      ];
    });

    const observations: CanonicalObservation[] = [
      ...entities.map((entity) =>
        toObservation({
          subjectKind: 'entity',
          subjectId: entity.entity_id,
          context,
          evidenceRef: `aws://${context.source.source_instance_id}/${entity.entity_id}`
        })
      ),
      ...relations.map((relation) =>
        toObservation({
          subjectKind: 'relation',
          subjectId: relation.relation_id,
          context,
          evidenceRef: `aws://${context.source.source_instance_id}/${relation.relation_id}`
        })
      )
    ];

    return {
      source_type: 'aws',
      source_instance_id: context.source.source_instance_id,
      scope: context.source.scope,
      graph_kind: 'observed',
      entities,
      relations,
      observations,
      cursor: context.now
    };
  }
}
