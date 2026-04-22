# Managed hosting roadmap

This document turns the managed-hosting architecture into phased delivery work through M6.

## Delivery sequence

The recommended sequence is:

1. M0: architecture baseline
2. M1: control contracts and schemas
3. M2: operational state model
4. M3: GitHub App integration and onboarding
5. M4: build, deploy, and rollback
6. M5: operator visibility and hardening
7. M6: subscription readiness and rollout

This order avoids building provider integration before contracts, uniqueness, and idempotency are fixed.

## M0: Architecture baseline

Outcome:

- truth-source boundaries are fixed
- tenant revision is defined
- failure domains are named

Implementation work:

- document component boundaries
- document desired-state vs operational-state responsibilities
- define `tenant revision`
- define rollback source precedence
- define Cloudflare tenancy model for the first release

Suggested commit split:

- `docs: add managed hosting architecture ADR`
- `docs: define truth-source boundaries and tenant revision`

## M1: Control contracts and schemas

Outcome:

- customer manifest schema is fixed
- hosting-control tenant schema is fixed
- override schema is fixed
- uniqueness and conflict rules are fixed

Delivered in this repository:

- `docs/schemas/customer-manifest.schema.json`
- `docs/schemas/hosting-control-tenant.schema.json`
- `docs/schemas/hosting-control-override.schema.json`

Implementation work:

- add schema validation tests
- add example fixture validation
- define conflict reason codes
- document operator approval contract in implementation-facing references
- add status-intent validation examples

Suggested commit split:

- `feat: add customer manifest schema`
- `feat: add hosting control tenant schema`
- `feat: add hosting control override schema`
- `docs: define uniqueness conflict and approval rules`

## M2: Operational state model

Outcome:

- DB entities and indexes are fixed
- onboarding and deployment state machines are fixed
- lock, retry, and idempotency strategy is fixed

Implementation work:

- document DB entity list
- define unique indexes
- define per-tenant lock model
- define webhook dedupe strategy
- define no-op reconcile rules
- define stale lock recovery
- define repo rename and uninstall handling rules

Suggested commit split:

- `docs: define hosting operational schema and indexes`
- `docs: define onboarding and deployment state machines`
- `docs: define locking retry and idempotency behavior`

## M3: GitHub App integration and onboarding

Outcome:

- GitHub App onboarding contract is fixed
- private and public repo intake flows are fixed
- onboarding saga is fully defined

Implementation work:

- define GitHub App permissions and webhook events
- define installation token usage rules
- define access preflight checks
- define onboarding saga transitions
- define uninstall and access-revoked behavior
- define control-state commit behavior during onboarding

Suggested commit split:

- `docs: define GitHub App permissions and webhook contract`
- `docs: define onboarding saga and preflight validation`
- `docs: define onboarding revoke conflict and retry handling`

## M4: Build, deploy, and rollback

Outcome:

- tenant artifact contract is fixed
- metadata v3 direction is fixed
- deploy verification and rollback flows are fixed

Implementation work:

- define artifact manifest and retention policy
- define deployment metadata v3 fields
- define Cloudflare target naming conventions
- define verify checks for deploy completion
- define rollback to previous successful artifact
- define rebuild fallback path
- define suspend and destroy behavior

Suggested commit split:

- `docs: define tenant artifact and metadata contract`
- `docs: define deployment verification contract`
- `docs: define rollback and Cloudflare target model`

## M5: Operator visibility and hardening

Outcome:

- operator-visible state is fixed
- drift detection rules are fixed
- runbooks are written

Implementation work:

- define operator read model
- define audit event taxonomy
- define drift categories and reconciliation rules
- define override visibility requirements
- write rollback runbook
- write break-glass runbook
- write drift investigation runbook

Suggested commit split:

- `docs: define operator audit and visibility model`
- `docs: define drift detection and recovery rules`
- `docs: add operator rollback and override runbooks`

## M6: Subscription readiness and rollout

Outcome:

- subscription lifecycle hooks are fixed
- plan and entitlement model is defined
- rollout path to paid GA is documented

Implementation work:

- define account subscription and entitlement primitives
- define suspend and cancel policy hooks
- define rollout milestones and exit criteria
- define support and incident ownership
- define production readiness checklist

Suggested commit split:

- `docs: define subscription and entitlement model`
- `docs: define suspend cancel and tombstone policies`
- `docs: add managed hosting rollout milestones`

## Commit strategy

Keep each commit auditable and reversible.

Recommended top-level order:

1. architecture docs
2. schemas and validation contracts
3. operational state and state-machine docs
4. GitHub App and onboarding docs
5. artifact, metadata, deploy, rollback docs
6. operator visibility and runbooks
7. subscription and rollout docs

Do not mix schema changes, provider integration logic, and runtime deploy behavior in the same commit.

## Verification strategy

Before implementation:

- review all schema examples against the JSON schemas
- confirm uniqueness rules cover rename, transfer, uninstall, and soft-delete cases
- confirm all deploy and approval flows are commit-pinned

During implementation:

- add schema tests
- add state-machine tests
- add webhook replay and duplicate-onboarding tests
- add deployment and rollback integration tests
- add drift and override visibility tests

Operational readiness checks:

- onboarding drill for public repo
- onboarding drill for private repo
- duplicate hostname rejection drill
- GitHub App revoke drill
- rollback drill
- drift recovery drill

## Known blockers to resolve before provider integration

- choose the operational database implementation
- choose the artifact storage implementation
- confirm the first Cloudflare tenancy model
- confirm operator authentication for override actions
- confirm custom-domain ownership process
