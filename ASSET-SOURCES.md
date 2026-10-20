# Sample walking routes

`src/demo-walks.json` contains nine pedestrian legs for Quavi’s fixed, fictional
West Village sample stops. Authored October 18, 2026 using the FOSSGIS OSRM foot
server: https://routing.openstreetmap.de/about.html (one request per second).
Geometry is derived from OpenStreetMap contributors’ data under ODbL:
https://www.openstreetmap.org/copyright. The sample maps show that credit and a
“Fix the map” link. These snapshots never substitute for live navigation,
closed roads, current access, or an unmatched/swapped sample stop.

Live routes continue to use transient Google Routes results and Google Maps.
No Google route geometry or venue photo content is included in this fixture.
Reward names and logos identify example scenarios, not actual partnerships.
`npm run rewards:logos` refreshes the bundled icons for each distinct merchant
in the reward catalog. Starbucks uses its official apple-touch icon:
https://www.starbucks.com/apple-touch-icon.png. Barnes & Noble uses its published
site icon obtained via Google's domain favicon service:
https://www.google.com/s2/favicons?domain=www.barnesandnoble.com&sz=128.
Icons are bundled so opening rewards does not depend on a third-party image API.
Merchant names remain visible if an icon is missing.
