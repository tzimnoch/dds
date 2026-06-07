import { useEffect, useState, useCallback } from 'react'

// ── Index mappings ────────────────────────────────────────────────────────────
// DDS suit indices: 0=Spades, 1=Hearts, 2=Diamonds, 3=Clubs
// DDS hand indices: 0=North,  1=East,   2=South,    3=West
// DDS trump index:  4=NoTrump (suit only, not hand)

const DDS_SUIT       = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 }
const DDS_TRUMP      = { spades: 0, hearts: 1, diamonds: 2, clubs: 3, nt: 4 }
const DDS_HAND       = { north: 0, east: 1, south: 2, west: 3 }
const DDS_HAND_NAMES = ['north', 'east', 'south', 'west']
const DDS_SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs', 'nt']

// Card value in gamestate: 0=2, 1=3, ..., 12=Ace
// DDS bitmask: bit (value+2) is set for each held card (bit2=2 .. bit14=Ace)
function handToBitmask(hand, suit) {
  return hand
    .filter(card => card.suit === suit)
    .reduce((mask, card) => mask | (1 << (card.value + 2)), 0)
}

// ── CalcDDtable helpers ───────────────────────────────────────────────────────
// struct ddTableDeal { unsigned int cards[4][4]; }  → 16×uint32 = 64 bytes
// cards[hand][suit], hand: 0=N 1=E 2=S 3=W, suit: 0=S 1=H 2=D 3=C
function writeDdTableDeal(dds, gs, ptr) {
  const hands = { north: gs.north.hand, east: gs.east.hand, south: gs.south.hand, west: gs.west.hand }
  for (const [player, handIdx] of Object.entries(DDS_HAND)) {
    for (const [suit, suitIdx] of Object.entries(DDS_SUIT)) {
      const byteOffset = (handIdx * 4 + suitIdx) * 4
      dds.setValue(ptr + byteOffset, handToBitmask(hands[player], suit), 'i32')
    }
  }
}

// struct ddTableResults { int resTable[5][4]; }  → 20×int32 = 80 bytes
function readDdTableResults(dds, ptr) {
  const table = {}
  for (let trumpIdx = 0; trumpIdx < 5; trumpIdx++) {
    const suitName = DDS_SUIT_NAMES[trumpIdx]
    table[suitName] = {}
    for (let handIdx = 0; handIdx < 4; handIdx++) {
      table[suitName][DDS_HAND_NAMES[handIdx]] = dds.getValue(ptr + (trumpIdx * 4 + handIdx) * 4, 'i32')
    }
  }
  return table
}

// ── SolveBoard helpers ────────────────────────────────────────────────────────
// struct deal (96 bytes):
//   int trump;                    offset  0  (4 bytes)
//   int first;                    offset  4  (4 bytes)
//   int currentTrickSuit[3];      offset  8  (12 bytes)
//   int currentTrickRank[3];      offset 20  (12 bytes)
//   unsigned int remainCards[4][4]; offset 32 (64 bytes)
//
// struct futureTricks (216 bytes):
//   int nodes;      offset   0  (4 bytes)
//   int cards;      offset   4  (4 bytes)
//   int suit[13];   offset   8  (52 bytes)
//   int rank[13];   offset  60  (52 bytes)
//   int equals[13]; offset 112  (52 bytes)
//   int score[13];  offset 164  (52 bytes)

function writeDeal(dds, ptr, { trumpSuit, leader, currentTrick, hands }) {
  dds.setValue(ptr + 0, DDS_TRUMP[trumpSuit] ?? 4, 'i32')
  dds.setValue(ptr + 4, DDS_HAND[leader] ?? 0, 'i32')

  // currentTrickSuit / currentTrickRank — cards already played to this trick (max 3)
  for (let i = 0; i < 3; i++) {
    const entry = currentTrick[i]
    dds.setValue(ptr + 8  + i * 4, entry ? DDS_SUIT[entry.card.suit] : 0, 'i32')
    dds.setValue(ptr + 20 + i * 4, entry ? entry.card.value + 2 : 0, 'i32')
  }

  // remainCards[hand][suit] — cards not yet played (excluding current trick cards already played)
  for (const [player, handIdx] of Object.entries(DDS_HAND)) {
    for (const [suit, suitIdx] of Object.entries(DDS_SUIT)) {
      dds.setValue(ptr + 32 + (handIdx * 4 + suitIdx) * 4, handToBitmask(hands[player] ?? [], suit), 'i32')
    }
  }
}

function readFutureTricks(dds, ptr) {
  const numCards = dds.getValue(ptr + 4, 'i32')
  const results = []
  for (let i = 0; i < numCards; i++) {
    results.push({
      suit:   dds.getValue(ptr + 8   + i * 4, 'i32'),
      rank:   dds.getValue(ptr + 60  + i * 4, 'i32'),
      equals: dds.getValue(ptr + 112 + i * 4, 'i32'),
      score:  dds.getValue(ptr + 164 + i * 4, 'i32'),
    })
  }
  return results
}

// Returns a Map from 'suitIdx-rank(2-14)' → score, expanding equivalent cards.
// DDS only returns the highest card of each equivalent group;
// lower equivalents are encoded in the 'equals' bitmask (bit N → rank N is equivalent).
function buildScoreMap(futureTricks) {
  const map = new Map()
  for (const { suit, rank, equals, score } of futureTricks) {
    map.set(`${suit}-${rank}`, score)
    for (let r = 2; r <= 14; r++) {
      if (equals & (1 << r)) map.set(`${suit}-${r}`, score)
    }
  }
  return map
}

