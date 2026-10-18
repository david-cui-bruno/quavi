/** Conservative identity matching. Localized catalog names are evidence; fuzzy name guesses are not. */
export const normalizePlaceName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export type PlaceIdentity = { kind?: string; aliases?: string[] };
export type PlaceRejection = { rejected: "category_mismatch" | "service_area" };
const families: Record<string, string[]> = {
  cafe: ["cafe", "coffee_shop", "tea_house", "juice_shop", "tea_room"],
  restaurant: [
    "restaurant",
    "food_court",
    "meal_takeaway",
    "sandwich_shop",
    "pizza_restaurant",
  ],
  bakery: ["bakery"],
  bookshop: ["book_store", "bookstore"],
  park: ["park", "national_park", "state_park", "city_park"],
  garden: ["botanical_garden", "garden", "community_garden"],
  museum: ["museum"],
  gallery: ["art_gallery"],
  arcade: ["video_arcade", "amusement_center", "amusement_arcade"],
  icecream: ["ice_cream_shop", "dessert_shop"],
};
const expectedFamily = (kind?: string) => {
  const k = normalizePlaceName(kind ?? "");
  return (
    {
      cafe: "cafe",
      coffeeshop: "cafe",
      restaurant: "restaurant",
      bakery: "bakery",
      bookshop: "bookshop",
      bookstore: "bookshop",
      park: "park",
      garden: "garden",
      botanicalgarden: "garden",
      museum: "museum",
      artgallery: "gallery",
      arcade: "arcade",
      icecreamshop: "icecream",
    } as Record<string, string>
  )[k];
};
export function categoryIssue(
  types: string[],
  primary: string | undefined,
  kind?: string,
): PlaceRejection | undefined {
  const all = [primary, ...types].filter((t): t is string => !!t);
  // A recognized non-visit venue or adult primary use must not borrow a catalog café/gallery label.
  if (
    all.some((t) =>
      [
        "parking",
        "corporate_office",
        "school",
        "university",
        "hospital",
        "night_club",
        "casino",
      ].includes(t),
    ) ||
    ["bar", "pub", "wine_bar", "night_club", "casino"].includes(primary ?? "")
  )
    return { rejected: "category_mismatch" };
  const family = expectedFamily(kind);
  if (!family || !all.length) return;
  const accepted = families[family];
  if (
    all.some(
      (t) =>
        accepted.includes(t) ||
        (family === "restaurant" && t.endsWith("_restaurant")),
    )
  )
    return;
  // Generic point_of_interest / establishment alone do not establish a contradictory category.
  const specific = all.filter(
    (t) =>
      ![
        "point_of_interest",
        "establishment",
        "food",
        "store",
        "tourist_attraction",
        "premise",
      ].includes(t),
  );
  return specific.length ? { rejected: "category_mismatch" } : undefined;
}
