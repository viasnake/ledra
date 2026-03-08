/// <reference path="./node-shims.d.ts" />
declare const process: { argv: string[] } | undefined;

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildBundle } from '@ledra/bundle';
import { createReadOnlyRepositoryFromFileSystem } from '@ledra/core';
import { searchEntities } from '@ledra/search';
import { validateEntities } from '@ledra/validator';

export const appName = '@ledra/cli';

export type CliCommand = 'validate' | 'build' | 'serve' | 'inspect' | 'export';

type ParsedArgs = {
  command: CliCommand | undefined;
  registryPath: string | undefined;
  outPath: string | undefined;
  query: string | undefined;
};

const usage =
  'Usage: ledra <validate|build|serve|inspect|export> --registry <path> [--out <path>] [--query <text>]';

const parseArgs = (args: readonly string[]): ParsedArgs => {
  const [command, ...rest] = args;
  let registryPath: string | undefined;
  let outPath: string | undefined;
  const queryParts: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (token === '--registry') {
      const value = rest[index + 1];
      if (value !== undefined) {
        registryPath = value;
      }
      index += 1;
      continue;
    }

    if (token === '--out') {
      const value = rest[index + 1];
      if (value !== undefined) {
        outPath = value;
      }
      index += 1;
      continue;
    }

    if (token === '--query') {
      queryParts.push(...rest.slice(index + 1).filter((value): value is string => value !== undefined));
      break;
    }

    queryParts.push(token);
  }

  return {
    command: command as CliCommand | undefined,
    registryPath,
    outPath,
    query: queryParts.join(' ').trim() || undefined
  };
};

const writeOutputFile = (filePath: string, content: unknown): void => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
};

export const runLedraCli = (args: readonly string[]): string => {
  const parsed = parseArgs(args);
  if (parsed.command === undefined) {
    return usage;
  }

  if (parsed.command === 'serve') {
    return 'serve mode is read-only and scheduled after validate/build.';
  }

  if (parsed.registryPath === undefined) {
    return `${usage}\nError: --registry is required for ${parsed.command}.`;
  }

  const repository = createReadOnlyRepositoryFromFileSystem(parsed.registryPath);

  switch (parsed.command) {
    case 'validate': {
      const result = validateEntities(repository.listEntities());
      return JSON.stringify({ result, diagnostics: repository.diagnostics() }, null, 2);
    }
    case 'build': {
      const bundle = buildBundle(repository);
      if (parsed.outPath !== undefined) {
        writeOutputFile(parsed.outPath, bundle);
      }

      return JSON.stringify({ bundle, diagnostics: repository.diagnostics() }, null, 2);
    }
    case 'inspect': {
      return JSON.stringify(searchEntities(parsed.query ?? '', repository), null, 2);
    }
    case 'export':
      return JSON.stringify(buildBundle(repository), null, 2);
    default:
      return usage;
  }
};

if (typeof process !== 'undefined' && process.argv[1]) {
  const args = process.argv.slice(2);
  // CLI intentionally keeps repository access read-only.
  console.log(runLedraCli(args));
}
