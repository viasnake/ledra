import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import type { SourceDefinition, SourceType } from '@cataloga/schema';
import { createAdapterRegistry } from '@cataloga/source-contract';
import { GitSourceAdapter } from '@cataloga/source-git';
import { AwsSourceAdapter } from '@cataloga/source-aws';
import { ManualSourceAdapter, OnPremSourceAdapter } from '@cataloga/source-onprem';
import { createCanonicalStore, type CanonicalStore, type StorageDriver } from '@cataloga/storage';
import { createIngestOrchestrator } from '@cataloga/ingest';

type ConfigObject = Record<string, unknown>;

const asRecord = (value: unknown): ConfigObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as ConfigObject)
    : {};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;

const resolveEnvPlaceholders = (value: string): string =>
  value.replace(/\$\{([A-Z0-9_]+)\}/g, (_full, key: string) => process.env?.[key] ?? '');

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const asSourceType = (value: unknown): SourceType => asString(value, 'manual') as SourceType;

export type CatalogaRuntimeConfig = {
  version: number;
  storage: {
    driver: StorageDriver;
    dsn?: string;
    filePath?: string;
  };
  object_store: {
    driver: string;
    bucket: string;
  };
  sources: readonly SourceDefinition[];
};

export const defaultConfigPath = 'cataloga.yaml';

export const loadRuntimeConfig = (configPath = defaultConfigPath): CatalogaRuntimeConfig => {
  const absolutePath = resolve(configPath);
  if (!existsSync(absolutePath)) {
    return {
      version: 1,
      storage: {
        driver: 'postgres',
        filePath: '.cataloga/canonical-store.json'
      },
      object_store: {
        driver: 'local',
        bucket: '.cataloga/evidence'
      },
      sources: []
    };
  }

  const parsed = asRecord(loadYaml(readFileSync(absolutePath, 'utf8')));
  const storage = asRecord(parsed.storage);
  const objectStore = asRecord(parsed.object_store);
  const sources = Array.isArray(parsed.sources) ? parsed.sources : [];

  return {
    version: Number(parsed.version ?? 1),
    storage: {
      driver: asString(storage.driver, 'postgres') as StorageDriver,
      ...(asString(storage.dsn) ? { dsn: resolveEnvPlaceholders(asString(storage.dsn)) } : {}),
      filePath: asString(storage.file_path, '.cataloga/canonical-store.json')
    },
    object_store: {
      driver: asString(objectStore.driver, 'local'),
      bucket: asString(objectStore.bucket, '.cataloga/evidence')
    },
    sources: sources.map((item, index) => {
      const source = asRecord(item);
      return {
        source_id: asString(source.id, `source-${index}`),
        source_type: asSourceType(source.type),
        source_instance_id: asString(source.id, `source-${index}`),
        scope: asString(source.scope, asString(source.id, `scope-${index}`)),
        ...(asString(source.credentials_ref)
          ? { credentials_ref: asString(source.credentials_ref) }
          : {}),
        enabled: asBoolean(source.enabled, true),
        poll_mode: asString(source.poll_mode, 'full') === 'incremental' ? 'incremental' : 'full',
        config: asRecord(source.config)
      };
    })
  };
};

export type CatalogaRuntime = {
  config: CatalogaRuntimeConfig;
  store: CanonicalStore;
  ingest: ReturnType<typeof createIngestOrchestrator>;
};

export const createCatalogaRuntime = (configPath = defaultConfigPath): CatalogaRuntime => {
  const config = loadRuntimeConfig(configPath);
  const store = createCanonicalStore(config.storage);

  for (const source of config.sources) {
    store.sources.upsert(source);
  }

  const adapters = createAdapterRegistry([
    new GitSourceAdapter(),
    new AwsSourceAdapter(),
    new ManualSourceAdapter(),
    new OnPremSourceAdapter('onprem_scan'),
    new OnPremSourceAdapter('snmp'),
    new OnPremSourceAdapter('dns'),
    new OnPremSourceAdapter('dhcp')
  ]);

  return {
    config,
    store,
    ingest: createIngestOrchestrator(store, adapters)
  };
};
