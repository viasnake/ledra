/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./node-shims.d.ts" />

declare const process:
  | {
      argv: string[];
      env: Record<string, string | undefined>;
      exitCode?: number;
    }
  | undefined;

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createCatalogaRuntime, defaultConfigPath } from '@cataloga/core';
import {
  diffSnapshots,
  findAssets,
  findPublicExposure,
  getEvidence,
  getNeighbors
} from '@cataloga/query';

export const appName = '@cataloga/api';

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const notFound = (response: ServerResponse): void => {
  sendJson(response, 404, { error: 'Not Found', readOnly: true });
};

const methodNotAllowed = (response: ServerResponse): void => {
  response.statusCode = 405;
  response.setHeader('allow', 'GET');
  sendJson(response, 405, { error: 'Method Not Allowed', readOnly: true });
};

export const createReadOnlyApi = (configPath = defaultConfigPath) => {
  const runtime = createCatalogaRuntime(configPath);

  return {
    '/api/v1/entities': () => runtime.store.entities.list(),
    '/api/v1/entities/{id}': (entityId: string) => runtime.store.entities.find(entityId) ?? null,
    '/api/v1/relations': () => runtime.store.relations.list(),
    '/api/v1/snapshots': () => runtime.store.snapshots.list(),
    '/api/v1/drift': () => runtime.store.drifts.list(),
    '/api/v1/topologies': () => runtime.store.topologies.list(),
    '/api/v1/topologies/{id}': (topologyId: string) =>
      runtime.store.topologies.get(topologyId) ?? null,
    '/api/v1/topologies/{id}/svg': (topologyId: string) => {
      const projection = runtime.store.topologies.get(topologyId);
      if (!projection || projection.format !== 'svg') {
        return null;
      }

      return projection;
    },
    '/api/v1/query/find-assets': (text: string, type?: string) =>
      findAssets(runtime.store, text, type),
    '/api/v1/query/get-neighbors': (entityId: string) => getNeighbors(runtime.store, entityId),
    '/api/v1/query/find-public-exposure': () => findPublicExposure(runtime.store),
    '/api/v1/query/find-ingress-paths': (entityId: string) => getNeighbors(runtime.store, entityId),
    '/api/v1/query/diff-snapshots': (left: string, right: string) =>
      diffSnapshots(runtime.store, left, right),
    '/api/v1/query/get-evidence': (subjectId: string) => getEvidence(runtime.store, subjectId),
    ingest: runtime.ingest
  };
};

const parseEntityRoute = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/api\/v1\/entities\/([^/]+)$/u);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
};

const parseTopologyRoute = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/api\/v1\/topologies\/([^/]+)$/u);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
};

const parseTopologySvgRoute = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/api\/v1\/topologies\/([^/]+)\/svg$/u);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
};

const queryValue = (requestUrl: URL, key: string): string =>
  requestUrl.searchParams.get(key)?.trim() ?? '';

