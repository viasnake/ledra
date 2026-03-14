import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_VIEWER_DIR = 'apps/web/dist';
const DEFAULT_OUT_DIR = 'deploy/cloudflare/public';
const DEFAULT_REGISTRY_PATH = 'registry';

const usage = [
  'Usage: node scripts/package-cloudflare.mjs --bundle <path> [--viewer-dir <path>] [--out <path>]',
  '',
  'Required:',
  '  --bundle <path>         Exported bundle.json path',
  '',
  'Optional metadata flags:',
  '  --repo <slug>           Repository slug or URL',
  '  --ref <ref>             Repository ref used for packaging',
  '  --commit <sha>          Repository commit SHA',
  '  --registry-path <path>  Registry directory inside the repository',
  '  --generated-at <iso>    ISO-8601 timestamp override',
  '  --deployment-version <value>  Deployment version override'
].join('\n');

const parseArgs = (argv) => {
  const parsed = {
    viewerDir: DEFAULT_VIEWER_DIR,
    outDir: DEFAULT_OUT_DIR,
    registryPath: DEFAULT_REGISTRY_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if (token === '--help' || token === '-h') {
      parsed.help = true;
      continue;
    }

    if (token === '--viewer-dir' && value) {
      parsed.viewerDir = value;
      index += 1;
      continue;
    }

    if (token === '--bundle' && value) {
      parsed.bundlePath = value;
      index += 1;
      continue;
    }

    if (token === '--out' && value) {
      parsed.outDir = value;
      index += 1;
      continue;
    }

    if (token === '--repo' && value) {
      parsed.repo = value;
      index += 1;
      continue;
    }

    if (token === '--ref' && value) {
      parsed.ref = value;
      index += 1;
      continue;
    }

    if (token === '--commit' && value) {
      parsed.commitSha = value;
      index += 1;
      continue;
    }

    if (token === '--registry-path' && value) {
      parsed.registryPath = value;
      index += 1;
      continue;
    }

    if (token === '--generated-at' && value) {
      parsed.generatedAt = value;
      index += 1;
      continue;
    }

    if (token === '--deployment-version' && value) {
      parsed.deploymentVersion = value;
      index += 1;
    }
  }

  return parsed;
};

const toShortSha = (value) => {
  if (!value) {
    return 'unknown';
  }

  return value.slice(0, 12);
};

const createDeploymentVersion = ({ deploymentVersion, generatedAt, commitSha }) => {
  if (deploymentVersion) {
    return deploymentVersion;
  }

  const compactTimestamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/u, 'Z');
  return `${toShortSha(commitSha)}-${compactTimestamp}`;
};

const ensureFile = (filePath, label) => {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`${label} not found: ${resolvedPath}`);
  }

  const stats = statSync(resolvedPath);
  if (!stats.isFile()) {
    throw new Error(`${label} must be a file: ${resolvedPath}`);
  }

  return resolvedPath;
};

const ensureDirectory = (directoryPath, label) => {
  const resolvedPath = resolve(directoryPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`${label} not found: ${resolvedPath}`);
  }

  const stats = statSync(resolvedPath);
  if (!stats.isDirectory()) {
    throw new Error(`${label} must be a directory: ${resolvedPath}`);
  }

  return resolvedPath;
};

export const buildCloudflareMetadata = ({
  bundle,
  generatedAt,
  deploymentVersion,
  registryPath,
  repo,
  ref,
  commitSha
}) => ({
  product: 'Ledra',
  metadataSchemaVersion: 2,
  deploymentVersion,
  generatedAt,
  repository: {
    repo: repo ?? 'unknown',
    ref: ref ?? 'unknown',
    commitSha: commitSha ?? 'unknown',
    registryPath
  },
  bundle: {
    path: '/bundle.json',
    schemaVersion: bundle.schemaVersion
  }
});

export const createCloudflarePackage = ({
  viewerDir = DEFAULT_VIEWER_DIR,
  bundlePath,
  outDir = DEFAULT_OUT_DIR,
  registryPath = DEFAULT_REGISTRY_PATH,
  repo,
  ref,
  commitSha,
  generatedAt,
  deploymentVersion
}) => {
  if (!bundlePath) {
    throw new Error('--bundle is required');
  }

  const resolvedViewerDir = ensureDirectory(viewerDir, 'Viewer build directory');
  const resolvedBundlePath = ensureFile(bundlePath, 'Bundle file');
  ensureFile(join(resolvedViewerDir, 'index.html'), 'Viewer entrypoint');

  const bundle = JSON.parse(readFileSync(resolvedBundlePath, 'utf8'));
  const timestamp = generatedAt ?? new Date().toISOString();
  const version = createDeploymentVersion({
    deploymentVersion,
    generatedAt: timestamp,
    commitSha
  });
  const metadata = buildCloudflareMetadata({
    bundle,
    generatedAt: timestamp,
    deploymentVersion: version,
    registryPath,
    repo,
    ref,
    commitSha
  });
  const resolvedOutDir = resolve(outDir);

  rmSync(resolvedOutDir, { recursive: true, force: true });
  mkdirSync(dirname(resolvedOutDir), { recursive: true });
  cpSync(resolvedViewerDir, resolvedOutDir, { recursive: true });
  cpSync(resolvedBundlePath, join(resolvedOutDir, 'bundle.json'));
  writeFileSync(
    join(resolvedOutDir, 'metadata.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8'
  );

  return {
    outDir: resolvedOutDir,
    bundlePath: join(resolvedOutDir, 'bundle.json'),
    metadataPath: join(resolvedOutDir, 'metadata.json'),
    metadata
  };
};

const isEntrypoint = resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage);
    process.exit(0);
  }

  const result = createCloudflarePackage(parsed);
  console.log(JSON.stringify(result, null, 2));
}
