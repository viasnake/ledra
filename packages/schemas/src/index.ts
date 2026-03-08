import { IMPLEMENTATION_ORDER } from '@ledra/types';

export const packageName = '@ledra/schemas';

export const CLI_ROADMAP = {
  first: ['validate', 'build'],
  second: ['serve', 'inspect', 'export']
} as const;

export const API_ENDPOINTS = [
  '/api/types',
  '/api/entities',
  '/api/entities/{type}/{id}',
  '/api/relations',
  '/api/search',
  '/api/diagnostics',
  '/api/views'
] as const;

export const WEB_POLICY = {
  mode: 'static-first',
  writable: false
} as const;

export const WORKFLOW_SCHEMA = {
  implementationOrder: IMPLEMENTATION_ORDER,
  cli: CLI_ROADMAP,
  api: API_ENDPOINTS,
  web: WEB_POLICY
} as const;
