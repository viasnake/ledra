#!/usr/bin/env node

/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./node-shims.d.ts" />

declare const process:
  | {
      argv: string[];
      env: Record<string, string | undefined>;
      exitCode?: number;
      stdout: { write(value: string): void };
      stderr: { write(value: string): void };
    }
  | undefined;

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle } from '@cataloga/bundle';
import { createCatalogaRuntime, defaultConfigPath, loadRegistryFromFs } from '@cataloga/core';
import { validateRegistry } from '@cataloga/validator';

export const appName = '@cataloga/cli';
export const cliVersion = '1.0.0';

type Command =
  | 'validate'
  | 'inspect'
  | 'build'
  | 'export'
  | 'source'
  | 'ingest'
  | 'snapshot'
  | 'topology'
  | 'drift'
  | 'serve';

type ParsedArgs = {
  command?: Command;
  subcommand?: string;
  flags: Record<string, string | true>;
};

const usage = [
  'Usage: cataloga <command> <subcommand> [flags]',
  '',
  'Commands:',
  '  validate --registry <path>',
  '  inspect --registry <path> [--query type=<entity-type>|id=<id>|tag=<tag>]',
  '  build --registry <path> --out <path>',
  '  export --registry <path> --out <path>',
  '  source add',
  '  source list',
  '  ingest run [--source <id>]',
  '  snapshot list',
  '  topology build [--view <site-overview|aws-vpc-overview|internet-ingress|service-dependency|drift-view>]',
  '  topology export --id <topology-id> --out <path>',
  '  drift compute',
  '  serve [--config <path>|--registry <path>] [--port <port>]',
  '',
  'Global flags:',
  '  --config <path>   Config file path (default: cataloga.yaml)',
  '  --help            Show help',
  '  --version         Show version'
].join('\n');

const parseArgs = (args: readonly string[]): ParsedArgs => {
  const [command, maybeSubcommand, ...tail] = args;
  const subcommand = maybeSubcommand?.startsWith('--') ? undefined : maybeSubcommand;
  const rest = maybeSubcommand?.startsWith('--') ? [maybeSubcommand, ...tail] : tail;
  const flags: Record<string, string | true> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token || !token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      flags[key] = true;
      continue;
    }

    flags[key] = value;
    index += 1;
  }

  const parsedCommand = command as Command | undefined;
  return {
    ...(parsedCommand ? { command: parsedCommand } : {}),
    ...(subcommand ? { subcommand } : {}),
    flags
  };
};

const asString = (value: string | true | undefined): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const formatJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const writeJson = (filePath: string, value: unknown): void => {
  const absolutePath = resolve(filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, formatJson(value), 'utf8');
};

const registryPathFromArgs = (args: ParsedArgs): string => {
  const registryPath = asString(args.flags.registry);
  if (!registryPath) {
    throw new Error('--registry is required');
  }

  return registryPath;
};

const writeRegistryRuntimeConfig = (args: ParsedArgs): string => {
  const registryPath = resolve(registryPathFromArgs(args));
  const configPath = asString(args.flags.config) ?? '.cataloga/serve-config.yaml';
  const storePath = asString(args.flags.store) ?? '.cataloga/canonical-store.json';
  const evidencePath = asString(args.flags.evidence) ?? '.cataloga/evidence';
  const content = [
    'version: 1',
    'storage:',
    '  driver: postgres',
    `  file_path: ${JSON.stringify(resolve(storePath))}`,
    'object_store:',
    '  driver: local',
    `  bucket: ${JSON.stringify(resolve(evidencePath))}`,
    'sources:',
    '  - id: registry',
    '    type: git',
    '    enabled: true',
    '    scope: registry',
    '    poll_mode: full',
    '    config:',
    '      ref: local',
    `      path: ${JSON.stringify(registryPath)}`,
    '      allow_external_paths: true'
  ].join('\n');

  mkdirSync(dirname(resolve(configPath)), { recursive: true });
  writeFileSync(resolve(configPath), `${content}\n`, 'utf8');
  return configPath;
};

const handleValidate = (args: ParsedArgs): string => {
  const repository = loadRegistryFromFs(registryPathFromArgs(args));
  const result = validateRegistry(repository);
  if (!result.ok && typeof process !== 'undefined') {
    process.exitCode = 1;
  }

  return formatJson(result);
};

const handleInspect = (args: ParsedArgs): string => {
  const repository = loadRegistryFromFs(registryPathFromArgs(args));
  const query = asString(args.flags.query);
  const graph = repository.graph();

  if (!query) {
    return formatJson({
      graph,
      diagnostics: repository.diagnostics()
    });
  }

  const [field, ...rawValueParts] = query.split('=');
  const value = rawValueParts.join('=').trim();
  const normalizedField = field?.trim();
  const entities = graph.entities.filter((entity) => {
    if (normalizedField === 'type') {
      return entity.type === value;
    }
    if (normalizedField === 'id') {
      return entity.id === value;
    }
    if (normalizedField === 'tag') {
      return entity.tags.includes(value);
    }

    return (
      entity.id.includes(query) ||
      entity.type.includes(query) ||
      entity.title.toLowerCase().includes(query.toLowerCase())
    );
  });

  return formatJson({ query, entities });
};

const handleBundleExport = (args: ParsedArgs): string => {
  const outPath = asString(args.flags.out);
  if (!outPath) {
    throw new Error('--out is required');
  }

  const repository = loadRegistryFromFs(registryPathFromArgs(args));
  const validation = validateRegistry(repository);
  if (!validation.ok) {
    if (typeof process !== 'undefined') {
      process.exitCode = 1;
    }
    return formatJson(validation);
  }

  const bundle = buildBundle(repository);
  writeJson(outPath, bundle);

  return formatJson({
    ok: true,
    out: outPath,
    diagnostics: bundle.diagnostics
  });
};

