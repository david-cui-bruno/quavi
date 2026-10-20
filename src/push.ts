import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { api, auth } from "./cloud";
let token: string | undefined;
export const nativePush = () => Capacitor.getPlatform() === "ios";
export async function detachPush() {
  const user = auth.currentUser;
  try {
    if (token && user) await api(user, "/social/devices", "DELETE", { token });
  } finally {
    if (nativePush()) await PushNotifications.unregister();
    token = undefined;
    localStorage.removeItem("quavi.push.owner");
  }
}
export async function enablePush() {
  const user = auth.currentUser;
  if (!user) throw Error("Sign in to enable notifications.");
  if (!nativePush())
    throw Error("Push notifications are available in the iPhone app.");
  if (
    !(await api<{ configured: boolean }>(user, "/social/push-status"))
      .configured
  )
    throw Error("iPhone push setup is pending. Your in-app inbox works now.");
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted")
    throw Error(
      "Notifications are off. You can enable them in iPhone Settings → Quavi.",
    );
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const handles: { remove: () => Promise<void> }[] = [];
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const h of handles) void h.remove();
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(
      () => finish(Error("Registration timed out. Try again.")),
      15000,
    );
    void (async () => {
      handles.push(
        await PushNotifications.addListener("registrationError", () =>
          finish(Error("Could not register this phone. Try again.")),
        ),
      );
      handles.push(
        await PushNotifications.addListener("registration", async (value) => {
          try {
            if (auth.currentUser?.uid !== user.uid)
              throw Error("Your account changed. Try again.");
            await api(user, "/social/devices", "PUT", {
              token: value.value,
              environment:
                import.meta.env.VITE_APNS_ENV === "sandbox"
                  ? "sandbox"
                  : "production",
            });
            if (auth.currentUser?.uid !== user.uid) {
              await PushNotifications.unregister();
              throw Error("Your account changed. Enable push again.");
            }
            token = value.value;
            localStorage.setItem("quavi.push.owner", user.uid);
            finish();
          } catch (e) {
            finish(e);
          }
        }),
      );
      await PushNotifications.register();
    })().catch(finish);
  });
}

export async function restorePush(uid?: string) {
  if (!nativePush()) return;
  if (uid && localStorage.getItem("quavi.push.owner") === uid) {
    if ((await PushNotifications.checkPermissions()).receive === "granted")
      await enablePush();
  } else await PushNotifications.unregister();
}
