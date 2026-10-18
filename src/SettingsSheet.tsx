import { useState } from "react";
import { AccountPanel } from "./AccountPanel";
import { AppBuild } from "./AppBuild";
import { PushSettings } from "./PushSettings";
import { useStore } from "./store";
import { Sheet, Btn } from "./ui";
export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { account, restart } = useStore(),
    [confirm, setConfirm] = useState(false);
  return (
    <Sheet label="Settings" onClose={onClose}>
      <h2 className="h1 h-m">The practical stuff.</h2>
      <AccountPanel />
      {account && <PushSettings />}
      {!account && (
        <section className="settings-section">
          {confirm ? (
            <>
              <p className="body">
                Clear this device’s demo stories and progress?
              </p>
              <Btn kind="secondary" onClick={restart}>
                Clear & restart demo
              </Btn>
              <button className="text-action" onClick={() => setConfirm(false)}>
                Keep my demo
              </button>
            </>
          ) : (
            <button className="text-action" onClick={() => setConfirm(true)}>
              Clear & restart demo
            </button>
          )}
        </section>
      )}
      <AppBuild />
      <Btn kind="soft" onClick={onClose}>
        Done
      </Btn>
    </Sheet>
  );
}
