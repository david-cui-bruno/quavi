import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { overtureProvider } from "./venues.js";
import { readConfig } from "./config.js";
import { createPool } from "./db.js";
import { createApp } from "./app.js";
import { cloudStorageSigner } from "./media.js";

import { osmWalkingProvider } from "./walking.js";
import { walkingAdmission } from "./provider-admission.js";

const config = readConfig();
const firebase = initializeApp({
  projectId: config.GOOGLE_CLOUD_PROJECT,
  ...(config.FIREBASE_AUTH_EMULATOR_HOST
    ? {}
    : { credential: applicationDefault() }),
});
const pool = createPool(config.DATABASE_URL);
const app = await createApp({
  pool,
  auth: getAuth(firebase),
  origins: config.origins,
  media: config.MEDIA_BUCKET
    ? cloudStorageSigner(config.GOOGLE_CLOUD_PROJECT, config.MEDIA_BUCKET)
    : undefined,
  logger: true,
  walking:
    process.env.WALKING_CHECKS_ENABLED === "true"
      ? osmWalkingProvider(walkingAdmission(pool))
      : undefined,
  detours:
    process.env.CITY_DETOURS_ENABLED === "true"
      ? overtureProvider(config.GOOGLE_CLOUD_PROJECT, pool)
      : undefined,
});
app.addHook("onClose", async () => {
  await pool.end();
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    void app.close();
  });
await app.listen({
  port: config.PORT,
  host:
    process.env.NODE_ENV === "production" || process.env.K_SERVICE
      ? "0.0.0.0"
      : "127.0.0.1",
});
