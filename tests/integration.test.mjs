import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const registryPath = 'packages/sample-data/registry';
const cliEntry = 'apps/cli/dist/apps/cli/src/index.js';

const runCli = (args) => {
  const output = execFileSync('node', [cliEntry, ...args], {
    encoding: 'utf8'
  });

  return JSON.parse(output);
};

test('ledra validate succeeds with sample registry graph', () => {
  const result = runCli(['validate', '--registry', registryPath]);

  assert.equal(result.validation.ok, true);
  assert.equal(result.validation.diagnostics.length, 0);
  assert.deepEqual(result.diagnostics.counts, {
    entities: 8,
    relations: 8,
    views: 2,
    policies: 1
  });
});

test('ledra build outputs a static bundle and writes --out', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ledra-build-'));
  const outPath = join(tempDir, 'bundle.json');

  try {
    const result = runCli(['build', '--registry', registryPath, '--out', outPath]);

    assert.equal(result.bundle.kind, 'static-bundle');
    assert.equal(result.bundle.graph.entities.length, 8);
    assert.equal(result.bundle.graph.relations.length, 8);
    assert.equal(result.bundle.graph.views.length, 2);
    assert.equal(result.bundle.graph.policies.length, 1);

    const writtenBundle = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(writtenBundle.kind, 'static-bundle');
    assert.equal(writtenBundle.graph.entities.length, 8);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('diagnostics include source file paths across entity and registry records', () => {
  const result = runCli(['validate', '--registry', registryPath]);

  assert.equal(result.diagnostics.sourceFilePaths.length, 19);
  assert.ok(
    result.diagnostics.sourceFilePaths.some((entry) => entry.startsWith('registry/entities/'))
  );
  assert.ok(
    result.diagnostics.sourceFilePaths.some((entry) => entry.startsWith('registry/relations/'))
  );
  assert.ok(
    result.diagnostics.sourceFilePaths.some((entry) => entry.startsWith('registry/views/'))
  );
  assert.ok(
    result.diagnostics.sourceFilePaths.some((entry) => entry.startsWith('registry/policies/'))
  );
});

test('inspect supports structured query input over attributes', () => {
  const query = JSON.stringify({ type: 'site', text: 'tokyo' });
  const result = runCli(['inspect', '--registry', registryPath, '--query', query]);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'site-tokyo');
});

test('export writes a bundle file when --out is provided', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ledra-export-'));
  const outPath = join(tempDir, 'bundle.json');

  try {
    const result = runCli(['export', '--registry', registryPath, '--out', outPath]);

    assert.equal(result.kind, 'static-bundle');
    const writtenBundle = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(writtenBundle.kind, 'static-bundle');
    assert.equal(writtenBundle.graph.views.length, 2);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('serve starts a read-only HTTP API from CLI', async () => {
  const port = 43117;
  const child = spawn(
    'node',
    [cliEntry, 'serve', '--registry', registryPath, '--port', String(port)],
    {
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('serve startup timeout')), 10000);

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes('Listening')) {
          clearTimeout(timeout);
          resolve(undefined);
        }
      });

      child.stderr.on('data', (chunk) => {
        clearTimeout(timeout);
        reject(new Error(chunk.toString()));
      });

      child.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`serve exited early with code ${String(code)}`));
      });
    });

    const types = JSON.parse(
      execFileSync('curl', ['-sS', `http://127.0.0.1:${String(port)}/api/types`], {
        encoding: 'utf8'
      })
    );
    const search = JSON.parse(
      execFileSync(
        'curl',
        [
          '-sS',
          `http://127.0.0.1:${String(port)}/api/search?q=${encodeURIComponent('attributes.siteId=site-tokyo')}`
        ],
        {
          encoding: 'utf8'
        }
      )
    );
    const views = JSON.parse(
      execFileSync('curl', ['-sS', `http://127.0.0.1:${String(port)}/api/views`], {
        encoding: 'utf8'
      })
    );

    assert.ok(Array.isArray(types));
    assert.ok(types.includes('site'));
    assert.equal(search.length, 4);
    assert.equal(views.length, 2);
    assert.equal(views[0].kind, 'view');
  } finally {
    child.kill('SIGTERM');
  }
});
