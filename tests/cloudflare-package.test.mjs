import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCloudflarePackage } from '../scripts/package-cloudflare.mjs';

test('Cloudflare packaging writes viewer assets, bundle, and metadata', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ledra-cloudflare-package-'));
  const bundlePath = join(tempDir, 'bundle.json');
  const outDir = join(tempDir, 'public');

  try {
    writeFileSync(
      bundlePath,
      JSON.stringify(
        {
          kind: 'static-bundle',
          schemaVersion: 1,
          generatedAt: '2026-03-14T00:00:00.000Z',
          graph: {
            kind: 'registry-graph',
            schemaVersion: 1,
            entities: [],
            relations: [],
            views: [],
            policies: []
          },
          diagnostics: {
            readOnly: true,
            schemaVersion: 1,
            counts: { entities: 0, relations: 0, views: 0, policies: 0 },
            sourceFilePaths: []
          }
        },
        null,
        2
      )
    );

    const result = createCloudflarePackage({
      viewerDir: 'apps/web/dist',
      bundlePath,
      outDir,
      repo: 'example/home-ledra',
      ref: 'refs/heads/main',
      commitSha: 'abcdef123456abcdef123456abcdef123456abcd',
      generatedAt: '2026-03-14T12:00:00.000Z'
    });

    assert.equal(existsSync(join(outDir, 'index.html')), true);
    assert.equal(existsSync(join(outDir, 'bundle.json')), true);
    assert.equal(existsSync(join(outDir, 'metadata.json')), true);
    assert.equal(result.metadata.metadataSchemaVersion, 2);
    assert.equal(result.metadata.bundle.schemaVersion, 1);
    assert.equal(result.metadata.repository.repo, 'example/home-ledra');
    assert.equal(result.metadata.repository.ref, 'refs/heads/main');

    const metadata = JSON.parse(readFileSync(join(outDir, 'metadata.json'), 'utf8'));
    assert.equal(metadata.bundle.path, '/bundle.json');
    assert.match(metadata.deploymentVersion, /^abcdef123456-20260314T120000Z$/u);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
