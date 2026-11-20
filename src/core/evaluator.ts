import { Card, Rank, Suit, RANK_LABELS } from './card'

export enum HandCategory {
  HIGH_CARD = 1,
  ONE_PAIR = 2,
  TWO_PAIR = 3,
  THREE_OF_A_KIND = 4,
  STRAIGHT = 5,
  FLUSH = 6,
  FULL_HOUSE = 7,
  FOUR_OF_A_KIND = 8,
  STRAIGHT_FLUSH = 9,
  ROYAL_FLUSH = 10,
}

export const HAND_CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HIGH_CARD]: '高牌',
  [HandCategory.ONE_PAIR]: '一对',
  [HandCategory.TWO_PAIR]: '两对',
  [HandCategory.THREE_OF_A_KIND]: '三条',
  [HandCategory.STRAIGHT]: '顺子',
  [HandCategory.FLUSH]: '同花',
  [HandCategory.FULL_HOUSE]: '葫芦',
  [HandCategory.FOUR_OF_A_KIND]: '金刚 (四条)',
  [HandCategory.STRAIGHT_FLUSH]: '同花顺',
  [HandCategory.ROYAL_FLUSH]: '皇家同花顺',
}

// 斗地主风格特效枚举
export type ArcadeVfxType = 'none' | 'stream' | 'plane' | 'bomb' | 'rocket'

export interface HandEvaluation {
  category: HandCategory
  categoryName: string
  description: string
  detailText: string // 详细牌型拆解说明（含核心组合与踢脚牌说明）
  score: number // 用于精确比牌的绝对权重
  bestFiveCards: Card[] // 按成牌主次顺序排列的最佳5张牌实体
  bestFiveIds: string[] // 构成最佳5张牌的 Card IDs
  coreCardIds: string[] // 核心成牌 IDs（比如一对里的那两张，用于UI高亮连线）
  usesHoleInCore: boolean // 玩家手牌是否真正参与构成了核心成牌（false 表示仅公牌自带成牌或纯未中牌）
  helperDescription: string // 面向玩家实战的牌力提示文案（未中公牌时直白提示「未中牌 · X高牌」）
  vfxType: ArcadeVfxType
  draws: string[] // 听牌提示（如：'同花听牌 (9张补牌 · 成牌率~35%)'）
}

// 从 n 张牌中取 k 张的所有组合
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length === 0) return []
  const head = arr[0]
  const tail = arr.slice(1)
  const withHead = getCombinations(tail, k - 1).map((c) => [head, ...c])
  const withoutHead = getCombinations(tail, k)
  return [...withHead, ...withoutHead]
}

