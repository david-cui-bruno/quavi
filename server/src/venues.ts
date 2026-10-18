import { BigQuery } from "@google-cloud/bigquery";
import type pg from "pg";
import { quota } from "./account.js";
import {
  kinds,
  normalizeCategory,
  type VenueProvider,
  type Point,
  type VenueResult,
} from "./detours.js";
export function overtureProvider(
  projectId: string,
  pool: pg.Pool,
): VenueProvider {
  const bq = new BigQuery({ projectId, location: "US" });
  return {
    async nearby(origin: Point) {
      // Coarse public-venue cache keys contain no user identity or precise GPS history.
      const center = {
          lat: Math.round(origin.lat * 100) / 100,
          lng: Math.round(origin.lng * 100) / 100,
        },
        key = `overture-v4:${center.lat}:${center.lng}`;
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        await db.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,72418203))",
          [key],
        );
        const cached = await db.query(
          "SELECT document FROM venue_cache WHERE area_key=$1 AND expires_at>now()",
          [key],
        );
        if (cached.rows[0]) {
          await db.query("COMMIT");
          return cached.rows[0].document as VenueResult;
        }
        if (!(await quota(db, "project", "venue-provider", 100, 86400))) {
          await db.query("COMMIT");
          throw Object.assign(new Error("Daily venue lookup limit reached"), {
            statusCode: 429,
          });
        }
        const [metadata] = await bq
          .dataset("overture_maps", { projectId: "bigquery-public-data" })
          .table("place")
          .getMetadata();
        const updatedAt = new Date(
          Number(metadata.lastModifiedTime),
        ).toISOString();
        if (Date.now() - new Date(updatedAt).getTime() > 90 * 86400000)
          throw new Error("Venue dataset is too old");
        const [rows] = await bq.query({
          query: `SELECT id,COALESCE((SELECT value FROM UNNEST(names.common.key_value) WHERE key='en' LIMIT 1),names.primary) AS name,
    ARRAY_CONCAT([names.primary], ARRAY(SELECT DISTINCT value FROM UNNEST(names.common.key_value) WHERE value IS NOT NULL LIMIT 7)) AS aliases,
    basic_category,taxonomy.primary AS category,confidence,operating_status,
    ST_Y(geometry) AS lat,ST_X(geometry) AS lng,
    addresses.list[SAFE_OFFSET(0)].element.locality AS locality
    FROM \`bigquery-public-data.overture_maps.place\`
    WHERE ST_DWITHIN(geometry,ST_GEOGPOINT(@lng,@lat),2800)
    AND confidence>=0.8 AND (operating_status IS NULL OR operating_status='open') AND names.primary IS NOT NULL
    AND (basic_category IN UNNEST(@categories) OR taxonomy.primary IN UNNEST(@categories))
    AND NOT REGEXP_CONTAINS(COALESCE(taxonomy.primary,''),r'(^|_)(bar|pub|casino|nightclub|adult)($|_)')
    ORDER BY ST_DISTANCE(geometry,ST_GEOGPOINT(@lng,@lat)) LIMIT 240`,
          params: {
            lat: center.lat,
            lng: center.lng,
            categories: Object.keys(kinds),
          },
          maximumBytesBilled: "21474836480",
          jobTimeoutMs: 20000,
        });
        const result: VenueResult = {
          updatedAt,
          venues: rows.map((r) => ({
            id: String(r.id),
            name: String(r.name).slice(0, 200),
            aliases: Array.isArray(r.aliases)
              ? ([
                  ...new Set(
                    r.aliases
                      .filter((n: unknown) => typeof n === "string" && n.trim())
                      .map((n: string) => n.slice(0, 200)),
                  ),
                ].slice(0, 8) as string[])
              : undefined,
            kind: normalizeCategory(r.category) ?? "unsupported",
            ll: { lat: Number(r.lat), lng: Number(r.lng) },
            locality: r.locality ? String(r.locality) : undefined,
            confidence: Number(r.confidence),
            status:
              r.operating_status == null
                ? "unknown"
                : String(r.operating_status),
          })),
        };
        await db.query(
          "INSERT INTO venue_cache(area_key,document,source_updated_at) VALUES($1,$2,$3) ON CONFLICT(area_key) DO UPDATE SET document=$2,source_updated_at=$3,expires_at=now()+interval '24 hours'",
          [key, JSON.stringify(result), updatedAt],
        );
        await db.query("COMMIT");
        return result;
      } catch (e) {
        await db.query("COMMIT");
        throw e;
      } finally {
        db.release();
      }
    },
  };
}
