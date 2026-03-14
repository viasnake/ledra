# API reference

Ledra exposes a read-only HTTP API. The API never mutates registry data and is intended to sit beside Git-managed source files or generated bundle artifacts.

## Base behavior

- Methods: `GET`, `HEAD`
- Content type: `application/json; charset=utf-8`
- Writes: not supported
- Health check: `GET /health`

## Endpoints

### `GET /api/types`

Returns built-in entity types present in the loaded registry.

Example response:

```json
["allocation", "dns_record", "host", "prefix", "segment", "service", "site", "vlan"]
```

### `GET /api/entities`

Returns all entity records from the normalized registry graph.

### `GET /api/entities/{type}/{id}`

Returns one entity record or `404` if the entity does not exist.

### `GET /api/relations`

Returns explicit relation records from `registry/relations/`.

### `GET /api/search`

Searches entity records.

Supported query parameters:

- `q=type=host`
- `q=attributes.siteId=site-tokyo`
- `q={"type":"prefix","attributes":[{"field":"vlanId","operator":"=","value":"vlan-100"}]}`

### `GET /api/diagnostics`

Returns repository diagnostics and validation results.

Response shape:

```json
{
  "repository": {
    "readOnly": true,
    "schemaVersion": 1,
    "counts": {
      "entities": 8,
      "relations": 8,
      "views": 2,
      "policies": 1
    },
    "sourceFilePaths": ["registry/entities/site/site.yaml"]
  },
  "validation": {
    "ok": true,
    "diagnostics": []
  }
}
```

### `GET /api/views`

Returns view definitions from `registry/views/`.

### `GET /api/metadata`

Cloudflare deployments may expose deployment metadata from `metadata.json` beside the static bundle.
This endpoint is optional outside Cloudflare packaging. The current schema exposes a single `repository`
object plus bundle metadata.

## Errors

- `404`: unknown route or missing entity
- `405`: non-`GET` method
- `500`: transport or loader failure
