import test from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_REWARDS, availableDemoRewards, demoRewardStatus, redeemDemoReward } from '../src/rewards.ts'

const [welcome, cafe, books] = DEMO_REWARDS
const at = '2026-10-18T12:00:00.000Z'

test('a new user can try the welcome sample without gaining or spending earned rewards', () => {
  const history = redeemDemoReward(welcome.id, 60, [], at)
  assert.equal(history.length, 1)
  assert.equal(availableDemoRewards(60, history), 0)
  assert.equal(demoRewardStatus(welcome, 60, history), 'used')
  assert.equal(demoRewardStatus(cafe, 60, history), 'locked')
})

test('earned offers unlock exactly at the XP threshold', () => {
  assert.equal(demoRewardStatus(cafe, 999, []), 'locked')
  assert.equal(demoRewardStatus(cafe, 1000, []), 'available')
})

test('spending one earned reward locks other offers until another is earned', () => {
  const history = redeemDemoReward(cafe.id, 1000, [], at)
  assert.equal(availableDemoRewards(1000, history), 0)
  assert.equal(demoRewardStatus(books, 1000, history), 'locked')
  assert.equal(demoRewardStatus(books, 2000, history), 'available')
  assert.deepEqual(redeemDemoReward(books.id, 1000, history, at), history)
})

test('a repeated redemption is idempotent, even when more rewards are available', () => {
  const history = redeemDemoReward(cafe.id, 2000, [], at)
  assert.strictEqual(redeemDemoReward(cafe.id, 2000, history, at), history)
  assert.equal(availableDemoRewards(2000, history), 1)
})

test('locked or unknown offers cannot create redemptions', () => {
  const history = []
  assert.strictEqual(redeemDemoReward(cafe.id, 0, history, at), history)
  assert.strictEqual(redeemDemoReward('unknown', 5000, history, at), history)
})

test('saved redemption history survives a JSON round trip and keeps lifetime XP separate', () => {
  const state = { xp: 1000, redemptions: redeemDemoReward(cafe.id, 1000, [], at) }
  const loaded = JSON.parse(JSON.stringify(state))
  assert.equal(loaded.xp, 1000)
  assert.equal(demoRewardStatus(cafe, loaded.xp, loaded.redemptions), 'used')
  assert.equal(loaded.redemptions[0].redeemedAt, at)
})
