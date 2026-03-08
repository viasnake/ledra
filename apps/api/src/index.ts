import { buildBundle } from '@ledra/bundle';
import { createReadOnlyRepository } from '@ledra/core';
import { searchEntities } from '@ledra/search';
import { API_ENDPOINTS } from '@ledra/schemas';
import type { EntityRecord } from '@ledra/types';
import { validateEntities } from '@ledra/validator';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const appName = '@ledra/api';

const DATA_ROOT = resolve(process.cwd(), 'packages/sample-data/data');

const isSupportedEntityFile = (filePath: string): boolean => {
  const extension = extname(filePath).toLowerCase();
  return extension === '.json' || extension === '.yaml' || extension === '.yml';
};

const parseSimpleYamlEntity = (content: string): Omit<EntityRecord, 'sourceFilePath'> => {
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.replace(/\t/g, '  '))
    .filter((line) => line.trim().length > 0 && !line.trimStart().startsWith('#'));

  let id = '';
  let type = '';
  let title = '';
  let summary: string | undefined;
  const tags: string[] = [];
  const relations: { type: string; targetId: string }[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (trimmed.startsWith('id:')) {
      id = trimmed.slice(3).trim();
      continue;
    }

    if (trimmed.startsWith('type:')) {
      type = trimmed.slice(5).trim();
      continue;
    }

    if (trimmed.startsWith('title:')) {
      title = trimmed.slice(6).trim();
      continue;
    }

    if (trimmed.startsWith('summary:')) {
      summary = trimmed.slice(8).trim();
      continue;
    }

    if (trimmed === 'tags:') {
      for (let j = i + 1; j < lines.length; j += 1) {
        const nextLine = lines[j] ?? '';
        if (!nextLine.startsWith('  - ')) {
          break;
        }

        tags.push(nextLine.trim().slice(2).trim());
        i = j;
      }
      continue;
    }

    if (trimmed === 'relations:') {
      for (let j = i + 1; j < lines.length; j += 1) {
        const relationHeader = lines[j] ?? '';
        if (!relationHeader.startsWith('  - ')) {
          break;
        }

        const relationTypeLine = relationHeader.trim();
        const relationTargetLine = lines[j + 1]?.trim();
        const relationType = relationTypeLine.replace('- ', '').replace('type:', '').trim();
        const targetId = relationTargetLine?.startsWith('targetId:')
          ? relationTargetLine.slice('targetId:'.length).trim()
          : '';

        relations.push({ type: relationType, targetId });
        i = j + 1;
        j += 1;
      }
    }
  }

  const entity: Omit<EntityRecord, 'sourceFilePath'> = {
    id,
    type,
    title,
    tags,
    relations
  };

  if (summary !== undefined) {
    entity.summary = summary;
  }

  return entity;
};

const loadEntityFromFile = async (filePath: string): Promise<EntityRecord> => {
  const content = await readFile(filePath, 'utf8');
  const extension = extname(filePath).toLowerCase();
  const parsed =
    extension === '.json'
      ? (JSON.parse(content) as Omit<EntityRecord, 'sourceFilePath'>)
      : parseSimpleYamlEntity(content);

  return {
    ...parsed,
    sourceFilePath: relative(process.cwd(), filePath)
  };
};

export const loadRegistryFromFilesystem = async (rootDir: string = DATA_ROOT): Promise<readonly EntityRecord[]> => {
  const entries = await readdir(rootDir, { withFileTypes: true });

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(rootDir, entry.name))
    .filter(isSupportedEntityFile)
    .sort((a, b) => a.localeCompare(b));

  const entities = await Promise.all(files.map((filePath) => loadEntityFromFile(filePath)));
  return entities;
};

