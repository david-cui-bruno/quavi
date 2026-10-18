# Quavi API foundation

Selected stack: Firebase Authentication, TypeScript/Fastify on Cloud Run,
PostgreSQL on Cloud SQL, and a private Cloud Storage bucket. This account/save API is deployed to Quavi dev and connected to the iPhone app.
The separate anonymous demo remains local; importing it into an empty account
requires an explicit confirmation.

The optional `user.onboarding` step is accepted by dev revision
`quavi-api-00011-js8` (source `3d564a5`). Older saves without this field remain valid;
no SQL migration is needed for the optional profile property.

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
| `DELETE /v1/me` | Recent-authenticated, confirmed and retryable account deletion; returns 202 after access is blocked |
| `POST /v1/me/detours` | Authenticated nearby route generation with per-account/project quotas and explicit no-result behavior |
| `POST /v1/me/media/:id/complete` | Verifies a staged image and finalizes an immutable private photo |
| `GET /v1/me/outings` | One-time legacy migration, then only this account’s independent outing records |
| `POST /v1/me/outings/operations` | Idempotent create/field-patch commands; distinct fields merge; same-field conflicts return 409 |
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

## Deployed development environment

Deployed October 18, 2026, in project `quavi-dev-dc824` (number `532892298664`),
region `us-central1`, billing Framewise Health Main (ending DE54D6).

| Resource | Configuration |
| --- | --- |
| Cloud Run `quavi-api` | `https://quavi-api-532892298664.us-central1.run.app`; 0–3 instances, 1 CPU / 512 MiB, concurrency 20, pool max 5, readiness/liveness probes |
| Artifact Registry `quavi` | Image `us-central1-docker.pkg.dev/quavi-dev-dc824/quavi/api:city-v5`; Cloud Build builds in Google Cloud |
| Cloud SQL `quavi-dev-db` | PostgreSQL 16 Enterprise, db-g1-small, 10 GiB SSD, deletion protection, daily backups (08:00 UTC, retain 7), point-in-time recovery |
| Database `quavi` | `quavi_migrator` owns schema; `quavi_runtime` has DML only on app tables, no schema creation, role/database creation or migration-table access |
| Migration job `quavi-migrate` | Runs migrations then `dist/bootstrap.js` with a separate migration identity |
| Private bucket | `quavi-dev-dc824-private-media`; uniform access, public-access prevention; signed uploads and reads; native/local-development CORS |
| Authentication | Firebase email/password; SDK initializes with persistence and without popup/redirect dependencies for the Capacitor webview |
| Secrets | `quavi-migration-database-url:1`, `quavi-runtime-database-url:1`; runtime and migration identities access only their respective DB secret |

The database accepts Cloud SQL connector connections only, with encryption and no
authorized public client networks. Cloud Run uses its Cloud SQL socket. The runtime
identity has Cloud SQL Client, Firebase Auth Viewer, bucket-scoped Object User,
access to the runtime secret and permission to sign URLs as itself. No downloaded
service-account key is used.

The HTTP transport is public so mobile clients can connect; **all `/v1` routes
still require a verified Firebase token**. Cloud Run uses `--no-invoker-iam-check`,
the supported public-service setting when organization domain-restricted IAM
prevents granting `allUsers` the Invoker role. No organization policy was changed.
Health endpoints return status only; the storage bucket remains private.

Public client configuration lives in `src/cloud-config.json`. Its API key is an
application identifier restricted to `identitytoolkit.googleapis.com` and
`securetoken.googleapis.com`; it is not an authorization credential for SQL, GCS
or the Quavi API. The app uses production Firebase authentication for **development
accounts**; emulator configuration is never deployed.

## Update this deployment

From `server/`, after local tests pass:

```sh
./scripts/deploy-dev.sh
```

