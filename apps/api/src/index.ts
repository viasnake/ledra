/// <reference path="./node-shims.d.ts" />
declare const process:
  | {
      argv: string[];
      env: Record<string, string | undefined>;
      exitCode?: number;
    }
  | undefined;

import { buildBundle } from '@ledra/bundle';
import { loadRegistryFromFs } from '@ledra/core';
import { searchEntities, type SearchQueryInput } from '@ledra/search';
import { API_ENDPOINTS } from '@ledra/schemas';
import { validateEntities } from '@ledra/validator';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export const appName = '@ledra/api';

const DEFAULT_REGISTRY_ROOT = 'packages/sample-data/registry';

type ReadOnlyApi = ReturnType<typeof createReadOnlyApi>;

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const methodNotAllowed = (response: ServerResponse): void => {
  response.statusCode = 405;
  response.setHeader('allow', 'GET');
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ error: 'Method Not Allowed', readOnly: true }));
};

const notFound = (response: ServerResponse): void => {
  sendJson(response, 404, { error: 'Not Found', readOnly: true });
};

const parseEntityRoute = (pathname: string): { type: string; id: string } | null => {
  const match = pathname.match(/^\/api\/entities\/([^/]+)\/([^/]+)$/u);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    type: decodeURIComponent(match[1]),
    id: decodeURIComponent(match[2])
  };
};

const parseSearchInput = (requestUrl: URL): SearchQueryInput => {
  const rawQuery = requestUrl.searchParams.get('q') ?? requestUrl.searchParams.get('query') ?? '';
  const trimmed = rawQuery.trim();

  if (!trimmed.startsWith('{')) {
    return trimmed;
  }

  try {
    return JSON.parse(trimmed) as SearchQueryInput;
  } catch {
    return trimmed;
  }
};

export const createReadOnlyApi = (registryRoot = DEFAULT_REGISTRY_ROOT) => {
  const repository = loadRegistryFromFs(registryRoot);
  const validation = validateEntities(repository.listEntities());

  return {
    endpoints: API_ENDPOINTS,
    '/api/types': () => repository.listTypes(),
    '/api/entities': () => repository.listEntities(),
    '/api/entities/{type}/{id}': (type: string, id: string) =>
      repository.findEntity(type, id) ?? null,
    '/api/relations': () => repository.listRelations(),
    '/api/search': (query: SearchQueryInput) => searchEntities(query, repository),
    '/api/diagnostics': () => ({ repository: repository.diagnostics(), validation }),
    '/api/views': () => ({ bundle: buildBundle(repository), readOnly: true })
  };
};

const handleRequest = (
  request: IncomingMessage,
  response: ServerResponse,
  api: ReadOnlyApi
): void => {
  if (request.method !== 'GET') {
    methodNotAllowed(response);
    return;
  }

  const requestUrl = new URL(request.url ?? '/', 'http://localhost');

  if (requestUrl.pathname === '/health') {
    sendJson(response, 200, { ok: true, readOnly: true });
    return;
  }

  if (requestUrl.pathname === '/api/types') {
    sendJson(response, 200, api['/api/types']());
    return;
  }

  if (requestUrl.pathname === '/api/entities') {
    sendJson(response, 200, api['/api/entities']());
    return;
  }

  const entityRoute = parseEntityRoute(requestUrl.pathname);
  if (entityRoute) {
    const entity = api['/api/entities/{type}/{id}'](entityRoute.type, entityRoute.id);
    if (entity === null) {
      notFound(response);
      return;
    }

    sendJson(response, 200, entity);
    return;
  }

  if (requestUrl.pathname === '/api/relations') {
    sendJson(response, 200, api['/api/relations']());
    return;
  }

  if (requestUrl.pathname === '/api/search') {
    sendJson(response, 200, api['/api/search'](parseSearchInput(requestUrl)));
    return;
  }

  if (requestUrl.pathname === '/api/diagnostics') {
    sendJson(response, 200, api['/api/diagnostics']());
    return;
  }

  if (requestUrl.pathname === '/api/views') {
    sendJson(response, 200, api['/api/views']());
    return;
  }

  notFound(response);
};

export const createHttpEntrypoint = (registryRoot = DEFAULT_REGISTRY_ROOT) => {
  const api = createReadOnlyApi(registryRoot);

  return createServer((request, response) => {
    try {
      handleRequest(request, response, api);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown transport error';
      sendJson(response, 500, { error: 'Internal Server Error', message, readOnly: true });
    }
  });
};

if (typeof process !== 'undefined' && process.argv[1]) {
  const registryRoot = process.env.LEDRA_REGISTRY_DIR ?? DEFAULT_REGISTRY_ROOT;
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);

  if (process.argv[1].endsWith('/apps/api/src/index.js')) {
    createHttpEntrypoint(registryRoot).listen(port, '0.0.0.0', () => {
      console.log(
        JSON.stringify({ readOnly: true, port, registryRoot, status: 'Listening' }, null, 2)
      );
    });
  }
}