const handleRequest = (
  request: IncomingMessage,
  response: ServerResponse,
  api: ReturnType<typeof createReadOnlyApi>
): void => {
  if (request.method !== 'GET') {
    methodNotAllowed(response);
    return;
  }

  const requestUrl = new URL(request.url ?? '/', 'http://localhost');

  const requiredApiKey = process?.env.CATALOGA_API_KEY?.trim();
  if (requiredApiKey) {
    const headers = (
      request as unknown as { headers?: Record<string, string | string[] | undefined> }
    ).headers;
    const providedRaw = headers?.['x-cataloga-api-key'];
    const provided = Array.isArray(providedRaw) ? providedRaw[0] : providedRaw;
    if (!provided || provided !== requiredApiKey) {
      sendJson(response, 401, { error: 'Unauthorized', readOnly: true });
      return;
    }
  }
  if (requestUrl.pathname === '/health') {
    sendJson(response, 200, { ok: true, readOnly: true });
    return;
  }

  if (requestUrl.pathname === '/api/v1/entities') {
    sendJson(response, 200, api['/api/v1/entities']());
    return;
  }

  const entityId = parseEntityRoute(requestUrl.pathname);
  if (entityId) {
    const entity = api['/api/v1/entities/{id}'](entityId);
    if (!entity) {
      notFound(response);
      return;
    }
    sendJson(response, 200, entity);
    return;
  }

  if (requestUrl.pathname === '/api/v1/relations') {
    sendJson(response, 200, api['/api/v1/relations']());
    return;
  }

  if (requestUrl.pathname === '/api/v1/snapshots') {
    sendJson(response, 200, api['/api/v1/snapshots']());
    return;
  }

  if (requestUrl.pathname === '/api/v1/drift') {
    sendJson(response, 200, api['/api/v1/drift']());
    return;
  }

  if (requestUrl.pathname === '/api/v1/topologies') {
    sendJson(response, 200, api['/api/v1/topologies']());
    return;
  }

  const topologySvgId = parseTopologySvgRoute(requestUrl.pathname);
  if (topologySvgId) {
    const projection = api['/api/v1/topologies/{id}/svg'](topologySvgId);
    if (!projection) {
      notFound(response);
      return;
    }

    response.statusCode = 200;
    response.setHeader('content-type', 'image/svg+xml; charset=utf-8');
    response.end(projection.payload);
    return;
  }

  const topologyId = parseTopologyRoute(requestUrl.pathname);
  if (topologyId) {
    const projection = api['/api/v1/topologies/{id}'](topologyId);
    if (!projection) {
      notFound(response);
      return;
    }
    sendJson(response, 200, projection);
    return;
  }

  if (requestUrl.pathname === '/api/v1/query/find-assets') {
    sendJson(
      response,
      200,
      api['/api/v1/query/find-assets'](
        queryValue(requestUrl, 'q'),
        queryValue(requestUrl, 'type') || undefined
      )
    );
    return;
  }

  if (requestUrl.pathname === '/api/v1/query/get-neighbors') {
    sendJson(response, 200, api['/api/v1/query/get-neighbors'](queryValue(requestUrl, 'id')));
    return;
  }

  if (requestUrl.pathname === '/api/v1/query/find-public-exposure') {
    sendJson(response, 200, api['/api/v1/query/find-public-exposure']());
    return;
  }

  if (requestUrl.pathname === '/api/v1/query/find-ingress-paths') {
    sendJson(response, 200, api['/api/v1/query/find-ingress-paths'](queryValue(requestUrl, 'id')));
    return;
  }

  if (requestUrl.pathname === '/api/v1/query/diff-snapshots') {
    sendJson(
      response,
      200,
      api['/api/v1/query/diff-snapshots'](
        queryValue(requestUrl, 'left'),
        queryValue(requestUrl, 'right')
      )
    );
    return;
  }

  if (requestUrl.pathname === '/api/v1/query/get-evidence') {
    sendJson(
      response,
      200,
      api['/api/v1/query/get-evidence'](queryValue(requestUrl, 'subject_id'))
    );
    return;
  }

  notFound(response);
};

export const createHttpEntrypoint = (configPath = defaultConfigPath) => {
  const api = createReadOnlyApi(configPath);
  return createServer((request, response) => {
    try {
      handleRequest(request, response, api);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown transport error';
      console.error(message);
      sendJson(response, 500, { error: 'Internal Server Error', readOnly: true });
    }
  });
};

if (typeof process !== 'undefined' && process.argv[1]) {
  const configPath = process.env.CATALOGA_CONFIG ?? defaultConfigPath;
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);

  if (process.argv[1].endsWith('/apps/api/src/index.js')) {
    createHttpEntrypoint(configPath).listen(port, '127.0.0.1', () => {
      console.log(
        JSON.stringify({ readOnly: true, port, configPath, status: 'Listening' }, null, 2)
      );
    });
  }
}
