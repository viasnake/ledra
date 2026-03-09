import {
  BUILTIN_ENTITY_TYPES,
  IMPLEMENTATION_ORDER,
  type BuiltinEntityTypeName
} from '@ledra/types';

export const packageName = '@ledra/schemas';

export const REGISTRY_LAYOUT = {
  rootDirectory: 'registry',
  entityTypesDirectory: 'entity-types',
  entitiesDirectory: 'entities',
  relationsDirectory: 'relations',
  viewsDirectory: 'views',
  policiesDirectory: 'policies'
} as const;

export const CLI_COMMANDS = ['validate', 'build', 'serve', 'inspect', 'export'] as const;

export const API_ENDPOINTS = [
  '/api/types',
  '/api/entities',
  '/api/entities/{type}/{id}',
  '/api/relations',
  '/api/search',
  '/api/diagnostics',
  '/api/views'
] as const;

export const VIEWER_POLICY = {
  mode: 'static-first',
  writable: false
} as const;

export type PrimitiveAttributeType = 'string' | 'number' | 'boolean';

export type BuiltinEntitySchema = {
  type: BuiltinEntityTypeName;
  title: string;
  description: string;
  requiredAttributes: readonly string[];
  attributeTypes: Readonly<Record<string, PrimitiveAttributeType>>;
};

export const BUILTIN_ENTITY_SCHEMAS: Readonly<Record<BuiltinEntityTypeName, BuiltinEntitySchema>> =
  {
    site: {
      type: 'site',
      title: 'Site',
      description: 'Physical or logical location that groups registry records.',
      requiredAttributes: ['name'],
      attributeTypes: {
        name: 'string',
        code: 'string',
        region: 'string'
      }
    },
    segment: {
      type: 'segment',
      title: 'Segment',
      description: 'A network or logical segment within a site.',
      requiredAttributes: ['name', 'siteId'],
      attributeTypes: {
        name: 'string',
        siteId: 'string',
        role: 'string'
      }
    },
    vlan: {
      type: 'vlan',
      title: 'VLAN',
      description: 'Layer 2 VLAN definition scoped by site.',
      requiredAttributes: ['name', 'siteId', 'vlanId'],
      attributeTypes: {
        name: 'string',
        siteId: 'string',
        vlanId: 'number'
      }
    },
    prefix: {
      type: 'prefix',
      title: 'Prefix',
      description: 'IP prefix with site/VLAN ownership.',
      requiredAttributes: ['cidr', 'family'],
      attributeTypes: {
        cidr: 'string',
        family: 'string',
        siteId: 'string',
        vlanId: 'string',
        gateway: 'string'
      }
    },
    allocation: {
      type: 'allocation',
      title: 'Allocation',
      description: 'Specific IP allocation inside a prefix.',
      requiredAttributes: ['address', 'prefixId'],
      attributeTypes: {
        address: 'string',
        prefixId: 'string',
        hostId: 'string',
        role: 'string'
      }
    },
    host: {
      type: 'host',
      title: 'Host',
      description: 'Host inventory record.',
      requiredAttributes: ['hostname'],
      attributeTypes: {
        hostname: 'string',
        fqdn: 'string',
        primaryAddress: 'string',
        siteId: 'string',
        os: 'string'
      }
    },
    service: {
      type: 'service',
      title: 'Service',
      description: 'Service inventory record tied to hosts or allocations.',
      requiredAttributes: ['name'],
      attributeTypes: {
        name: 'string',
        hostId: 'string',
        protocol: 'string',
        port: 'number',
        exposure: 'string'
      }
    },
    dns_record: {
      type: 'dns_record',
      title: 'DNS Record',
      description: 'DNS registry record.',
      requiredAttributes: ['name', 'fqdn', 'recordType', 'value'],
      attributeTypes: {
        name: 'string',
        fqdn: 'string',
        recordType: 'string',
        value: 'string',
        zone: 'string'
      }
    }
  };

export const WORKFLOW_SCHEMA = {
  implementationOrder: IMPLEMENTATION_ORDER,
  builtInEntityTypes: BUILTIN_ENTITY_TYPES,
  registryLayout: REGISTRY_LAYOUT,
  cli: CLI_COMMANDS,
  api: API_ENDPOINTS,
  viewer: VIEWER_POLICY
} as const;
