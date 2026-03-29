#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const cliEntrypoint = resolve(currentDirectory, '../dist/apps/cli/src/index.js');

if (process.env.INIT_CWD) {
  process.chdir(process.env.INIT_CWD);
}

if (!existsSync(cliEntrypoint)) {
  console.error('Cataloga CLI is not built yet. Run `npm run build` first.');
  process.exit(1);
}

process.env.CATALOGA_CLI_EMBEDDED = '1';
const { runCatalogaCli } = await import(pathToFileURL(cliEntrypoint).href);
const args = process.argv.slice(2);

try {
  const output = await runCatalogaCli(args);
  process.stdout.write(output);
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown CLI error';
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
