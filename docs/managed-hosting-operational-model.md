# Managed hosting operational model

This document defines the M2 operational model for Ledra managed hosting.

It binds the Git-backed desired state from `hosting-control` to the execution state stored in the control
plane database.

## Scope

This document fixes:

- database entities
- uniqueness indexes
- onboarding and deployment state machines
- per-tenant locking
- idempotency rules
- webhook dedupe behavior

It intentionally does not fix provider-specific implementation details beyond the minimum required to keep
state transitions auditable.

## Operational database responsibilities

The database is the source of truth for execution state, not desired configuration.

It stores:

- tenant records and current operational status
- GitHub installation and repository bindings
- tenant revisions
- deployment jobs and outcomes
- per-tenant locks
- hostname claims
- webhook deliveries
- override events mirrored from Git-backed override records
- subscription and billing-facing state

## Core entities

### `tenants`

Tracks the current operational status of each tenant.

Recommended fields:

- `tenant_id`
- `slug`
- `display_name`
- `status`
- `current_tenant_revision_id`
- `created_at`
- `updated_at`
- `deleted_at`

### `github_installations`

Tracks the GitHub App installation lifecycle.

Recommended fields:

- `installation_id`
- `account_login`
- `account_type`
- `installation_status`
- `last_event_at`
- `created_at`
- `updated_at`

### `repo_bindings`

Maps tenants to customer repositories.

Recommended fields:

- `tenant_id`
- `installation_id`
- `repository_full_name`
- `repository_node_id`
- `default_ref`
- `registry_path`
- `binding_status`
- `created_at`
- `updated_at`

### `tenant_revisions`

Captures the exact deploy unit.

Recommended fields:

- `tenant_revision_id`
- `tenant_id`
- `customer_repo_commit_sha`
- `control_repo_commit_sha`
- `platform_version`
- `config_hash`
- `created_at`

### `deployments`

Tracks attempted and completed deploys.

Recommended fields:

- `deployment_id`
- `tenant_id`
- `tenant_revision_id`
- `status`
- `artifact_hash`
- `artifact_location`
- `cloudflare_target`
- `hostname`
- `override_applied`
- `started_at`
- `finished_at`
- `failure_category`
- `failure_code`

### `jobs`

Represents asynchronous work items.

Recommended fields:

- `job_id`
- `tenant_id`
- `kind`
- `idempotency_key`
- `state`
- `payload`
- `attempt_count`
- `scheduled_at`
- `started_at`
- `finished_at`
- `last_error_code`

### `locks`

Ensures only one critical flow runs per tenant.

Recommended fields:

- `tenant_id`
- `lock_kind`
- `owner_job_id`
- `acquired_at`
- `expires_at`

### `domain_claims`

Tracks hostname reservations and active assignments.

Recommended fields:

- `hostname`
- `tenant_id`
- `claim_status`
- `claimed_at`
- `released_at`

### `cloudflare_target_claims`

Tracks reserved and active Cloudflare service identifiers.

Recommended fields:

- `cloudflare_target`
- `tenant_id`
- `claim_status`
- `claimed_at`
- `released_at`

### `override_events`

Mirrors override records into operational state for fast reads.

Recommended fields:

- `override_event_id`
- `tenant_id`
- `override_kind`
- `source_control_commit_sha`
- `active`
- `created_at`
- `expires_at`

### `webhook_deliveries`

Stores delivery ids for dedupe and replay handling.

Recommended fields:

- `delivery_id`
- `provider`
- `event_type`
- `installation_id`
- `repository_node_id`
- `received_at`
- `processed_at`
- `processing_state`

## Required uniqueness indexes

The database must enforce at least these uniqueness rules:

- `tenants.slug`
- `repo_bindings.repository_node_id`
- `repo_bindings.installation_id + repository_full_name + registry_path`
- `domain_claims.hostname`
- `cloudflare_target_claims.cloudflare_target`
- `tenant_revisions.tenant_id + customer_repo_commit_sha + control_repo_commit_sha + platform_version`
- `jobs.idempotency_key`
- `webhook_deliveries.provider + delivery_id`

These indexes are the primary protection against race conditions and duplicate onboarding.

## State machines

### Tenant lifecycle

- `pending`
- `active`
- `degraded`
- `suspended`
- `deleted`

### Onboarding lifecycle

- `detected`
- `access_validating`
- `manifest_validating`
- `uniqueness_checking`
- `provisioning`
- `control_state_committing`
- `initial_reconcile_pending`
- `active`
- `action_required`
- `conflict`
- `failed`

### Deployment lifecycle

- `pending`
- `validating`
- `building`
- `deploying`
- `healthy`
- `failed`
- `rolled_back`

## Locking model

Locks are tenant-scoped.

Rules:

- onboarding, deploy, rollback, and destructive actions may not run concurrently for the same tenant
- lock ownership is attached to a job id
- locks have expiry timestamps
- stale locks are recoverable by an explicit reconciliation job
- stale lock recovery must be audited

## Idempotency model

Each flow has its own stable dedupe key.

- webhook ingestion: provider delivery id
- onboarding saga steps: onboarding attempt id plus tenant or repository identity
- deployment job: tenant revision id
- rollback job: target deployment id or target tenant revision id

Repeated execution with the same key must either return a prior result or produce a no-op result.

## Reconcile rules

Reconcile compares:

- desired control state from `hosting-control`
- current operational state from the database
- actual deployment state and health observations

Reconcile outcomes:

- `no_op`: desired and effective state already match
- `enqueue_deploy`: desired tenant revision differs from deployed revision
- `enqueue_repair`: desired state matches but runtime health or drift requires repair
- `blocked`: active override or conflict prevents action

## Webhook dedupe and replay

Webhooks are accepted asynchronously.

Rules:

- verify provider signature before any work is queued
- record delivery id immediately
- ignore duplicate delivery ids after first successful record
- replay should re-evaluate current desired state rather than assuming old state still applies

## Failure handling

Failure categories must be explicit.

- `github_access_failure`
- `manifest_failure`
- `uniqueness_conflict`
- `control_commit_failure`
- `build_failure`
- `deploy_failure`
- `verification_failure`
- `drift_failure`
- `internal_failure`

Each failure must record:

- category
- code
- retriable flag
- first seen timestamp
- last seen timestamp

## Soft delete and tombstones

Tenant deletion must not immediately release identity claims.

Initial policy:

- deleted tenants enter tombstone state
- slug, hostname, and Cloudflare target remain reserved until explicit release
- repo rename or transfer must be tracked by repository node id rather than only repository name

## Operator approval safety

Any approval-backed action must lock these values:

- tenant id
- customer repo commit SHA
- control repo commit SHA
- platform version
- target hostname or Cloudflare target

Execution must fail fast if the effective inputs differ from the approved inputs.
