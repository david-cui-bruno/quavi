import { useState } from "react";
import { enablePush, detachPush, nativePush } from "./push";
export function PushSettings({heading=true}:{heading?:boolean}={}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (!nativePush()) return null;
  const set = async (on: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      if (on) await enablePush();
      else await detachPush();
      setMessage(
        on
          ? "Notifications enabled on this phone."
          : "Notifications are off on this phone.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-section">
      {heading&&<h3 className="h1 h-xs">Notifications</h3>}
      <p className="small muted">
        Choose whether Quavi can send updates to this iPhone.
      </p>
      <div className="circle-actions">
        <button className="chip" disabled={busy} onClick={() => void set(true)}>
          Enable notifications
        </button>
        <button
          className="text-action"
          disabled={busy}
          onClick={() => void set(false)}
        >
          Turn off
        </button>
      </div>
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
