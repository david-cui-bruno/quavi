import { OutingSaveStatus } from "./OutingSaveStatus";
import { useState } from "react";
import { useStore } from "./store";
import { Btn } from "./ui";
import { auth, accountError } from "./cloud";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
} from "firebase/auth";

const labels = {
  deleted: "Account deletion in progress",
  "save-error":
    "Save needs attention — check your photos or account limits, then retry",
  empty: "Connected — no cloud save yet",
  demo: "Saved on this device",
  saved: "Cloud save is up to date",
  pending: "Changes waiting to save",
  saving: "Saving…",
  offline: "Offline — changes stay on this device",
  conflict: "Another device has a newer save",
  "sign-in-required": "Session expired — log out and log in again",
  "storage-full": "Device storage is full — keep Quavi open and retry",
};
export function AccountPanel() {
  const {
    account,
    syncStatus,
    retrySync,
    loadCloud,
    importDemo,
    canImportDemo,
    logout,
    deleteAccount,
    go,
  } = useStore();
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<"import" | "cloud" | "delete" | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [clearDemo, setClearDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <section className="settings-account" aria-label="Account and cloud saves">
      <div className="settings-identity">
        <span className="settings-mode">
          {account ? "QUAVI ACCOUNT" : "JUST LOOKING AROUND?"}
        </span>
        <h3 className="h1 h-xs">
          {account ? "Your account." : "Make yourself at home."}
        </h3>
        <p className="small">
          {account?.email ||
            "Keep your stories, progress and flock together with a Quavi account."}
        </p>
        <p className="small settings-sync" role="status">
          {labels[syncStatus]}
        </p>
      </div>
      <OutingSaveStatus controls />
      <div className="col" style={{ gap: 10, marginTop: 12 }}>
        {!account ? (
          <Btn kind="secondary" onClick={() => go("login")}>
            Log in or create an account
          </Btn>
        ) : (
          <>
            {["pending", "save-error", "storage-full"].includes(syncStatus) && (
                <Btn kind="soft" onClick={retrySync}>
                  Retry cloud save
                </Btn>
              )}
            {syncStatus === "conflict" && (
              <>
                <p className="small">
                  Your edits are kept on this device. Loading the cloud save
                  replaces those profile edits. Outing edits sync separately.
                </p>
                <Btn kind="soft" onClick={() => setConfirm("cloud")}>
                  Load cloud save
                </Btn>
              </>
            )}
            {canImportDemo && (
              <Btn
                kind="soft"
                disabled={busy}
                onClick={() => setConfirm("import")}
              >
                Import this device’s demo
              </Btn>
            )}
            {!account.emailVerified && (
              <button
                className="small"
                style={{ minHeight: 44 }}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (auth.currentUser)
                      await sendEmailVerification(auth.currentUser);
                    setMessage("Verification email sent. Check your inbox.");
                  } catch (e) {
                    setMessage(accountError(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Send verification email
              </button>
            )}
            <button
              className="small"
              style={{ minHeight: 44 }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await logout();
                } catch (e) {
                  setMessage(accountError(e));
                  setBusy(false);
                }
              }}
            >
              Log out
            </button>
            <button
              className="small"
              style={{ minHeight: 44 }}
              disabled={busy}
              onClick={() => {
                setConfirm("delete");
                setMessage("");
                setPassword("");
              }}
            >
              Delete account
            </button>
          </>
        )}
        {confirm && confirm !== "delete" && (
          <div role="group" aria-label="Confirm cloud save action">
            <p className="small" style={{ marginBottom: 10 }}>
              {confirm === "import"
                ? "Copy your stories, photos and progress from this device’s demo into an empty account? Existing cloud saves cannot be replaced by importing."
                : "Replace this device’s unsaved account edits with the newer cloud save? The separate demo stays on this device."}
            </p>
            <Btn
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMessage("");
                try {
                  if (confirm === "import") importDemo();
                  else await loadCloud();
                  setConfirm(null);
                } catch (e) {
                  setMessage(
                    e instanceof Error
                      ? e.message
                      : "Could not finish. Try again online.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? "Working…"
                : confirm === "import"
                  ? "Import demo into account"
                  : "Replace local edits"}
            </Btn>
            <button
              className="small"
              disabled={busy}
              style={{ minHeight: 44, width: "100%" }}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
          </div>
        )}
        {confirm === "delete" && (
          <div role="group" aria-label="Delete account confirmation">
            <h3 className="h1 h-xs">Delete your account?</h3>
            <p className="small" style={{ margin: "10px 0" }}>
              This permanently removes your account, stories, lists, progress
              and photos. Access stops as soon as the request is accepted.
              Cleanup usually finishes within 20 minutes. Late uploads are
              cleaned within 24 hours. Automated backups and deleted photo
              recovery copies expire within 7 days.
            </p>
            <div className="field">
              <label htmlFor="delete-password">CONFIRM YOUR PASSWORD</label>
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <label
              className="row small"
              style={{ minHeight: 44, margin: "8px 0" }}
            >
              <input
                type="checkbox"
                checked={clearDemo}
                onChange={(e) => setClearDemo(e.target.checked)}
              />
              Also clear the separate demo on this device
            </label>
            <Btn
              disabled={busy || !password}
              kind="secondary"
              onClick={async () => {
                if (!account?.email) return;
                setBusy(true);
                setMessage("");
                try {
                  await reauthenticateWithCredential(
                    account,
                    EmailAuthProvider.credential(account.email, password),
                  );
                  await deleteAccount(clearDemo);
                } catch (e) {
                  setMessage(accountError(e));
                  setBusy(false);
                }
              }}
            >
              {busy ? "Deleting…" : "Permanently delete account"}
            </Btn>
            <button
              className="small"
              disabled={busy}
              style={{ minHeight: 44, width: "100%" }}
              onClick={() => {
                setConfirm(null);
                setPassword("");
              }}
            >
              Keep my account
            </button>
          </div>
        )}
        {message && (
          <p className="small" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
