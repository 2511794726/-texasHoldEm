import { acceptHMRUpdate, defineStore } from 'pinia'
import { HandCategory } from '@/core/evaluator'

export interface RoomConfig {
  id: string
  name: string
  subtitle: string
  smallBlind: number
  bigBlind: number
  minBeans: number
  recommendedBeans: number
  badgeText: string
  themeGradient: string
  borderColor: string
  icon: string
  aiPool: string[] // 优先匹配的 AI 角色 ID
}

export const ROOM_CONFIGS: RoomConfig[] = [
  {
    id: 'rookie',
    name: '黄枫谷 · 初阶雅座',
    subtitle: '樱风初起 · 轻松切磋',
    smallBlind: 50,
    bigBlind: 100,
    minBeans: 1000,
    recommendedBeans: 10000,
    badgeText: '零门槛雅局',
    themeGradient: 'from-[#162044] via-[#1f2957] to-[#131936]',
    borderColor: 'border-rose-300/55',
    icon: 'mdi:flower-tulip-outline',
    aiPool: ['ai_abacus', 'ai_farmer', 'ai_joker', 'ai_tycoon', 'ai_koi'],
  },
  {
    id: 'elite',
    name: '乱星海 · 筑基茶会',
    subtitle: '道友过招 · 灵光暗涌',
    smallBlind: 500,
    bigBlind: 1000,
    minBeans: 10000,
    recommendedBeans: 80000,
    badgeText: '人气夜宴',
    themeGradient: 'from-[#1d1b4b] via-[#31215e] to-[#171338]',
    borderColor: 'border-indigo-300/60',
    icon: 'mdi:moon-waning-crescent',
    aiPool: ['ai_abacus', 'ai_landlord', 'ai_tycoon', 'ai_joker', 'ai_koi'],
  },
  {
    id: 'supreme',
    name: '天南域 · 元婴秘境',
    subtitle: '一掷千金 · 剑阵对决',
    smallBlind: 2500,
    bigBlind: 5000,
    minBeans: 50000,
    recommendedBeans: 300000,
    badgeText: '高倍灵池',
    themeGradient: 'from-[#351738] via-[#4a1c40] to-[#1d1026]',
    borderColor: 'border-amber-300/65',
    icon: 'mdi:crown-outline',
    aiPool: ['ai_tycoon', 'ai_joker', 'ai_abacus', 'ai_farmer', 'ai_landlord'],
  },
  {
    id: 'carnival',
    name: '灵界 · 樱月神殿',
    subtitle: '千万豪池 · 绝世奥义',
    smallBlind: 10000,
    bigBlind: 20000,
    minBeans: 200000,
    recommendedBeans: 1000000,
    badgeText: '巅峰神殿',
    themeGradient: 'from-[#3e163b] via-[#5c1e49] to-[#231130]',
    borderColor: 'border-pink-300/75',
    icon: 'mdi:sparkles',
    aiPool: ['ai_abacus', 'ai_tycoon', 'ai_joker', 'ai_koi', 'ai_landlord'],
  },
]

export interface ShopItem {
  id: string
  type: 'table_theme' | 'card_back' | 'avatar_frame'
  name: string
  description: string
  price: number
  previewClass: string
  icon: string
}

export const SHOP_ITEMS: ShopItem[] = [
  // 桌布主题
  {
    id: 'table_emerald',
    type: 'table_theme',
    name: '翡翠皇家绿绒',
    description: '经典欢乐街机绿绒牌桌，护眼百搭',
    price: 0,
    previewClass: 'from-emerald-800 via-green-900 to-teal-950',
    icon: 'mdi:cards-playing-spade-multiple',
  },
  {
    id: 'table_ocean',
    type: 'table_theme',
    name: '深海蓝晶幻境',
    description: '沉稳深邃的蔚蓝宝石牌桌',
    price: 15000,
    previewClass: 'from-sky-800 via-blue-900 to-indigo-950',
    icon: 'mdi:waves',
  },
  {
    id: 'table_crimson',
    type: 'table_theme',
    name: '紫金至尊宫殿',
    description: '地主老财最爱的奢华暗红紫金桌布',
    price: 38000,
    previewClass: 'from-rose-900 via-purple-950 to-slate-950',
    icon: 'mdi:crown-circle',
  },
  // 牌背主题
  {
    id: 'card_classic_red',
    type: 'card_back',
    name: '红金鸿运牌背',
    description: '喜庆红金纹饰，把把迎好运',
    price: 0,
    previewClass: 'from-red-600 to-amber-600',
    icon: 'mdi:cards',
  },
  {
    id: 'card_royal_gold',
    type: 'card_back',
    name: '土豪纯金龙纹',
    description: '金大牙同款24K纯金质感牌背',
    price: 25000,
    previewClass: 'from-yellow-400 via-amber-500 to-orange-600',
    icon: 'mdi:dragon',
  },
  {
    id: 'card_cyber_neon',
    type: 'card_back',
    name: '幻彩魔术霓虹',
    description: '小丑杰克专属流光紫青牌背',
    price: 50000,
    previewClass: 'from-fuchsia-500 via-purple-600 to-cyan-500',
    icon: 'mdi:magic-staff',
  },
]

