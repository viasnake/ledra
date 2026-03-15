# Cloudflare self-host deployment

This guide describes the direct self-host path for Ledra on Cloudflare.

If you are building a hosted product where customer data stays in customer-owned repositories and Cloudflare
credentials stay operator-side, start with `docs/managed-hosting-architecture.md` instead.

## Repository model

The direct self-host path assumes one deployment repository controlled by the operator or self-hosting team.

That repository contains:

- Ledra packages and apps
- `registry/` as the source-of-truth data tree
- the Cloudflare Worker and Wrangler template
- the Cloudflare packaging script
- GitHub Actions workflows for preview, production, and rollback

This path is appropriate when the same team owns both the registry data and the Cloudflare account.

## Deployment contract

Each workflow packages and deploys a single repository ref:

1. check out the repository ref to deploy
2. run `validate`
3. run `export`
4. package viewer assets, `bundle.json`, and `metadata.json`
5. deploy the packaged artifact to Cloudflare Workers + Assets

Cloudflare reads only packaged assets. It does not fetch registry data from GitHub at runtime.

## Artifact layout

```text
public/
  index.html
  assets/
  bundle.json
  metadata.json
```

- `bundle.json`: exported registry bundle
- `metadata.json`: deployment audit data for preview, production, and rollback
  The bundled viewer is a route-based SPA. Cloudflare Worker fallback ensures that extensionless HTML
  routes resolve to `index.html` while `/bundle.json`, `/metadata.json`, `/assets/*`, `/api/*`, and
  `/health` keep their direct runtime behavior. `_redirects` remains useful for generic static hosts,
  but the Cloudflare package removes it before deployment because the Worker owns route fallback.

## GitHub Actions model

Store workflows in the deployment repository.

- `preview.yml`: PR validation, packaging, preview deploy, preview teardown on PR close
- `production.yml`: deploy on `main`
- `rollback.yml`: redeploy a specific repository ref or commit

Reference templates:

- `deploy/cloudflare/workflows/preview.yml.example`
- `deploy/cloudflare/workflows/production.yml.example`
- `deploy/cloudflare/workflows/rollback.yml.example`
- `deploy/cloudflare/metadata-schema.md`

## Required secrets and variables

Configure these in the deployment repository.

### Secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Variables

- `CLOUDFLARE_PRODUCTION_HOSTNAME`
- `CLOUDFLARE_ACCOUNT_SUBDOMAIN`

The workflow templates assume `registry/` at the repository root.

## Environment model

### Preview

- one Worker per PR
- `workers.dev` only
- destroyed when the PR closes
- must not share production routes or production-only secrets
- deploy only for trusted same-repository PRs
- secret-bearing deploy jobs should read trusted workflow config, not PR-modified deployment code

### Production

- deployed only from `main`
- served from a custom domain
- protected with a GitHub Environment if approvals are required

## Packaging command

The deployment repository provides a packaging script:

```bash
node scripts/package-cloudflare.mjs \
  --bundle .artifacts/cloudflare/bundle.json \
  --out deploy/cloudflare/public \
  --repo "example/home-ledra" \
  --ref "refs/heads/main" \
  --commit "<repo_sha>" \
  --registry-path "registry"
```

## Rollback policy

Primary rollback is a GitHub-driven rebuild and redeploy.

1. choose a known-good repository ref or commit
2. run `rollback.yml`, which validates data before repackaging
3. verify `/health`, `/bundle.json`, `/api/views`, and `/api/metadata`

The example rollback workflow targets production only. Preview environments are per-PR Workers and should be
recreated from the corresponding PR branch instead of rolled back through a shared workflow.

Cloudflare native rollback is only a secondary tool. The audited path is to rebuild and redeploy from
GitHub.

## Manual bootstrap allowed once

The following initial setup is intentionally manual:

- create the Cloudflare account
- create the API token
- connect the custom domain and DNS
- create GitHub environments and secrets

After bootstrap, routine preview, production, and rollback actions should run from GitHub.

## Upstream update model

If the deployment repository is a fork, treat the original Ledra repository as upstream.

1. create an upgrade branch in the fork
2. merge or rebase upstream changes
3. run validation, tests, and preview deploy in the fork
4. merge into `main` only after the packaged artifact verifies correctly

## Secret-handling note

The workflow templates split build/package jobs from deploy jobs. Cloudflare secrets are only required by the
deploy jobs so validation, test, and packaging steps can run without deployment credentials.

Use minimally scoped Cloudflare API tokens. If preview and production trust boundaries differ, keep separate
tokens for each environment.
