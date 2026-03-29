/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../../api/src/node-shims.d.ts" />

declare const process:
  | {
      env: Record<string, string | undefined>;
      argv: string[];
      exitCode?: number;
    }
  | undefined;

import { createCatalogaRuntime, defaultConfigPath } from '@cataloga/core';

export const appName = '@cataloga/worker';

export const runWorker = async (configPath = defaultConfigPath) => {
  const runtime = createCatalogaRuntime(configPath);
  const result = await runtime.ingest.run();
  return {
    ok: true,
    ...result
  };
};

if (typeof process !== 'undefined' && process.argv[1]?.endsWith('/apps/worker/src/index.js')) {
  const configPath = process.env.CATALOGA_CONFIG ?? defaultConfigPath;
  void runWorker(configPath)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error: unknown) => {
      process.exitCode = 1;
      console.error(error instanceof Error ? error.message : String(error));
    });
}
