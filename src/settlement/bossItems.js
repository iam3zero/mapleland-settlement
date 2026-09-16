import { MOCK_ITEMS } from './calculations.js'

// Reuse the existing provisional catalog; these are not newly verified game drops.
export const bossItems = Object.freeze({
  normalZakum: Object.freeze([...MOCK_ITEMS]),
  chaosZakum: Object.freeze([...MOCK_ITEMS]),
})
export const itemsForBoss = mode => bossItems[mode.startsWith('chaos/') ? 'chaosZakum' : 'normalZakum']
export const saleStatus = amount => String(amount ?? '').trim() === '' ? 'pending' : 'sold'
