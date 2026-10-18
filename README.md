# Quavi

"Plans fell through? Good." A prototype where cancelled plans become a story: pick a mood, pick an opening, walk three chapters, add moments, then tell the story.

```
npm install
npm run dev      # http://127.0.0.1:5199
npm run build
```

## iPhone app

The iOS app packages this same React prototype with Capacitor. Screens, fonts,
characters, animations and demo data share the web implementation. The built
assets are bundled in the app; it does not require the Vite server to run.

Requirements: Node.js 22+, Xcode 26+, and an installed iOS simulator runtime.

```sh
npm ci
npm run ios:sync   # build the web app and copy it into the iOS project
npm run ios:open   # open ios/App/App.xcodeproj in Xcode
# Or choose a simulator interactively:
npm run ios:run
```

In Xcode, choose the `App` scheme and an iPhone simulator, then Run. After every
web code change, run `npm run ios:sync` before rebuilding in Xcode. For a physical
iPhone, select your Apple development team in Signing & Capabilities and choose
a connected phone. `com.quavi.app` is the development bundle identifier; confirm
the final identifier and team before distributing through TestFlight.

This is a development build, not a production release. Real email/password
accounts, private cloud saves and photos now connect to Quavi dev. You can still
explore the separate local demo. AI generation remains scripted. Maps and place
lookups still need internet. Foreground GPS, photo picking, sharing, keyboard
behavior and the complete story flow need physical-iPhone testing; background
location and native notifications are not implemented by this shell.

### Implementation audit

| Feature | Current implementation | Needed for a real release |
| --- | --- | --- |
| Accounts | Firebase accounts, recovery/verification controls and confirmed account deletion connected to Quavi dev | Email-delivery acceptance and extended account-lifecycle QA |
| Stories, lists, profiles, photos | Deployed private PostgreSQL saves, revision-aware sync, separate account caches, explicit demo import and private GCS photos | Extended multi-device/offline QA and richer photo retry/conflict resolution |
| Friends and circle | Locally added names and bundled example stories | User lookup, friendship requests, shared feed, privacy controls |
| Mood-based plans and captions | Signed-in nearby openings use worldwide Overture venues through the server; anonymous openings and captions keep scripted demo behavior | Live opening-hours/admission validation, grounded captions and stronger venue quality controls |
| Explore | Live Photon search, Nominatim detours, OSM map tiles and walking routes | Reliable provider setup, venue/hours validation, quotas and error handling |
| Location and arrival tasks | Browser foreground GPS or demo walking | Native device validation; background tracking if selected |
| Sharing | Browser share/clipboard and local shared status | Native sharing validation and actual delivery to other accounts |
| XP, coins and demo partner rewards | Local XP, fictional offers, locked/unlocked states and persistent simulated redemptions | Server-authoritative reward history and sync; real partners/funding are deferred |
| Operations | Cloud Run dev deployment, Secret Manager, limited runtime DB privileges, Cloud SQL backups/PITR, private bucket | CI, production environment, alerts/budgets, restore drill, release/signing setup |

Product direction: preserve all prototype features on iPhone and support any city.
The user confirmed this repo is the full implementation: there is no separate
backend to integrate. Demo partner rewards are the chosen reward model for now.
Background tracking during active detours is recommended but still needs a decision.

## Demo partner rewards

Open **You → Browse demo rewards**. Quavi Demo Café and Quavi Demo Bookshop are
fictional partners, with no actual funding, merchant agreements or discounts.
Every offer and redemption screen is labeled demo-only and non-redeemable.

- The welcome coffee sample can be tried immediately, once per demo, without XP.
- Every 1,000 lifetime XP unlocks one earned reward. Café and bookshop offers each
  use one earned reward and can each be tried once per demo.
- Using a demo reward does not deduct lifetime XP, levels, coins or badges.
- Redemption history is saved on the device and syncs when signed in. Restarting
  the separate local demo clears its history. The server does not yet validate awards
  or redemption eligibility; these values remain demo data.
- There are no valid vouchers, cash balances, payments or real merchant redemption.

Run the reward eligibility and redemption tests with `npm test` (Node.js 22.18+).

## Build roadmap

Keep all prototype features and its visual identity; target iPhone first and
support any city. Demo partners stay in the initial release. This is the build
order. The account/save backend is deployed; the detour, social and trusted reward
services below still need implementation.

