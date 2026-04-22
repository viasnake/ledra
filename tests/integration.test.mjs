import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createReadOnlyApi } from '../apps/api/dist/apps/api/src/index.js';
import { runCatalogaCli } from '../apps/cli/dist/apps/cli/src/index.js';
import { loadRuntimeConfig } from '../packages/core/dist/core/src/index.js';

const createTempRuntime = () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'cataloga-v1-'));
  const configPath = join(tempDir, 'cataloga.yaml');
  const storePath = join(tempDir, 'canonical-store.json');
  const fixturePath = resolve('examples/aws-fixture.json');
  const registryPath = resolve('packages/sample-data/registry');

  const config = [
    'version: 1',
    'storage:',
    '  driver: postgres',
    `  file_path: ${storePath}`,
    'object_store:',
    '  driver: local',
    '  bucket: local',
    'sources:',
    '  - id: git-main',
    '    type: git',
    '    enabled: true',
    '    scope: planned-main',
    '    poll_mode: full',
    '    config:',
    `      path: ${registryPath}`,
    '      ref: main',
    '  - id: aws-prod',
    '    type: aws',
    '    enabled: true',
    '    scope: aws-prod',
    '    poll_mode: full',
    '    config:',
    "      account_id: '123456789012'",
    '      regions: ["ap-northeast-1"]',
    `      fixture_path: ${fixturePath}`,
    '  - id: manual-main',
    '    type: manual',
    '    enabled: true',
    '    scope: manual-main',
    '    poll_mode: full',
    '    config:',
    '      records:',
    '        - id: manual-svc',
    '          type: service',
    '          name: manual-svc',
    '  - id: onprem-main',
    '    type: onprem_scan',
    '    enabled: true',
    '    scope: onprem-main',
    '    poll_mode: full',
    '    config: {}'
  ].join('\n');

  writeFileSync(configPath, `${config}\n`, 'utf8');
  return {
    tempDir,
    configPath,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true })
  };
};

const runCli = async (args) => {
  const output = await runCatalogaCli(args);
  return JSON.parse(output);
};

test('workspace cataloga command exposes v1 help output', async () => {
  const output = await runCatalogaCli(['--help']);

  assert.match(output, /Usage: cataloga/u);
  assert.match(output, /source add/u);
  assert.match(output, /ingest run/u);
});

test('web build outputs static viewer assets', () => {
  assert.equal(existsSync('apps/web/dist/index.html'), true);
  const indexHtml = readFileSync('apps/web/dist/index.html', 'utf8');
  const assetFiles = readdirSync('apps/web/dist/assets');

  assert.match(indexHtml, /<div id="root"><\/div>/u);
  assert.ok(assetFiles.some((fileName) => fileName.endsWith('.js')));
  assert.ok(assetFiles.some((fileName) => fileName.endsWith('.css')));
});

test('registry validate and export commands support static delivery', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'cataloga-bundle-'));

  try {
    const validation = await runCli(['validate', '--registry', 'packages/sample-data/registry']);
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.diagnostics, []);

    const outPath = join(tempDir, 'bundle.json');
    const exported = await runCli([
      'export',
      '--registry',
      'packages/sample-data/registry',
      '--out',
      outPath
    ]);

    assert.equal(exported.ok, true);
    assert.equal(existsSync(outPath), true);

    const bundle = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(bundle.kind, 'static-bundle');
    assert.equal(bundle.graph.kind, 'registry-graph');
    assert.equal(bundle.diagnostics.counts.entities, 34);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('cataloga source list and ingest run produce snapshots', async () => {
  const runtime = createTempRuntime();

  try {
    const sources = await runCli(['source', 'list', '--config', runtime.configPath]);
    assert.equal(sources.length, 4);

    const ingest = await runCli(['ingest', 'run', '--config', runtime.configPath]);
    assert.ok(ingest.run_ids.length >= 4);
    assert.ok(ingest.snapshot_ids.length >= 4);

    const snapshots = await runCli(['snapshot', 'list', '--config', runtime.configPath]);
    const kinds = new Set(snapshots.map((snapshot) => snapshot.kind));
    assert.ok(kinds.has('planned'));
    assert.ok(kinds.has('observed'));
    assert.ok(kinds.has('effective'));
  } finally {
    runtime.cleanup();
  }
});

test('topology build and export work with generated projections', async () => {
  const runtime = createTempRuntime();

  try {
    await runCli(['ingest', 'run', '--config', runtime.configPath]);

    const projections = await runCli(['topology', 'build', '--config', runtime.configPath]);
    assert.ok(projections.length > 0);

    const target = projections.find((projection) => projection.format === 'json');
    assert.ok(target);

    const outPath = join(runtime.tempDir, 'topology.json');
    const exported = await runCli([
      'topology',
      'export',
      '--config',
      runtime.configPath,
      '--id',
      target.topology_id,
      '--out',
      outPath
    ]);
    assert.equal(exported.ok, true);
    assert.equal(existsSync(outPath), true);
  } finally {
    runtime.cleanup();
  }
});

test('drift compute returns findings after ingest', async () => {
  const runtime = createTempRuntime();

  try {
    await runCli(['ingest', 'run', '--config', runtime.configPath]);
    const findings = await runCli(['drift', 'compute', '--config', runtime.configPath]);
    assert.ok(Array.isArray(findings));
    assert.ok(findings.length > 0);
    assert.equal(typeof findings[0].drift_type, 'string');
  } finally {
    runtime.cleanup();
  }
});

test('read-only API v1 exposes entities, snapshots, drift, and query metadata', async () => {
  const runtime = createTempRuntime();

  try {
    const api = createReadOnlyApi(runtime.configPath);
    await api.ingest.run();

    const entities = api['/api/v1/entities']();
    const snapshots = api['/api/v1/snapshots']();
    const drift = api['/api/v1/drift']();
    const queryResult = api['/api/v1/query/find-public-exposure']();

    assert.ok(Array.isArray(entities));
    assert.ok(entities.length > 0);
    assert.ok(Array.isArray(snapshots));
    assert.ok(snapshots.length > 0);
    assert.ok(Array.isArray(drift));
    assert.equal(typeof queryResult.observed_at, 'string');
    assert.ok(Array.isArray(queryResult.source));
    assert.equal(typeof queryResult.confidence, 'number');
    assert.ok(Array.isArray(queryResult.evidence_refs));
  } finally {
    runtime.cleanup();
  }
});

test('runtime config resolves environment placeholders in dsn', () => {
  const runtime = createTempRuntime();

  try {
    const withDsn = [
      'version: 1',
      'storage:',
      '  driver: postgres',
      '  dsn: ${CATALOGA_DATABASE_URL}',
      '  file_path: .cataloga/test.json',
      'object_store:',
      '  driver: local',
      '  bucket: local',
      'sources: []'
    ].join('\n');

    writeFileSync(runtime.configPath, withDsn, 'utf8');
    process.env.CATALOGA_DATABASE_URL = 'postgres://user:pass@localhost:5432/cataloga';
    const config = loadRuntimeConfig(runtime.configPath);
    assert.equal(config.storage.dsn, 'postgres://user:pass@localhost:5432/cataloga');
  } finally {
    delete process.env.CATALOGA_DATABASE_URL;
    runtime.cleanup();
  }
});
