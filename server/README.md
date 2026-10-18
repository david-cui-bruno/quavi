# Quavi API foundation

Selected stack: Firebase Authentication, TypeScript/Fastify on Cloud Run,
PostgreSQL on Cloud SQL, and a private Cloud Storage bucket. This API is a first
backend slice. The iPhone app still uses local demo storage until its account
and synchronization UI is connected to a deployed API.

## Run locally

Requires Node.js 24, Docker, and two terminals. The local auth emulator does not
contact a real Firebase project. The example password is for local Docker only.

```sh
cd server
npm ci
cp .env.example .env
docker compose -p quavi-dev up -d --wait
npm run migrate
npm run emulators
```

In a second terminal, run `cd server && npm run dev`. The API listens on
`http://127.0.0.1:8080`; `/healthz` is a liveness check and `/readyz` checks the
database. Stop only these development services with Ctrl-C and
`docker compose -p quavi-dev stop`. Do not use `down -v` unless you intend to erase
the local demo database.

## Verify

With PostgreSQL and the auth emulator running:

```sh
npm run build
npm test
npm audit --omit=dev
```

Tests create temporary emulator accounts and use real PostgreSQL. They check
authentication, separate-account isolation, identity injection attempts,
concurrent/stale writes, durability across API instances, photo ownership and
constraints, disabled users, and production emulator guards. Photo signing is
replaced by a test adapter; real GCS upload/download must be verified after deploy.

## API

All `/v1` routes require `Authorization: Bearer <Firebase ID token>`. The Admin
SDK verifies the token and checks disabled/revoked sessions. Identity always comes
from that verified token; there are no client-selectable owner IDs in the API.

| Route | Behavior |
| --- | --- |
| `GET /v1/me` | Returns the verified Firebase user ID |
| `GET /v1/me/state` | Reads only this user's private document; returns revision 0 and null state for a new account |
| `PUT /v1/me/state` | Accepts `{state: {...}, revision: number}`; saves only if the expected revision matches; returns 409 on a conflict |
| `POST /v1/me/media` | Accepts `{contentType, bytes}`; returns an owner-scoped upload form valid for ten minutes; supports JPEG/PNG/WebP up to 8 MiB |
| `GET /v1/me/media/:id` | Returns a five-minute download URL only for a photo owned by this user |

State is capped at 2 MiB per request. Use media objects for photos, not base64
photo payloads in state. The document is a first persistence adapter for the
existing prototype; social sharing will introduce separate story/friendship
resources. XP and demo-redemption values inside this document are **client demo
data**, not server-authoritative awards or a financial ledger.

Clients must keep each account's offline cache separate, capture revisions when
reading, and show a conflict rather than blindly retrying an outdated save.
Existing anonymous demo data must be imported only after the user chooses to
attach it to an account. Do not automatically merge another account's local data.

## Deployment preparation

The Dockerfile runs as a non-root user, excludes local environment files, and
binds the production service to Cloud Run's `PORT`. Build with:

```sh
docker build -t quavi-api:dev .
```

Choose a dedicated Quavi GCP project and the billing account containing the credits
before provisioning. No cloud resources are created by these local commands.
Use explicit `--project` flags rather than changing or relying on an unrelated
active gcloud project.

Provision and configure:

- Firebase Authentication: enable email/password and configure verification,
  password recovery, authorized domains and mobile app identifiers.
- Cloud SQL PostgreSQL: backups enabled; separate migration and runtime database
  users. Runtime needs SELECT/INSERT/UPDATE on these tables, not schema ownership.
  Use the Cloud SQL connector/socket with Cloud Run, without broad authorized
  networks. Run migrations with the migration identity before serving traffic
  (`npm run migrate:production` in the built container).
- A Cloud Storage bucket with uniform bucket access and public-access prevention
  enforced. Allow CORS POST from approved app/web origins if using browser uploads.
  Completed uploads, retention and orphan-upload cleanup need deployment QA.
- A dedicated Cloud Run service account: Cloud SQL Client, Firebase Authentication
  Viewer, bucket-scoped Storage Object User, access to the database secret, and
  permission to sign URLs as itself (`iam.serviceAccounts.signBlob`). Do not ship
  service-account keys to the app or grant project-wide Storage Admin.
- Secret Manager: store `DATABASE_URL` (with the Cloud SQL socket host) as a secret;
  set `GOOGLE_CLOUD_PROJECT`, `MEDIA_BUCKET` and `ALLOWED_ORIGINS` on the service.
  Never set `FIREBASE_AUTH_EMULATOR_HOST` on Cloud Run. Production startup rejects it.
- Initially cap Cloud Run at three instances with five DB connections per instance;
  configure budgets and alerts even when credits are available. Migrations and
  the public API runtime are separate deployment steps.

Cloud Run must accept mobile HTTP requests at the transport layer; private API
routes still require verified Firebase tokens. Keep the bucket private and limit
allowed browser origins. Set up deployment via a short-lived identity rather than
committing credential JSON files.

## Next slice

Connect Firebase sign-up/sign-in/sign-out/recovery to the existing iPhone screens;
add account-specific caches, explicit demo import, revision-aware synchronization
and private photo upload. Then implement complete account deletion (Auth, SQL,
media and retries), email verification, production rate limits and cloud acceptance
tests. These are not implemented by the API scaffold. Friends, AI recommendations,
background location and a trusted demo-reward ledger remain later roadmap stages.
