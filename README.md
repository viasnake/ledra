# Ledra

Ledra is a **Git-native registry engine** that validates, searches, browses, and serves structured registry data from Git.

- **Git-native**: the registry data repository is the source of truth.
- **Read-only by design**: CLI, API, and viewer do not mutate registry data.
- **Static-first**: `ledra build` and `ledra export` produce portable artifacts that can be hosted without a live database.
- **Registry-first**: IPAM is one use case, not the product boundary.

## Core workflow

1. Keep registry records in a Git repository under `registry/`.
2. Run Ledra validation and bundle build against that repo.
3. Publish generated static output and optional read-only API endpoints.

## Quickstart

```bash
mise install
npm install
npm run build
npm exec --workspace @ledra/cli ledra -- validate --registry packages/sample-data/registry
npm exec --workspace @ledra/cli ledra -- export --registry packages/sample-data/registry --out apps/web/dist/bundle.json
```

Ledra development targets Node.js 20.x. If you use `mise`, the repository-local `mise.toml` installs the expected runtime.

Then open `apps/web/dist/index.html` with a static file server and browse the generated registry bundle.

## Cloudflare deployment model

Ledra now distinguishes two Cloudflare paths:

1. `Managed hosting`: the recommended product path. Customers keep a Git repository with `registry/` as
   the source of truth. Ledra reads that repository through a GitHub App and deploys packaged assets from
   operator-owned Cloudflare infrastructure.
2. `Direct self-host deployment`: a lower-level path for teams that want to run Ledra on their own
   Cloudflare account.

Both paths keep Cloudflare runtime read-only and package-based. Cloudflare serves built assets,
`bundle.json`, and `metadata.json`; it never live-reads GitHub at runtime.

## Registry layout

```text
registry/
  entity-types/
  entities/
    site/
    segment/
    vlan/
    prefix/
    allocation/
    host/
    service/
    dns_record/
  relations/
  views/
  policies/
```

- `entities/`: one file per entity
- `relations/`: explicit graph edges between entities
- `views/`: read-only viewer presets and filters
- `policies/`: validation metadata and rules

## Docs

- [Self-host guide](docs/self-host-guide.md)
- [Managed hosting architecture](docs/managed-hosting-architecture.md)
- [Managed hosting operational model](docs/managed-hosting-operational-model.md)
- [Managed hosting operations](docs/managed-hosting-operations.md)
- [Managed hosting roadmap](docs/managed-hosting-roadmap.md)
- [Cloudflare self-host deployment](docs/cloudflare-deployment.md)
- [CLI examples](docs/cli-examples.md)
- [API reference](docs/api-reference.md)
- [Bundle format](docs/bundle-format.md)
- [Data repository structure](docs/data-repository-structure.md)
- [Read-only and static-first model](docs/read-only-and-delivery-model.md)
- [Reproducible deployment notes](docs/deployment-reproducible.md)
- [Docker example](deploy/docker/README.md)
- [Cloudflare example](deploy/cloudflare/README.md)