const createReadOnlyDomain = (repository: ReturnType<typeof createReadOnlyRepository>) => ({
  types: () => repository.listTypes(),
  entities: () => repository.listEntities(),
  entityByTypeAndId: (type: string, id: string) => repository.findEntity(type, id) ?? null,
  relations: () => repository.listRelations(),
  search: (query: string) => searchEntities(query, repository),
  diagnostics: () => ({
    repository: repository.diagnostics(),
    validation: validateEntities(repository.listEntities())
  }),
  views: () => ({ bundle: buildBundle(repository), readOnly: true })
});

export const createReadOnlyApi = async (rootDir?: string) => {
  const entities = await loadRegistryFromFilesystem(rootDir);
  const repository = createReadOnlyRepository(entities);
  const domain = createReadOnlyDomain(repository);

  return {
    endpoints: API_ENDPOINTS,
    '/api/types': () => domain.types(),
    '/api/entities': () => domain.entities(),
    '/api/entities/{type}/{id}': (type: string, id: string) => domain.entityByTypeAndId(type, id),
    '/api/relations': () => domain.relations(),
    '/api/search': (query: string) => domain.search(query),
    '/api/diagnostics': () => domain.diagnostics(),
    '/api/views': () => domain.views()
  };
};

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
  sendJson(response, 404, { error: 'Not Found' });
};

const parseEntityRoute = (pathname: string): { type: string; id: string } | null => {
  const match = pathname.match(/^\/api\/entities\/([^/]+)\/([^/]+)$/u);
  if (!match) {
    return null;
  }

  const [, type, id] = match;
  if (!type || !id) {
    return null;
  }

  return {
    type: decodeURIComponent(type),
    id: decodeURIComponent(id)
  };
};

const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  domain: ReturnType<typeof createReadOnlyDomain>
): Promise<void> => {
  if (request.method !== 'GET') {
    methodNotAllowed(response);
    return;
  }

  const requestUrl = new URL(request.url ?? '/', 'http://localhost');

  if (requestUrl.pathname === '/api/types') {
    sendJson(response, 200, domain.types());
    return;
  }

  if (requestUrl.pathname === '/api/entities') {
    sendJson(response, 200, domain.entities());
    return;
  }

  const entityRoute = parseEntityRoute(requestUrl.pathname);
  if (entityRoute) {
    const entity = domain.entityByTypeAndId(entityRoute.type, entityRoute.id);
    if (entity === null) {
      notFound(response);
      return;
    }

    sendJson(response, 200, entity);
    return;
  }

  if (requestUrl.pathname === '/api/relations') {
    sendJson(response, 200, domain.relations());
    return;
  }

  if (requestUrl.pathname === '/api/search') {
    sendJson(response, 200, domain.search(requestUrl.searchParams.get('q') ?? ''));
    return;
  }

  if (requestUrl.pathname === '/api/diagnostics') {
    sendJson(response, 200, domain.diagnostics());
    return;
  }

  if (requestUrl.pathname === '/api/views') {
    sendJson(response, 200, domain.views());
    return;
  }

  notFound(response);
};

export const createHttpEntrypoint = async (rootDir?: string) => {
  const entities = await loadRegistryFromFilesystem(rootDir);
  const repository = createReadOnlyRepository(entities);
  const domain = createReadOnlyDomain(repository);

  return createServer((request, response) => {
    void handleRequest(request, response, domain).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown transport error';
      sendJson(response, 500, { error: 'Internal Server Error', message });
    });
  });
};

const isDirectRun = (): boolean => {
  const currentFilePath = fileURLToPath(import.meta.url);
  const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
  return currentFilePath === invokedPath;
};

if (isDirectRun()) {
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  const registryRoot = process.env.LEDRA_REGISTRY_DIR ? resolve(process.env.LEDRA_REGISTRY_DIR) : DATA_ROOT;

  createHttpEntrypoint(registryRoot)
    .then((server) => {
      server.listen(port, '0.0.0.0', () => {
        console.log(`@ledra/api listening on http://0.0.0.0:${port}`);
      });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown startup error';
      console.error(`Failed to start @ledra/api: ${message}`);
      process.exitCode = 1;
    });
}
