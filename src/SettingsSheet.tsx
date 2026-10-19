import { Icon } from "./Icons";
import config from "./cloud-config.json";
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
      <div className="settings-heading">
        <div className="settings-mark">
          <Icon name="settings" size={28} />
        </div>
        <h2 className="h1 h-m">Settings.</h2>
      </div>
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
      <section className="settings-legal" aria-label="Privacy and terms">
        <a
          href={`${config.apiUrl}/legal/privacy`}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="shield" />
          <span>Privacy policy</span>
          <Icon name="chevron" size={18} />
        </a>
        <a
          href={`${config.apiUrl}/legal/terms`}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="book" />
          <span>Terms of use</span>
          <Icon name="chevron" size={18} />
        </a>
      </section>
      <div className="settings-build">
        <AppBuild />
      </div>
      <Btn kind="soft" onClick={onClose}>
        Done
      </Btn>
    </Sheet>
  );
}
