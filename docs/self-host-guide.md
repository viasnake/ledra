# Self-host guide

This guide shows how to run Ledra against a Git-managed registry repository.

## Requirements

- Node.js 20+
- npm
- Git

## 1) Install and build

```bash
npm install
npm run build
```

## 2) Prepare a registry data repository

Use the included canonical example as a baseline:

```bash
mkdir -p ./.local/registry-data
cp -R examples/minimal-registry/. ./.local/registry-data/
```

Treat `./.local/registry-data` as your Git-tracked registry repo:

```bash
cd ./.local/registry-data
git init
git add .
git commit -m "chore: bootstrap registry data"
cd ../..
```

## 3) Validate, inspect, and build

```bash
npm exec --workspace @ledra/cli ledra -- validate --registry ./.local/registry-data
npm exec --workspace @ledra/cli ledra -- inspect --registry ./.local/registry-data --query "type=host"
npm exec --workspace @ledra/cli ledra -- build --registry ./.local/registry-data --out ./.local/bundle.json
```

## 4) Serve a read-only API

```bash
npm exec --workspace @ledra/cli ledra -- serve --registry ./.local/registry-data --port 3000
curl http://127.0.0.1:3000/api/diagnostics
curl http://127.0.0.1:3000/api/views
```

## 5) Update loop

1. Change files inside `registry/`.
2. Commit changes in the data repo.
3. Re-run `validate`.
4. Re-run `build` or `export`.
5. Redeploy static assets or API runtime.

## Cloudflare production note

For Cloudflare production, the recommended model is no longer a local `wrangler deploy` from this
repository. Use a deployment repository, usually a fork of Ledra, and run deployment from GitHub Actions.

- Deployment repo: Ledra runtime, Worker, viewer, packaging script, `registry/`, and workflow templates.
- Runtime contract: Cloudflare serves packaged assets only. It never reads GitHub live.

Use `docs/cloudflare-deployment.md` and `deploy/cloudflare/README.md` when setting up that model.
