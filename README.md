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
| Friends and circle | Signed-in exact handles, requests, accepted friends, private feed, story/photo access controls, block/report; anonymous sample circle | Notifications, moderation tooling and wider-beta acceptance |
| Mood-based plans and captions | Signed-in nearby openings use worldwide Overture venues through the server; anonymous openings and captions keep scripted demo behavior | Admission/access validation, grounded captions and stronger venue quality controls |
| Explore | Live Photon/Nominatim search, Google Maps and signed-in Google walking routes | Reliable provider setup, venue/hours validation, quotas and error handling |
| Location and arrival tasks | Native iPhone foreground GPS or browser GPS, explicit demo walking, accuracy/freshness gates and resume checks | Outdoor device acceptance; background tracking only if selected |
| Sharing | Browser share/clipboard and local shared status | Native sharing validation and actual delivery to other accounts |
| XP, coins and demo partner rewards | Signed-in server ledger, confirmed XP, offline commands and one-time fictional offers; anonymous local demo | Stronger participation evidence, real partners and funding are deferred |
| Operations | Cloud Run dev deployment, Secret Manager, limited runtime DB privileges, Cloud SQL backups/PITR, private bucket | CI, production environment, alerts/budgets, restore drill, release/signing setup |

Product direction: preserve all prototype features on iPhone and support any city.
The user confirmed this repo is the full implementation: there is no separate
backend to integrate. Demo partner rewards are the chosen reward model for now.
Background tracking during active detours is recommended but still needs a decision.

## Demo partner rewards

Open **You → Browse demo rewards**. Quavi Demo Café and Quavi Demo Bookshop are
fictional partners, with no actual funding, merchant agreements or discounts.
Every offer and redemption screen is labeled demo-only and non-redeemable.

- Signed-in accounts receive XP and coins from a server ledger. Each 1,000
  confirmed XP unlocks one earned demo reward; café and bookshop each spend one.
- Welcome is free once per account; each other offer can be tried once per account.
  All partners and receipts remain fictional and cannot be redeemed with merchants.
- Old demo XP stays visible in your level, but does not create spendable credit.
- Offline task changes and redemptions queue on the device. Pending actions never
  become confirmed XP or spent rewards until the server acknowledges them.
- Anonymous demo mode retains local balances and resets separately.
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
name is necessary because Apple reported that “Quavi” is already in use.
**1.0 (10)** is verified **Testing** in Quavi Development on October 18, 2026.
Open TestFlight on the accepted tester's iPhone, tap **Update**, and confirm
**1.0 (10)** in You. Update every device using a migrated account: old builds'
whole-document writes cannot replace independent outing records or server-owned rewards. Earlier builds
remain listed as release history, not a safe persistence rollback. App Store
publication and external tester review remain separate release steps.

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

### Account setup and October 18 bug pass

New accounts start at About you with blank identity/age fields and zero XP, coins,
streak and badges. Setup saves an account-specific step through interests and avatar
customization. Returning completed profiles open Home; a stale online device reads
its cloud state before selecting that entry screen. Known accounts can open offline;
unknown offline accounts show retry/log-out recovery instead of being treated as new.
Existing profiles without a step marker retain their completed behavior when they
already have a name and age answer. Anonymous demo progress stays separate, and demo
import remains an explicit action before account detour activity has been saved.

The visual pass restores larger opening-card characters, collapses the selected
starting point to an editable summary, keeps story titles above provider caveats,
reduces transit-map clutter, and uses the existing Quavi logo for the app icon.
Interests, customization and mood screens now allow vertical scrolling when their
content exceeds a smaller phone. Fixed map screens still cannot scroll as pages; recenter controls stay above the bottom panel, with a compact walking summary on short phones.

Verification: 24 client tests and 43 server tests; real fresh-account signup and
interrupted-setup reload; iPhone 17 account startup; a 25-command Maestro flow on
iPhone SE through onboarding, mood, openings, starting the story and demo arrival. Production
dependency audits report no known vulnerabilities for client or server. The saved
flow is `.maestro/onboarding-small-phone.yaml` and must run on a disposable simulator.
Outdoor GPS/arrival, physical lock/resume and airplane-mode photo recovery still
need physical-device acceptance. Friends remain roadmap work. Authoritative demo rewards are implemented in build 10 below.

## Agreed system design and implementation order

Keep the React/Capacitor UI and native Google Maps/GPS for the beta, preserve the
prototype design, and keep Quavi on GCP. Improve the implementation in this order:

1. **Independent outings and offline actions (implemented in this branch).** Each
   outing has a stable ID, lifecycle, chapter, task/coin progress, notes/photos,
   shelf membership and its own server revision. An account-scoped IndexedDB
   journal checkpoints pending changes and retries them with stable operation IDs.
   Separate fields merge; same-field conflicts retain local edits and require a
   choice in You → account saves. Profile edits no longer carry outing content.
2. **Server-owned rewards (implemented).** Idempotent server commands and an
   append-only ledger own signed-in awards and demo spending. Arrival/task
   participation remains self-reported demo evidence, not proof of a visit or
   purchase. Real partner verification and funding remain later work.
