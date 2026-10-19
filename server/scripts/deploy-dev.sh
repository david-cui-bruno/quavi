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
if [[ -n ${QUAVI_IMAGE:-} ]]; then
  # CI builds from the checked-out commit and authenticates through restricted OIDC.
  [[ "$QUAVI_IMAGE" == "us-central1-docker.pkg.dev/$project/quavi/api:$(git rev-parse HEAD)" ]] || { echo 'Image must match this exact source commit.' >&2; exit 1; }
  image="$QUAVI_IMAGE"
else
  gcloud builds submit --project="$project" --region="$region" --tag="$image" --quiet
fi
gcloud run jobs update quavi-migrate --project="$project" --region="$region" --image="$image" --quiet
gcloud run jobs update quavi-maintenance --project="$project" --region="$region" --image="$image" --quiet
gcloud run jobs execute quavi-migrate --project="$project" --region="$region" --wait --quiet
gcloud run deploy quavi-api --project="$project" --region="$region" --image="$image" \
  --service-account="quavi-api@$project.iam.gserviceaccount.com" \
  --add-cloudsql-instances="$project:$region:quavi-dev-db" \
  --set-secrets=DATABASE_URL=quavi-runtime-database-url:1 \
  --update-env-vars='^|^GOOGLE_CLOUD_PROJECT=quavi-dev-dc824|MEDIA_BUCKET=quavi-dev-dc824-private-media|CITY_DETOURS_ENABLED=true|WALKING_CHECKS_ENABLED=true|GOOGLE_MAPS_ENABLED=true|ALLOWED_ORIGINS=capacitor://localhost,http://localhost:5199,http://127.0.0.1:5199' \
  --min-instances=0 --max-instances=3 --concurrency=20 --cpu=1 --memory=512Mi \
  --timeout=60 --no-invoker-iam-check \
  --startup-probe='httpGet.path=/readyz,httpGet.port=8080,periodSeconds=10,timeoutSeconds=5,failureThreshold=12' \
  --liveness-probe='httpGet.path=/healthz,httpGet.port=8080,periodSeconds=30,timeoutSeconds=5,failureThreshold=3' --quiet

if gcloud run jobs describe quavi-push --project="$project" --region="$region" >/dev/null 2>&1; then
  gcloud run jobs update quavi-push --project="$project" --region="$region" --image="$image" --quiet
fi

# Readiness includes a database round-trip; /v1 must still reject anonymous callers.
url=$(gcloud run services describe quavi-api --project="$project" --region="$region" --format='value(status.url)')
curl --fail --silent --show-error --retry 4 --retry-delay 3 "$url/readyz"
status=$(curl --silent --output /dev/null --write-out '%{http_code}' "$url/v1/me/state")
[[ "$status" == 401 ]] || { echo "Authentication smoke check failed: $status" >&2; exit 1; }