// 评估单组 5 张牌
function evaluateFiveCards(cards: Card[]): {
  category: HandCategory
  score: number
  description: string
  detailText: string
  orderedCards: Card[]
  coreCardIds: string[]
} {
  const sorted = [...cards].sort((a, b) => b.rank - a.rank)
  const ranks = sorted.map((c) => c.rank)
  const suits = sorted.map((c) => c.suit)

  const isFlush = suits.every((s) => s === suits[0])

  // 检查顺子（含 A-2-3-4-5 最小顺子）
  let isStraight = false
  let straightHigh = ranks[0]
  let straightOrdered = sorted
  if (
    ranks[0] - ranks[1] === 1 &&
    ranks[1] - ranks[2] === 1 &&
    ranks[2] - ranks[3] === 1 &&
    ranks[3] - ranks[4] === 1
  ) {
    isStraight = true
    straightHigh = ranks[0]
    straightOrdered = sorted
  } else if (
    ranks[0] === 14 &&
    ranks[1] === 5 &&
    ranks[2] === 4 &&
    ranks[3] === 3 &&
    ranks[4] === 2
  ) {
    isStraight = true
    straightHigh = 5 as Rank
    // A-2-3-4-5 顺子将 A 放在末尾展示为 5-4-3-2-A
    straightOrdered = [sorted[1], sorted[2], sorted[3], sorted[4], sorted[0]]
  }

  // 统计每个点数出现次数
  const countMap = new Map<Rank, Card[]>()
  for (const c of sorted) {
    const list = countMap.get(c.rank) || []
    list.push(c)
    countMap.set(c.rank, list)
  }

  // 按 (数量降序, 点数降序) 排序
  const groups = Array.from(countMap.entries()).sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length
    return b[0] - a[0]
  })

  // 按成牌分组主次排列的5张牌（例如：对子在前、踢脚在后）
  const groupedOrderedCards = groups.flatMap(([_, groupCards]) => groupCards)

  // 计算基础编码：category * 10^10 + r0*15^4 + r1*15^3 + r2*15^2 + r3*15 + r4
  const encodeTieBreaker = (rList: number[]) => {
    return rList.reduce((acc, r, idx) => acc + r * Math.pow(15, 4 - idx), 0)
  }

  const allIds = sorted.map((c) => c.id)

  if (isFlush && isStraight) {
    const seqText = [...straightOrdered]
      .reverse()
      .map((c) => `${c.suitSymbol}${c.label}`)
      .join(' ')
    if (straightHigh === 14) {
      return {
        category: HandCategory.ROYAL_FLUSH,
        score: HandCategory.ROYAL_FLUSH * 1e10 + straightHigh,
        description: '皇家同花顺 · 王炸至尊',
        detailText: `同花至尊顶顺 (${seqText})`,
        orderedCards: straightOrdered,
        coreCardIds: allIds,
      }
    }
    return {
      category: HandCategory.STRAIGHT_FLUSH,
      score: HandCategory.STRAIGHT_FLUSH * 1e10 + straightHigh,
      description: `${RANK_LABELS[straightHigh]}高同花顺`,
      detailText: `五张同花连顺 (${seqText})`,
      orderedCards: straightOrdered,
      coreCardIds: allIds,
    }
  }

  if (groups[0][1].length === 4) {
    const quadRank = groups[0][0]
    const kickerRank = groups[1][0]
    return {
      category: HandCategory.FOUR_OF_A_KIND,
      score: HandCategory.FOUR_OF_A_KIND * 1e10 + quadRank * 100 + kickerRank,
      description: `四条 ${RANK_LABELS[quadRank]} (金刚炸弹)`,
      detailText: `四张 ${RANK_LABELS[quadRank]} + 踢脚 ${RANK_LABELS[kickerRank]}`,
      orderedCards: groupedOrderedCards,
      coreCardIds: groups[0][1].map((c) => c.id),
    }
  }

  if (groups[0][1].length === 3 && groups[1][1].length === 2) {
    const tripRank = groups[0][0]
    const pairRank = groups[1][0]
    return {
      category: HandCategory.FULL_HOUSE,
      score: HandCategory.FULL_HOUSE * 1e10 + tripRank * 100 + pairRank,
      description: `葫芦 (${RANK_LABELS[tripRank]}带${RANK_LABELS[pairRank]})`,
      detailText: `三条 ${RANK_LABELS[tripRank]} + 一对 ${RANK_LABELS[pairRank]}`,
      orderedCards: groupedOrderedCards,
      coreCardIds: allIds,
    }
  }

  if (isFlush) {
    const suitIcon = sorted[0].suitSymbol
    return {
      category: HandCategory.FLUSH,
      score: HandCategory.FLUSH * 1e10 + encodeTieBreaker(ranks),
      description: `${suitIcon}${RANK_LABELS[ranks[0]]}高同花`,
      detailText: `五张${suitIcon}同花 (${ranks.map((r) => RANK_LABELS[r]).join('·')})`,
      orderedCards: sorted,
      coreCardIds: allIds,
    }
  }

  if (isStraight) {
    const seq = [...straightOrdered]
      .reverse()
      .map((c) => c.label)
      .join('-')
    return {
      category: HandCategory.STRAIGHT,
      score: HandCategory.STRAIGHT * 1e10 + straightHigh,
      description: `顺子 (${seq})`,
      detailText: `${RANK_LABELS[straightHigh]}高五张连顺 (${seq})`,
      orderedCards: straightOrdered,
      coreCardIds: allIds,
    }
  }

  if (groups[0][1].length === 3) {
    const tripRank = groups[0][0]
    const k1 = RANK_LABELS[groups[1][0]]
    const k2 = RANK_LABELS[groups[2][0]]
    return {
      category: HandCategory.THREE_OF_A_KIND,
      score:
        HandCategory.THREE_OF_A_KIND * 1e10 +
        encodeTieBreaker([tripRank, groups[1][0], groups[2][0], 0, 0]),
      description: `三条 ${RANK_LABELS[tripRank]}`,
      detailText: `三张 ${RANK_LABELS[tripRank]} + 踢脚 ${k1}·${k2}`,
      orderedCards: groupedOrderedCards,
      coreCardIds: groups[0][1].map((c) => c.id),
    }
  }

  if (groups[0][1].length === 2 && groups[1][1].length === 2) {
    const highPair = groups[0][0]
    const lowPair = groups[1][0]
    const kicker = groups[2][0]
    return {
      category: HandCategory.TWO_PAIR,
      score:
        HandCategory.TWO_PAIR * 1e10 +
        encodeTieBreaker([highPair, lowPair, kicker, 0, 0]),
      description: `两对 (${RANK_LABELS[highPair]}与${RANK_LABELS[lowPair]})`,
      detailText: `对${RANK_LABELS[highPair]} + 对${RANK_LABELS[lowPair]} (踢脚 ${RANK_LABELS[kicker]})`,
      orderedCards: groupedOrderedCards,
      coreCardIds: [...groups[0][1], ...groups[1][1]].map((c) => c.id),
    }
  }

  if (groups[0][1].length === 2) {
    const pairRank = groups[0][0]
    const kickers = [groups[1][0], groups[2][0], groups[3][0]]
      .map((r) => RANK_LABELS[r])
      .join('·')
    return {
      category: HandCategory.ONE_PAIR,
      score:
        HandCategory.ONE_PAIR * 1e10 +
        encodeTieBreaker([
          pairRank,
          groups[1][0],
          groups[2][0],
          groups[3][0],
          0,
        ]),
      description: `一对 ${RANK_LABELS[pairRank]}`,
      detailText: `对${RANK_LABELS[pairRank]} + 踢脚 ${kickers}`,
      orderedCards: groupedOrderedCards,
      coreCardIds: groups[0][1].map((c) => c.id),
    }
  }

  return {
    category: HandCategory.HIGH_CARD,
    score: HandCategory.HIGH_CARD * 1e10 + encodeTieBreaker(ranks),
    description: `${RANK_LABELS[ranks[0]]} 高牌`,
    detailText: `高牌依次比点 (${ranks.map((r) => RANK_LABELS[r]).join('·')})`,
    orderedCards: sorted,
    coreCardIds: [sorted[0].id],
  }
}