3. **Private circle foundation (implemented).** Exact handle lookup, explicit
   friend requests/acceptance, friends-only stories, removal, blocking, private
   reports and authorization on story/photo reads. Push notifications and
   moderation tooling remain next steps.
4. **Physical acceptance and mobile improvements.** Test real outings, gestures,
   accessibility, battery and lifecycle behavior; use those results to decide any
   additional native UI migration. Add background tracking only during an explicitly
   started outing, with a visible stop control, in a later implementation phase.
5. **Operations.** Separate staging/production from dev, automate deploys, monitor
   failed saves/provider calls, exercise restore and configure provider budgets.

### Independent outings and offline recovery

The new client stores each outing separately from profile/preferences. Supported
lifecycle: planned → active ↔ paused → completed, with explicit abandonment.
Completed/abandoned records cannot be reopened through stale queued changes.
Notes, photos, task progress and collected coins are optimistic on the phone;
IndexedDB atomically stores the base records and retry journal. Photo data stays
on-device until uploaded privately; the prepared media references and operation ID
are checkpointed before submission. Lost responses can be retried without applying
an operation twice. Typing during a slow upload queues a later change.

Reconnect and foreground resume fetch server records before replaying pending
changes. Different note/task fields merge. A conflict blocks only that outing;
other outings continue syncing. You can use its cloud version or explicitly keep
local edits. Storage failures show an unsaved warning. Saved notes/photos and tasks
at an already reached stop can be edited offline; new directions/hours checks need
internet, and live arrival still needs a fresh, precise GPS fix. Background GPS is
not added by this change.

Legacy cloud stories migrate once under the account lock. Legacy local edits are
retained for migration/conflict review, rather than silently discarded. Older app
builds must be updated after an account migrates: their whole-document writes are
rejected to prevent overwriting independently saved outings. Legacy snapshot fields
remain until the next new-client profile save; they are not the outing authority.
Deleting an account immediately removes outings and operation receipts, and photo
cleanup checks both profile and outing references.

That outing-only phase retained client demo rewards; build 10 below adds server-owned accounting.
Verification: 28 client tests and 53 backend tests pass, both TypeScript builds
pass, and the 25-command native iPhone SE flow reaches demo arrival. A separate
signed-in native check restores a migrated outing after stop/relaunch and shows
Outings saved. Live disposable-account API checks pass against development
revision `quavi-api-00012-8jk` (source `fe25491`). Physical airplane-mode
photo/lock/relaunch acceptance remains a release check.

## Build roadmap

Keep all prototype features and its visual identity; target iPhone first and
support any city. Demo partners stay in the initial release. This is the build
order. The account/save backend and first live detour checks are deployed; social and
production partner verification and the reliability stages below still need implementation.

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
| Done: independent outing records and offline journal | Private per-outing records/revisions, lifecycle, one-time legacy migration, IndexedDB retry journal, field-level conflicts, idempotent operation receipts, photo-reference retention and deletion | API/PostgreSQL tests exercise cold offline replay, lost acknowledgement, concurrent fields, conflicts, account isolation and deletion; physical-device acceptance remains below |
| Deferred by user: physical outing acceptance before wider beta | Outdoor GPS/arrival checks on the user's iPhone; camera/native sharing; airplane-mode note/photo recovery; denied/approximate GPS; cold relaunch and small/large phone layouts | Finish a real outing, lock/resume, add content offline, reconnect and verify the same progress from a second session |
| Planned: active-outing background tracking | Track only during an explicitly started outing, with a clear stop control; implement permission, battery, privacy and notification behavior | Current build remains foreground-only and explains that policy before using GPS |
| Done: private circle foundation | Exact handle discovery, requests/acceptance/cancel/decline/remove, friends-only completed stories, stop sharing, private story/photo reads, block/unblock and private reports | API tests verify A→accepted B access and C denial, pending requests, races, removal/unshare/block and deletion; notification delivery and moderation operations remain below |
| Next: social delivery and moderation operations | Push/in-app notifications, report-review workflow/tooling, stronger abuse controls and feed pagination | Request/share notices reach authorized recipients; reports can be triaged and resolved privately; access revocation remains enforced |
| Done: server-owned demo rewards | Deterministic task plans, append-only ledger, one-time redemptions, offline commands and legacy display-only XP | 63 backend and 30 client tests cover duplicate awards, concurrent spending, inflated balances and lost acknowledgements; partners remain fictional |
| Done: explicit Explore location selection | Address-bearing search suggestions, keyboard selection and stale-response cancellation | Searching never silently chooses the first hit; the selected result coordinates drive the route |
| Done: map motion and scroll repair | Native projected artwork, stable zoom anchors and marker identity, pulse/coin motion, collision-aware labels, compact provider credit, vertical-only content scrolling and safe-area clipping | 23 client tests pass; native zoom, artwork taps, selected route and active walk checked; signed 1.0 (5) verified Testing in Quavi Development |
| Done: first internal TestFlight beta | App Store Connect record, explicit app identifier, signed 1.0 (4), real-use onboarding, visible build label and beta instructions | Apple shows Testing in Quavi Development; owner is an accepted tester; installation on the physical phone is the next user step |
| Beta and launch | CI, monitoring, backups, provider limits/budget, privacy disclosures, final app icon/splash, accessibility and small/large iPhone QA, TestFlight and App Store submission | Beta testers complete the full flow; no blocking failures remain; release metadata matches actual behavior |
| Later: real partners | Partner agreements, funding model, eligibility/expiry, merchant validation, redemption disputes and abuse prevention | Real offers launch only after participating merchants and funding are secured |

