import { mkdir, writeFile } from "node:fs/promises";
import { DEMO_REWARDS } from "../src/rewards.ts";
// Curated domains, automatic asset refresh. Never accepts user-supplied fetch targets.
const sources = [
  ...new Map(DEMO_REWARDS.map((o) => [o.merchantDomain, o])).values(),
].map((o) => {
  const domain = o.merchantDomain;
  if (!/^[a-z0-9-]+\.[a-z.]+$/.test(domain))
    throw Error("Invalid merchant domain");
  return [
    o.logo
      .split("/")
      .at(-1)
      .replace(/\.png$/, ""),
    domain === "starbucks.com"
      ? "https://www.starbucks.com/apple-touch-icon.png"
      : "https://www.google.com/s2/favicons?domain=" +
        encodeURIComponent(domain) +
        "&sz=128",
  ];
});
await mkdir(new URL("../public/reward-logos/", import.meta.url), {
  recursive: true,
});
for (const [brand, url] of sources) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok)
    throw Error(
      "Logo refresh failed for " + brand + "; retain the last verified asset",
    );
  const data = Buffer.from(await r.arrayBuffer());
  if (
    data.length > 512000 ||
    !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw Error("Invalid PNG for " + brand);
  await writeFile(
    new URL("../public/reward-logos/" + brand + ".png", import.meta.url),
    data,
  );
  console.log("Updated " + brand);
}