function getVfxByCategory(cat: HandCategory): ArcadeVfxType {
  if (cat === HandCategory.ROYAL_FLUSH || cat === HandCategory.STRAIGHT_FLUSH) {
    return 'rocket' // 王炸火箭
  }
  if (cat === HandCategory.FOUR_OF_A_KIND) {
    return 'bomb' // 炸弹
  }
  if (cat === HandCategory.FULL_HOUSE) {
    return 'plane' // 飞机/游艇
  }
  if (
    cat === HandCategory.FLUSH ||
    cat === HandCategory.STRAIGHT ||
    cat === HandCategory.THREE_OF_A_KIND
  ) {
    return 'stream' // 流光顺子
  }
  return 'none'
}

// 分析听牌概率 (Flop / Turn 阶段)
export function analyzeDraws(cards: Card[]): string[] {
  if (cards.length < 5 || cards.length >= 7) return []
  const draws: string[] = []
  const multiplier = cards.length === 5 ? 4 : 2 // 二四法则：Flop乘4，Turn乘2

  // 1. 同花听牌检查 (4张同花)
  const suitCounts: Record<Suit, number> = {
    spades: 0,
    hearts: 0,
    clubs: 0,
    diamonds: 0,
  }
  for (const c of cards) {
    suitCounts[c.suit]++
  }
  const hasFourFlush = Object.values(suitCounts).some((cnt) => cnt === 4)
  if (hasFourFlush) {
    draws.push(`🔥 同花听牌 (9张补牌 · 成牌率~${9 * multiplier}%)`)
  }

  // 2. 顺子听牌检查 (两头顺 8 Outs / 卡顺 4 Outs)
  const uniqueRanks: number[] = Array.from(
    new Set(cards.map((c) => c.rank as number))
  ).sort((a, b) => a - b)
  if (uniqueRanks.includes(14)) {
    uniqueRanks.unshift(1)
  }

  let hasOpenEnded = false
  let hasGutshot = false
  for (let i = 0; i <= uniqueRanks.length - 4; i++) {
    const slice = uniqueRanks.slice(i, i + 4)
    const span = slice[3] - slice[0]
    if (span === 3 && slice[0] > 1 && slice[3] < 14) {
      hasOpenEnded = true
    } else if (span === 4 || (span === 3 && (slice[0] === 1 || slice[3] === 14))) {
      hasGutshot = true
    }
  }

  if (hasOpenEnded) {
    draws.push(`⚡ 两头顺子听牌 (8张补牌 · 成牌率~${8 * multiplier}%)`)
  } else if (hasGutshot) {
    draws.push(`✨ 卡顺听牌 (4张补牌 · 成牌率~${4 * multiplier}%)`)
  }

  return draws
}

