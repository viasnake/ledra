import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const testDir = dirname(fileURLToPath(import.meta.url));
const registryPath = join(testDir, 'fixtures', 'registry');
const bundleOutPath = join(testDir, 'fixtures', 'output', 'bundle.json');

const runCli = (args) => {
  const output = execFileSync('node', ['apps/cli/dist/apps/cli/src/index.js', ...args], {
    encoding: 'utf8'
  });

  return JSON.parse(output);
};

test('ledra validate succeeds with registry data', () => {
  const result = runCli(['validate', '--registry', registryPath]);

  assert.equal(result.result.ok, true);
  assert.equal(result.result.issues.length, 0);
});

test('ledra build outputs a static bundle', () => {
  const result = runCli(['build', '--registry', registryPath, '--out', bundleOutPath]);

  assert.equal(result.bundle.kind, 'static-bundle');
  assert.equal(result.bundle.entities.length, 3);
  assert.deepEqual(result.bundle.types, ['segment', 'site', 'vlan']);
});

test('diagnostics include source file paths from the registry', () => {
  const result = runCli(['validate', '--registry', registryPath]);

  assert.equal(result.diagnostics.sourceFilePaths.length, 3);
  assert.ok(result.diagnostics.sourceFilePaths.every((entry) => entry.endsWith('.json')));
});

test('inspect supports --query argument parsing', () => {
  const result = runCli(['inspect', '--registry', registryPath, '--query', 'campus']);

  assert.equal(result.length, 2);
  assert.ok(result.some((entry) => entry.id === 'site-campus'));
});