The script builds an image tagged with the current Git commit, updates and executes
the existing migration job, then deploys the API with explicit project/region,
pinned Secret Manager versions and instance caps. It assumes the resources and IAM
listed above already exist. Only the migration identity can change the schema.
Review migrations before deploying; avoid running migrations concurrently. The
migration runner also uses a PostgreSQL advisory lock and immutable checksums.

After a frontend change, run `npm run ios:sync` from the repository root and rebuild
the app. Changing Cloud Run code alone does not require reinstalling the app.
The container runs as a non-root user and excludes local environment files.

## Deployed acceptance and limits

Verified with disposable real Firebase accounts:

- Readiness succeeds and missing/forged credentials are rejected.
- Account A's save is invisible to B; concurrent revision writes yield one success
  and one 409, rather than overwriting each other.
- A real signed GCS upload downloads byte-for-byte, native-origin CORS succeeds,
  another account receives 404 and an unsigned object read is denied.
- Runtime SQL privileges were checked directly: no elevated role membership,
  database/role/schema creation or migration-table access.
- The iOS simulator signs in through the actual SDK/API, explicitly imports its
  demo and restores the saved profile after clearing its local app data.
- The signed backend-connected development app was installed on David's iPhone.
  Opening the app and checking personal-account behavior on that phone remains a
  user acceptance step; simulator results do not stand in for physical-device QA.

Root `npm test` covers rewards plus account-cache isolation, offline recovery,
conflicts, edits during slow uploads and sign-out races. Server `npm test` runs
against the isolated local Auth emulator and PostgreSQL. Both production dependency
audits are clean; existing Capacitor/Firebase CLI development-tool advisories are
separate from shipped runtime dependencies.

## Next slice

Verify email recovery/verification delivery, improve sync/photo retry UX, add app attestation,
and configure deployment CI, alerting/budgets and a backup restore drill. Offline
account edits are cached, but uncached private photos need a connection. Conflict
resolution currently offers an explicit cloud-copy replacement; merging divergent
local edits is not implemented. Initial cloud reads and token refresh need internet.

Friends/circle remain local demo data, captions remain scripted,
background location is unimplemented, and XP/rewards are client-controlled demo
values. These are separate roadmap stages, not services supplied by this deploy.


## Account deletion and data guards (October 18)

`DELETE /v1/me` requires `{confirm:"DELETE"}` and authentication within five minutes
(the app reauthenticates with the password). A durable SQL tombstone blocks further
account access immediately and removes its state. The maintenance job disables
Firebase sign-in/revokes sessions and purges private photos; after an eleven-minute
upload-link grace period, it purges again, deletes Auth/media/quota rows and removes
the plaintext UID. Retries survive worker restarts and storage errors. Repeated
requests remain idempotent. Per-account PostgreSQL advisory locks serialize deletion
with saves/uploads so an in-flight request cannot resurrect data.

Cloud Scheduler invokes the private `quavi-maintenance` job every five minutes via
OAuth as `quavi-scheduler`; this identity can only invoke that job. The separate
`quavi-maintenance` runtime identity has database DML, private bucket object access
and a custom Firebase role limited to get/update/delete users. The public API has
no Firebase user-deletion permission. The worker also removes unreferenced media
and expired staging objects after 24 hours and sweeps completed deletion prefixes
for late uploads. Failed/overdue cleanup fails the job for operational visibility.
Hashed deletion tombstones expire after 30 days. Automated SQL/PITR and GCS soft-delete
recovery copies retain their configured seven-day windows; administrative snapshots
must be managed separately.

Uploads now go to private staging keys. `/media/:id/complete` verifies the actual
size, MIME metadata and PNG/JPEG/WebP signature, then copies to an immutable final
key using a generation precondition. Reusing an old upload form cannot replace the
verified photo. Saves accept the bounded application schema, reject inline data
URLs and require completed, owned media references. Legacy private photos are
validated on first read. Limits are shared in SQL across instances: 120 API calls
per account/minute, 40 upload grants/hour and 256 MiB / 1,000 reserved media records.
Unused reservations are reclaimed by maintenance. Reward values remain demo data,
not a trusted financial or XP ledger.