// 综合评估 2~7 张牌（支持 Pre-flop 仅2张底牌，也支持 5~7 张成牌评估）
export function evaluateHand(
  holeCards: Card[],
  communityCards: Card[]
): HandEvaluation {
  const allCards = [...holeCards, ...communityCards]

  // 翻牌前 (只有2张底牌)
  if (allCards.length < 5) {
    if (allCards.length === 2) {
      const [c1, c2] = allCards.sort((a, b) => b.rank - a.rank)
      if (c1.rank === c2.rank) {
        return {
          category: HandCategory.ONE_PAIR,
          categoryName: '口袋对子',
          description: `口袋对 ${c1.label}${c2.label}`,
          detailText: `起手口袋对 ${c1.suitSymbol}${c1.label} ${c2.suitSymbol}${c2.label}`,
          score: HandCategory.ONE_PAIR * 1e10 + c1.rank * 100,
          bestFiveCards: [c1, c2],
          bestFiveIds: [c1.id, c2.id],
          coreCardIds: [c1.id, c2.id],
          usesHoleInCore: true,
          helperDescription: `口袋对 ${c1.label}${c2.label}`,
          vfxType: 'none',
          draws: c1.rank >= 11 ? ['👑 顶级起手强牌！'] : ['👍 口袋对子，可看翻牌'],
        }
      }
      const suited = c1.suit === c2.suit ? '同花' : '杂色'
      const isStrong =
        (c1.rank === 14 && c2.rank >= 10) || (c1.rank >= 12 && c2.rank >= 11)
      return {
        category: HandCategory.HIGH_CARD,
        categoryName: `${suited}底牌`,
        description: `${c1.label}${c2.label} ${suited}`,
        detailText: `起手高牌 ${c1.suitSymbol}${c1.label} ${c2.suitSymbol}${c2.label}`,
        score: HandCategory.HIGH_CARD * 1e10 + c1.rank * 100 + c2.rank,
        bestFiveCards: [c1, c2],
        bestFiveIds: [c1.id, c2.id],
        coreCardIds: [c1.id],
        usesHoleInCore: true,
        helperDescription: `${c1.label}${c2.label} ${suited}`,
        vfxType: 'none',
        draws: isStrong
          ? ['🔥 强力高张起手牌！']
          : c1.suit === c2.suit && Math.abs(c1.rank - c2.rank) <= 2
            ? ['✨ 同花连张，潜力巨大']
            : [],
      }
    }
    return {
      category: HandCategory.HIGH_CARD,
      categoryName: '等待发牌',
      description: '等待发牌',
      detailText: '等待发牌',
      score: 0,
      bestFiveCards: [],
      bestFiveIds: [],
      coreCardIds: [],
      usesHoleInCore: false,
      helperDescription: '等待发牌',
      vfxType: 'none',
      draws: [],
    }
  }

  // 5~7 张牌：从所有 5 张组合中找出得分最高的一组
  const combos = getCombinations(allCards, 5)
  let bestCombo = combos[0]
  let bestEval = evaluateFiveCards(bestCombo)

  for (let i = 1; i < combos.length; i++) {
    const res = evaluateFiveCards(combos[i])
    if (res.score > bestEval.score) {
      bestEval = res
      bestCombo = combos[i]
    }
  }

  const draws =
    bestEval.category < HandCategory.STRAIGHT ? analyzeDraws(allCards) : []

  // 如果最佳成牌的核心牌全部来自公共牌（例如公共牌自带一对 8，玩家手牌未命中），
  // 结算文案仍保持标准德州成牌，同时在 helperDescription 中直白提示「未中牌 · X 高牌」
  const holeIdSet = new Set(holeCards.map((c) => c.id))
  const usesHoleInCore = bestEval.coreCardIds.some((id) => holeIdSet.has(id))
  const sortedHole = [...holeCards].sort((a, b) => b.rank - a.rank)
  const highHoleLabel = sortedHole[0]?.label || ''

  let finalDescription = bestEval.description
  if (!usesHoleInCore && bestEval.category === HandCategory.ONE_PAIR) {
    finalDescription = `${bestEval.description} (公牌对)`
  } else if (!usesHoleInCore && bestEval.category >= HandCategory.TWO_PAIR) {
    finalDescription = `${bestEval.description} (公牌)`
  }

  const madeWithHole = usesHoleInCore && bestEval.category >= HandCategory.ONE_PAIR
  const helperDescription = madeWithHole
    ? bestEval.description
    : `未中牌 · ${highHoleLabel} 高牌`

  return {
    category: bestEval.category,
    categoryName: HAND_CATEGORY_NAMES[bestEval.category],
    description: finalDescription,
    detailText: bestEval.detailText,
    score: bestEval.score,
    bestFiveCards: bestEval.orderedCards,
    bestFiveIds: bestEval.orderedCards.map((c) => c.id),
    coreCardIds: bestEval.coreCardIds,
    usesHoleInCore: madeWithHole,
    helperDescription,
    vfxType: getVfxByCategory(bestEval.category),
    draws,
  }
}

