# API reference

Cataloga v1 exposes a read-only API over canonical graph data.

## Base behavior

- Methods: `GET`
- Content type: `application/json; charset=utf-8`
- Write operations: not supported
- Health check: `GET /health`
- Optional auth: set `CATALOGA_API_KEY` and send `x-cataloga-api-key`

## Human-facing endpoints

### `GET /api/v1/entities`

Returns canonical entities.

### `GET /api/v1/entities/{id}`

Returns one entity by `entity_id`.

### `GET /api/v1/relations`

Returns canonical relations.

### `GET /api/v1/snapshots`

Returns planned/observed/effective snapshots.

### `GET /api/v1/drift`

Returns drift findings.

### `GET /api/v1/topologies`

Returns topology projections metadata.

### `GET /api/v1/topologies/{id}`

Returns one projection payload entry.

### `GET /api/v1/topologies/{id}/svg`

Returns SVG projection payload.

## AI-facing query endpoints

### `GET /api/v1/query/find-assets?q=<text>&type=<entity_type>`

Find entities by text/type.

### `GET /api/v1/query/get-neighbors?id=<entity_id>`

Returns neighboring entities.

### `GET /api/v1/query/find-public-exposure`

Returns entities marked as public/internet-facing.

### `GET /api/v1/query/find-ingress-paths?id=<entity_id>`

Returns ingress-neighbor candidates for the entity.

### `GET /api/v1/query/diff-snapshots?left=<snapshot_id>&right=<snapshot_id>`

Returns added/removed entities and relations between snapshots.

### `GET /api/v1/query/get-evidence?subject_id=<entity_or_relation_id>`

Returns evidence references for a subject.

## Query response contract

All query endpoints return:

- `observed_at`
- `source`
- `confidence`
- `evidence_refs`
- `data`

## Errors

- `401`: API key required or invalid
- `404`: unknown route or missing resource
- `405`: non-`GET` method
- `500`: internal transport/runtime error