When deploying future API versions, also update the maintenance image to the same
commit so cleanup follows the current schema. Use `gcloud run jobs update
quavi-maintenance --project=quavi-dev-dc824 --region=us-central1 --image=...`.


## City-aware detours

`POST /v1/me/detours` accepts an origin `{lat,lng}`, area label, interests, optional
mood/age21 and 30/60/120 minute duration. Firebase identity, lifecycle checks and
SQL quotas are enforced. A slow provider lookup releases the account transaction,
then rechecks the deletion tombstone before responding. No-route and provider-error
responses never fall back to demo venues.

The provider queries the spatially clustered public BigQuery table
`bigquery-public-data.overture_maps.place`, using the API service account’s BigQuery
Job User permission. It filters operating status/confidence, uses strict venue
categories and applies age/name exclusions, uniqueness, distance/time and preference
ranking. Specific coordinates take precedence over any prototype name match.
`operating_status=open` is not live opening hours. Missing status is retained as
`unknown`, while known temporary/permanent closures are excluded. This optional
field is absent for much international data; requiring `open` discarded valid
candidates. Google clients separately check reported hours for arrival and stay.
The app shows Overture attribution and the table update date. A dataset older than
90 days is rejected. Current access validation, category accuracy and broader
international acceptance remain roadmap work.

Public venue caches contain coarse area keys (about 1 km), venue records and source
metadata, with a 24-hour TTL; precise request GPS and user identities are not stored
in this cache. Origin coordinates are saved only as part of the user’s chosen story.
Provider SQL uses parameters, a 20 GiB maximum-bytes-billed ceiling and a 20-second
job timeout. Shared limits are 12 generation requests/account/day and 100 uncached
provider lookups/project/day, including failed provider attempts. Cache versioning
invalidates older category/status mappings (`overture-v3`). The independent venue
query does not use a public Overpass backend. API logs redact request bodies and authorization headers.

`CITY_DETOURS_ENABLED=true` enables the provider. `venue_cache` is an additive
migration; runtime DML is granted by bootstrap. The deployment script updates both
migration and maintenance images before serving the matching API version. The
separate public Photon/Nominatim search services still need production service
agreements or replacements before public launch. Google clients use the map and
walking providers described below; older clients retain the original map path.

