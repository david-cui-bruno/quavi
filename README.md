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
| Mood-based plans and captions | Signed-in nearby openings use worldwide Overture venues through the server; anonymous openings and captions keep scripted demo behavior | Admission/access validation, grounded captions and stronger venue quality controls |
| Explore | Live Photon/Nominatim search, Google Maps and signed-in Google walking routes | Reliable provider setup, venue/hours validation, quotas and error handling |
| Location and arrival tasks | Native iPhone foreground GPS or browser GPS, explicit demo walking, accuracy/freshness gates and resume checks | Outdoor device acceptance; background tracking only if selected |
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

## iPhone beta

The beta supports real use against the Quavi development backend. Choose
**Log in or create an account**, finish your profile, then search an area or use
GPS to generate a nearby detour. Follow its checked walking route and add notes
and photos. Tracking pauses when the app is locked or backgrounded and checks
again when you return. Availability and coverage can still be incomplete.

**Explore the demo** remains available for the scripted West Village experience.
Demo partners, discounts, coins, XP and social examples are not real merchant
rewards or a completed social service. Do not navigate to invented demo venues.
See **You** for the installed version/build number.

App Store Connect: [Quavi: Take a Detour](https://appstoreconnect.apple.com/apps/6824241658/testflight),
bundle `com.quavi.app`, internal group **Quavi Development**. The longer store
title is necessary because Apple reported that “Quavi” is already in use. On
October 18, 2026, **1.0 (4)** finished processing and its internal-group status
was verified as **Testing** with one accepted tester. Builds 2 and 3 were not
assigned to the group. Install the TestFlight app on iPhone using the owner's
Apple account, then open Quavi's invitation/listing. The map-motion update,
**1.0 (5)**, is verified **Testing** in Quavi Development on October 18.
Open TestFlight on the accepted tester’s iPhone and tap **Update** for Quavi;
confirm **1.0 (5)** in You. Build 4 remains available as a fallback. App Store publication and external tester review remain separate release steps.

### Map fidelity

Google Maps supplies the street map and live walking geometry. Quavi’s original
vectors render as a separate geographic artwork layer: customized avatar,
colored/selected silhouettes, place-name pills, circular coins, dotted future
route and orange completed route. Native camera callbacks project artwork without
rebuilding markers on zoom. Labels wrap, avoid other pins/labels, and stay clear
of measured screen controls and attribution; quest labels hide at distant zooms.

Original pulse timing and coin bobbing run in native Core Animation (DOM/CSS on
web), pause offscreen/background, and respect Reduce Motion. Google recognizes
tap versus pan before dispatching artwork selection. Map gestures stay north-up
and flat. The outer screen and native placeholder cannot scroll or bounce; long
content retains vertical scrolling below the iPhone status area. Google’s legal
branding stays visible, with compact provider credits on cards. Route-preview
numbered pins now stay inside the illustration.

The underlying Google cartography differs from the prototype’s OpenStreetMap.
Artwork and transient Google responses remain memory-only. The pinned SDK patch
is reapplied by `npm ci` and rejects unsupported source changes. Client regression
coverage exercises the actual map component: zoom in/out and cloned autosave
props preserve marker/path identity; removing a stop removes only that marker.
Physical outdoor acceptance remains on the roadmap.

## Build roadmap

Keep all prototype features and its visual identity; target iPhone first and
support any city. Demo partners stay in the initial release. This is the build
order. The account/save backend and first live detour checks are deployed; social and
trusted reward services and the reliability stages below still need implementation.

| Order | Work | Completion check |
| --- | --- | --- |
| Done | iOS shell, safe areas, keyboard behavior, navigation fixes and demo partner rewards | App opens on the user's iPhone; simulator flows and reward tests pass |
| Done: dev accounts and cloud saves | Firebase Auth + Cloud Run API + Cloud SQL PostgreSQL + private Cloud Storage in `quavi-dev-dc824`; real sign-in, recovery/verification controls, account caches, revision conflicts, explicit demo import and private photo transfer | Live two-account isolation, concurrent-write conflicts and real photo round trip pass; simulator signs in, imports demo data and restores it after clearing local storage |
| Done: account deletion and data guards | Recent-password confirmation, durable deletion requests, immediate access blocking, scheduled Auth/SQL/photo cleanup, immutable verified photos, validated saves and shared account quotas | Emulator/PostgreSQL tests cover deletion retries and races. Live checks verify private uploads and immediate deletion blocking; final scheduled cleanup is tested with disposable accounts |
| Done: first city-aware slice | Search an area or use GPS; generate up to three nearby routes from recent Overture data, with duration/interest ranking and actual map coordinates; show unknown hours/prices explicitly | Live API returns grounded routes in NYC and SF; tests cover sparse coverage, age restrictions, coordinates, deduplication and strict categories |
| Remaining data/operations hardening | Email delivery, richer sync conflict/photo retry UX, app attestation, deployment CI, budget/monitoring alerts and restore drill | Physical-device lifecycle checks and operational recovery/alert tests pass |
| Done: live provider foundation | Google Maps on iPhone/web; Google walking checks and reported hours for arrival/full stay at generation and Start; explicit unknown hours, closed-stop replacement, and transient Google responses kept out of durable saves | Live walking/open/closed checks pass; native Shibuya generation and Start/navigation pass; London generation and persistence exclusion pass; 42 server tests, 12 client tests and 26-step native smoke pass |
| Next: detour reliability | Validate entry/access; strengthen venue identity/category matching and multilingual coverage; replace scripted captions with grounded generation | Complete real outings in multiple regions, including closed stops, missing hours, sparse coverage and interrupted sessions |
| Done: foreground outing recovery foundation | Native while-in-use GPS, accuracy/freshness gates, explicit denied-location recovery, lock/background pause, transient checks after resume/reconnect and every five minutes, cached account startup and read-before-retry sync | Unit tests cover stale/inaccurate fixes, watch cancellation, session invalidation, autosave stability, offline replay and sync conflicts; simulator GPS, screen lock/resume and permission-denied flows pass |
| Next: physical outing acceptance | Outdoor GPS/arrival checks on the user's iPhone; camera/native sharing; airplane-mode note/photo recovery; denied/approximate GPS; cold relaunch and small/large phone layouts | Finish a real outing, lock/resume, add content offline, reconnect and verify the same progress from a second session |
| Optional background tracking | Decide whether active outings should track while locked and send arrival notifications; implement permission, battery and privacy behavior only if selected | Current build remains foreground-only and explains that policy before using GPS |
| Friends and real story delivery | User discovery, requests/acceptance/removal, private circle feed, story sharing controls, blocking/reporting and notifications | A story shared by account A appears for an authorized friend B and stays hidden from unrelated C |
| Reliable demo reward loop | Move XP awards and one-time demo redemption to the backend; preserve badges/levels and migrate local demo data; maintain explicit demo labels | Duplicate requests and concurrent devices cannot award or spend the same reward twice; no cash or real discount is promised |
| Done: map motion and scroll repair | Native projected artwork, stable zoom anchors and marker identity, pulse/coin motion, collision-aware labels, compact provider credit, vertical-only content scrolling and safe-area clipping | 23 client tests pass; native zoom, artwork taps, selected route and active walk checked; signed 1.0 (5) verified Testing in Quavi Development |
| Done: first internal TestFlight beta | App Store Connect record, explicit app identifier, signed 1.0 (4), real-use onboarding, visible build label and beta instructions | Apple shows Testing in Quavi Development; owner is an accepted tester; installation on the physical phone is the next user step |
| Beta and launch | CI, monitoring, backups, provider limits/budget, privacy disclosures, final app icon/splash, accessibility and small/large iPhone QA, TestFlight and App Store submission | Beta testers complete the full flow; no blocking failures remain; release metadata matches actual behavior |
| Later: real partners | Partner agreements, funding model, eligibility/expiry, merchant validation, redemption disputes and abuse prevention | Real offers launch only after participating merchants and funding are secured |

Open decisions: Google Maps budget/credit eligibility and AI provider; whether to extend the current foreground-only policy to active-detour background tracking; initial age policy and story visibility.
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
- **Tracking:** `src/tracking.tsx`. *Demo walk* fast-forwards a walker along the route; *My location* uses Capacitor Geolocation on iPhone and browser GPS on web. **Foreground policy:** iPhone uses native Capacitor GPS; web uses browser geolocation. Locking/leaving Quavi stops the watch and pauses demo walking and spoken directions. Returning requires a fresh position and reported-hours/walking checks for remaining stops. No background tracking or arrival notifications are enabled. GPS denial never selects the demo walker automatically.
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
status, when present, describes continued operation rather than current opening hours.
Missing catalog status remains unknown; it does not imply a closure. Google checks
reported hours for the planned arrival and stay, with unknown hours labeled explicitly.
Entry restrictions, accessibility, admission/prices and current street conditions
remain unverified. Signed-in walking times and directions use Google Routes. Any-city coverage
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


### GPS, lock/resume and offline recovery

Use **Tracking → My location** during an outing. Choose **While Using the App**
in iOS; Quavi never asks for Always access. The SDK requires an Always description
in Info.plist, but the app does not enable a background location mode. GPS needs a
fix no older than 20 seconds and accuracy within 50 m. Arrival unlocks only when
the distance plus reported uncertainty fits inside the 70 m arrival radius.
Missing permission, stale GPS and approximate location pause arrival checks;
**Retry GPS** explains the recovery. Demo walk remains an explicit choice.

A screen lock or app switch cancels current checks and spoken directions, stops
the GPS watch and pauses simulated walking. On return, a fresh fix, route and
reported-hours checks are required for the remaining stops. Checks also expire
after five minutes. Auto-saving the same outing does not trigger more map calls.
Unknown hours remain explicit; closures/provider failures pause guidance and offer
a retry or a different plan. This is not offline turn-by-turn navigation.

Signed-in cached plans open before a cloud read completes. Notes and progress are
cached on edit and retry when connected/foregrounded. Interrupted writes require a
remote revision read; differing cloud revisions stop writes and preserve the local
copy until the user resolves the conflict. Cached Google hours/directions remain
excluded. Map loading and live guidance require a connection. Private cloud photos
may require a new download; storage-full warnings mean the latest content is not
guaranteed to survive closing the app.

Verification: `npm test` includes injected offline/reconnect and delayed-response
cases plus a React regression against repeated paid checks after autosaves. Native
simulator checks use a disposable account and simulated London GPS, including
screen lock/unlock, revoked location permission and cold reopening. Outdoor GPS,
actual airplane-mode transfers and battery behavior still require physical-device
acceptance. Do not reset a personal device or account to run the disposable tests.

Provider references: [Geolocation](https://capacitorjs.com/docs/apis/geolocation),
[app lifecycle](https://capacitorjs.com/docs/apis/app),
[network changes](https://capacitorjs.com/docs/apis/network).