// ── Module loader ─────────────────────────────────────────────────────────────
function loadDDS() {
  return new Promise((resolve, reject) => {
    if (window.__ddsInstance) { resolve(window.__ddsInstance); return }

    // Use the webpack public path (set by rsbuild from assetPrefix) so that
    // dds.js and dds.wasm resolve correctly regardless of deployment sub-path.
    // Falls back to './' if __webpack_public_path__ is not defined.
    const base = (typeof __webpack_public_path__ !== 'undefined' && __webpack_public_path__)
      ? __webpack_public_path__
      : './'

    const script = document.createElement('script')
    script.src = base + 'dds.js'
    script.async = true
    script.onload = () => {
      const factory = window.DDS
      if (typeof factory !== 'function') {
        reject(new Error('dds.js loaded but window.DDS is not a function'))
        return
      }
      factory({ locateFile: (path) => base + path }).then(instance => {
        instance._SetMaxThreads(1)
        window.__ddsInstance = instance
        resolve(instance)
      }).catch(reject)
    }
    script.onerror = () => reject(new Error('Failed to load ' + base + 'dds.js'))
    document.body.appendChild(script)
  })
}

const suits = ['spades', 'hearts', 'diamonds', 'clubs']
const cards = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]

// Generate a random deal (all 52 cards distributed among 4 players)
function generateRandomDeal() {
  const deck = []
  for (const suit of suits) {
    for (const value of cards) {
      deck.push({ suit, value })
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return {
    north: deck.slice(0, 13),
    east:  deck.slice(13, 26),
    south: deck.slice(26, 39),
    west:  deck.slice(39, 52),
  }
}

// Generate n random deals
function generateRandomDeals(n) {
  const deals = []
  for (let i = 0; i < n; i++) {
    deals.push(generateRandomDeal())
  }
  return deals
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useDDS() {
  const [dds, setDds] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadDDS()
      .then(instance => { if (!cancelled) { setDds(instance); setLoading(false) } })
      .catch(err    => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  // Full 5×4 DD table for the initial deal
  const calcDDTable = useCallback((gs) => {
    if (!dds) return null
    const dealPtr    = dds._malloc(64)
    const resultsPtr = dds._malloc(80)
    try {
      writeDdTableDeal(dds, gs, dealPtr)
      const status = dds._CalcDDtable(dealPtr, resultsPtr)
      if (status !== 1) { console.error('CalcDDtable status', status); return null }
      return readDdTableResults(dds, resultsPtr)
    } finally {
      dds._free(dealPtr)
      dds._free(resultsPtr)
    }
  }, [dds])

  // Full 5×4 DD table taking raw hands { north, east, south, west } arrays directly
  const calcDDTableFromHands = useCallback((hands) => {
    if (!dds) return null
    return calcDDTable({ north: { hand: hands.north }, east: { hand: hands.east },
                         south: { hand: hands.south }, west: { hand: hands.west } })
  }, [dds, calcDDTable])

  // Per-card DD analysis for the active player.
  // Returns a Map<'suit-value', declarerTricks> — always expressed as tricks
  // for declarer's side regardless of who is on lead.
  //
  // We do NOT store intermediates or adjust for prior plays — we always call
  // DDS fresh with the current position and use whatever it returns.
  const solveBoard = useCallback(({ trumpSuit, leader, currentTrick, hands }) => {
    if (!dds) return null
    const dealPtr = dds._malloc(96)
    const futPtr  = dds._malloc(216)
    try {
      writeDeal(dds, dealPtr, { trumpSuit, leader, currentTrick, hands })
      // target=-1: find all; solutions=3: return all cards with scores; mode=1: normal
      const status = dds._SolveBoard(dealPtr, -1, 3, 1, futPtr, 0)
      if (status !== 1) { console.error('SolveBoard status', status); return null }
      const futureTricks = readFutureTricks(dds, futPtr)
      const rawMap = buildScoreMap(futureTricks)

      // Build result map keyed by gamestate 'suit-value' (value 0-12).
      // Scores are raw DDS values: tricks remaining for the active player's side.
      // Caller is responsible for converting to declarer-side totals.
      const result = new Map()
      for (const [key, score] of rawMap) {
        const [suitIdx, ddsRank] = key.split('-').map(Number)
        const gsValue = ddsRank - 2          // DDS rank 2-14 → gamestate value 0-12
        const suitName = DDS_SUIT_NAMES[suitIdx]
        result.set(`${suitName}-${gsValue}`, score)
      }
      return result
    } finally {
      dds._free(dealPtr)
      dds._free(futPtr)
    }
  }, [dds])

  // Speed test: generate 100 random hands, solve boards in groups of 10, log times
  const runSpeedTest = useCallback(async () => {
    if (!dds) return
    const deals = generateRandomDeals(100)
    const trumpSuit = 'spades'
    const leader = 'north'

    for (let i = 0; i < 100; i += 10) {
      const group = deals.slice(i, i + 10)
      const start = performance.now()
      for (const hands of group) {
        solveBoard({ trumpSuit, leader, currentTrick: [], hands })
      }
      const elapsed = performance.now() - start
      console.log(`Solved ${group.length} boards in ${elapsed.toFixed(1)}ms (${(elapsed / group.length).toFixed(2)}ms per board)`)
      // Yield to event loop between groups
      await new Promise(r => setTimeout(r, 0))
    }
    console.log('Speed test complete: 100 random boards solved')
  }, [dds, solveBoard])

  return { calcDDTable, calcDDTableFromHands, solveBoard, runSpeedTest, loading, error, ready: !!dds }
}