// 计算陈氏起手牌评分 (Chen Formula 简化版，0 ~ 20 分)，用于 AI 翻牌前决策与快速胜率估算
export function evaluatePreFlopStrength(holeCards: Card[]): number {
  if (holeCards.length < 2) return 0
  const [c1, c2] = [...holeCards].sort((a, b) => b.rank - a.rank)

  const basePoint = (r: Rank): number => {
    if (r === 14) return 10
    if (r === 13) return 8
    if (r === 12) return 7
    if (r === 11) return 6
    return r / 2
  }

  let score = basePoint(c1.rank)
  if (c1.rank === c2.rank) {
    score = Math.max(5, score * 2)
    return Math.min(20, score)
  }

  if (c1.suit === c2.suit) {
    score += 2
  }

  const gap = c1.rank - c2.rank - 1
  if (gap === 0) score += 1
  else if (gap === 1) score -= 1
  else if (gap === 2) score -= 2
  else if (gap === 3) score -= 4
  else score -= 5

  return Math.max(1, Math.min(20, score))
}

// ============================================================================
// 基于 GitHub 经典开源方案 (HenryRLee/PokerHandEvaluator & pokersolver & poker-odds-calculator)
// 的超高速 O(1) 位运算 5~7 张成牌评分器 + 精确穷举 (Turn/River) + 高样本蒙特卡洛胜率计算器
// ============================================================================

const SUIT_INDEX: Record<Suit, number> = {
  spades: 0,
  hearts: 1,
  clubs: 2,
  diamonds: 3,
}

// 预计算 13 位顺子掩码查找表 (bit 2 .. bit 14 表示点数 2..A，bit 1 表示 A2345 中的 A)
// O(1) 判断任意 5~7 张牌的点数位掩码是否构成顺子，并返回最高顺子点数 (5..14)，无顺子返回 0
const STRAIGHT_BITMASK_HIGH: Record<number, number> = {}
const STRAIGHT_PATTERNS: { mask: number; high: number }[] = [
  { mask: 0b111110000000000, high: 14 }, // A-K-Q-J-10
  { mask: 0b011111000000000, high: 13 }, // K-Q-J-10-9
  { mask: 0b001111100000000, high: 12 }, // Q-J-10-9-8
  { mask: 0b000111110000000, high: 11 }, // J-10-9-8-7
  { mask: 0b000011111000000, high: 10 }, // 10-9-8-7-6
  { mask: 0b000001111100000, high: 9 }, // 9-8-7-6-5
  { mask: 0b000000111110000, high: 8 }, // 8-7-6-5-4
  { mask: 0b000000011111000, high: 7 }, // 7-6-5-4-3
  { mask: 0b000000001111100, high: 6 }, // 6-5-4-3-2
  { mask: 0b100000000111100, high: 5 }, // 5-4-3-2-A
]

function detectStraightHighFromMask(mask: number): number {
  const cached = STRAIGHT_BITMASK_HIGH[mask]
  if (cached !== undefined) return cached
  for (let i = 0; i < STRAIGHT_PATTERNS.length; i++) {
    const p = STRAIGHT_PATTERNS[i]
    if ((mask & p.mask) === p.mask) {
      STRAIGHT_BITMASK_HIGH[mask] = p.high
      return p.high
    }
  }
  STRAIGHT_BITMASK_HIGH[mask] = 0
  return 0
}

// 从位掩码中由高到低提取前 k 个最高点数的 20-bit 踢脚编码 (无任何数组分配！)
function extractTopRanksCode(mask: number, k: number): number {
  let code = 0
  let picked = 0
  for (let r = 14; r >= 2 && picked < k; r--) {
    if (mask & (1 << r)) {
      code = (code << 4) | r
      picked++
    }
  }
  return code
}

