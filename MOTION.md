# Quavi motion

**Personality:** Balanced, leaning Expressive for rewards and Productive for navigation (map/quest product with a playful duck cast). Entrances may overshoot; exits and navigation stay quick and calm.

## Principles
1. **Motion as usability:** direction tells you where you are (forward slides in from the right, back from the left); every tap answers within ~90 ms.
2. **Focus the next step:** new content (a chosen tile, the current stop, an error) moves once, then stops.
3. **Delight is earned:** springs and bursts are for choices, rewards and arrivals, never for chrome.
4. **Restraint on the map:** only the current stop breathes. Nothing else loops except the live "you" radar.
5. **Never in the way:** nothing blocks input; reduced-motion collapses every token to 1 ms and removes travel and loops.

## Tokens (`src/index.css`)
| Token | Value | Use |
|---|---|---|
| `--motion-t1` | 90 ms | touch feedback, press, hover |
| `--motion-t2` | 160 ms | small state changes (task toggle, error reveal) |
| `--motion-t3` | 260 ms | screen enter, fades, selection, toasts |
| `--motion-t4` | 340 ms | sheets, marker drop, mood carousel |
| `--motion-t5` | 600 ms | XP bar catch-up |
| `--ease-default` | .4,0,.2,1 | state changes |
| `--ease-enter` | .2,.8,.2,1 | things arriving |
| `--ease-exit` | .4,0,1,1 | things leaving (reserved) |
| `--ease-spring` | .34,1.56,.64,1 | entrances and rewards only |
| `--motion-stagger` | 40 ms | between siblings, capped at 8 items |

## Pattern map
| Where | Pattern | Duration / easing | Trigger | Reduced motion |
|---|---|---|---|---|
| every screen (`.screen`) | Push / Back transition | t3, enter | route change | instant |
| Interests grid, Home stories, Openings cards (`.stagger`) | Stagger-in | t3 + 40 ms steps | screen enter | no animation |
| Interests tiles (`.tile.on`) | Selection bounce | t3, spring | tap | none (tick still appears) |
| Map pins (`GameMap`, `.pcs-wrap`) | Map-marker drop | t4, spring, 40 ms steps | map mount | none |
| Current stop ring | Restrained location pulse | 2.6 s, only current stop | continuous | off |
| Tab bar (`.tab.on svg`) | Icon personality pop | t3, spring | tab change | none |
| Login fields (`.err`, `.field.bad`) | Inline validation reveal + gentle nudge | t2 / t3 | failed submit | none; red outline + text remain |
| Buttons, chips, tiles, round buttons | Press compression | t1, default | press | instant |
| Sheets (`.sheet`, `.scrim`) | Sheet rise + backdrop fade | t4 / t3 | open | instant |
| Mood carousel (`Mood`) | Selection scale + move | t4, enter | tap | instant |
| HUD XP bar | Progress-bar catch-up | t5, default | XP awarded | instant |
| `.xpfloat` | Reward float (non-blocking) | 900 ms | XP awarded | instant |
| "You" marker | Follows GPS 1:1 (not eased by a timer) | 140 ms linear | position update | unchanged (data-driven) |

## Specs
- **stagger-in:** opacity 0→100, translateY 8→0; t3 enter; item *n* delayed `n × 40 ms`, items 8+ share the last delay.
- **selection-bounce:** scale .95→1, t3 spring; tick badge pops in at the same time.
- **marker-drop:** opacity 0→100, translateY −16→0, scale .9→1; t4 spring; pin *n* delayed `n × 40 ms` (max 280 ms).
- **tab-pop:** icon scale .8→1, translateY 3→0; t3 spring.
- **validation:** message opacity 0→100, translateY −4→0 (t2); field translateX ±4 px ×2 (t3). Always paired with text and outline.
- **press-compress:** scale 1→.97–.98, t1 default; background/colour invert per the brand button states.

## Not done on purpose
No confetti or badge bursts yet (no completion celebration is wired); no coin-collect animation (coins are removed from SVG state instantly); no shared-element transitions.