export interface AchievementItem {
  id: string
  title: string
  description: string
  rewardBeans: number
  icon: string
}

export const ACHIEVEMENTS: AchievementItem[] = [
  {
    id: 'first_win',
    title: '初露锋芒',
    description: '在牌局中赢得第 1 把胜利',
    rewardBeans: 5000,
    icon: 'mdi:trophy-award',
  },
  {
    id: 'streak_3',
    title: '三连胜战神',
    description: '连续赢得 3 局底池',
    rewardBeans: 15000,
    icon: 'mdi:fire-circle',
  },
  {
    id: 'hand_full_house',
    title: '豪华飞机驾驶员',
    description: '在牌局中打出【葫芦】并获胜',
    rewardBeans: 20000,
    icon: 'mdi:airplane-takeoff',
  },
  {
    id: 'hand_four_kind',
    title: '四条炸弹专家',
    description: '在牌局中打出【金刚(四条)】炸弹',
    rewardBeans: 50000,
    icon: 'mdi:bomb',
  },
  {
    id: 'hand_straight_flush',
    title: '王炸火箭至尊',
    description: '打出【同花顺】或【皇家同花顺】',
    rewardBeans: 150000,
    icon: 'mdi:rocket-launch',
  },
  {
    id: 'bluff_master',
    title: '偷鸡大魔术师',
    description: '仅凭【高牌】逼退所有对手赢下底池',
    rewardBeans: 25000,
    icon: 'mdi:emoticon-cool',
  },
  {
    id: 'millionaire',
    title: '百万欢乐富豪',
    description: '持有欢乐豆突破 1,000,000',
    rewardBeans: 88888,
    icon: 'mdi:diamond-stone',
  },
]

export type BillType =
  | 'game_win' // 牌局获胜盈利
  | 'game_loss' // 牌局失利支出
  | 'game_even' // 牌局平手保本
  | 'wheel' // 幸运转盘抽奖
  | 'relief' // 破产救济补贴
  | 'achievement' // 成就荣誉悬赏
  | 'shop' // 装扮商城购买
  | 'dealer_tip' // 打赏荷官小甜
  | 'initial' // 创角初始赠送

export interface BillRecord {
  id: string
  timestamp: number
  type: BillType
  title: string
  detail: string
  delta: number // 正数为收入，负数为支出
  balanceAfter: number // 结算后欢乐豆余额
}

