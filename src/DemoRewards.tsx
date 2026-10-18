import { useState } from 'react'
import { Persona, flock } from './brand/Persona'
import { DEMO_REWARDS, XP_PER_DEMO_REWARD, availableDemoRewards, demoRewardStatus, redeemDemoReward, type DemoReward } from './rewards'
import { useStore } from './store'
import { Btn, Sheet } from './ui'

export function DemoRewards() {
  const { s, update } = useStore()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<DemoReward | null>(null)
  const available = availableDemoRewards(s.game.xp, s.demoRedemptions)
  const starter = !s.demoRedemptions.some((r) => r.offerId === 'welcome')
  const untilNext = XP_PER_DEMO_REWARD - (s.game.xp % XP_PER_DEMO_REWARD)
  const status = selected ? demoRewardStatus(selected, s.game.xp, s.demoRedemptions) : null
  const close = () => { setOpen(false); setSelected(null) }
  return (
    <section className="demo-rewards" aria-label="Demo partner rewards">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2 className="h1 h-s">Little perks.<br />More stories.</h2>
        <span className="pill" style={{ background: 'var(--paper)' }}>Demo</span>
      </div>
      <p className="body" style={{ margin: '12px 0 8px' }}><b>{available} earned {available === 1 ? 'reward' : 'rewards'} ready</b>{starter ? ' · plus a welcome sample' : ''}</p>
      <div className="hud-bar" style={{ background: 'rgba(30,27,22,.18)' }}><i style={{ width: `${Math.max(3, ((s.game.xp % XP_PER_DEMO_REWARD) / XP_PER_DEMO_REWARD) * 100)}%`, background: 'var(--ink)' }} /></div>
      <p className="small" style={{ margin: '8px 0 16px', lineHeight: 1.5 }}>{untilNext.toLocaleString()} XP to your next reward. Your XP and level stay yours when you use a reward.</p>
      <Btn kind="secondary" onClick={() => setOpen(true)}>Browse demo rewards</Btn>
      <p className="small" style={{ marginTop: 10, lineHeight: 1.5 }}>Fictional partners. No real discounts, payments or cash value.</p>
      {open && (
        <Sheet label="Demo partner rewards" onClose={close}>
          {selected ? (
            <>
              <button className="chip" onClick={() => setSelected(null)}>All demo offers</button>
              <div className="row" style={{ margin: '16px 0', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h2 className="h1 h-m">{status === 'used' ? 'Demo redemption complete.' : selected.title}</h2>
                  <p className="body" style={{ marginTop: 8 }}>{selected.partner} · fictional partner</p>
                </div>
                <Persona spec={flock('Pip', 'Orange')} size={68} />
              </div>
              <p className="body" style={{ fontWeight: 700 }}>{selected.benefit}</p>
              <p className="body muted" style={{ margin: '8px 0 16px' }}>{status === 'used' ? 'You tried the reward flow. No payment was made and no real voucher was issued.' : selected.description}</p>
              <p className="demo-notice">Demo only — cannot be redeemed at a real business.</p>
              {status === 'used' ? (
                <>
                  <p className="small muted" style={{ margin: '12px 0 16px' }}>Recorded in your demo history. {selected.cost ? '1 earned reward used; your XP is unchanged.' : 'Welcome sample used; no earned reward or XP spent.'}</p>
                  <Btn onClick={() => setSelected(null)}>Back to demo offers</Btn>
                </>
              ) : (
                <>
                  <p className="small" style={{ margin: '12px 0 16px' }}>{selected.cost ? 'Uses 1 earned reward. Keep your XP and level.' : 'Welcome sample · no XP needed · once per demo.'}</p>
                  <Btn disabled={status === 'locked'} onClick={() => update((st) => ({ ...st, demoRedemptions: redeemDemoReward(selected.id, st.game.xp, st.demoRedemptions, new Date().toISOString()) }))}>{status === 'locked' ? 'Earn a reward to unlock' : 'Try demo redemption'}</Btn>
                </>
              )}
            </>
          ) : (
            <>
              <h2 className="h1 h-m">Demo partner rewards.</h2>
              <p className="body muted" style={{ margin: '8px 0 14px' }}>Try a little perk for taking the scenic way. These partners and offers are fictional.</p>
              <p className="demo-notice">Demo only — cannot be redeemed at a real business.</p>
              <div className="col" style={{ marginTop: 8 }}>
                {DEMO_REWARDS.map((offer) => {
                  const state = demoRewardStatus(offer, s.game.xp, s.demoRedemptions)
                  return (
                    <button className="demo-offer" key={offer.id} onClick={() => setSelected(offer)} aria-label={`View demo offer: ${offer.title}`}>
                      <span className="col" style={{ gap: 5 }}><b className="h1 h-xs">{offer.title}</b><span className="small muted">{offer.partner} · fictional</span><span className="body">{offer.benefit}</span><span className="small" style={{ fontWeight: 700 }}>{state === 'used' ? 'Demo used · view receipt' : offer.cost === 0 ? 'Welcome sample · ready to try' : state === 'locked' ? `Unlock with ${XP_PER_DEMO_REWARD.toLocaleString()} XP` : '1 earned reward · ready to try'}</span></span>
                      <span aria-hidden="true" style={{ fontSize: 24 }}>›</span>
                    </button>
                  )
                })}
              </div>
              <p className="small muted" style={{ margin: '12px 0', lineHeight: 1.5 }}>Earn 1 reward per {XP_PER_DEMO_REWARD.toLocaleString()} XP. Each offer can be tried once per demo. History is saved on this device.</p>
              <Btn kind="soft" onClick={close}>Done</Btn>
            </>
          )}
        </Sheet>
      )}
    </section>
  )
}
