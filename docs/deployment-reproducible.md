# Reproducible deployment (Cloudflare / Docker)

This document ties the runnable examples under `deploy/` to the Git-native registry workflow.

For local setup, this repository targets Node.js 20.x. Run `mise install` before the commands below if you use `mise`.

## Shared principle

Use a Git-tracked `registry/` tree as source-of-truth input, then regenerate artifacts and redeploy:

```bash
npm exec --workspace @ledra/cli ledra -- validate --registry <registry_repo_path>
npm exec --workspace @ledra/cli ledra -- build --registry <registry_repo_path> --out dist/bundle.json
```

## Docker

- Files:
  - `deploy/docker/Dockerfile`
  - `deploy/docker/compose.yaml`
  - `deploy/docker/server.mjs`
- Uses mounted registry repo (`LEDRA_REGISTRY_PATH`) in read-only mode.

```bash
docker compose -f deploy/docker/compose.yaml up --build -d
```

## Cloudflare Workers + Assets

- Files:
  - `deploy/cloudflare/wrangler.toml.example`
  - `deploy/cloudflare/worker.mjs`
- Uses a packaged artifact directory containing viewer assets, `bundle.json`, and `metadata.json`.
- Recommended production flow is a single deployment repository model: a Ledra repository or fork keeps
  runtime code, `registry/`, and GitHub Actions workflows together and deploys to Cloudflare from one ref.
- Use `ledra export` for the Cloudflare bundle so the packaged artifact matches the static deployment flow.

```bash
npm exec --workspace @ledra/cli ledra -- export --registry <registry_repo_path> --out .artifacts/cloudflare/bundle.json
node scripts/package-cloudflare.mjs --bundle .artifacts/cloudflare/bundle.json --out deploy/cloudflare/public --repo <repo_slug> --ref <git_ref> --commit <git_sha>
cd deploy/cloudflare && npx wrangler deploy
```

See `docs/cloudflare-deployment.md` for the full GitHub-driven preview, production, and rollback
workflow.
