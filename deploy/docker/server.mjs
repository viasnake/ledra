import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHttpEntrypoint } from '../../apps/api/dist/apps/api/src/index.js';
import { createCatalogaRuntime } from '../../packages/core/dist/core/src/index.js';

const registryPath = process.env.CATALOGA_REGISTRY_PATH ?? '/app/registry';
const port = Number(process.env.PORT ?? '8080');
const configPath = process.env.CATALOGA_CONFIG ?? '/tmp/cataloga/docker-config.yaml';
const storePath = process.env.CATALOGA_STORE_PATH ?? '/tmp/cataloga/canonical-store.json';

const config = [
  'version: 1',
  'storage:',
  '  driver: postgres',
  `  file_path: ${JSON.stringify(storePath)}`,
  'object_store:',
  '  driver: local',
  '  bucket: /tmp/cataloga/evidence',
  'sources:',
  '  - id: mounted-registry',
  '    type: git',
  '    enabled: true',
  '    scope: mounted-registry',
  '    poll_mode: full',
  '    config:',
  '      ref: mounted',
  `      path: ${JSON.stringify(registryPath)}`,
  '      allow_external_paths: true'
].join('\n');

mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(configPath, `${config}\n`, 'utf8');

const runtime = createCatalogaRuntime(configPath);
await runtime.ingest.run();

createHttpEntrypoint(configPath).listen(port, '0.0.0.0', () => {
  console.log(
    JSON.stringify({ ok: true, readOnly: true, port, configPath, registryPath }, null, 2)
  );
});
