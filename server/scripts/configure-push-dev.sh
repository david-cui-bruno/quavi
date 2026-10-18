#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${APNS_KEY_ID:?Set the approved Quavi production APNs key ID}"
project=quavi-dev-dc824
region=us-central1
worker="quavi-push@$project.iam.gserviceaccount.com"
image="us-central1-docker.pkg.dev/$project/quavi/api:$(git rev-parse --short=12 HEAD)"
# Prerequisite: quavi-push has Cloud SQL client and accessor on only the runtime
# database secret and quavi-apns-private-key. Never mount the APNs key in the API.
if gcloud run jobs describe quavi-push --project="$project" --region="$region" >/dev/null 2>&1; then verb=update; else verb=create; fi
gcloud run jobs "$verb" quavi-push --project="$project" --region="$region" \
 --image="$image" --service-account="$worker" \
 --set-cloudsql-instances="$project:$region:quavi-dev-db" \
 --set-secrets=DATABASE_URL=quavi-runtime-database-url:1,APNS_PRIVATE_KEY=quavi-apns-private-key:1 \
 --set-env-vars="GOOGLE_CLOUD_PROJECT=$project,APNS_KEY_ID=$APNS_KEY_ID,APNS_TEAM_ID=R45248279P" \
 --command=node --args=dist/push-worker.js --tasks=1 --parallelism=1 \
 --max-retries=1 --task-timeout=300 --cpu=1 --memory=512Mi --quiet
scheduler="quavi-scheduler@$project.iam.gserviceaccount.com"
gcloud run jobs add-iam-policy-binding quavi-push --project="$project" --region="$region" \
 --member="serviceAccount:$scheduler" --role=roles/run.invoker --quiet >/dev/null
if gcloud scheduler jobs describe quavi-push --project="$project" --location="$region" >/dev/null 2>&1; then verb=update; else verb=create; fi
gcloud scheduler jobs "$verb" http quavi-push --project="$project" --location="$region" \
 --schedule='* * * * *' --time-zone=Etc/UTC \
 --uri="https://run.googleapis.com/v2/projects/$project/locations/$region/jobs/quavi-push:run" \
 --http-method=POST --oauth-service-account-email="$scheduler" --quiet
gcloud run jobs execute quavi-push --project="$project" --region="$region" --wait --quiet
gcloud run services update quavi-api --project="$project" --region="$region" --update-env-vars=APNS_PUSH_ENABLED=true --quiet