export const useUserStore = defineStore('happy_holdem_user', {
  state: () => ({
    nickname: '达文西',
    avatar: 'assets/characters/player_hero.png',
    beans: 50000, // 初始赠送 50,000 欢乐豆
    totalGames: 0,
    winGames: 0,
    currentStreak: 0,
    bestStreak: 0,
    biggestPotWon: 0,
    bestHandCategory: 0 as number,
    bestHandDescription: '暂无记录',
    bankruptcyReliefCount: 0,
    lastWheelDate: '',
    wheelSpinsToday: 0,
    ownedItems: ['table_emerald', 'card_classic_red'] as string[],
    equippedTableTheme: 'table_emerald',
    equippedCardBack: 'card_classic_red',
    unlockedAchievements: [] as string[],
    claimedAchievements: [] as string[],
    dealerTipsCount: 0,
    showHandHelper: true, // 是否开启实时牌力提示器
    moyuMode: false, // 是否开启上班摸鱼紧凑模式
    stealthKey: 'Escape', // 全局一键隐蔽快捷键（默认 Esc，同时兼容反引号 `）
    stealthDisguiseType: 'excel' as 'excel' | 'code_doc' | 'moyu_card', // 一键隐蔽伪装形态
    autoStealthOnLeave: false, // 鼠标移出浏览器窗口是否自动触发隐蔽
    middleClickStealth: true, // 按下鼠标中键(滚轮)是否一键触发隐蔽
    autoNextHandAfterFold: false, // 弃牌加速结算后是否自动开启下一局
    ledger: [
      {
        id: 'init_gift',
        timestamp: Date.now(),
        type: 'initial' as BillType,
        title: '🎁 创角初始欢乐豆礼包',
        detail: '欢迎达文西入驻欢乐德州扑克，赠送启动资金',
        delta: 50000,
        balanceAfter: 50000,
      },
    ] as BillRecord[],
  }),
  getters: {
    winRate(state): number {
      if (state.totalGames === 0) return 0
      return Math.round((state.winGames / state.totalGames) * 100)
    },
    playerTitle(state): string {
      if (state.beans >= 1000000) return '👑 至尊赌神地主'
      if (state.beans >= 300000) return '💎 皇家德扑富豪'
      if (state.beans >= 100000) return '🔥 街机常胜大侠'
      if (state.beans >= 30000) return '⭐ 欢乐牌桌新星'
      return '🌱 快乐小农夫'
    },
    // 牌局累计净盈亏
    netGameProfit(state): number {
      return state.ledger
        .filter((b) => b.type === 'game_win' || b.type === 'game_loss' || b.type === 'game_even')
        .reduce((sum, b) => sum + b.delta, 0)
    },
    // 累计总赢入（不含初始赠豆）
    totalIncome(state): number {
      return state.ledger
        .filter((b) => b.delta > 0 && b.type !== 'initial')
        .reduce((sum, b) => sum + b.delta, 0)
    },
    // 累计总支出
    totalExpense(state): number {
      return state.ledger
        .filter((b) => b.delta < 0)
        .reduce((sum, b) => sum + Math.abs(b.delta), 0)
    },
  },
  actions: {
    // 写入一条账单流水记录（最多保留最近 200 条）
    addBillRecord(params: {
      type: BillType
      title: string
      detail: string
      delta: number
      balanceAfter?: number
    }) {
      if (!Array.isArray(this.ledger)) {
        this.ledger = []
      }
      const record: BillRecord = {
        id: `bill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        type: params.type,
        title: params.title,
        detail: params.detail,
        delta: params.delta,
        balanceAfter: params.balanceAfter ?? this.beans,
      }
      this.ledger.unshift(record)
      if (this.ledger.length > 200) {
        this.ledger = this.ledger.slice(0, 200)
      }
    },

    clearLedger() {
      this.ledger = [
        {
          id: `snapshot_${Date.now()}`,
          timestamp: Date.now(),
          type: 'initial',
          title: '📌 账单流水重置快照',
          detail: '手动清空历史流水，以当前持有欢乐豆为新起点',
          delta: this.beans,
          balanceAfter: this.beans,
        },
      ]
    },

    addBeans(amount: number) {
      this.beans = Math.max(0, this.beans + amount)
      if (this.beans >= 1000000) {
        this.unlockAchievement('millionaire')
      }
    },

    // 转盘抽奖入账并记账
    recordWheelPrize(prizeLabel: string, amount: number) {
      this.addBeans(amount)
      this.wheelSpinsToday++
      this.addBillRecord({
        type: 'wheel',
        title: '🎡 幸运大转盘中奖',
        detail: `转盘抽中【${prizeLabel}】`,
        delta: amount,
        balanceAfter: this.beans,
      })
    },

    // 领取破产救济金并记账
    claimBankruptcyRelief(): number {
      const gift = 15000
      this.beans += gift
      this.bankruptcyReliefCount++
      this.addBillRecord({
        type: 'relief',
        title: '🎁 破产救济金扶持',
        detail: `荷官小甜发放第 ${this.bankruptcyReliefCount} 次东山再起补贴`,
        delta: gift,
        balanceAfter: this.beans,
      })
      return gift
    },

    // 打赏荷官记账
    recordDealerTip(roomName: string, tipAmount: number) {
      this.dealerTipsCount++
      this.addBillRecord({
        type: 'dealer_tip',
        title: '💖 打赏金牌荷官小甜',
        detail: `在【${roomName}】打赏荷官沾喜气`,
        delta: -tipAmount,
        balanceAfter: this.beans,
      })
    },

    // 记录一局结束及账单流水
    recordGameResult(params: {
      won: boolean
      netBeans: number
      potWon: number
      totalBet?: number
      roomName?: string
      handNumber?: number
      winnerSummary?: string
      handCategory?: HandCategory
      handDescription?: string
      wonByFoldWithHighCard?: boolean
    }): string[] {
      const newlyUnlocked: string[] = []
      this.totalGames++

      const roomTag = params.roomName ? `【${params.roomName}】` : ''
      const handTag = params.handNumber ? `第 ${params.handNumber} 局` : '对局结算'
      const betInfo =
        params.totalBet !== undefined
          ? `本局投入 ${params.totalBet.toLocaleString()} · 收回 ${params.potWon.toLocaleString()}`
          : `净变动 ${params.netBeans >= 0 ? '+' : ''}${params.netBeans.toLocaleString()}`

      if (params.netBeans > 0) {
        this.addBillRecord({
          type: 'game_win',
          title: `🏆 ${roomTag}${handTag} · ${params.handDescription ? params.handDescription + '获胜' : '收池获胜'}`,
          detail: `${betInfo}${params.wonByFoldWithHighCard ? ' (高牌偷鸡成功)' : ''}`,
          delta: params.netBeans,
          balanceAfter: this.beans,
        })
      } else if (params.netBeans < 0) {
        this.addBillRecord({
          type: 'game_loss',
          title: `💸 ${roomTag}${handTag} · ${params.totalBet && params.potWon === 0 ? '未中池/弃牌' : '对局失利'}`,
          detail: `${betInfo}${params.winnerSummary ? ' · ' + params.winnerSummary : ''}`,
          delta: params.netBeans,
          balanceAfter: this.beans,
        })
      } else {
        this.addBillRecord({
          type: 'game_even',
          title: `🤝 ${roomTag}${handTag} · 平局/未损耗`,
          detail: `${betInfo}`,
          delta: 0,
          balanceAfter: this.beans,
        })
      }

      if (params.won) {
        this.winGames++
        this.currentStreak++
        if (this.currentStreak > this.bestStreak) {
          this.bestStreak = this.currentStreak
        }
        if (params.potWon > this.biggestPotWon) {
          this.biggestPotWon = params.potWon
        }

        if (this.unlockAchievement('first_win')) newlyUnlocked.push('初露锋芒')
        if (this.currentStreak >= 3 && this.unlockAchievement('streak_3')) {
          newlyUnlocked.push('三连胜战神')
        }
        if (
          params.wonByFoldWithHighCard &&
          this.unlockAchievement('bluff_master')
        ) {
          newlyUnlocked.push('偷鸡大魔术师')
        }
      } else {
        this.currentStreak = 0
      }

      if (params.handCategory && params.handDescription) {
        if (params.handCategory > this.bestHandCategory) {
          this.bestHandCategory = params.handCategory
          this.bestHandDescription = params.handDescription
        }
        if (
          params.won &&
          params.handCategory === HandCategory.FULL_HOUSE &&
          this.unlockAchievement('hand_full_house')
        ) {
          newlyUnlocked.push('豪华飞机驾驶员')
        }
        if (
          params.handCategory === HandCategory.FOUR_OF_A_KIND &&
          this.unlockAchievement('hand_four_kind')
        ) {
          newlyUnlocked.push('四条炸弹专家')
        }
        if (
          (params.handCategory === HandCategory.STRAIGHT_FLUSH ||
            params.handCategory === HandCategory.ROYAL_FLUSH) &&
          this.unlockAchievement('hand_straight_flush')
        ) {
          newlyUnlocked.push('王炸火箭至尊')
        }
      }

      if (this.beans >= 1000000 && this.unlockAchievement('millionaire')) {
        newlyUnlocked.push('百万欢乐富豪')
      }

      return newlyUnlocked
    },

    unlockAchievement(id: string): boolean {
      if (!this.unlockedAchievements.includes(id)) {
        this.unlockedAchievements.push(id)
        return true
      }
      return false
    },

    claimAchievementReward(id: string): number {
      if (
        this.unlockedAchievements.includes(id) &&
        !this.claimedAchievements.includes(id)
      ) {
        const item = ACHIEVEMENTS.find((a) => a.id === id)
        if (item) {
          this.claimedAchievements.push(id)
          this.addBeans(item.rewardBeans)
          this.addBillRecord({
            type: 'achievement',
            title: `🏅 荣誉勋章悬赏【${item.title}】`,
            detail: item.description,
            delta: item.rewardBeans,
            balanceAfter: this.beans,
          })
          return item.rewardBeans
        }
      }
      return 0
    },

    buyOrEquipShopItem(item: ShopItem): { success: boolean; message: string } {
      if (!this.ownedItems.includes(item.id)) {
        if (this.beans < item.price) {
          return { success: false, message: '欢乐豆不足，快去牌桌赢取或转转盘吧！' }
        }
        this.beans -= item.price
        this.ownedItems.push(item.id)
        if (item.price > 0) {
          this.addBillRecord({
            type: 'shop',
            title: `🛍️ 装扮商城购买【${item.name}】`,
            detail: item.description,
            delta: -item.price,
            balanceAfter: this.beans,
          })
        }
      }
      if (item.type === 'table_theme') {
        this.equippedTableTheme = item.id
      } else if (item.type === 'card_back') {
        this.equippedCardBack = item.id
      }
      return { success: true, message: `已装备【${item.name}】！` }
    },
  },
  persist: true,
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUserStore, import.meta.hot))
}
