import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const registryPath = 'packages/sample-data/registry';

const runCli = (args) => {
  const output = execFileSync('node', ['apps/cli/dist/apps/cli/src/index.js', ...args], {
    encoding: 'utf8'
  });

  return JSON.parse(output);
};

test('ledra validate succeeds with sample registry', () => {
  const result = runCli(['validate', '--registry', registryPath]);

  assert.equal(result.result.ok, true);
  assert.equal(result.result.issues.length, 0);
});

test('ledra build outputs a static bundle and writes --out', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ledra-build-'));
  const outPath = join(tempDir, 'bundle.json');

  try {
    const result = runCli(['build', '--registry', registryPath, '--out', outPath]);

    assert.equal(result.bundle.kind, 'static-bundle');
    assert.equal(result.bundle.entities.length, 8);
    assert.deepEqual(result.bundle.types, [
      'allocation',
      'dns_record',
      'host',
      'prefix',
      'segment',
      'service',
      'site',
      'vlan'
    ]);

    const writtenBundle = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(writtenBundle.kind, 'static-bundle');
    assert.equal(writtenBundle.entities.length, 8);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('diagnostics include registry source file paths', () => {
  const result = runCli(['validate', '--registry', registryPath]);

  assert.equal(result.diagnostics.sourceFilePaths.length, 8);
  assert.ok(
    result.diagnostics.sourceFilePaths.every((entry) =>
      entry.startsWith('packages/sample-data/registry/entities/')
    )
  );
});

test('inspect supports structured search query input', () => {
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
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('serve starts a read-only HTTP API from CLI', async () => {
  const port = 43117;
  const child = spawn(
    'node',
    [
      'apps/cli/dist/apps/cli/src/index.js',
      'serve',
      '--registry',
      registryPath,
      '--port',
      String(port)
    ],
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
        ['-sS', `http://127.0.0.1:${String(port)}/api/search?q=${encodeURIComponent('type=site')}`],
        {
          encoding: 'utf8'
        }
      )
    );

    assert.ok(Array.isArray(types));
    assert.ok(types.includes('site'));
    assert.equal(search.length, 1);
    assert.equal(search[0].id, 'site-tokyo');
  } finally {
    child.kill('SIGTERM');
  }
});
