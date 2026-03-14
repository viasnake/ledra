# Cloudflare deployment metadata schema

Ledra keeps the exported registry bundle unchanged and writes deployment metadata to a sibling
`metadata.json` file.

## Purpose

- Identify which repository commit is deployed.
- Keep rollback and audit data outside the registry bundle contract.

## File location

```text
public/
  index.html
  assets/
  bundle.json
  metadata.json
```

## Schema

```json
{
  "product": "Ledra",
  "metadataSchemaVersion": 2,
  "deploymentVersion": "abcdef123456-20260314T120000Z",
  "generatedAt": "2026-03-14T12:00:00.000Z",
  "repository": {
    "repo": "example/home-ledra",
    "ref": "refs/heads/main",
    "commitSha": "abcdef123456abcdef123456abcdef123456abcd",
    "registryPath": "registry"
  },
  "bundle": {
    "path": "/bundle.json",
    "schemaVersion": 1
  }
}
```

## Field notes

- `metadataSchemaVersion`: schema version for `metadata.json`. Increment on breaking changes.
- `deploymentVersion`: deployment identifier for preview, production, and rollback runs.
- `generatedAt`: UTC timestamp for artifact packaging, not for data authoring.
- `repository.ref`: Git ref used for the repository checkout. Preview usually uses a PR head ref. Production uses
  `refs/heads/main`.
- `bundle.schemaVersion`: copied from the exported `bundle.json` so viewers and APIs can verify
  compatibility without mutating the bundle contract.