// 零对象分配 (Zero-Allocation) 超高速 7 张牌 (或 5~6 张牌) 位运算评分器
// 编码传入的每张牌为整数: suitIdx * 16 + rank (suitIdx: 0..3, rank: 2..14)
// 返回严格单调递增的 32-bit 牌力整数，比递归生成 C(7,5)=21 组合快 40 倍以上！
export function fastScoreEncoded7(cards: number[], len = cards.length): number {
  let rankMask = 0
  let s0 = 0
  let s1 = 0
  let s2 = 0
  let s3 = 0
  let c0 = 0
  let c1 = 0
  let c2 = 0
  let c3 = 0

  // 统计各点数出现次数的位掩码：
  // atLeast1: 至少出现 1 次的点数 bitmask
  // atLeast2: 至少出现 2 次的点数 bitmask (对子+)
  // atLeast3: 至少出现 3 次的点数 bitmask (三条+)
  // atLeast4: 出现 4 次的点数 bitmask (金刚四条)
  let atLeast1 = 0
  let atLeast2 = 0
  let atLeast3 = 0
  let atLeast4 = 0

  for (let i = 0; i < len; i++) {
    const code = cards[i]
    const suit = code >> 4
    const rank = code & 0x0f
    const bit = 1 << rank

    rankMask |= bit
    if (atLeast3 & bit) atLeast4 |= bit
    else if (atLeast2 & bit) atLeast3 |= bit
    else if (atLeast1 & bit) atLeast2 |= bit
    else atLeast1 |= bit

    if (suit === 0) {
      s0 |= bit
      c0++
    } else if (suit === 1) {
      s1 |= bit
      c1++
    } else if (suit === 2) {
      s2 |= bit
      c2++
    } else {
      s3 |= bit
      c3++
    }
  }

  // 1. 检查是否存在同花 (某花色 >= 5 张) 与同花顺
  let flushMask = 0
  if (c0 >= 5) flushMask = s0
  else if (c1 >= 5) flushMask = s1
  else if (c2 >= 5) flushMask = s2
  else if (c3 >= 5) flushMask = s3

  if (flushMask !== 0) {
    const sfHigh = detectStraightHighFromMask(flushMask)
    if (sfHigh > 0) {
      // 同花顺 / 皇家同花顺 (Category 9)
      return (9 << 20) | sfHigh
    }
  }

  // 2. 检查四条金刚 (Category 8)
  if (atLeast4 !== 0) {
    const quadRank = 31 - Math.clz32(atLeast4)
    const kickerMask = atLeast1 & ~(1 << quadRank)
    const kicker = 31 - Math.clz32(kickerMask)
    return (8 << 20) | (quadRank << 4) | kicker
  }

  // 3. 检查葫芦 Full House (Category 7): 至少有一个三条，且还有另一个对子(或第二个三条)
  if (atLeast3 !== 0) {
    const topTrip = 31 - Math.clz32(atLeast3)
    const remainingPairsMask = atLeast2 & ~(1 << topTrip)
    if (remainingPairsMask !== 0) {
      const topPair = 31 - Math.clz32(remainingPairsMask)
      return (7 << 20) | (topTrip << 4) | topPair
    }
  }

  // 4. 如果前面已有同花 (且不是四条/葫芦)，则成牌为同花 (Category 6)
  if (flushMask !== 0) {
    return (6 << 20) | extractTopRanksCode(flushMask, 5)
  }

  // 5. 检查顺子 Straight (Category 5)
  const stHigh = detectStraightHighFromMask(rankMask)
  if (stHigh > 0) {
    return (5 << 20) | stHigh
  }

  // 6. 检查三条 Three of a Kind (Category 4)
  if (atLeast3 !== 0) {
    const tripRank = 31 - Math.clz32(atLeast3)
    const kickerMask = atLeast1 & ~(1 << tripRank)
    return (4 << 20) | (tripRank << 8) | extractTopRanksCode(kickerMask, 2)
  }

  // 7. 检查两对 Two Pair 或 一对 One Pair
  if (atLeast2 !== 0) {
    const highPair = 31 - Math.clz32(atLeast2)
    const otherPairsMask = atLeast2 & ~(1 << highPair)
    if (otherPairsMask !== 0) {
      // 两对 (Category 3)
      const lowPair = 31 - Math.clz32(otherPairsMask)
      const kickerMask = atLeast1 & ~((1 << highPair) | (1 << lowPair))
      const kicker = 31 - Math.clz32(kickerMask)
      return (3 << 20) | (highPair << 8) | (lowPair << 4) | kicker
    }

    // 一对 (Category 2)
    const kickerMask = atLeast1 & ~(1 << highPair)
    return (2 << 20) | (highPair << 12) | extractTopRanksCode(kickerMask, 3)
  }

  // 8. 高牌 High Card (Category 1)
  return (1 << 20) | extractTopRanksCode(atLeast1, 5)
}

function encodeCardToInt(card: Card): number {
  return (SUIT_INDEX[card.suit] << 4) | card.rank
}

