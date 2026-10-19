# Quavi development operations

Environment: `quavi-dev-dc824`, `us-central1`. This runbook is for development;
production isolation, physical-device acceptance and app attestation remain separate work.

## Deployment

GitHub workflow **Backend checks and Quavi dev deployment** runs PostgreSQL 16 and
an isolated Firebase Auth emulator. It compiles and runs the server integration
suite on pull requests and pushes. No cloud credentials are available to PR tests.
Pushes to `mobile/social-delivery` deploy only after the checks pass. Main currently
runs checks only; changing the release branch requires reviewing both workflow and
OIDC trust configuration.

Actions are pinned to commit SHAs. A Workload Identity Federation provider requires
this repository's immutable numeric repository/owner IDs, the dev branch, a push
event, and the specific backend workflow. It grants short-lived access to
`quavi-deploy`, with Artifact Registry Writer on the Quavi repository, Run Developer
on the existing API/jobs, and Service Account User on their four execution identities.
There is no downloaded account key, project Owner/Editor grant or direct secret-read
grant to the GitHub identity. A deployer can change executable service/job code and
therefore must still be treated as privileged.

The image tag is the full source commit. The deployment script rejects a mismatched
CI image, applies checksum-locked migrations with the migration identity, deploys the
API with readiness/liveness probes and instance caps, then updates maintenance/push
workers. No migration or maintenance job is exposed as an HTTP service. CI serializes
runs for the dev branch; do not run a manual deployment at the same time.

Post-deploy checks require `/readyz` success and anonymous `/v1/me/state` rejection.
If these fail, the script returns API traffic to the previous revision and fails the
workflow. This does not roll back database migrations or job images. Use additive,
backwards-compatible migrations. For a manual API traffic rollback:

```sh
gcloud run revisions list --service=quavi-api --project=quavi-dev-dc824 --region=us-central1
# Inspect the known-good revision, then use its actual name:
gcloud run services update-traffic quavi-api --project=quavi-dev-dc824 --region=us-central1 --to-revisions=KNOWN_GOOD_REVISION=100
```

Infrastructure-admin setup is reproducible with `scripts/configure-ci-dev.sh`.
Do not run infrastructure setup from untrusted PR code. Check the workflow run and
Cloud Run revision after each deploy; a green compile alone does not prove deployment.

## Alerts and cost

`scripts/configure-operations-dev.py --email YOUR_ALERT_EMAIL --monthly-usd 100`
reconciles the named dev policies and budget. It uses the current operator's gcloud
session and sets the quota project explicitly. It does not write credentials.

- Database-backed readiness: HTTPS `/readyz` once a minute; alert after two US
  check locations fail for three minutes.
- API failures: at least five 5xx responses on one revision in five minutes.
- Any failed Cloud Run job execution, including migration, cleanup and push jobs.
- SQL disk above 80% or memory above 90%, sustained for ten minutes.
- A project-filtered $100 USD calendar-month budget, **before credits**, at 50%,
  90% and 100%. Alerts go to the configured email and default billing recipients.
  This budget does not shut services down. Billing data and notifications can lag.

For an incident, inspect the named execution/revision and recent changes. Do not
paste tokens, notes, photos or precise user locations into incident reports. First
restore service or stop the faulty rollout; investigate the root cause afterward.
A failed push job can be retried; the existing delivery ledger handles acknowledged
work. For deletion failures, inspect the maintenance execution and retry cleanup;
never clear deletion markers to let a blocked account back in.

Policy creation and observed successful uptime-check samples are distinct from
email receipt. Record a real alert delivery/acknowledgement drill before wider beta;
no end-to-end paging claim follows from policy creation alone.

## Database recovery

The source instance has daily backups at 08:00 UTC, seven retained backups and
seven-day point-in-time recovery. Verify these settings before relying on them.
Restore to a **new** instance and validate it before planning a cutover. Never use
an in-place restore against the active app database as a test.

```sh
# Choose a new quavi-restore-* name and an available UTC recovery point.
gcloud sql instances clone quavi-dev-db quavi-restore-YYYYMMDD --point-in-time=RECOVERY_TIME_UTC --project=quavi-dev-dc824
# Run the official Cloud SQL Auth Proxy locally on an unused loopback port:
cloud-sql-proxy --address=127.0.0.1 --port=55439 quavi-dev-dc824:us-central1:quavi-restore-YYYYMMDD
# In another terminal, from server/:
node scripts/verify-restored-dev.mjs quavi-restore-YYYYMMDD 55439
```

The read-only verifier checks migration checksums, validated constraints, core app
tables and restricted runtime privileges. It prints no customer rows or DB secrets.
The clone must retain encrypted connector-only access and no authorized networks.
Recovery of SQL does not independently restore Auth identities, bucket objects or
external provider state. Check media retention/deletion markers and reconcile Auth
before opening a recovered environment to users. A restore can resurrect previously
deleted rows: preserve and reapply deletion requests newer than the restore point.

After the drill, remove only its temporary instance (confirm the exact
`quavi-restore-*` name), disabling deletion protection on that clone first. Stop the
local proxy. Keep the source and its backups intact. Record recovery point, elapsed
time, validation and cleanup; this is not a claim of a production recovery SLA.

## Authentication email

Firebase currently uses its managed email sender and hosted action handler with
email enumeration protection enabled. Verification/reset templates and authorized
domains can be inspected through Identity Toolkit admin configuration. No custom
SMTP sender/domain is configured. Do not claim inbox delivery from a successful
API request; verification and reset each need a real authorized mailbox check.
Never log an action link or complete a password reset as part of a delivery drill.
A branded sender domain requires a domain decision, DNS setup and delivery testing.

## Recorded development evidence (October 18, 2026)

- GitHub run 39192466879: 97 server tests passed; API revision `quavi-api-00022-9gq`
  and all three jobs deployed from `0d5d330`. Readiness/auth smoke checks passed.
- Five alert policies enabled; readiness checks passed in Oregon and Iowa.
- $100/month project budget created with credits excluded and 50/90/100 thresholds.
- PITR clone `quavi-restore-20261018` recovered to `2026-10-18T21:00:00Z`.
  Clone operation took approximately ten minutes. Read-only checks verified eight
  migration checksums, validated constraints, table access and restricted runtime
  privileges. Proxy stopped and clone deletion completed; source remained RUNNABLE.
- Real incident alert receipt is not verified. Verification and password-reset emails
  were each sent once with authorization and confirmed in Gmail INBOX on October
  18 at 23:11 EDT. No action links were opened and no password change was made.
  Subjects still identify the dev project; branding is a separate follow-up.

Provider references: [GitHub federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines),
[budget credit treatment](https://docs.cloud.google.com/billing/docs/reference/budget/rest/v1/billingAccounts.budgets),
[Cloud SQL point-in-time recovery](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/pitr).
