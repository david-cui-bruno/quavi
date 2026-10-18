import { useState } from "react";
import { useStore } from "./store";
import { Btn } from "./ui";
export function OutingSaveStatus({ controls = false }: { controls?: boolean }) {
  const { account, outingStatus, resolveOuting, retrySync } = useStore();
  const [choice, setChoice] = useState<"cloud" | "local" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!account || outingStatus === "demo") return null;
  const labels = {
    saved: "Outings saved",
    empty: "No saved outings yet",
    pending: "Outing changes waiting to sync",
    saving: "Saving outing…",
    offline: "Outing edits are on this device · sync when online",
    conflict: "An outing has conflicting edits from another device",
    "storage-full":
      "Outing changes could not be saved on this device. Keep Quavi open and free up storage.",
    "save-error":
      "Outing save needs attention. Check photo or account limits, then retry.",
    "sign-in-required": "Sign in again to sync your outings",
    deleted: "Account deletion in progress",
  };
  return (
    <div
      className="small"
      style={{ margin: "10px 0" }}
      role={
        ["conflict", "storage-full", "save-error"].includes(outingStatus)
          ? "alert"
          : "status"
      }
    >
      <p>{labels[outingStatus]}</p>
      {controls && outingStatus === "conflict" && (
        <>
          <p style={{ margin: "8px 0" }}>
            Your edits are retained here. Edits to different fields merge
            automatically. Choose which version of the conflicting outing to
            keep.
          </p>
          <button
            className="small"
            style={{ minHeight: 44, textDecoration: "underline" }}
            onClick={() => setChoice("cloud")}
          >
            Use cloud outing
          </button>
          {" · "}
          <button
            className="small"
            style={{ minHeight: 44, textDecoration: "underline" }}
            onClick={() => setChoice("local")}
          >
            Keep my outing edits
          </button>
        </>
      )}
      {controls && !["saved", "conflict", "deleted"].includes(outingStatus) && (
        <button
          className="small"
          style={{ minHeight: 44, textDecoration: "underline" }}
          onClick={retrySync}
        >
          Retry outing sync
        </button>
      )}
      {choice && (
        <div role="group" aria-label="Resolve outing conflict">
          <p>
            {choice === "cloud"
              ? "Replace this device’s pending edits for the conflicting outing with its cloud version?"
              : "Apply this device’s edits to the conflicting outing? Fields changed here will replace their cloud values; other fields stay intact."}
          </p>
          <Btn
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await resolveOuting(choice);
                setChoice(null);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not sync. Try again online.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Saving…"
              : choice === "cloud"
                ? "Use cloud outing"
                : "Keep my edits"}
          </Btn>
          <button
            style={{ minHeight: 44 }}
            disabled={busy}
            onClick={() => setChoice(null)}
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
