import { acceptHMRUpdate, defineStore } from 'pinia'
import { Card, createDeck } from '@/core/card'
import {
  ArcadeVfxType,
  calculateWinProbabilities,
  estimatePlayerBlindEquity,
  evaluateHand,
  HandCategory,
  HandEvaluation,
} from '@/core/evaluator'
import { AI_PERSONAS, AIPersona, makeAIDecision } from '@/core/ai'
import { calculateSidePots, distributePots, SidePot } from '@/core/pot'
import { sound } from '@/core/sound'
import { resolvePublicAsset } from '@/core/assets'
import { ROOM_CONFIGS, RoomConfig, useUserStore } from './user'

export type GameStage =
  | 'IDLE'
  | 'PRE_FLOP'
  | 'FLOP'
  | 'TURN'
  | 'RIVER'
  | 'SHOWDOWN'
  | 'SETTLEMENT'

export interface TablePlayer {
  id: string
  seatIndex: number // 0 = 玩家本人 (正下方)，1~5 = 5个AI对手
  isHuman: boolean
  name: string
  title: string
  avatar: string
  styleTag: string
  tagColor: string
  persona?: AIPersona
  chips: number
  currentBet: number // 当前街 (Street) 投入的筹码
  totalHandBet: number // 本局累计投入底池的筹码
  holeCards: Card[]
  folded: boolean
  allIn: boolean
  actedInRound: boolean
  lastActionText: string
  lastActionType: 'none' | 'blind' | 'check' | 'call' | 'raise' | 'allin' | 'fold'
  bubbleQuote: string
  bubbleTimer?: number
  isDealer: boolean
  isSmallBlind: boolean
  isBigBlind: boolean
  winProbability: number // All-in 跑马或实时估算的胜率 (0~100)
  handEvaluation?: HandEvaluation
  roundWinnings: number // 本局结算赢得的欢乐豆
  isWinner: boolean
  hitReactionEmoji: string // 被互动道具砸中时的反应特效
  actionVfxId: number // 每次发生下注/跟注/加注/全下/过牌/弃牌时自增，驱动前端特效重播
  actionVfxDelta: number // 本次动作新投入的筹码量
}

export interface TableActionAlert {
  id: number
  seatIndex: number
  playerName: string
  playerTitle: string
  isHuman: boolean
  actionType: 'raise' | 'allin' | 'call'
  addedAmount: number
  totalStreetBet: number
}

export interface ChipFlyEvent {
  id: string
  fromSeat: number
  toSeat: number // -1 表示飞向底池中央，0~5 表示从底池飞向赢家座位
  amount: number
  isAllIn?: boolean // 是否为双手整排豪迈推出的 All-in 全下动作
}

export interface InteractivePropEvent {
  id: string
  fromSeat: number
  toSeat: number
  propType: 'tomato' | 'water' | 'rose' | 'slipper'
}

export interface ShowdownPlayerResult {
  id: string
  seatIndex: number
  isHuman: boolean
  name: string
  title: string
  avatar: string
  isWinner: boolean
  winByFold: boolean
  folded: boolean
  holeCards: Card[]
  holeCardIds: string[]
  bestFiveCards: Card[]
  bestFiveIds: string[]
  coreCardIds: string[]
  categoryName: string
  handDescription: string
  handDetail: string
  score: number
  totalBet: number
  winnings: number
  netProfit: number
}

