// 主池与多重边池 (Side Pots) 结算器

export interface PlayerContribution {
  id: string
  totalBet: number // 本局累计投入底池的总额
  folded: boolean
  score: number // 摊牌时的牌力得分
}

export interface SidePot {
  name: string // '主池' | '边池 1' | '边池 2'...
  amount: number
  eligiblePlayerIds: string[] // 有资格争夺该池的未弃牌玩家
}

export interface PotDistribution {
  potName: string
  amount: number
  winnerIds: string[]
  perWinnerAmount: number
}

// 根据所有玩家本局的总下注额，切割主池与边池
export function calculateSidePots(players: PlayerContribution[]): SidePot[] {
  const activeContribs = players.filter((p) => p.totalBet > 0)
  if (activeContribs.length === 0) return []

  // 获取所有未弃牌玩家的下注水位线（排序去重）
  const allLevels = Array.from(
    new Set(activeContribs.map((p) => p.totalBet))
  ).sort((a, b) => a - b)

  const rawPots: SidePot[] = []
  let prevLevel = 0

  for (const level of allLevels) {
    const slice = level - prevLevel
    if (slice <= 0) continue

    const contributors = activeContribs.filter((p) => p.totalBet >= level)
    const sliceAmount = slice * contributors.length
    const eligible = contributors
      .filter((p) => !p.folded)
      .map((p) => p.id)

    if (sliceAmount > 0) {
      // 如果前一个池子的合格争夺者集合与当前完全一致，则合并，避免产生多余的空边池
      const lastPot = rawPots[rawPots.length - 1]
      if (
        lastPot &&
        lastPot.eligiblePlayerIds.length === eligible.length &&
        lastPot.eligiblePlayerIds.every((id) => eligible.includes(id))
      ) {
        lastPot.amount += sliceAmount
      } else {
        rawPots.push({
          name: rawPots.length === 0 ? '主池' : `边池 ${rawPots.length}`,
          amount: sliceAmount,
          eligiblePlayerIds: eligible,
        })
      }
    }
    prevLevel = level
  }

  return rawPots
}

// 结算派彩：计算每个池子归谁，以及每位玩家最终分得多少欢乐豆
export function distributePots(players: PlayerContribution[]): {
  pots: SidePot[]
  distributions: PotDistribution[]
  winningsByPlayer: Record<string, number>
} {
  const pots = calculateSidePots(players)
  const distributions: PotDistribution[] = []
  const winningsByPlayer: Record<string, number> = {}

  const playerMap = new Map<string, PlayerContribution>()
  players.forEach((p) => {
    playerMap.set(p.id, p)
    winningsByPlayer[p.id] = 0
  })

  for (const pot of pots) {
    if (pot.eligiblePlayerIds.length === 0) continue

    let maxScore = -1
    let winnerIds: string[] = []

    for (const pid of pot.eligiblePlayerIds) {
      const p = playerMap.get(pid)
      if (!p) continue
      if (p.score > maxScore) {
        maxScore = p.score
        winnerIds = [pid]
      } else if (p.score === maxScore) {
        winnerIds.push(pid)
      }
    }

    if (winnerIds.length > 0) {
      const perWinner = Math.floor(pot.amount / winnerIds.length)
      const remainder = pot.amount - perWinner * winnerIds.length

      winnerIds.forEach((wid, idx) => {
        const gain = perWinner + (idx === 0 ? remainder : 0)
        winningsByPlayer[wid] = (winningsByPlayer[wid] || 0) + gain
      })

      distributions.push({
        potName: pot.name,
        amount: pot.amount,
        winnerIds,
        perWinnerAmount: perWinner,
      })
    }
  }

  return {
    pots,
    distributions,
    winningsByPlayer,
  }
}