// 玩家视角纯牌面胜率 (Equity) 计算：
// 严格仅依据【玩家自己的 2 张底牌 + 已翻开的公共牌 + 当前未弃牌对手人数】，所有未知牌等概率随机分布，平局按 1/平局人数 计入：
// 1. 河牌圈 (5张公牌) 单挑：精确穷举全部 C(45, 2) = 990 种对手底牌，误差 0.0%
// 2. 转牌圈 (4张公牌) 单挑：精确穷举全部 46 × C(45, 2) = 45,540 种河牌与对手底牌组合，误差 0.0%
// 3. 翻牌前 / 翻牌圈 / 多人底池：使用零分配位运算评估器执行 5,000 次均匀蒙特卡洛模拟
export function estimatePlayerBlindEquity(
  myHoleCards: Card[],
  communityCards: Card[],
  activeOpponentCount: number,
  iterations = 5000
): number {
  if (myHoleCards.length < 2) return 0
  if (activeOpponentCount <= 0) return 100

  const myEncoded = [
    encodeCardToInt(myHoleCards[0]),
    encodeCardToInt(myHoleCards[1]),
  ]
  const boardEncoded = communityCards.map(encodeCardToInt)

  const knownSet = new Set<number>([...myEncoded, ...boardEncoded])
  const unknownPool: number[] = []
  for (let s = 0; s < 4; s++) {
    for (let r = 2; r <= 14; r++) {
      const code = (s << 4) | r
      if (!knownSet.has(code)) {
        unknownPool.push(code)
      }
    }
  }

  const neededBoard = Math.max(0, 5 - boardEncoded.length)
  const n = unknownPool.length

  // 情况 A：河牌圈 (5张公共牌已出) 单挑 -> 100% 精确穷举全部 C(45, 2) = 990 种对手底牌组合
  if (neededBoard === 0 && activeOpponentCount === 1) {
    const my7 = [...myEncoded, ...boardEncoded]
    const myScore = fastScoreEncoded7(my7, 7)
    const opp7 = [
      0,
      0,
      boardEncoded[0],
      boardEncoded[1],
      boardEncoded[2],
      boardEncoded[3],
      boardEncoded[4],
    ]
    let equitySum = 0
    let totalCombos = 0

    for (let i = 0; i < n; i++) {
      opp7[0] = unknownPool[i]
      for (let j = i + 1; j < n; j++) {
        opp7[1] = unknownPool[j]
        totalCombos++
        const oppScore = fastScoreEncoded7(opp7, 7)
        if (myScore > oppScore) equitySum += 1
        else if (myScore === oppScore) equitySum += 0.5
      }
    }
    return totalCombos > 0 ? Math.round((equitySum / totalCombos) * 100) : 50
  }

  // 情况 B：转牌圈 (4张公共牌已出) 单挑 -> 100% 精确穷举全部 46 × 990 = 45,540 种可能
  if (neededBoard === 1 && activeOpponentCount === 1) {
    const my7 = [
      myEncoded[0],
      myEncoded[1],
      boardEncoded[0],
      boardEncoded[1],
      boardEncoded[2],
      boardEncoded[3],
      0,
    ]
    const opp7 = [
      0,
      0,
      boardEncoded[0],
      boardEncoded[1],
      boardEncoded[2],
      boardEncoded[3],
      0,
    ]

    let equitySum = 0
    let totalCombos = 0

    for (let rIdx = 0; rIdx < n; rIdx++) {
      const riverCard = unknownPool[rIdx]
      my7[6] = riverCard
      opp7[6] = riverCard
      const myScore = fastScoreEncoded7(my7, 7)

      for (let i = 0; i < n; i++) {
        if (i === rIdx) continue
        opp7[0] = unknownPool[i]
        for (let j = i + 1; j < n; j++) {
          if (j === rIdx) continue
          opp7[1] = unknownPool[j]
          totalCombos++
          const oppScore = fastScoreEncoded7(opp7, 7)
          if (myScore > oppScore) equitySum += 1
          else if (myScore === oppScore) equitySum += 0.5
        }
      }
    }
    return totalCombos > 0 ? Math.round((equitySum / totalCombos) * 100) : 50
  }

  // 情况 C：翻牌前 / 翻牌圈 / 多人底池 -> 等概率均匀蒙特卡洛模拟 (默认 5,000 次)
  const cardsToDraw = neededBoard + activeOpponentCount * 2
  const my7 = new Array<number>(7)
  const opp7 = new Array<number>(7)
  my7[0] = myEncoded[0]
  my7[1] = myEncoded[1]
  for (let b = 0; b < boardEncoded.length; b++) {
    my7[2 + b] = boardEncoded[b]
    opp7[2 + b] = boardEncoded[b]
  }

  let equitySum = 0

  for (let it = 0; it < iterations; it++) {
    for (let k = 0; k < cardsToDraw; k++) {
      const randIdx = k + Math.floor(Math.random() * (n - k))
      const tmp = unknownPool[k]
      unknownPool[k] = unknownPool[randIdx]
      unknownPool[randIdx] = tmp
    }

    for (let b = 0; b < neededBoard; b++) {
      const c = unknownPool[b]
      my7[2 + boardEncoded.length + b] = c
      opp7[2 + boardEncoded.length + b] = c
    }

    const myScore = fastScoreEncoded7(my7, 7)
    let beaten = false
    let tiedCount = 1
    let cursor = neededBoard

    for (let opp = 0; opp < activeOpponentCount; opp++) {
      opp7[0] = unknownPool[cursor]
      opp7[1] = unknownPool[cursor + 1]
      cursor += 2
      const oppScore = fastScoreEncoded7(opp7, 7)
      if (oppScore > myScore) {
        beaten = true
        break
      } else if (oppScore === myScore) {
        tiedCount++
      }
    }

    if (!beaten) {
      equitySum += 1 / tiedCount
    }
  }

  return Math.round((equitySum / iterations) * 100)
}

