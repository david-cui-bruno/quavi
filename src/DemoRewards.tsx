import { useState } from "react";
import { Persona, flock } from "./brand/Persona";
import {
  DEMO_REWARDS,
  XP_PER_DEMO_REWARD,
  availableDemoRewards,
  redeemDemoReward,
  type DemoReward,
} from "./rewards";
import { useStore } from "./store";
import { Btn, Sheet } from "./ui";

export function DemoRewards() {
  const {
    s,
    update,
    account,
    rewards,
    pendingRewards,
    rewardError,
    redeemReward,
  } = useStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<DemoReward | null>(null);
  const available = account
    ? (rewards?.balance ?? 0)
    : availableDemoRewards(s.game.xp, s.demoRedemptions);
  const confirmedXp = account ? (rewards?.confirmedXp ?? 0) : s.game.xp;
  const pending = !!selected && pendingRewards.includes(selected.id);
  const starter = !s.demoRedemptions.some((r) => r.offerId === "welcome");
  const untilNext = XP_PER_DEMO_REWARD - (confirmedXp % XP_PER_DEMO_REWARD);
  const status = selected
    ? s.demoRedemptions.some((r) => r.offerId === selected.id)
      ? "used"
      : available >= selected.cost
        ? "available"
        : "locked"
    : null;
  const close = () => {
    setOpen(false);
    setSelected(null);
  };
  return (
    <section className="demo-rewards" aria-label="Demo partner rewards">
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <h2 className="h1 h-s">
          Little perks.
        </h2>
        <span className="pill" style={{ background: "var(--paper)" }}>
          Preview
        </span>
      </div>
      <p className="body" style={{ margin: "12px 0 8px" }}>
        <b>
          {available} earned {available === 1 ? "reward" : "rewards"} ready
        </b>
        {starter ? " · plus a welcome sample" : ""}
      </p>
      <div className="hud-bar" style={{ background: "rgba(30,27,22,.18)" }}>
        <i
          style={{
            width: `${Math.max(3, ((confirmedXp % XP_PER_DEMO_REWARD) / XP_PER_DEMO_REWARD) * 100)}%`,
            background: "var(--ink)",
          }}
        />
      </div>
      <p className="small" style={{ margin: "8px 0 16px", lineHeight: 1.5 }}>
        {untilNext.toLocaleString()} XP to your next reward.
      </p>
      <Btn kind="secondary" onClick={() => setOpen(true)}>
        Browse rewards
      </Btn>

      {!!account && !rewards && (
        <p className="small" role="status">
          Connect to load your confirmed reward balance.
        </p>
      )}
      {rewards?.dailyRemaining === 0 && (
        <p className="small">
          Daily XP limit reached. Your tasks and story still save normally.
        </p>
      )}
      {!!rewards?.legacyXp && (
        <p className="small">
          Previous demo XP stays in your level. New rewards use confirmed XP
          only.
        </p>
      )}
      {!!pendingRewards.length && (
        <p className="small" role="status">
          Demo redemption pending. Reconnect to confirm; no reward has been used
          yet.
        </p>
      )}
      {rewardError && (
        <p className="small" role="alert">
          {rewardError}
        </p>
      )}
      {open && (
        <Sheet label="Demo partner rewards" onClose={close}>
          {selected ? (
            <>
              <button className="chip" onClick={() => setSelected(null)}>
                All offers
              </button>
              <div
                className="row"
                style={{ margin: "16px 0", alignItems: "flex-start" }}
              >
                <div style={{ flex: 1 }}>
                  <h2 className="h1 h-m">
                    {status === "used"
                      ? "Preview complete."
                      : selected.title}
                  </h2>
                  <p className="body" style={{ marginTop: 8 }}>
                    {selected.partner}
                  </p>
                </div>
                <Persona spec={flock("Pip", "Orange")} size={68} />
              </div>
              <p className="body" style={{ fontWeight: 700 }}>
                {selected.benefit}
              </p>
              <p className="body muted" style={{ margin: "8px 0 16px" }}>
                {status === "used"
                  ? "You tried the reward flow. No payment was made and no real voucher was issued."
                  : selected.description}
              </p>
              <p className="reward-preview-label">
                Preview · not redeemable
              </p>
              {status === "used" ? (
                <>
                  <p className="small muted" style={{ margin: "12px 0 16px" }}>
                    Recorded in your preview history.{" "}
                    {selected.cost
                      ? "1 earned reward used; your XP is unchanged."
                      : "Welcome sample used; no earned reward or XP spent."}
                  </p>
                  <Btn onClick={() => setSelected(null)}>
                    Back to offers
                  </Btn>
                </>
              ) : (
                <>
                  <p className="small" style={{ margin: "12px 0 16px" }}>
                    {selected.cost
                      ? "Uses 1 earned reward. Keep your XP and level."
                      : account
                        ? "Welcome sample · no XP needed · once per account."
                        : "Welcome sample · no XP needed · once per demo."}
                  </p>
                  <Btn
                    disabled={
                      pending || status === "locked" || (!!account && !rewards)
                    }
                    onClick={() =>
                      account
                        ? redeemReward(selected.id)
                        : update((st) => ({
                            ...st,
                            demoRedemptions: redeemDemoReward(
                              selected.id,
                              st.game.xp,
                              st.demoRedemptions,
                              new Date().toISOString(),
                            ),
                          }))
                    }
                  >
                    {pending
                      ? "Pending confirmation"
                      : status === "locked"
                        ? "Earn a reward to unlock"
                        : "Try this reward"}
                  </Btn>
                </>
              )}
            </>
          ) : (
            <>
              <h2 className="h1 h-m">A little something back.</h2>
              <p className="body muted" style={{ margin: "8px 0 14px" }}>
                A coffee. A new book. A reason to take the scenic way.
              </p>
              <p className="reward-preview-label">
                Preview · not redeemable
              </p>
              <div className="col" style={{ marginTop: 8 }}>
                {DEMO_REWARDS.map((offer) => {
                  const state = s.demoRedemptions.some(
                    (r) => r.offerId === offer.id,
                  )
                    ? "used"
                    : available >= offer.cost
                      ? "available"
                      : "locked";
                  return (
                    <button
                      className="demo-offer"
                      key={offer.id}
                      onClick={() => setSelected(offer)}
                      aria-label={`View demo offer: ${offer.title}`}
                    >
                      <span className="col" style={{ gap: 5 }}>
                        <b className="h1 h-xs">{offer.title}</b>
                        <span className="small muted">
                          {offer.partner}
                        </span>
                        <span className="body">{offer.benefit}</span>
                        <span className="small" style={{ fontWeight: 700 }}>
                          {state === "used"
                            ? "Preview used · view receipt"
                            : offer.cost === 0
                              ? "Welcome sample · ready to try"
                              : state === "locked"
                                ? `Unlock with ${XP_PER_DEMO_REWARD.toLocaleString()} XP`
                                : "1 earned reward · ready to try"}
                        </span>
                      </span>
                      <span aria-hidden="true" style={{ fontSize: 24 }}>
                        ›
                      </span>
                    </button>
                  );
                })}
              </div>
              <p
                className="small muted"
                style={{ margin: "12px 0", lineHeight: 1.5 }}
              >
                Earn 1 reward per {XP_PER_DEMO_REWARD.toLocaleString()} XP. Each
                offer can be tried{" "}
                {account ? "once per account." : "once per demo."}{" "}
                {account
                  ? "History is confirmed by Quavi and synced across your devices."
                  : "History is saved on this device."}
              </p>
              <Btn kind="soft" onClick={close}>
                Done
              </Btn>
            </>
          )}
        </Sheet>
      )}
    </section>
  );
}