Open decisions: Google Maps budget/credit eligibility and AI provider; initial age policy and story visibility. Active-outing-only background tracking is agreed for a later phase; the current build remains foreground-only.
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

### Server rewards and Explore search — build 10

Migration `006_rewards.sql` snapshots pre-existing demo totals for display only.
Signed-in clients cannot overwrite XP, coins, badges or redemption history. A
server-frozen task plan limits XP to 25 per outing and 100 per UTC day; confirmed
map/chapter coins are capped at 100 per day. Rechecking tasks, retrying a lost
response and simultaneous spending on two devices cannot duplicate value.
Account deletion purges the private ledger, task plans and redemption receipts.

Reward activation is per account. Once activated, older clients must update before
writing saves. A client-only rollback is insufficient for an activated account.
Participation still relies on reported arrival and task completion: this supports
fictional demo rewards, not funded rewards or merchant verification.

Explore now offers named places with addresses before selecting a destination.
The selected result's coordinates are retained. Search uses the existing
[Photon provider](https://github.com/komoot/photon), with 500 ms debounce,
cancellation, explicit empty/error states and keyboard navigation. Production
search availability, provider budgets and a managed/self-hosted option remain
operations work. Outdoor offline/lock/resume acceptance remains user-deferred.

Live development verification passed against `quavi-api-00013-sbf` (source
`197a5bd`): deterministic task XP, duplicate replay, one-time welcome sample,
insufficient funds and forged profile totals. A fresh signed-in UI session showed
the confirmed 12 XP and synced demo receipt. The disposable account was then
blocked for deletion and its temporary credentials removed. Native iPhone SE
verification confirms address suggestions fit above the keyboard and selecting
Springfield Park opens the New York destination. Signed archive/upload 1.0 (10)
succeeded; **1.0 (10)** is verified **Testing** in Quavi Development.

### Friends and private sharing — build 11

Signed-in **You → Friends** shows your handle. Share it with a friend; exact-handle
lookup exposes only a name, handle and public profile ID, never an email or starting
location. Requests need the recipient's acceptance. Old locally typed demo names
are not real friends and cannot grant access. Anonymous demo mode stays separate.

From a saved, completed story choose **Share with friends**, preview the content,
and explicitly publish to accepted friends. New accepted friends can see existing
shared stories. Saved edits update the shared story; use **Stop sharing** to revoke
it. **Export a copy** is a separate action for your own story. Private circle reads
are online-only; other people's stories/photos do not enter the offline journal.
The feed shows the latest 50 accessible posts and refreshes on entry/resume and
periodically while active. A direct story or photo read always checks server access.

The shared view includes title, captions, intro and previewed task notes/photos.
It omits starting coordinates, GPS/arrival records, preferences and unknown draft
fields. Unsharing, removing/blocking a friend or deleting an account prevents new
reads. Issued photo links may remain valid for five minutes; copies/downloads
cannot be recalled. Blocks remove requests/friendships and unblocking does not
restore them. Reports are private and retained at most 90 days (or until a related
account is deleted); operational review is manual for this development phase.

Migration `007_social.sql` keeps social authority separate from editable profile
snapshots. Pair locks and unique rows handle repeated requests, crossed requests,
concurrent accept/block and duplicate publication. Request/search/report quotas
bound abuse. Account deletion cascades profiles, relationships, blocks, posts and
reports. Push notifications, a moderation dashboard, pagination and wider-beta
social acceptance remain work. Outdoor iPhone/offline checks remain user-deferred.

Verification for this phase: **74 backend tests and 32 client tests** pass, both
TypeScript builds pass, iPhone 17/SE builds succeed and the 25-command SE smoke
flow still passes. Three disposable live accounts verified UI publication/request,
recipient acceptance on iPhone, private story/photo delivery, unrelated-account and
pending denial, owner-media isolation, blocking, unblock without restored access,
re-request/acceptance and unshare revocation. The open iPhone story cleared after
revocation; a cold relaunch reopened the current authorized post. Native reporting
recorded a private report successfully. Temporary accounts were blocked for
scheduled deletion and credential files removed after acceptance.

Development revision `quavi-api-00014-flw` serves all traffic from backend source
`4a50dfd`; migration 007 completed. Mobile layout refinements are in `0a5ecf4`.
Signed **1.0 (11)** archive is ready, but upload currently needs the Mac unlocked
so Xcode can access the saved Apple account. **1.0 (10)** remains the latest
verified TestFlight build until that upload is completed.
