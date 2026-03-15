# Cloudflare deployment example (Workers + Assets)

This directory targets the recommended single-repository Cloudflare deployment model.

Use one deployment repository, usually a fork of Ledra, that keeps runtime code, `registry/`, and GitHub
Actions workflows together.

For the managed-hosting product path where customer data stays in separate repositories and operator-owned
infrastructure performs deploys, use `docs/managed-hosting-architecture.md` instead of this direct example.

The Cloudflare runtime serves only packaged assets and read-only API responses.

## Runtime routes

- `/` -> static viewer from `public/`
- `/entities/*` and other extensionless viewer paths -> Worker rewrites to `index.html`
- `/bundle.json` -> exported registry bundle
- `/metadata.json` -> deployment audit metadata
- `/api/views` -> Worker returns `bundle.graph.views`
- `/api/metadata` -> Worker returns deployment metadata
- `/health` -> basic read-only health check

## Local packaging smoke test

Use this flow when validating the Cloudflare package locally inside the deployment repository.

### 1) Build Ledra

```bash
mise install
npm install
npm run build
```

This repository targets Node.js 20.x. `mise.toml` provides that runtime for local packaging flows.

### 2) Prepare sample registry data

```bash
mkdir -p ./.local/registry-data
cp -R examples/minimal-registry/. ./.local/registry-data/
```

### 3) Export the bundle and package Cloudflare assets

```bash
mkdir -p .artifacts/cloudflare
npm exec --workspace @ledra/cli ledra -- export --registry ./.local/registry-data --out .artifacts/cloudflare/bundle.json
node scripts/package-cloudflare.mjs \
  --bundle .artifacts/cloudflare/bundle.json \
  --out deploy/cloudflare/public \
  --repo "local/example-ledra" \
  --ref "refs/heads/main" \
  --commit "$(git rev-parse HEAD)" \
  --registry-path "registry"
```

### 4) Deploy manually for a smoke test

```bash
cp deploy/cloudflare/wrangler.toml.example deploy/cloudflare/wrangler.toml
cd deploy/cloudflare
npx wrangler deploy --env preview
```

Use a scoped API token for this smoke test rather than a broad interactive login.

## Recommended production model

Production should be driven from the deployment repository itself.

1. A trusted repository PR runs validation, tests, packaging, and preview deploy.
2. A merge to `main` runs production deploy.
3. Rollback rebuilds from a specific repository ref or commit.

Template workflows live under `deploy/cloudflare/workflows/`.

For this repository's built-in demo site, use `.github/workflows/ledra-demo-production.yml`. It packages
`packages/sample-data/registry` and deploys it as a read-only Cloudflare demo.

Preview deploys are intentionally limited to trusted same-repository PRs. Secret-bearing deploy jobs should
use trusted workflow configuration rather than PR-modified deployment code.
Rollback is production-oriented; preview Workers should be recreated from the relevant PR branch.

See `deploy/cloudflare/metadata-schema.md` for the public deployment metadata contract.

## Required configuration

- `assets.binding = "ASSETS"` is required because `worker.mjs` reads packaged assets directly.
- `worker.mjs` provides SPA fallback for extensionless HTML navigation while preserving
  `/bundle.json`, `/metadata.json`, `/assets/*`, `/api/*`, and `/health` as reserved runtime paths.
- `_redirects` is useful in generic static hosting, but Cloudflare Workers + Assets packaging removes it and
  relies on the Worker fallback instead.
- `metadata.json` must be packaged next to `bundle.json`.
- Production should use a custom domain via `env.production.routes`.
- Preview URL comments require a `CLOUDFLARE_ACCOUNT_SUBDOMAIN` variable in the deployment repository.
- Workflow templates assume `registry/` at the repository root.
- Use minimally scoped Cloudflare API tokens, and split preview/production tokens if the trust boundary differs.

## Preview and production policy

- Preview: one Worker per PR on `workers.dev`
- Production: custom domain only
- Runtime: no GitHub live read
- Rollback: rebuild and redeploy from GitHub first, Cloudflare rollback second
