/// <reference path="./node-shims.d.ts" />
declare const process:
  | {
      argv: string[];
      env: Record<string, string | undefined>;
      exitCode?: number;
    }
  | undefined;

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildBundle } from '@ledra/bundle';
import { loadRegistryFromFs } from '@ledra/core';
import { createHttpEntrypoint } from '@ledra/api';
import { searchEntities, type SearchQueryInput } from '@ledra/search';
import { validateEntities } from '@ledra/validator';

export const appName = '@ledra/cli';

export type CliCommand = 'validate' | 'build' | 'serve' | 'inspect' | 'export';

type ParsedArgs = {
  command: CliCommand | undefined;
  registryRoot?: string;
  outPath?: string;
  query?: string;
  port?: number;
};

const DEFAULT_REGISTRY_ROOT = 'packages/sample-data/registry';
const DEFAULT_PORT = 3000;
const usage =
  'Usage: ledra <validate|build|serve|inspect|export> [--registry <path>] [--out <path>] [--query <text|json>] [--port <number>]';

const parsePort = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 ? port : undefined;
};

const parseArgs = (args: readonly string[]): ParsedArgs => {
  const [command, ...rest] = args;
  let registryRoot: string | undefined;
  let outPath: string | undefined;
  let port: number | undefined;
  const queryParts: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === '--registry') {
      registryRoot = rest[index + 1];
      index += 1;
      continue;
    }

    if (token === '--out') {
      outPath = rest[index + 1];
      index += 1;
      continue;
    }

    if (token === '--port') {
      port = parsePort(rest[index + 1]);
      index += 1;
      continue;
    }

    if (token === '--query') {
      queryParts.push(
        ...rest.slice(index + 1).filter((value): value is string => value !== undefined)
      );
      break;
    }

    queryParts.push(token);
  }

  return {
    command: command as CliCommand | undefined,
    ...(registryRoot === undefined ? {} : { registryRoot }),
    ...(outPath === undefined ? {} : { outPath }),
    ...(queryParts.length === 0 ? {} : { query: queryParts.join(' ').trim() }),
    ...(port === undefined ? {} : { port })
  };
};

const resolveRegistryRoot = (registryRoot?: string): string =>
  registryRoot ?? DEFAULT_REGISTRY_ROOT;

const writeJsonFile = (filePath: string, value: unknown): void => {
  const outputPath = resolve(filePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const parseSearchQuery = (query: string | undefined): SearchQueryInput => {
  const normalized = query?.trim() ?? '';
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('{')) {
    try {
      return JSON.parse(normalized) as SearchQueryInput;
    } catch {
      return normalized;
    }
  }

  return normalized;
};

const createCommandOutput = (registryRoot: string) => {
  const repository = loadRegistryFromFs(registryRoot);
  const diagnostics = repository.diagnostics();

  return {
    repository,
    diagnostics,
    validation: validateEntities(repository.listEntities())
  };
};

export const runLedraCli = (args: readonly string[]): string => {
  const parsed = parseArgs(args);
  const registryRoot = resolveRegistryRoot(parsed.registryRoot);

  switch (parsed.command) {
    case 'validate': {
      const { diagnostics, validation } = createCommandOutput(registryRoot);
      return JSON.stringify({ result: validation, diagnostics }, null, 2);
    }
    case 'build': {
      const { repository, diagnostics, validation } = createCommandOutput(registryRoot);
      const bundle = buildBundle(repository);
      const payload = { bundle, diagnostics, validation };

      if (parsed.outPath) {
        writeJsonFile(parsed.outPath, bundle);
      }

      return JSON.stringify(payload, null, 2);
    }
    case 'inspect': {
      const { repository } = createCommandOutput(registryRoot);
      const query = parseSearchQuery(parsed.query);
      return JSON.stringify(searchEntities(query, repository), null, 2);
    }
    case 'export': {
      const { repository } = createCommandOutput(registryRoot);
      const bundle = buildBundle(repository);

      if (parsed.outPath) {
        writeJsonFile(parsed.outPath, bundle);
      }

      return JSON.stringify(bundle, null, 2);
    }
    case 'serve':
      return JSON.stringify(
        {
          readOnly: true,
          registryRoot,
          port: parsed.port ?? parsePort(process?.env.PORT) ?? DEFAULT_PORT,
          status: 'Starting read-only HTTP server via @ledra/api.'
        },
        null,
        2
      );
    default:
      return usage;
  }
};

export const startLedraServe = async (args: readonly string[]) => {
  const parsed = parseArgs(args);
  const registryRoot = resolveRegistryRoot(parsed.registryRoot);
  const port = parsed.port ?? parsePort(process?.env.PORT) ?? DEFAULT_PORT;
  const server = await createHttpEntrypoint(registryRoot);

  return new Promise<{ port: number; registryRoot: string }>((resolveServer) => {
    server.listen(port, '0.0.0.0', () => {
      resolveServer({ port, registryRoot });
    });
  });
};

if (typeof process !== 'undefined' && process.argv[1]) {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.command === 'serve') {
    void startLedraServe(args)
      .then(({ port, registryRoot }) => {
        console.log(
          JSON.stringify({ readOnly: true, port, registryRoot, status: 'Listening' }, null, 2)
        );
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown serve error';
        process.exitCode = 1;
        console.error(message);
      });
  } else {
    console.log(runLedraCli(args));
  }
}
