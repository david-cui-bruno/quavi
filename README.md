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

This is the first mobile prototype, not a production release. Authentication,
AI generation and persistence keep their existing demo behavior. Maps and place
lookups still need internet. Foreground GPS, photo picking, sharing, keyboard
behavior and the complete story flow need physical-iPhone testing; background
location and native notifications are not implemented by this shell.

### Implementation audit

| Feature | Current implementation | Needed for a real release |
| --- | --- | --- |
| Accounts | Email/password format checks and a local flag | Authentication, recovery, account deletion |
| Stories, lists, profiles, photos | React state persisted in localStorage | Database, media storage, access rules, synchronization |
| Friends and circle | Locally added names and bundled example stories | User lookup, friendship requests, shared feed, privacy controls |
| Mood-based plans and captions | Preset openings, rules and text templates | City-aware recommendations and server-side generation |
| Explore | Live Photon search, Nominatim detours, OSM map tiles and walking routes | Reliable provider setup, venue/hours validation, quotas and error handling |
| Location and arrival tasks | Browser foreground GPS or demo walking | Native device validation; background tracking if selected |
| Sharing | Browser share/clipboard and local shared status | Native sharing validation and actual delivery to other accounts |
| XP, coins and dollar rewards | Client-side counters and a displayed dollar conversion | Trusted reward ledger; redemption/partner system if rewards become real |
| Operations | Local builds | CI, environments, monitoring, backups, release/signing setup |

Product direction: preserve all prototype features on iPhone and support any city.
Real-money rewards and background tracking remain product decisions. A backend
elsewhere is not ruled out by this audit; none is implemented or connected here.

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

- **Stack:** Vite + React + TypeScript. No backend; state is saved in `localStorage` (Profile → "Log out & restart demo" resets it).
- **Brand:** colors, ABC Areal + Fraunces Soft, flat buttons with the brand's hover/pressed behavior (`src/index.css`).
- **Characters:** the Persona Kit ducklings, rendered as SVG from the brand file's vector data (`src/brand/partsData.ts`, `Persona.tsx`). Colorway rules keep accessories from matching the body.
- **Flow:** Splash → Welcome → (Log in | Interests → Make your Quavi) → Home → Mood → Openings → Writing → Story details → Active story (add moments, swap chapters) → Complete → Tell your story → Story shelf. Also Explore (map, destination route, stop preview), Friend's story + save to lists, Profile.
- **Content:** openings, chapters and captions are scripted in `src/data.ts`; the "writing your plot twist" screen is a timed animation, not an AI call yet.

## Arrival tasks, tracking & the game map

- **Arrival tasks:** every stop has 3 tasks with XP (e.g. at Corner Coffee: order a pastry you've never tried, ask the barista what they'd order). They unlock automatically when you're within 70 m of the stop (`ARRIVE_RADIUS` in `src/data.ts`). Clearing all three earns a bonus, coins and a place badge.
- **Tracking:** `src/tracking.tsx`. *Demo walk* fast-forwards a walker along the route; *My location* uses `navigator.geolocation.watchPosition`. **Limit:** a web page can't track in the background or when closed. That needs a native app (iOS "Always" location + region monitoring, Android foreground service + geofencing), e.g. by wrapping this UI in Capacitor and moving `tracking.tsx` to a background-geolocation plugin.
- **Game map:** `src/GameMap.tsx`: XP/level HUD, your Quavi walking the trail, pulsing quest pins, collectible coins, ✓ stamps on cleared stops. Used on Active story and Explore.
