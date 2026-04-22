# Cataloga

Cataloga is a read-only infrastructure knowledge platform for Git-managed registry data.

It provides:

- a canonical registry loader for entities, relations, views, and policies
- validation diagnostics for graph integrity and policy rules
- static bundle export for the React viewer and Cloudflare Workers + Assets
- an optional read-only `/api/v1` runtime for canonical graph, topology, drift, and query endpoints
- managed-hosting contracts for a future operator-controlled hosting plane

## Requirements

- Node.js 24.x
- npm
- Git

The repository-local `mise.toml` pins Node 24 for local development.

## Quick Start

```bash
mise install
npm install
npm run build
npm exec --workspace @cataloga/cli cataloga -- validate --registry packages/sample-data/registry
npm exec --workspace @cataloga/cli cataloga -- export --registry packages/sample-data/registry --out .artifacts/bundle.json
```

Run the read-only API against a registry tree:

```bash
npm exec --workspace @cataloga/cli cataloga -- serve --registry packages/sample-data/registry --port 3000
```

Open:

- `http://127.0.0.1:3000/health`
- `http://127.0.0.1:3000/api/v1/entities`
- `http://127.0.0.1:3000/api/v1/snapshots`
- `http://127.0.0.1:3000/api/v1/query/find-public-exposure`

## CLI Commands

- `cataloga validate --registry <path>`
- `cataloga inspect --registry <path> [--query type=<entity_type>|id=<id>|tag=<tag>]`
- `cataloga build --registry <path> --out <path>`
- `cataloga export --registry <path> --out <path>`
- `cataloga source add --config <path> --id <id> --type <type>`
- `cataloga source list --config <path>`
- `cataloga ingest run --config <path> [--source <id>]`
- `cataloga snapshot list --config <path>`
- `cataloga topology build --config <path>`
- `cataloga topology export --config <path> --id <topology-id> --out <path>`
- `cataloga drift compute --config <path>`
- `cataloga serve --config <path> --port <port>`
- `cataloga serve --registry <path> --port <port>`

## API v1

Human-facing:

- `GET /health`
- `GET /api/v1/entities`
- `GET /api/v1/entities/{id}`
- `GET /api/v1/relations`
- `GET /api/v1/snapshots`
- `GET /api/v1/drift`
- `GET /api/v1/topologies`
- `GET /api/v1/topologies/{id}`
- `GET /api/v1/topologies/{id}/svg`

AI-facing:

- `GET /api/v1/query/find-assets?q=<text>&type=<entity_type>`
- `GET /api/v1/query/get-neighbors?id=<entity_id>`
- `GET /api/v1/query/find-public-exposure`
- `GET /api/v1/query/find-ingress-paths?id=<entity_id>`
- `GET /api/v1/query/diff-snapshots?left=<snapshot_id>&right=<snapshot_id>`
- `GET /api/v1/query/get-evidence?subject_id=<entity_or_relation_id>`

Query responses include `observed_at`, `source`, `confidence`, `evidence_refs`, and `data`.

## Deployment Paths

- Static viewer bundle: `docs/read-only-and-delivery-model.md`
- Cloudflare Workers + Assets: `deploy/cloudflare/README.md`
- Docker read-only API: `deploy/docker/README.md`
- Managed-hosting architecture: `docs/managed-hosting-architecture.md`

## Monorepo Layout

- `apps/cli`: CLI entrypoint
- `apps/api`: read-only HTTP API
- `apps/web`: static React viewer
- `apps/worker`: ingest worker
- `packages/core`: registry loader and runtime assembly
- `packages/validator`: registry validation
- `packages/bundle`: static bundle builder
- `packages/search`: viewer search helpers
- `packages/managed-hosting`: managed-hosting contracts and helpers
- `deploy/cloudflare`: Cloudflare packaging/runtime example
- `deploy/docker`: Docker API example
