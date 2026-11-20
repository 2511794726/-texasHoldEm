// 扑克牌花色与点数模型

export type Suit = 'spades' | 'hearts' | 'clubs' | 'diamonds'
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  id: string
  suit: Suit
  rank: Rank
  label: string
  suitSymbol: string
  color: 'red' | 'black'
}

export const SUIT_INFO: Record<Suit, { symbol: string; color: 'red' | 'black'; name: string }> = {
  spades: { symbol: '♠', color: 'black', name: '黑桃' },
  hearts: { symbol: '♥', color: 'red', name: '红桃' },
  clubs: { symbol: '♣', color: 'black', name: '梅花' },
  diamonds: { symbol: '♦', color: 'red', name: '方块' },
}

export const RANK_LABELS: Record<Rank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
}

export function createDeck(): Card[] {
  const suits: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds']
  const ranks: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
  const deck: Card[] = []

  for (const suit of suits) {
    for (const rank of ranks) {
      const info = SUIT_INFO[suit]
      deck.push({
        id: `${suit}_${rank}`,
        suit,
        rank,
        label: RANK_LABELS[rank],
        suitSymbol: info.symbol,
        color: info.color,
      })
    }
  }
  return shuffleDeck(deck)
}

export function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
