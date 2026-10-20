#!/usr/bin/env bash
# Run with infrastructure-admin credentials, never from a pull request.
set -euo pipefail
project=quavi-dev-dc824
region=us-central1
sa="quavi-deploy@$project.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$sa" --project="$project" >/dev/null 2>&1 || gcloud iam service-accounts create quavi-deploy --project="$project" --display-name='Quavi dev GitHub deployer'
gcloud iam workload-identity-pools describe quavi-github --project="$project" --location=global >/dev/null 2>&1 || gcloud iam workload-identity-pools create quavi-github --project="$project" --location=global --display-name='Quavi GitHub Actions'
provider=(--project="$project" --location=global --workload-identity-pool=quavi-github)
if ! gcloud iam workload-identity-pools providers describe quavi-backend "${provider[@]}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc quavi-backend "${provider[@]}" \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' \
    --attribute-condition="assertion.repository_id=='1423963712' && assertion.repository_owner_id=='196666240' && assertion.ref=='refs/heads/mobile/social-delivery' && assertion.event_name=='push' && assertion.job_workflow_ref=='david-cui-bruno/quavi/.github/workflows/backend.yml@refs/heads/mobile/social-delivery'"
fi
gcloud iam service-accounts add-iam-policy-binding "$sa" --project="$project" --role=roles/iam.workloadIdentityUser \
  --member='principalSet://iam.googleapis.com/projects/532892298664/locations/global/workloadIdentityPools/quavi-github/attribute.repository_id/1423963712' --quiet >/dev/null
for identity in quavi-api quavi-migrate quavi-maintenance quavi-push; do
  gcloud iam service-accounts add-iam-policy-binding "$identity@$project.iam.gserviceaccount.com" --project="$project" --member="serviceAccount:$sa" --role=roles/iam.serviceAccountUser --quiet >/dev/null
done
gcloud artifacts repositories add-iam-policy-binding quavi --project="$project" --location="$region" --member="serviceAccount:$sa" --role=roles/artifactregistry.writer --quiet >/dev/null
gcloud run services add-iam-policy-binding quavi-api --project="$project" --region="$region" --member="serviceAccount:$sa" --role=roles/run.developer --quiet >/dev/null
for job in quavi-migrate quavi-maintenance quavi-push; do
  gcloud run jobs add-iam-policy-binding "$job" --project="$project" --region="$region" --member="serviceAccount:$sa" --role=roles/run.developer --quiet >/dev/null
done
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:$sa" --role=roles/serviceusage.serviceUsageConsumer --quiet >/dev/null
echo 'Quavi dev CI identity configured; no service-account key created.'