Sources: [Overture Places](https://docs.overturemaps.org/guides/places/),
[attribution/licensing](https://docs.overturemaps.org/attribution/),
[BigQuery public data](https://docs.cloud.google.com/bigquery/public-data),
[optional operating status](https://docs.overturemaps.org/schema/reference/places/place/).


### Walking feasibility checks

`WALKING_CHECKS_ENABLED=true` adds a pedestrian-network check to each candidate
outing and enables authenticated `POST /v1/me/walking-check` with two to four
`points`. The app rechecks before starting a city story, using the current GPS
position when live tracking is active. No path, >100 m snap, invalid metrics or
an over-budget walk rejects the route. A provider outage returns an error rather
than an estimated route. This validates mapped connectivity, **not** safe sidewalks,
wheelchair suitability, entrances, construction or actual current access.

The development adapter uses FOSSGIS's worldwide **foot** OSRM graph. Admission
reserves starts at least 1.1 seconds apart across API instances via a SQL advisory
lock and a provider clock (no coordinates) in `venue_cache`. It caps calls at
400/project/day, including failures, with at most 3.5 seconds of waiting. Individual
preflight is also limited to 60/account/hour; each call times out after six seconds.
Exact route requests aren't persisted by this adapter. The upstream server logs
requests under its own privacy policy. Existing device navigation also contacts
FOSSGIS directly. A contracted or hosted provider is still needed for launch.

Live outings draw the fetched current pedestrian leg rather than invented straight
lines to later stops. Failed/rerouting requests clear the old route. Missing street
directions shows a pause/check message and an external walking-directions link.
The active map's straight-line coin trail is hidden for live outings; authoritative
on-route rewards remain a separate roadmap item.

Sources: [FOSSGIS service and usage policy](https://routing.openstreetmap.de/about.html),
[OSRM route and waypoint API](https://project-osrm.org/docs/v5.24.0/api/),
[Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).

## Google Maps, reported hours and walking directions

New clients send `X-Quavi-Maps: google`. With `GOOGLE_MAPS_ENABLED=true`, city
outings use Google Routes' `WALK` graph and Google Places (New) to check each
selected venue for its expected arrival **and full stay**, including earlier stops.
Reported closed or temporarily/permanently closed matches reject the candidate.
An exact normalized name plus an 80 m coordinate match is required; ambiguous,
unmatched, missing, truncated or DST-ambiguous schedules are explicitly unknown.
Dated current-opening periods include provider exceptions; current open-now alone
is insufficient. No admission, accessibility, sidewalk or safety guarantee is made.

`POST /v1/me/detour-check` refreshes hours and the route before Start. Its `stops`
(name, independently sourced coordinates, stay minutes, optional Google place ID)
must match its bounded `points`. `POST /v1/me/walking-route` returns ephemeral
Google geometry, instructions and warnings for signed-in navigation. Both enforce
identity, shared quotas and a deletion recheck after external work. Anonymous demos
show their separate sample plans and do not call paid Google navigation endpoints.
Existing clients keep the original FOSSGIS path until updated; do not serve Google
geometry on the old OpenStreetMap client.

The catalog and its saved names/coordinates remain independently sourced Overture
data. Google identity matches and hours are a transient verification layer. Only
permitted Google place IDs are retained. Google hours, walking metrics, route
geometry/instructions and derived open-status labels are excluded from persistent
client caches and cloud saves. Hours expire from displayed claims after five minutes
and recheck on Start; resuming a saved plan shows hours as not checked. User notes,
photos and independently sourced catalog data remain saveable. The native map SDK
manages its own map rendering/cache under its terms. Provider request bodies are
not logged by the API.

Cloud Run authenticates Places and Routes through its attached service account
with `roles/serviceusage.serviceUsageConsumer` and explicit project quota headers;
there is no server Maps API key or service-account key file. SDK keys in
`src/maps-config.json` are public client identifiers: iOS is restricted to
`com.quavi.app` and the iOS map SDK; browser access is restricted to local port 5199
origins and Maps JavaScript. Android is not configured. Browser Maps quota is capped
at 100 loads/day. Backend Places and Routes requests each have a shared **500 per
calendar month** development cap, counting failures; per-account checks are capped
at 60/hour and existing detour-generation limits remain. Monthly provider counters
survive the ordinary two-day quota sweep and expire after their month ends. No
provider content is kept in the provider clock/counter records.

Google Maps billing and free allowances are separate from general GCP credits and
may aggregate across projects sharing billing. Credit eligibility is **not confirmed**;
the caps bound development usage and are not a promise of a zero bill. Confirm Maps
billing coverage/allowances before increasing them or launching publicly. Monitoring,
budget alerts and a production provider-cap policy remain on the roadmap.

The native Google map keeps the app's branded pins and overlays. A small pinned
8.0.1 plugin patch registers `onMapReady` before native creation: the original
ordering missed the event and could lead to a native nil-view crash. `npm ci`
applies `scripts/patch-google-maps.mjs`; unexpected source changes fail the patch.
Creation waits for screen-entry animations to finish before measuring the native
container. The iOS smoke test asserts actual map readiness, rather than only the
surrounding screen. Map areas reserve space for bottom panels so SDK attribution
remains visible. Official attribution assets are kept unmodified, and third-party
attributions returned with hours are displayed. Native pin PNGs are reproducible
with `npm run maps:icons` after installing server development tools.

Public development notices are available at `/legal/privacy` and `/legal/terms`,
linked from You → Your account. They describe provider/location sharing, deletion,
Google's additional terms and the separate demo reward behavior.

Sources: [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies),
[Routes policies](https://developers.google.com/maps/documentation/routes/policies),
[Places data fields](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places),
[Routes response fields](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes),
[Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing),
[Capacitor map plugin](https://capacitorjs.com/docs/apis/google-maps).

## Independent outings and offline commands

Deployed to `quavi-api-00012-8jk` from `fe25491` on October 18, 2026; migration
005 and the expanded runtime DML grants completed, and readiness returns ready.
28 client and 53 backend tests pass. Live disposable-account checks verified
migration, isolation, idempotent replay, conflicts and profile/outing separation.
The native iPhone SE restores the migrated outing after stop/relaunch.

Migration `005_outings.sql` introduces `outings`, `outing_operations` and an
`outing_accounts` migration marker. Runtime DML grants and account deletion include
all three. GET copies legacy stories/progress once under the existing account
transaction/lock. New clients send `X-Quavi-Outings: 1`; a legacy client cannot PUT
a whole-account save after migration. Update every device that uses that account.

Outing create and patch commands include a UUID operation ID. The server records a
canonical request fingerprint in the same transaction as the outing write. An
identical retry returns the current record without another revision increment;
reusing the ID for a different payload returns 409. Receipts live with the outing
until account deletion, so a long-offline retry does not outlive its receipt.

Patches carry a path, expected previous value and desired value. Distinct fields
merge without replacing the record; a different current value returns 409. A
request whose desired value is already present can converge. Identity/prototype
paths, invalid lifecycle transitions, oversized records and unowned/unuploaded
photos are rejected. Limits: 500 outings, 128 KiB per record, 8 MiB total outing
content per account, plus the existing authenticated request quota. No GPS trail
is stored, and transient Google facts are scrubbed from durable content.

The client atomically checkpoints its account-scoped IndexedDB records/outbox,
uploads photos, checkpoints prepared references, then sends the operation. A
conflict retains the local projection, blocks that outing only and supports
explicit cloud/local resolution. Profile snapshot syncing stays separate. The reward-ledger phase below supersedes
client-owned demo balances. Media
maintenance checks outing references before removing an orphan.

Verification includes the actual shipped JavaScript journal calling Fastify and
PostgreSQL through simulated offline transport and lost responses. Physical iPhone
airplane-mode photo capture, forced relaunch and lock/resume remain acceptance work.

## Server-owned demo rewards (migration 006)

`GET /v1/me/rewards` returns confirmed balances. `POST
/v1/me/rewards/redemptions` accepts a stable UUID operationId and a known offerId.
New clients send `X-Quavi-Rewards: 1`; outing operations return the authoritative
rewardState. Existing account locks serialize awards and spending across API
instances. Runtime access to ledger/plan/request tables is append-only; deletion
cascades from the private account record.

Legacy totals are snapshotted at migration for display, never spendable credit.
Known task plans award at most 25 XP per outing / 100 per UTC day, and at most
100 coins per UTC day. Only confirmed XP generates earned demo tokens. Tasks and
arrival are self-reported participation, not anti-fraud proof for real funding.
Activated accounts reject writes from older clients. Upgrade all tester phones;
rolling back only the client does not undo account activation.

Verification: 63 backend tests and 30 client tests, including the shipped offline
journal against the API, concurrent spending, duplicate task awards, forged totals,
legacy migration, deletion and address-disambiguated Explore selection.

Deployed October 18, 2026 to `quavi-api-00013-sbf`, serving all development traffic
from source `197a5bd`. Migration `006_rewards.sql` completed. Live disposable-account
checks verify task XP, duplicate replay, one-time welcome, insufficient funds,
forged totals and deletion blocking; signed-in UI shows the same confirmed XP and
receipt. Physical outdoor/offline acceptance remains deferred by the user.
