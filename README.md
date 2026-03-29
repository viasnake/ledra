# Cataloga

Cataloga is a multi-source infrastructure knowledge platform.

- Ingests data from `git`, `aws`, and on-prem sources.
- Normalizes all records into a canonical graph model.
- Persists entities, relations, observations, snapshots, drift findings, and topology projections.
- Serves read-only `/api/v1` endpoints for humans and AI agents.

This repository now follows `SPEC.md` as the product architecture baseline.

## Quick Start

```bash
mise install
npm install
npm run build
npm exec --workspace @cataloga/cli cataloga -- ingest run --config cataloga.yaml
npm exec --workspace @cataloga/cli cataloga -- serve --config cataloga.yaml --port 3000
```

Open:

- `http://localhost:3000/api/v1/entities`
- `http://localhost:3000/api/v1/snapshots`
- `http://localhost:3000/api/v1/drift`

## PostgreSQL backend mode

`storage.driver: postgres` supports two operation modes:

- `file_path` mode (default local development fallback): uses file-backed canonical store.
- `dsn` mode: when `storage.dsn` is resolved to a concrete value, Cataloga uses PostgreSQL via `psql`.

Example:

```yaml
storage:
  driver: postgres
  dsn: ${CATALOGA_DATABASE_URL}
```

`CATALOGA_DATABASE_URL` is resolved at runtime from environment variables.

## Required CLI Commands

- `cataloga source add`
- `cataloga source list`
- `cataloga ingest run`
- `cataloga ingest run --source <id>`
- `cataloga snapshot list`
- `cataloga topology build`
- `cataloga topology export`
- `cataloga drift compute`
- `cataloga serve`

## API v1

Human-facing:

- `GET /api/v1/entities`
- `GET /api/v1/entities/{id}`
- `GET /api/v1/relations`
- `GET /api/v1/snapshots`
- `GET /api/v1/drift`
- `GET /api/v1/topologies`
- `GET /api/v1/topologies/{id}`
- `GET /api/v1/topologies/{id}/svg`

AI-facing:

- `GET /api/v1/query/find-assets`
- `GET /api/v1/query/get-neighbors`
- `GET /api/v1/query/find-public-exposure`
- `GET /api/v1/query/find-ingress-paths`
- `GET /api/v1/query/diff-snapshots`
- `GET /api/v1/query/get-evidence`

All query responses include:

- `observed_at`
- `source`
- `confidence`
- `evidence_refs`

## Monorepo Layout (v1)

- `packages/schema`
- `packages/storage`
- `packages/source-contract`
- `packages/source-git`
- `packages/source-aws`
- `packages/source-onprem`
- `packages/ingest`
- `packages/identity`
- `packages/query`
- `packages/topology`
- `packages/drift`
- `apps/api`
- `apps/web`
- `apps/cli`
- `apps/worker`