export const useGameStore = defineStore('happy_holdem_game', {
  state: () => ({
    currentRoom: ROOM_CONFIGS[0] as RoomConfig,
    stage: 'IDLE' as GameStage,
    handNumber: 0,
    deck: [] as Card[],
    communityCards: [] as Card[],
    players: [] as TablePlayer[],
    dealerSeatIndex: 0,
    activeSeatIndex: -1,
    highestBet: 0,
    minRaiseDelta: 100,
    potTotal: 0,
    sidePots: [] as SidePot[],
    isAllInRunout: false, // 是否处于全员 All-in 跑马亮牌状态
    activeVfx: 'none' as ArcadeVfxType,
    vfxTitle: '',
    vfxSubtitle: '',
    dealerQuote: '欢迎莅临樱花夜宴！紫灵仙子为您发牌，祝道友把把起手 AA~',
    settlementSummary: '' as string,
    settlementResults: [] as ShowdownPlayerResult[],
    mainWinnerResult: null as ShowdownPlayerResult | null,
    newlyUnlockedBadges: [] as string[],
    canBluffShow: false, // 玩家偷鸡成功时是否可点击“亮底牌炫耀”
    humanShowedBluff: false,
    latestActionAlert: null as TableActionAlert | null, // 最新一次加注/全下/跟注动态警报
    chipFlyQueue: [] as ChipFlyEvent[],
    propFlyQueue: [] as InteractivePropEvent[],
    actionTimerId: null as number | null,
    lastEquityCacheKey: '' as string,
  }),

  getters: {
    humanPlayer(state): TablePlayer | undefined {
      return state.players.find((p) => p.isHuman)
    },
    isHumanTurn(state): boolean {
      const p = state.players[state.activeSeatIndex]
      return (
        !!p &&
        p.isHuman &&
        !p.folded &&
        !p.allIn &&
        ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER'].includes(state.stage)
      )
    },
    humanToCall(state): number {
      const h = state.players.find((p) => p.isHuman)
      if (!h) return 0
      return Math.max(0, state.highestBet - h.currentBet)
    },
    humanEvaluation(state): HandEvaluation | null {
      const h = state.players.find((p) => p.isHuman)
      if (!h || h.holeCards.length === 0) return null
      return evaluateHand(h.holeCards, state.communityCards)
    },
    // 玩家本局已弃牌，但牌局仍在进行中（自动开启 8x 倍速快进模式）
    isFastForwarding(state): boolean {
      const h = state.players.find((p) => p.isHuman)
      return (
        !!h &&
        h.folded &&
        ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'].includes(state.stage)
      )
    },
  },

  actions: {
    // 清理定时器
    clearTimers() {
      if (this.actionTimerId !== null) {
        clearTimeout(this.actionTimerId)
        this.actionTimerId = null
      }
    },

    // 当外部系统（幸运大转盘、破产救济金、成就领奖、商城消费）增减欢乐豆时，实时同步到牌桌上的玩家筹码！
    syncExternalBeansDelta(delta: number) {
      const human = this.players[0]
      if (human && human.isHuman) {
        human.chips = Math.max(0, human.chips + delta)
      }
    },

    // 离开牌桌返回大厅（如果牌局未结束且已下注，自动同步并记录中途弃牌账单）
    leaveTable() {
      this.clearTimers()
      const userStore = useUserStore()
      const human = this.players[0]
      if (
        human &&
        ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER'].includes(this.stage) &&
        human.totalHandBet > 0
      ) {
        userStore.beans = human.chips
        userStore.recordGameResult({
          won: false,
          netBeans: -human.totalHandBet,
          potWon: 0,
          totalBet: human.totalHandBet,
          roomName: this.currentRoom.name,
          handNumber: this.handNumber,
          winnerSummary: '中途离桌弃牌',
        })
      }
      this.stage = 'IDLE'
    },

    // 进入指定场次并初始化 6 人牌桌
    enterRoom(room: RoomConfig) {
      this.clearTimers()
      const userStore = useUserStore()
      this.currentRoom = room
      this.handNumber = 0
      this.stage = 'IDLE'
      this.communityCards = []
      this.potTotal = 0
      this.sidePots = []
      this.dealerSeatIndex = 0
      this.dealerQuote = `欢迎莅临【${room.name}】！紫灵仙子为您执牌~`

      // 挑选 5 位 AI 对手入座 (Seat 1 ~ 5)
      const selectedPersonas: AIPersona[] = []
      for (const pid of room.aiPool) {
        const found = AI_PERSONAS.find((a) => a.id === pid)
        if (found && selectedPersonas.length < 5) {
          selectedPersonas.push(found)
        }
      }
      // 补齐 5 个
      for (const p of AI_PERSONAS) {
        if (selectedPersonas.length < 5 && !selectedPersonas.some((s) => s.id === p.id)) {
          selectedPersonas.push(p)
        }
      }

      // 构建 6 个座位 (0=玩家本人)
      const humanSeat: TablePlayer = {
        id: 'human_player',
        seatIndex: 0,
        isHuman: true,
        name: userStore.nickname,
        title: userStore.playerTitle,
        avatar: resolvePublicAsset(userStore.avatar),
        styleTag: '主角 · 达文西',
        tagColor: 'from-amber-400 to-orange-500',
        chips: userStore.beans,
        currentBet: 0,
        totalHandBet: 0,
        holeCards: [],
        folded: false,
        allIn: false,
        actedInRound: false,
        lastActionText: '',
        lastActionType: 'none',
        bubbleQuote: '',
        isDealer: true,
        isSmallBlind: false,
        isBigBlind: false,
        winProbability: 0,
        roundWinnings: 0,
        isWinner: false,
        hitReactionEmoji: '',
        actionVfxId: 0,
        actionVfxDelta: 0,
      }

      const aiSeats: TablePlayer[] = selectedPersonas.map((persona, idx) => {
        // 给 AI 分配接近场次推荐值的随机欢乐豆
        const baseBeans = room.recommendedBeans
        const aiChips =
          Math.floor((baseBeans * (0.75 + Math.random() * 0.7)) / room.bigBlind) *
          room.bigBlind

        return {
          id: persona.id,
          seatIndex: idx + 1,
          isHuman: false,
          name: persona.name,
          title: persona.title,
          avatar: persona.avatar,
          styleTag: persona.styleTag,
          tagColor: persona.tagColor,
          persona,
          chips: aiChips,
          currentBet: 0,
          totalHandBet: 0,
          holeCards: [],
          folded: false,
          allIn: false,
          actedInRound: false,
          lastActionText: '',
          lastActionType: 'none',
          bubbleQuote: '',
          isDealer: false,
          isSmallBlind: false,
          isBigBlind: false,
          winProbability: 0,
          roundWinnings: 0,
          isWinner: false,
          hitReactionEmoji: '',
          actionVfxId: 0,
          actionVfxDelta: 0,
        }
      })

      this.players = [humanSeat, ...aiSeats]
    },

    // 开始新一局
    startNewHand() {
      this.clearTimers()
      const userStore = useUserStore()

      // 同步玩家最新欢乐豆
      const human = this.players[0]
      if (!human) return
      human.chips = userStore.beans

      if (human.chips < this.currentRoom.bigBlind * 2) {
        this.dealerQuote = '老板，您的欢乐豆不够下盲注啦，快领救济金吧~'
        return
      }

      // 给破产的 AI 自动补充欢乐豆（带趣味提示）
      this.players.forEach((p) => {
        if (!p.isHuman && p.chips < this.currentRoom.bigBlind * 5) {
          p.chips = this.currentRoom.recommendedBeans
          this.setPlayerBubble(p.seatIndex, '刚去取了点私房豆子，继续战！')
        }
      })

      this.handNumber++
      this.deck = createDeck()
      this.communityCards = []
      this.potTotal = 0
      this.sidePots = []
      this.highestBet = 0
      this.minRaiseDelta = this.currentRoom.bigBlind
      this.isAllInRunout = false
      this.activeVfx = 'none'
      this.settlementSummary = ''
      this.settlementResults = []
      this.mainWinnerResult = null
      this.newlyUnlockedBadges = []
      this.canBluffShow = false
      this.humanShowedBluff = false
      this.latestActionAlert = null
      this.lastEquityCacheKey = ''

      // 轮转庄家位置
      this.dealerSeatIndex =
        this.handNumber === 1 ? 0 : (this.dealerSeatIndex + 1) % this.players.length
      const sbSeat = (this.dealerSeatIndex + 1) % this.players.length
      const bbSeat = (this.dealerSeatIndex + 2) % this.players.length

      // 重置所有玩家状态并发 2 张底牌
      this.players.forEach((p, idx) => {
        p.currentBet = 0
        p.totalHandBet = 0
        p.holeCards = [this.deck.pop()!, this.deck.pop()!]
        p.folded = false
        p.allIn = false
        p.actedInRound = false
        p.lastActionText = ''
        p.lastActionType = 'none'
        p.isDealer = idx === this.dealerSeatIndex
        p.isSmallBlind = idx === sbSeat
        p.isBigBlind = idx === bbSeat
        p.winProbability = 0
        p.handEvaluation = undefined
        p.roundWinnings = 0
        p.isWinner = false
        p.actionVfxId = 0
        p.actionVfxDelta = 0
      })

      sound.playDealCard()

      // 下小盲注与大盲注
      this.postBet(sbSeat, this.currentRoom.smallBlind, 'blind', '小盲')
      this.postBet(bbSeat, this.currentRoom.bigBlind, 'blind', '大盲')
      this.highestBet = this.currentRoom.bigBlind

      this.stage = 'PRE_FLOP'
      this.dealerQuote = `第 ${this.handNumber} 局开始！盲注 ${this.currentRoom.smallBlind}/${this.currentRoom.bigBlind}`

      // 计算初始胜率
      this.updateLiveProbabilities()

      // 翻牌前从大盲注左手边第一位 (UTG) 开始行动
      const firstActor = (bbSeat + 1) % this.players.length
      this.activeSeatIndex = firstActor
      this.scheduleNextTurn()
    },

    // 玩家投入筹码通用方法
    postBet(
      seatIndex: number,
      chipAmount: number,
      actionType: TablePlayer['lastActionType'],
      label: string
    ) {
      const p = this.players[seatIndex]
      if (!p) return

      const actual = Math.min(p.chips, chipAmount)
      p.chips -= actual
      p.currentBet += actual
      p.totalHandBet += actual
      this.potTotal += actual

      if (p.isHuman) {
        const userStore = useUserStore()
        userStore.beans = p.chips
      }

      if (p.chips === 0 && actual > 0) {
        p.allIn = true
        p.lastActionType = 'allin'
        p.lastActionText = '全下 All-in!'
      } else {
        p.lastActionType = actionType
        p.lastActionText = label
      }

      p.actionVfxDelta = actual
      if (actionType !== 'blind') {
        p.actionVfxId = (p.actionVfxId || 0) + 1
      }

      if (p.currentBet > this.highestBet) {
        this.minRaiseDelta = Math.max(
          this.currentRoom.bigBlind,
          p.currentBet - this.highestBet
        )
        this.highestBet = p.currentBet
      }

      // 记录醒目的加注/全下/跟注战况提醒（用于中央横幅与座位爆点特效）
      if (
        p.lastActionType === 'raise' ||
        p.lastActionType === 'allin' ||
        (p.lastActionType === 'call' && actual > 0)
      ) {
        this.latestActionAlert = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          seatIndex: p.seatIndex,
          playerName: p.name,
          playerTitle: p.title,
          isHuman: p.isHuman,
          actionType: p.lastActionType as 'raise' | 'allin' | 'call',
          addedAmount: actual,
          totalStreetBet: p.currentBet,
        }
      }

      // 触发筹码飞向底池动画事件 (区分普通抛扔与 All-in 双手整排平推)
      if (actual > 0) {
        this.triggerChipFly(
          seatIndex,
          -1,
          actual,
          p.lastActionType === 'allin'
        )
      }

      // 实时刷新边池
      this.refreshSidePots()
    },

    refreshSidePots() {
      this.sidePots = calculateSidePots(
        this.players.map((p) => ({
          id: p.id,
          totalBet: p.totalHandBet,
          folded: p.folded,
          score: 0,
        }))
      )
    },

    triggerChipFly(
      fromSeat: number,
      toSeat: number,
      amount: number,
      isAllIn = false
    ) {
      const id = `chip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      this.chipFlyQueue.push({ id, fromSeat, toSeat, amount, isAllIn })
      if (this.chipFlyQueue.length > 25) {
        this.chipFlyQueue.shift()
      }
    },

    setPlayerBubble(seatIndex: number, quote: string) {
      const p = this.players[seatIndex]
      if (!p || !quote) return
      p.bubbleQuote = quote
      if (p.bubbleTimer) {
        clearTimeout(p.bubbleTimer)
      }
      p.bubbleTimer = window.setTimeout(() => {
        p.bubbleQuote = ''
      }, 3200)
    },

    // 更新存活玩家的实时胜率
    // - 正常下注阶段（对手未亮牌）：玩家本人的胜率严格仅根据【自己的2张底牌 + 桌面公共牌 + 存活对手人数】未知牌池推算，绝不偷看 AI 底牌！
    // - 全员 All-in 跑马或摊牌亮牌阶段：所有存活玩家已明牌，按实际亮出的底牌计算跑马胜率
    updateLiveProbabilities() {
      const activePlayers = this.players.filter(
        (p) => !p.folded && p.holeCards.length === 2
      )

      if (this.isAllInRunout || this.stage === 'SHOWDOWN') {
        const probs = calculateWinProbabilities(
          activePlayers.map((p) => ({ id: p.id, holeCards: p.holeCards })),
          this.communityCards,
          2000
        )
        this.players.forEach((p) => {
          p.winProbability = p.folded ? 0 : probs[p.id] ?? 0
        })
        return
      }

      // 未知底牌阶段：严格仅依据玩家手牌、桌面已翻开的公共牌、当前未弃牌对手人数计算纯数学胜率（缓存键防无变化时抖动）
      const human = this.players[0]
      if (human && !human.folded && human.holeCards.length === 2) {
        const activeOpponents = activePlayers.filter((p) => !p.isHuman).length
        const cacheKey = `${human.holeCards.map((c) => c.id).join(',')}|${this.communityCards.map((c) => c.id).join(',')}|${activeOpponents}`
        if (cacheKey === this.lastEquityCacheKey) return
        this.lastEquityCacheKey = cacheKey
        human.winProbability = estimatePlayerBlindEquity(
          human.holeCards,
          this.communityCards,
          activeOpponents,
          5000
        )
      } else if (human) {
        this.lastEquityCacheKey = ''
        human.winProbability = 0
      }
    },

    // 调度当前行动座位
    scheduleNextTurn() {
      this.clearTimers()

      // 检查是否只剩 1 名未弃牌玩家（其余全弃牌，直接获胜）
      const activeNotFolded = this.players.filter((p) => !p.folded)
      if (activeNotFolded.length === 1) {
        this.resolveSingleWinnerByFold(activeNotFolded[0])
        return
      }

      // 检查本轮下注街是否已经结束
      if (this.isBettingRoundComplete()) {
        const stageDelay = this.isFastForwarding ? 120 : 650
        this.actionTimerId = window.setTimeout(() => {
          this.advanceToNextStage()
        }, stageDelay)
        return
      }

      // 找到下一个需要行动的座位
      const curr = this.players[this.activeSeatIndex]
      if (!curr || curr.folded || curr.allIn || (curr.actedInRound && curr.currentBet === this.highestBet)) {
        this.moveToNextActiveSeat()
      }

      const actor = this.players[this.activeSeatIndex]
      if (!actor) return

      // 如果是玩家本人回合，等待玩家点击 UI 按钮
      if (actor.isHuman) {
        return
      }

      // 如果是 AI 回合，正常延迟 750~1150ms；若玩家已弃牌开启加速模式，则仅 110ms 倍速推进！
      const thinkDelay = this.isFastForwarding
        ? 110
        : 750 + Math.floor(Math.random() * 400)
      this.actionTimerId = window.setTimeout(() => {
        this.executeAITurn(actor)
      }, thinkDelay)
    },

    // 玩家弃牌后可随时点击“立即跳过剩余过程，直达本局结算”
    skipToSettlementNow() {
      this.clearTimers()
      let guard = 0
      while (
        ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER'].includes(this.stage) &&
        guard < 200
      ) {
        guard++
        const activeNotFolded = this.players.filter((p) => !p.folded)
        if (activeNotFolded.length === 1) {
          this.resolveSingleWinnerByFold(activeNotFolded[0])
          return
        }

        if (this.isBettingRoundComplete() || this.isAllInRunout) {
          this.players.forEach((p) => {
            p.currentBet = 0
            p.actedInRound = false
          })
          this.highestBet = 0
          this.minRaiseDelta = this.currentRoom.bigBlind

          const notFolded = this.players.filter((p) => !p.folded)
          const withChipsLeft = notFolded.filter((p) => !p.allIn)
          if (withChipsLeft.length <= 1 && this.stage !== 'RIVER') {
            this.isAllInRunout = true
          }

          if (this.stage === 'PRE_FLOP') {
            this.stage = 'FLOP'
            this.communityCards.push(
              this.deck.pop()!,
              this.deck.pop()!,
              this.deck.pop()!
            )
          } else if (this.stage === 'FLOP') {
            this.stage = 'TURN'
            this.communityCards.push(this.deck.pop()!)
          } else if (this.stage === 'TURN') {
            this.stage = 'RIVER'
            this.communityCards.push(this.deck.pop()!)
          } else if (this.stage === 'RIVER') {
            this.resolveShowdown()
            this.clearTimers()
            this.stage = 'SETTLEMENT'
            return
          }

          if (!this.isAllInRunout) {
            const len = this.players.length
            for (let step = 1; step <= len; step++) {
              const idx = (this.dealerSeatIndex + step) % len
              const p = this.players[idx]
              if (!p.folded && !p.allIn) {
                this.activeSeatIndex = idx
                break
              }
            }
          }
          continue
        }

        const curr = this.players[this.activeSeatIndex]
        if (
          !curr ||
          curr.folded ||
          curr.allIn ||
          (curr.actedInRound && curr.currentBet === this.highestBet)
        ) {
          this.moveToNextActiveSeat()
        }
        const actor = this.players[this.activeSeatIndex]
        if (!actor || actor.isHuman) {
          if (actor?.isHuman) {
            actor.folded = true
            actor.actedInRound = true
          }
          this.moveToNextActiveSeat()
          continue
        }

        const stageKey = (
          ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER'].includes(this.stage)
            ? this.stage
            : 'PRE_FLOP'
        ) as 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER'

        if (actor.persona) {
          const decision = makeAIDecision({
            persona: actor.persona,
            holeCards: actor.holeCards,
            communityCards: this.communityCards,
            myChips: actor.chips,
            myCurrentBet: actor.currentBet,
            highestBet: this.highestBet,
            potTotal: this.potTotal,
            bigBlind: this.currentRoom.bigBlind,
            stage: stageKey,
          })

          const toCall = Math.max(0, this.highestBet - actor.currentBet)
          actor.actedInRound = true

          if (decision.action === 'fold') {
            actor.folded = true
            actor.lastActionType = 'fold'
            actor.lastActionText = '弃牌'
          } else if (decision.action === 'check') {
            if (toCall > 0) {
              this.postBet(actor.seatIndex, toCall, 'call', '跟注')
            } else {
              actor.lastActionType = 'check'
              actor.lastActionText = '过牌'
            }
          } else if (decision.action === 'call') {
            this.postBet(actor.seatIndex, toCall, 'call', '跟注')
          } else if (decision.action === 'allin') {
            const prevHigh = this.highestBet
            this.postBet(actor.seatIndex, actor.chips, 'allin', '全下 All-in!')
            if (actor.currentBet > prevHigh) {
              this.players.forEach((p) => {
                if (p.id !== actor.id && !p.folded && !p.allIn) {
                  p.actedInRound = false
                }
              })
            }
          } else if (decision.action === 'raise') {
            const prevHigh = this.highestBet
            const minAdd = toCall + this.minRaiseDelta
            const addAmount = Math.min(
              actor.chips,
              Math.max(minAdd, decision.raiseAmount || minAdd)
            )
            this.postBet(
              actor.seatIndex,
              addAmount,
              addAmount >= actor.chips ? 'allin' : 'raise',
              addAmount >= actor.chips
                ? '全下 All-in!'
                : `加注 ${actor.currentBet + addAmount}`
            )
            if (actor.currentBet > prevHigh) {
              this.players.forEach((p) => {
                if (p.id !== actor.id && !p.folded && !p.allIn) {
                  p.actedInRound = false
                }
              })
            }
          }
        }
        this.moveToNextActiveSeat()
      }

      if ((this.stage as string) === 'SHOWDOWN') {
        this.clearTimers()
        this.stage = 'SETTLEMENT'
      }
    },

    // 判断当前街下注是否结束
    isBettingRoundComplete(): boolean {
      const notFolded = this.players.filter((p) => !p.folded)
      if (notFolded.length <= 1) return true

      const canAct = notFolded.filter((p) => !p.allIn)
      // 所有尚未 All-in 的玩家都必须已经行动过，且注额等于最高注
      const allMatched = canAct.every(
        (p) => p.actedInRound && p.currentBet === this.highestBet
      )
      return allMatched
    },

    moveToNextActiveSeat() {
      const len = this.players.length
      for (let step = 1; step <= len; step++) {
        const idx = (this.activeSeatIndex + step) % len
        const p = this.players[idx]
        if (!p.folded && !p.allIn) {
          this.activeSeatIndex = idx
          return
        }
      }
    },

    // 执行玩家操作 (弃牌 / 过牌 / 跟注 / 加注 / 全下)
    humanAction(
      action: 'fold' | 'check' | 'call' | 'raise' | 'allin',
      customRaiseTotal?: number
    ) {
      if (!this.isHumanTurn) return
      const human = this.players[0]
      this.applyPlayerAction(human, action, customRaiseTotal)
    },

    // 执行 AI 决策
    executeAITurn(aiPlayer: TablePlayer) {
      if (!aiPlayer.persona) return
      const stageKey = (
        ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER'].includes(this.stage)
          ? this.stage
          : 'PRE_FLOP'
      ) as 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER'

      const decision = makeAIDecision({
        persona: aiPlayer.persona,
        holeCards: aiPlayer.holeCards,
        communityCards: this.communityCards,
        myChips: aiPlayer.chips,
        myCurrentBet: aiPlayer.currentBet,
        highestBet: this.highestBet,
        potTotal: this.potTotal,
        bigBlind: this.currentRoom.bigBlind,
        stage: stageKey,
      })

      this.setPlayerBubble(aiPlayer.seatIndex, decision.quote)
      this.applyPlayerAction(aiPlayer, decision.action, decision.raiseAmount)
    },

    // 统一落盘某位玩家的行动
    applyPlayerAction(
      player: TablePlayer,
      action: 'fold' | 'check' | 'call' | 'raise' | 'allin',
      extraOrTargetAmount?: number
    ) {
      const toCall = Math.max(0, this.highestBet - player.currentBet)
      player.actedInRound = true

      if (action === 'fold') {
        player.folded = true
        player.lastActionType = 'fold'
        player.lastActionText = '弃牌'
        player.actionVfxDelta = 0
        player.actionVfxId = (player.actionVfxId || 0) + 1
        sound.playFold()
        if (player.isHuman) {
          this.setPlayerBubble(0, '这把先忍一手，弃牌！')
        }
      } else if (action === 'check') {
        if (toCall > 0) {
          // 防御：如果需要跟注却选了过牌，自动转为跟注
          this.postBet(player.seatIndex, toCall, 'call', '跟注')
          sound.playChipBet()
        } else {
          player.lastActionType = 'check'
          player.lastActionText = '过牌'
          player.actionVfxDelta = 0
          player.actionVfxId = (player.actionVfxId || 0) + 1
          sound.playCheck()
        }
      } else if (action === 'call') {
        this.postBet(player.seatIndex, toCall, 'call', '跟注')
        sound.playChipBet()
        if (player.allIn) {
          sound.playAllIn()
          sound.speak('全下！')
        }
      } else if (action === 'allin') {
        const prevHigh = this.highestBet
        this.postBet(player.seatIndex, player.chips, 'allin', '全下 All-in!')
        sound.playAllIn()
        sound.speak('超级全下！')
        if (player.isHuman) {
          this.setPlayerBubble(0, '超级加倍！全部押上，敢接吗？！')
        }
        // 如果全下金额超过了之前的最高注，其他未行动或已行动玩家需要重新表态
        if (player.currentBet > prevHigh) {
          this.players.forEach((p) => {
            if (p.id !== player.id && !p.folded && !p.allIn) {
              p.actedInRound = false
            }
          })
        }
      } else if (action === 'raise') {
        const prevHigh = this.highestBet
        // extraOrTargetAmount 表示本次额外投入的筹码
        const minAdd = toCall + this.minRaiseDelta
        const addAmount = Math.min(
          player.chips,
          Math.max(minAdd, extraOrTargetAmount || minAdd)
        )
        this.postBet(
          player.seatIndex,
          addAmount,
          addAmount >= player.chips ? 'allin' : 'raise',
          addAmount >= player.chips ? '全下 All-in!' : `加注 ${player.currentBet + addAmount}`
        )
        if (player.allIn) {
          sound.playAllIn()
          sound.speak('全下！')
        } else {
          sound.playRaise()
        }
        if (player.isHuman && !player.allIn) {
          this.setPlayerBubble(0, `加注到 ${player.currentBet}！跟得上吗？`)
        }
        if (player.currentBet > prevHigh) {
          this.players.forEach((p) => {
            if (p.id !== player.id && !p.folded && !p.allIn) {
              p.actedInRound = false
            }
          })
        }
      }

      this.updateLiveProbabilities()
      this.moveToNextActiveSeat()
      this.scheduleNextTurn()
    },

    // 推进到下一条街 (Flop -> Turn -> River -> Showdown)
    advanceToNextStage() {
      this.clearTimers()

      // 重置本轮单街注额
      this.players.forEach((p) => {
        p.currentBet = 0
        p.actedInRound = false
        p.actionVfxDelta = 0
        if (!p.folded && !p.allIn) {
          p.lastActionText = ''
          p.lastActionType = 'none'
        }
      })
      this.highestBet = 0
      this.minRaiseDelta = this.currentRoom.bigBlind
      this.latestActionAlert = null
      this.lastEquityCacheKey = ''

      // 检查是否已经进入“全员 All-in 或只剩至多1人有剩余筹码”的跑马状态
      const notFolded = this.players.filter((p) => !p.folded)
      const withChipsLeft = notFolded.filter((p) => !p.allIn)
      if (withChipsLeft.length <= 1 && this.stage !== 'RIVER') {
        this.isAllInRunout = true
      }

      if (this.stage === 'PRE_FLOP') {
        this.stage = 'FLOP'
        this.communityCards.push(
          this.deck.pop()!,
          this.deck.pop()!,
          this.deck.pop()!
        )
        sound.playDealCard()
        this.dealerQuote = '翻牌圈！三张公共牌已揭晓~'
      } else if (this.stage === 'FLOP') {
        this.stage = 'TURN'
        this.communityCards.push(this.deck.pop()!)
        sound.playDealCard()
        this.dealerQuote = '转牌圈！第四张公共牌登场！'
      } else if (this.stage === 'TURN') {
        this.stage = 'RIVER'
        this.communityCards.push(this.deck.pop()!)
        sound.playDealCard()
        this.dealerQuote = '河牌圈！最后一张决胜牌！'
      } else if (this.stage === 'RIVER') {
        this.resolveShowdown()
        return
      }

      this.updateLiveProbabilities()

      // 如果处于 All-in 跑马模式，自动每隔 1.2 秒（弃牌快进时 160ms）发下一张公共牌，直达摊牌
      if (this.isAllInRunout) {
        this.dealerQuote = this.isFastForwarding
          ? '⚡ 弃牌倍速快进中，正在快速开奖...'
          : '🔥 全下跑马对决中！实时胜率跳动，屏住呼吸！'
        const runoutDelay = this.isFastForwarding ? 160 : 1250
        this.actionTimerId = window.setTimeout(() => {
          this.advanceToNextStage()
        }, runoutDelay)
        return
      }

      // 翻牌后从庄家左手边第一个未弃牌且未 All-in 的玩家开始行动
      const len = this.players.length
      for (let step = 1; step <= len; step++) {
        const idx = (this.dealerSeatIndex + step) % len
        const p = this.players[idx]
        if (!p.folded && !p.allIn) {
          this.activeSeatIndex = idx
          break
        }
      }

      this.scheduleNextTurn()
    },

    // 其他所有人弃牌，唯一存活者直接收池
    resolveSingleWinnerByFold(winner: TablePlayer) {
      this.clearTimers()
      this.stage = 'SETTLEMENT'
      this.activeSeatIndex = -1

      const potGain = this.potTotal
      winner.chips += potGain
      winner.roundWinnings = potGain
      winner.isWinner = true
      this.triggerChipFly(-1, winner.seatIndex, potGain)

      const userStore = useUserStore()
      const human = this.players[0]
      userStore.beans = human.chips

      const humanNet = human.roundWinnings - human.totalHandBet
      const winnerEval = evaluateHand(winner.holeCards, this.communityCards)

      const winnerResult: ShowdownPlayerResult = {
        id: winner.id,
        seatIndex: winner.seatIndex,
        isHuman: winner.isHuman,
        name: winner.name,
        title: winner.title,
        avatar: winner.avatar,
        isWinner: true,
        winByFold: true,
        folded: false,
        holeCards: winner.holeCards,
        holeCardIds: winner.holeCards.map((c) => c.id),
        bestFiveCards:
          winner.isHuman || this.humanShowedBluff
            ? winnerEval.bestFiveCards.length > 0
              ? winnerEval.bestFiveCards
              : winner.holeCards
            : [],
        bestFiveIds:
          winner.isHuman || this.humanShowedBluff
            ? winnerEval.bestFiveIds
            : [],
        coreCardIds:
          winner.isHuman || this.humanShowedBluff
            ? winnerEval.coreCardIds
            : [],
        categoryName: '逼退全场',
        handDescription: winner.isHuman
          ? `逼退全场 (${winnerEval.description})`
          : '对手全部弃牌 · 不战而胜',
        handDetail: winner.isHuman
          ? `你以【${winnerEval.description}】逼退全场对手，独揽底池`
          : `全场其他玩家均已弃牌，【${winner.title}·${winner.name}】直接收池`,
        score: winnerEval.score,
        totalBet: winner.totalHandBet,
        winnings: potGain,
        netProfit: potGain - winner.totalHandBet,
      }

      const resultsList: ShowdownPlayerResult[] = [winnerResult]
      if (!winner.isHuman) {
        const humanEval = evaluateHand(human.holeCards, this.communityCards)
        resultsList.push({
          id: human.id,
          seatIndex: human.seatIndex,
          isHuman: true,
          name: human.name,
          title: human.title,
          avatar: human.avatar,
          isWinner: false,
          winByFold: false,
          folded: true,
          holeCards: human.holeCards,
          holeCardIds: human.holeCards.map((c) => c.id),
          bestFiveCards: humanEval.bestFiveCards,
          bestFiveIds: humanEval.bestFiveIds,
          coreCardIds: humanEval.coreCardIds,
          categoryName: '已弃牌',
          handDescription: `已弃牌 (${humanEval.description})`,
          handDetail: `中途弃牌止损 · 本局投入 ${human.totalHandBet.toLocaleString()} 豆`,
          score: 0,
          totalBet: human.totalHandBet,
          winnings: 0,
          netProfit: humanNet,
        })
      }

      this.mainWinnerResult = winnerResult
      this.settlementResults = resultsList

      if (winner.isHuman) {
        sound.playWinFanfare()
        // 检查是否是拿高牌诈唬成功
        const evalRes = winnerEval
        const isHighCardBluff = evalRes.category === HandCategory.HIGH_CARD
        this.canBluffShow = isHighCardBluff
        this.settlementSummary = `🎉 对手全部被你吓跑！独揽底池 +${potGain.toLocaleString()} 欢乐豆 (净赚 +${humanNet.toLocaleString()})！`
        this.dealerQuote = '哇！老板气场两米八，不战而屈人之兵！'
        if (winner.persona) {
          this.setPlayerBubble(0, '不好意思，全部弃牌那就归我喽~')
        }
        this.newlyUnlockedBadges = userStore.recordGameResult({
          won: true,
          netBeans: humanNet,
          potWon: potGain,
          totalBet: human.totalHandBet,
          roomName: this.currentRoom.name,
          handNumber: this.handNumber,
          winnerSummary: `对手全弃牌 · 独揽底池`,
          handCategory: evalRes.category,
          handDescription: evalRes.description,
          wonByFoldWithHighCard: isHighCardBluff,
        })
      } else {
        sound.playChipBet()
        if (winner.persona) {
          const q =
            winner.persona.quotes.win[
              Math.floor(Math.random() * winner.persona.quotes.win.length)
            ]
          this.setPlayerBubble(winner.seatIndex, q)
        }
        this.settlementSummary = `【${winner.title}·${winner.name}】逼退全场，收走底池 ${potGain.toLocaleString()} 欢乐豆`
        userStore.recordGameResult({
          won: false,
          netBeans: humanNet,
          potWon: 0,
          totalBet: human.totalHandBet,
          roomName: this.currentRoom.name,
          handNumber: this.handNumber,
          winnerSummary: `被【${winner.name}】收池`,
        })
      }
    },

    // 玩家点击“亮出底牌炫耀偷鸡”
    triggerHumanBluffShow() {
      if (!this.canBluffShow || this.humanShowedBluff) return
      this.humanShowedBluff = true
      sound.playWinFanfare()
      sound.speak('偷鸡成功！')
      this.setPlayerBubble(0, '哈哈哈，看清楚了，我手里其实是空气牌！')
      this.players.forEach((p) => {
        if (!p.isHuman) {
          this.setPlayerBubble(p.seatIndex, '？！居然被偷鸡诈唬了，心态崩了呀！')
        }
      })
    },

    // 河牌圈结束，进入 Showdown 比牌与大牌特效演出
    resolveShowdown() {
      this.clearTimers()
      this.stage = 'SHOWDOWN'
      this.activeSeatIndex = -1

      // 评估所有未弃牌玩家的最终牌力
      let highestCategoryEval: HandEvaluation | null = null
      this.players.forEach((p) => {
        if (!p.folded) {
          p.handEvaluation = evaluateHand(p.holeCards, this.communityCards)
          if (
            !highestCategoryEval ||
            p.handEvaluation.score > highestCategoryEval.score
          ) {
            highestCategoryEval = p.handEvaluation
          }
        }
      })

      // 分配主池与多重边池
      const distResult = distributePots(
        this.players.map((p) => ({
          id: p.id,
          totalBet: p.totalHandBet,
          folded: p.folded,
          score: p.handEvaluation?.score || 0,
        }))
      )

      this.sidePots = distResult.pots

      const winnerNames: string[] = []
      this.players.forEach((p) => {
        const gain = distResult.winningsByPlayer[p.id] || 0
        if (gain > 0) {
          p.chips += gain
          p.roundWinnings = gain
          p.isWinner = true
          winnerNames.push(`${p.name}(${p.handEvaluation?.description})`)
          this.triggerChipFly(-1, p.seatIndex, gain)

          if (!p.isHuman && p.persona) {
            const q =
              p.persona.quotes.win[
                Math.floor(Math.random() * p.persona.quotes.win.length)
              ]
            this.setPlayerBubble(p.seatIndex, q)
          }
        } else if (!p.folded && !p.isHuman && p.persona) {
          const q =
            p.persona.quotes.lose[
              Math.floor(Math.random() * p.persona.quotes.lose.length)
            ]
          this.setPlayerBubble(p.seatIndex, q)
        }
      })

      // 检查是否触发欢乐斗地主大牌全屏特效 (玩家未弃牌时正常播放，若玩家已弃牌快进则不播冗长全屏特效，直接进结算)
      const bestEval = highestCategoryEval as HandEvaluation | null
      if (bestEval && bestEval.vfxType !== 'none' && !this.isFastForwarding) {
        this.triggerArcadeVfx(bestEval)
      }

      // 同步玩家资产与成就记录
      const userStore = useUserStore()
      const human = this.players[0]
      userStore.beans = human.chips
      const humanNet = human.roundWinnings - human.totalHandBet

      // 构建详细的比牌结算榜（赢家排最前，其次为参与比牌的未弃牌玩家，并始终包含玩家本人）
      const showdownList: ShowdownPlayerResult[] = []
      this.players.forEach((p) => {
        if (!p.folded || p.isHuman) {
          const ev =
            p.handEvaluation || evaluateHand(p.holeCards, this.communityCards)
          showdownList.push({
            id: p.id,
            seatIndex: p.seatIndex,
            isHuman: p.isHuman,
            name: p.name,
            title: p.title,
            avatar: p.avatar,
            isWinner: p.isWinner,
            winByFold: false,
            folded: p.folded,
            holeCards: p.holeCards,
            holeCardIds: p.holeCards.map((c) => c.id),
            bestFiveCards: ev.bestFiveCards,
            bestFiveIds: ev.bestFiveIds,
            coreCardIds: ev.coreCardIds,
            categoryName: p.folded ? '已弃牌' : ev.categoryName,
            handDescription: p.folded
              ? `已弃牌 (若留存可凑: ${ev.description})`
              : ev.description,
            handDetail: p.folded ? '中途弃牌未参与比牌' : ev.detailText,
            score: p.folded ? -1 : ev.score,
            totalBet: p.totalHandBet,
            winnings: p.roundWinnings,
            netProfit: p.roundWinnings - p.totalHandBet,
          })
        }
      })

      showdownList.sort((a, b) => {
        if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1
        if (a.folded !== b.folded) return a.folded ? 1 : -1
        return b.score - a.score
      })

      this.settlementResults = showdownList
      this.mainWinnerResult = showdownList[0] || null

      if (human.isWinner) {
        sound.playWinFanfare()
        this.dealerQuote = `🎉 恭喜老板以【${human.handEvaluation?.description}】赢取 ${human.roundWinnings.toLocaleString()} 欢乐豆！`
      } else {
        sound.playLoseSound()
        this.dealerQuote = `本局赢家：${winnerNames.join('、')}，下一把好运马上来！`
      }

      this.settlementSummary = `🏆 赢家：${winnerNames.join(' | ')}`

      this.newlyUnlockedBadges = userStore.recordGameResult({
        won: human.isWinner,
        netBeans: humanNet,
        potWon: human.roundWinnings,
        totalBet: human.totalHandBet,
        roomName: this.currentRoom.name,
        handNumber: this.handNumber,
        winnerSummary: `赢家: ${winnerNames.join('、')}`,
        handCategory: human.handEvaluation?.category,
        handDescription: human.handEvaluation?.description,
      })

      const settleDelay = this.isFastForwarding ? 150 : 900
      this.actionTimerId = window.setTimeout(() => {
        this.stage = 'SETTLEMENT'
      }, settleDelay)
    },

    // 触发二次元奥义大牌 Cut-in 特效
    triggerArcadeVfx(evalRes: HandEvaluation) {
      this.activeVfx = evalRes.vfxType
      if (evalRes.vfxType === 'rocket') {
        this.vfxTitle = '绝世奥义 · ' + evalRes.categoryName
        this.vfxSubtitle = evalRes.description + ' · 樱月共鸣！'
        sound.playRocket()
        sound.speak('绝世奥义！' + evalRes.categoryName)
      } else if (evalRes.vfxType === 'bomb') {
        this.vfxTitle = '剑阵破空 · 四条金刚'
        this.vfxSubtitle = evalRes.description + ' · 震慑全场！'
        sound.playBomb()
        sound.speak('剑阵破空！四条！')
      } else if (evalRes.vfxType === 'plane') {
        this.vfxTitle = '樱月结界 · 葫芦成牌'
        this.vfxSubtitle = evalRes.description
        sound.playRocket()
        sound.speak('葫芦成牌！')
      } else if (evalRes.vfxType === 'stream') {
        this.vfxTitle = '灵光初现 · ' + evalRes.categoryName
        this.vfxSubtitle = evalRes.description
        sound.playRaise()
      }

      window.setTimeout(() => {
        this.activeVfx = 'none'
      }, 3600)
    },

    // 荷官打赏互动
    tipDealer() {
      const userStore = useUserStore()
      const human = this.players[0]
      const tipAmount = Math.max(100, this.currentRoom.smallBlind)

      if (human && human.chips < tipAmount) {
        this.dealerQuote = '道友心意紫灵领啦，灵石留着翻盘要紧~'
        return
      }

      if (human) {
        human.chips -= tipAmount
        userStore.beans = human.chips
      }
      userStore.recordDealerTip(this.currentRoom.name, tipAmount)
      sound.playChipBet()

      const sweetQuotes = [
        '多谢道友赏赐！祝道友把把发 AA，步步皇家同花顺~ 🌸',
        '道友大气！紫灵为你点亮樱花祈福阵，此局必胜 ✨',
        '收到道友的灵石啦，今晚牌运一定如星河璀璨~ 🌙',
        '鸿运当头！今晚韩立与玄骨老祖的灵石全归道友~ 💮',
      ]
      this.dealerQuote =
        sweetQuotes[userStore.dealerTipsCount % sweetQuotes.length]
      sound.speak('多谢道友赏赐，祝道友鸿运当头！', 1.2, 1.2)
    },

    // 向某个 AI 座位扔互动道具 (番茄/泼水/玫瑰/拖鞋)
    throwPropAtSeat(
      toSeat: number,
      propType: 'tomato' | 'water' | 'rose' | 'slipper'
    ) {
      const target = this.players[toSeat]
      if (!target || target.isHuman) return

      sound.playItemThrow()
      const id = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      this.propFlyQueue.push({
        id,
        fromSeat: 0,
        toSeat,
        propType,
      })

      const emojiMap: Record<typeof propType, string> = {
        tomato: '🍅💥',
        water: '🪣💦',
        rose: '🌹🥰',
        slipper: '🩴💫',
      }

      window.setTimeout(() => {
        target.hitReactionEmoji = emojiMap[propType]
        if (target.persona) {
          if (propType === 'rose') {
            this.setPlayerBubble(toSeat, '哇，多谢老板送的红玫瑰，怪不好意思的~')
          } else {
            const q =
              target.persona.quotes.hitByItem[
                Math.floor(Math.random() * target.persona.quotes.hitByItem.length)
              ]
            this.setPlayerBubble(toSeat, q)
          }
        }
        window.setTimeout(() => {
          target.hitReactionEmoji = ''
        }, 2000)
      }, 450)
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useGameStore, import.meta.hot))
}