| Order | Work | Completion check |
| --- | --- | --- |
| Done | iOS shell, safe areas, keyboard behavior, navigation fixes and demo partner rewards | App opens on the user's iPhone; simulator flows and reward tests pass |
| Done: dev accounts and cloud saves | Firebase Auth + Cloud Run API + Cloud SQL PostgreSQL + private Cloud Storage in `quavi-dev-dc824`; real sign-in, recovery/verification controls, account caches, revision conflicts, explicit demo import and private photo transfer | Live two-account isolation, concurrent-write conflicts and real photo round trip pass; simulator signs in, imports demo data and restores it after clearing local storage |
| Done: account deletion and data guards | Recent-password confirmation, durable deletion requests, immediate access blocking, scheduled Auth/SQL/photo cleanup, immutable verified photos, validated saves and shared account quotas | Emulator/PostgreSQL tests cover deletion retries and races. Live checks verify private uploads and immediate deletion blocking; final scheduled cleanup is tested with disposable accounts |
| Done: first city-aware slice | Search an area or use GPS; generate up to three nearby routes from recent Overture data, with duration/interest ranking and actual map coordinates; show unknown hours/prices explicitly | Live API returns grounded routes in NYC and SF; tests cover sparse coverage, age restrictions, coordinates, deduplication and strict categories |
| Remaining data/operations hardening | Email delivery, richer sync conflict/photo retry UX, app attestation, deployment CI, budget/monitoring alerts and restore drill | Physical-device lifecycle checks and operational recovery/alert tests pass |
| In progress: detour reliability | Google Maps on iPhone/web; Google walking checks and reported hours for expected arrival/full stay at generation and Start; unknown hours stay explicit, closed matches are excluded and Google responses stay out of durable saves. Next: entry/access validation and pause/resume rechecks, strengthen category quality, replace scripted captions with grounded generation, and test more regions, languages and sparse areas | Complete a relevant detour in NYC and another city; closed or unavailable places are excluded and uncertain data is shown honestly |
| Native outing experience | Validate foreground GPS, camera, native sharing, resume and permission-denied behavior; decide active-detour background location and arrival notifications; recover safely from offline/interrupted sessions | Complete a real outing on iPhone, including locking/resuming the phone under the selected tracking policy |
| Friends and real story delivery | User discovery, requests/acceptance/removal, private circle feed, story sharing controls, blocking/reporting and notifications | A story shared by account A appears for an authorized friend B and stays hidden from unrelated C |
| Reliable demo reward loop | Move XP awards and one-time demo redemption to the backend; preserve badges/levels and migrate local demo data; maintain explicit demo labels | Duplicate requests and concurrent devices cannot award or spend the same reward twice; no cash or real discount is promised |
| Beta and launch | CI, monitoring, backups, provider limits/budget, privacy disclosures, final app icon/splash, accessibility and small/large iPhone QA, TestFlight and App Store submission | Beta testers complete the full flow; no blocking failures remain; release metadata matches actual behavior |
| Later: real partners | Partner agreements, funding model, eligibility/expiry, merchant validation, redemption disputes and abuse prevention | Real offers launch only after participating merchants and funding are secured |

Open decisions: Google Maps budget/credit eligibility and AI provider; foreground-only
versus active-detour background tracking; initial age policy and story visibility.
Any-city support is a target, with explicit no-result fallbacks where coverage is poor.

### Selected backend stack

Use GCP as the primary cloud, given the available credits and no existing cloud
preference. Keep React/TypeScript/Capacitor on iPhone; use Firebase Authentication,
a TypeScript API on Cloud Run, Cloud SQL PostgreSQL and private Cloud Storage.
AWS is not part of the initial deployment. Provider-specific map/AI eligibility
still needs checking against the actual credits.

The deployed API and operations instructions are in [server/README.md](server/README.md).
Development API: `https://quavi-api-532892298664.us-central1.run.app` (region
`us-central1`). Billing is linked to Framewise Health Main (ending DE54D6).
Every cloud command uses an explicit Quavi project; the unrelated active CLI
project is unchanged.

On iPhone, open **Quavi → You → Log in or create an account** (or use the welcome
screen). A new account starts separately from the demo. Before editing it, choose
**You → Import this device’s demo → Import demo into account** to copy demo progress
into that empty account. Existing cloud saves cannot be replaced by importing.
Delete an account from **You → Your account → Delete account**, confirm your
password, and explicitly choose whether to clear the separate local demo. Account
access stops when accepted; cleanup retries in the background after upload links
expire. The app explains recovery-copy retention before confirmation.

Account edits save automatically; **You → Your account** shows saving/offline/conflict
status. Signing out preserves each account’s separate pending cache and returns to
the local demo. A conflict requires explicitly loading the cloud copy before saving
again; this replaces unsaved local account edits.

