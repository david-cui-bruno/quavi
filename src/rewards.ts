/** Prototype-only offers. These partners, funding and benefits are fictional. */
export const XP_PER_DEMO_REWARD = 1000
export const DEMO_REWARDS = [
  { id: 'welcome', title: 'Your first coffee', partner: 'Starbucks · example', merchantDomain:'starbucks.com', logo:'/reward-logos/starbucks.png', benefit: 'A free coffee', cost: 0, description: 'A welcome sample so you can try the reward experience without earning XP first.' },
  { id: 'cafe', title: 'A little café treat', partner: 'Starbucks · example', merchantDomain:'starbucks.com', logo:'/reward-logos/starbucks.png', benefit: '$3 off a café visit', cost: 1, description: 'A coffee break for the next chapter of your day.' },
  { id: 'books', title: 'One more chapter', partner: 'Barnes & Noble · example', merchantDomain:'barnesandnoble.com', logo:'/reward-logos/barnesandnoble.png', benefit: '$3 off a book', cost: 1, description: 'Something good to take home from your detour.' },
] as const

export type DemoReward = (typeof DEMO_REWARDS)[number]
export type DemoRedemption = { offerId: DemoReward['id']; redeemedAt: string }

export function availableDemoRewards(xp: number, redemptions: DemoRedemption[]) {
  const spent = DEMO_REWARDS.reduce((n, offer) => n + (redemptions.some((r) => r.offerId === offer.id) ? offer.cost : 0), 0)
  return Math.max(0, Math.floor(Math.max(0, xp) / XP_PER_DEMO_REWARD) - spent)
}

export function demoRewardStatus(offer: DemoReward, xp: number, redemptions: DemoRedemption[]): 'available' | 'locked' | 'used' {
  if (redemptions.some((r) => r.offerId === offer.id)) return 'used'
  return availableDemoRewards(xp, redemptions) >= offer.cost ? 'available' : 'locked'
}

/** Spending a demo reward never subtracts lifetime XP, levels or coins. */
export function redeemDemoReward(offerId: string, xp: number, redemptions: DemoRedemption[], redeemedAt: string): DemoRedemption[] {
  const offer = DEMO_REWARDS.find((o) => o.id === offerId)
  if (!offer || demoRewardStatus(offer, xp, redemptions) !== 'available') return redemptions
  return [...redemptions, { offerId: offer.id, redeemedAt }]
}
