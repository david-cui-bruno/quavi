#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
project=quavi-dev-dc824
region=us-central1
commit=$(git rev-parse --short=12 HEAD)
if [[ -n $(git status --porcelain) ]]; then
  echo 'Commit the reviewed changes before deployment so the image tag identifies its source.' >&2
  exit 1
fi
image="us-central1-docker.pkg.dev/$project/quavi/api:$commit"
gcloud builds submit --project="$project" --region="$region" --tag="$image" --quiet
gcloud run jobs update quavi-migrate --project="$project" --region="$region" --image="$image" --quiet
gcloud run jobs update quavi-maintenance --project="$project" --region="$region" --image="$image" --quiet
gcloud run jobs execute quavi-migrate --project="$project" --region="$region" --wait --quiet
gcloud run deploy quavi-api --project="$project" --region="$region" --image="$image" \
  --service-account="quavi-api@$project.iam.gserviceaccount.com" \
  --add-cloudsql-instances="$project:$region:quavi-dev-db" \
  --set-secrets=DATABASE_URL=quavi-runtime-database-url:1 \
  --set-env-vars='^|^GOOGLE_CLOUD_PROJECT=quavi-dev-dc824|MEDIA_BUCKET=quavi-dev-dc824-private-media|CITY_DETOURS_ENABLED=true|WALKING_CHECKS_ENABLED=true|ALLOWED_ORIGINS=capacitor://localhost,http://localhost:5199,http://127.0.0.1:5199' \
  --min-instances=0 --max-instances=3 --concurrency=20 --cpu=1 --memory=512Mi \
  --timeout=60 --no-invoker-iam-check \
  --startup-probe='httpGet.path=/readyz,httpGet.port=8080,periodSeconds=10,timeoutSeconds=5,failureThreshold=12' \
  --liveness-probe='httpGet.path=/healthz,httpGet.port=8080,periodSeconds=30,timeoutSeconds=5,failureThreshold=3' --quiet