`src/cloud-config.json` contains public Firebase client identifiers and the dev API
URL, not server credentials. Its browser API key is restricted to Authentication
and token refresh APIs. Passwords, database URLs and service-account keys never ship
in the app. Dev accounts and data are not the eventual production environment.

### Mobile verification

Simulator walkthrough covers the named onboarding, home, plan, active detour,
completion, story editor/reader, profile, lists, friends/circle and Explore routes,
including task notes and local persistence. This is a screen/navigation check,
not complete production acceptance or a substitute for physical-device testing.

Run the navigation/search regression flow with Maestro on a **disposable iPhone
simulator** after installing a build (it resets that simulator's Quavi demo data):

```sh
maestro test .maestro/ios-smoke.yaml
```

- **Stack:** Vite + React + TypeScript with a Capacitor iPhone shell. Anonymous demo state stays in `localStorage` (You → "Clear & restart demo" resets it). Signed-in state uses isolated local caches and the deployed API in `server/`; photos use stable private media IDs.
- **Brand:** colors, ABC Areal + Fraunces Soft, flat buttons with the brand's hover/pressed behavior (`src/index.css`).
- **Characters:** the Persona Kit ducklings, rendered as SVG from the brand file's vector data (`src/brand/partsData.ts`, `Persona.tsx`). Colorway rules keep accessories from matching the body.
- **Flow:** Splash → Welcome → (Log in | Interests → Make your Quavi) → Home → Mood → Openings → Writing → Story details → Active story (add moments, swap chapters) → Complete → Tell your story → Story shelf. Also Explore (map, destination route, stop preview), Friend's story + save to lists, Profile.
- **Content:** openings, chapters and captions are scripted in `src/data.ts`; the "writing your plot twist" screen is a timed animation, not an AI call yet.

## Arrival tasks, tracking & the game map

- **Arrival tasks:** every stop has 3 tasks with XP (e.g. at Corner Coffee: order a pastry you've never tried, ask the barista what they'd order). They unlock automatically when you're within 70 m of the stop (`ARRIVE_RADIUS` in `src/data.ts`). Clearing all three earns a bonus, coins and a place badge.
- **Tracking:** `src/tracking.tsx`. *Demo walk* fast-forwards a walker along the route; *My location* uses `navigator.geolocation.watchPosition`. **Limit:** a web page can't track in the background or when closed. That needs a native app (iOS "Always" location + region monitoring, Android foreground service + geofencing), e.g. by wrapping this UI in Capacitor and moving `tracking.tsx` to a background-geolocation plugin.
- **Game map:** `src/GameMap.tsx`: XP/level HUD, your Quavi walking the trail, pulsing quest pins, collectible coins, ✓ stamps on cleared stops. Used on Active story and Explore.


### Try city-aware detours

Sign in, then **Home → Take a detour → choose a mood → Show me 3 openings**.
Search for a city/neighborhood, choose the matching area, or use **Use my location**.
Choose 30 minutes, one hour or two hours. The service returns up to three options
with real venue IDs/coordinates; it returns an explicit no-results state when it
cannot assemble three suitable stops. Choosing another city previews its route
with the demo walker; using GPS enables foreground location tracking.

Venue data is from Overture Maps, queried through Quavi’s GCP project and cached
for 24 hours. The app displays the dataset update date and attribution. Operating
status in this dataset means the business is listed as operating; it does **not**
mean open right now. Live hours, entry restrictions, accessibility, admission/prices
and safe pedestrian access remain unverified. Walking times are estimates; the
existing walking directions service is used during navigation. Any-city coverage
is a goal, with honest sparse/no-result states rather than fictional substitutions.
Explore shows a signed-in account’s real recent detour stops; anonymous demo pins
are labeled. Destination-search failures do not substitute a sample city for accounts.


### Google Maps development setup

Install with `npm ci` so the pinned native map-ready listener patch is applied.
Google Maps provides the base map, signed-in walking directions and transient venue
hours checks. Overture remains the independently saveable venue catalog; area and
additional destination searches still use Photon/Nominatim. Missing or ambiguous
hours are not treated as confirmed open. Planned visits are rechecked before Start.
Saved outings do not retain Google hours or route responses; they need a new check
when reopened. Admission, entrances, accessibility and current conditions remain
unverified. Friends, demo rewards, captions and other roadmap items retain their
existing implementation status.

The backend uses its attached GCP service account for Google requests. Public SDK
keys are restricted by bundle/origin and API; backend development caps are 500
Places requests and 500 Routes requests per calendar month, and browser map loads
are capped at 100/day. General GCP credits have not been confirmed to cover Maps.
See [server operations and provider notes](server/README.md#google-maps-reported-hours-and-walking-directions).