const handleSource = (args: ParsedArgs): string => {
  const configPath = asString(args.flags.config) ?? defaultConfigPath;
  const runtime = createCatalogaRuntime(configPath);

  if (args.subcommand === 'list') {
    return formatJson(runtime.store.sources.list());
  }

  if (args.subcommand === 'add') {
    const id = asString(args.flags.id);
    const type = asString(args.flags.type);
    if (!id || !type) {
      return formatJson({ error: 'source add requires --id and --type' });
    }

    const configLiteral = asString(args.flags.sourceConfig);
    const parsedConfig = configLiteral
      ? (JSON.parse(configLiteral) as Record<string, unknown>)
      : {};
    runtime.store.sources.upsert({
      source_id: id,
      source_type: type as never,
      source_instance_id: id,
      scope: asString(args.flags.scope) ?? id,
      enabled: asString(args.flags.enabled) === 'false' ? false : true,
      poll_mode: asString(args.flags.pollMode) === 'incremental' ? 'incremental' : 'full',
      config: parsedConfig
    });
    runtime.store.flush();

    return formatJson({ ok: true, source_id: id });
  }

  return usage;
};

const handleIngest = async (args: ParsedArgs): Promise<string> => {
  if (args.subcommand !== 'run') {
    return usage;
  }

  const configPath = asString(args.flags.config) ?? defaultConfigPath;
  const runtime = createCatalogaRuntime(configPath);
  const sourceId = asString(args.flags.source);
  const result = await runtime.ingest.run(sourceId ? { sourceIds: [sourceId] } : {});

  return formatJson(result);
};

const handleSnapshot = (args: ParsedArgs): string => {
  if (args.subcommand !== 'list') {
    return usage;
  }

  const configPath = asString(args.flags.config) ?? defaultConfigPath;
  const runtime = createCatalogaRuntime(configPath);
  return formatJson(runtime.store.snapshots.list());
};

const handleTopology = (args: ParsedArgs): string => {
  const configPath = asString(args.flags.config) ?? defaultConfigPath;
  const runtime = createCatalogaRuntime(configPath);

  if (args.subcommand === 'build') {
    return formatJson(runtime.store.topologies.list());
  }

  if (args.subcommand === 'export') {
    const topologyId = asString(args.flags.id);
    const outPath = asString(args.flags.out);
    if (!topologyId || !outPath) {
      return formatJson({ error: 'topology export requires --id and --out' });
    }

    const projection = runtime.store.topologies.get(topologyId);
    if (!projection) {
      return formatJson({ error: `topology '${topologyId}' not found` });
    }

    if (projection.format === 'json') {
      writeJson(outPath, JSON.parse(projection.payload));
    } else {
      mkdirSync(dirname(resolve(outPath)), { recursive: true });
      writeFileSync(resolve(outPath), projection.payload, 'utf8');
    }

    return formatJson({ ok: true, topology_id: topologyId, out: outPath });
  }

  return usage;
};

const handleDrift = (args: ParsedArgs): string => {
  if (args.subcommand !== 'compute') {
    return usage;
  }

  const configPath = asString(args.flags.config) ?? defaultConfigPath;
  const runtime = createCatalogaRuntime(configPath);
  const latest = runtime.store.snapshots.latest('effective');
  const findings = latest ? runtime.store.drifts.list(latest.snapshot_id) : [];
  return formatJson(findings);
};

const handleServe = async (args: ParsedArgs): Promise<string> => {
  const configPath = args.flags.registry
    ? writeRegistryRuntimeConfig(args)
    : (asString(args.flags.config) ?? defaultConfigPath);
  if (args.flags.registry) {
    const runtime = createCatalogaRuntime(configPath);
    await runtime.ingest.run();
  }
  const port = Number.parseInt(asString(args.flags.port) ?? process?.env.PORT ?? '3000', 10);
  const apiModule = await import('@cataloga/api');
  const server = apiModule.createHttpEntrypoint(configPath);
  await new Promise<void>((resolvePromise) => {
    server.listen(port, '127.0.0.1', () => resolvePromise());
  });

  return formatJson({ ok: true, port, configPath, status: 'Listening' });
};

export const runCatalogaCli = async (argv: readonly string[]): Promise<string> => {
  if (argv.includes('--help') || argv.includes('-h')) {
    return usage;
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    return `${cliVersion}\n`;
  }

  const args = parseArgs(argv);

  switch (args.command) {
    case 'validate':
      return handleValidate(args);
    case 'inspect':
      return handleInspect(args);
    case 'build':
    case 'export':
      return handleBundleExport(args);
    case 'source':
      return handleSource(args);
    case 'ingest':
      return handleIngest(args);
    case 'snapshot':
      return handleSnapshot(args);
    case 'topology':
      return handleTopology(args);
    case 'drift':
      return handleDrift(args);
    case 'serve':
      return handleServe(args);
    default:
      return usage;
  }
};

const isExecutedAsEntrypoint =
  typeof process !== 'undefined' &&
  process.env.CATALOGA_CLI_EMBEDDED !== '1' &&
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isExecutedAsEntrypoint) {
  void runCatalogaCli(process.argv.slice(2))
    .then((output) => {
      process.stdout.write(output);
    })
    .catch((error: unknown) => {
      process.exitCode = 1;
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
    });
}

export const loadConfigFromDisk = (path: string): string => readFileSync(resolve(path), 'utf8');