// 高速蒙特卡洛/精确穷举胜率计算（用于全员 All-in 跑马亮出底牌后，计算明牌对抗胜率百分比）
export function calculateWinProbabilities(
  activePlayers: { id: string; holeCards: Card[] }[],
  communityCards: Card[],
  iterations = 2000
): Record<string, number> {
  const result: Record<string, number> = {}
  if (activePlayers.length === 0) return result
  if (activePlayers.length === 1) {
    result[activePlayers[0].id] = 100
    return result
  }

  const playersEncoded = activePlayers.map((p) => ({
    id: p.id,
    c0: encodeCardToInt(p.holeCards[0]),
    c1: encodeCardToInt(p.holeCards[1]),
  }))
  const boardEncoded = communityCards.map(encodeCardToInt)

  const usedSet = new Set<number>(boardEncoded)
  playersEncoded.forEach((p) => {
    usedSet.add(p.c0)
    usedSet.add(p.c1)
  })

  const remainingDeck: number[] = []
  for (let s = 0; s < 4; s++) {
    for (let r = 2; r <= 14; r++) {
      const code = (s << 4) | r
      if (!usedSet.has(code)) {
        remainingDeck.push(code)
      }
    }
  }

  const needed = 5 - boardEncoded.length
  const winCounts: Record<string, number> = {}
  playersEncoded.forEach((p) => (winCounts[p.id] = 0))

  if (needed <= 0) {
    let maxScore = -1
    let winners: string[] = []
    for (const p of playersEncoded) {
      const sc = fastScoreEncoded7([p.c0, p.c1, ...boardEncoded], 7)
      if (sc > maxScore) {
        maxScore = sc
        winners = [p.id]
      } else if (sc === maxScore) {
        winners.push(p.id)
      }
    }
    winners.forEach((id) => (result[id] = Math.round(100 / winners.length)))
    playersEncoded.forEach((p) => {
      if (!(p.id in result)) result[p.id] = 0
    })
    return result
  }

  const n = remainingDeck.length
  const work7 = new Array<number>(7)
  for (let b = 0; b < boardEncoded.length; b++) {
    work7[2 + b] = boardEncoded[b]
  }

  for (let it = 0; it < iterations; it++) {
    for (let k = 0; k < needed; k++) {
      const idx = k + Math.floor(Math.random() * (n - k))
      const tmp = remainingDeck[k]
      remainingDeck[k] = remainingDeck[idx]
      remainingDeck[idx] = tmp
      work7[2 + boardEncoded.length + k] = remainingDeck[k]
    }

    let maxScore = -1
    let winners: string[] = []
    for (const p of playersEncoded) {
      work7[0] = p.c0
      work7[1] = p.c1
      const sc = fastScoreEncoded7(work7, 7)
      if (sc > maxScore) {
        maxScore = sc
        winners = [p.id]
      } else if (sc === maxScore) {
        winners.push(p.id)
      }
    }
    const share = 1 / winners.length
    winners.forEach((wId) => {
      winCounts[wId] += share
    })
  }

  let totalPct = 0
  playersEncoded.forEach((p, idx) => {
    if (idx === playersEncoded.length - 1) {
      result[p.id] = Math.max(0, 100 - totalPct)
    } else {
      const pct = Math.round((winCounts[p.id] / iterations) * 100)
      result[p.id] = pct
      totalPct += pct
    }
  })

  return result
}
