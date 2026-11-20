<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useGameStore, TablePlayer } from '@/store/game'
import { useUserStore } from '@/store/user'
import { sound } from '@/core/sound'
import { formatChips, formatChipStep } from '@/core/format'
import { resolvePublicAsset } from '@/core/assets'
import PlayingCard from './PlayingCard.vue'
import PixiTableCanvas from './PixiTableCanvas.vue'
import ArcadeVfxOverlay from './ArcadeVfxOverlay.vue'
import LobbyModals, { ModalType } from './LobbyModals.vue'

const props = defineProps<{
  compact?: boolean
}>()

const emit = defineEmits<{
  (e: 'back-lobby'): void
  (e: 'toggle-boss'): void
}>()

const gameStore = useGameStore()
const userStore = useUserStore()

const activeModal = ref<ModalType>('none')
const selectedSeatForProp = ref<number | null>(null)
const customRaiseExtra = ref<number>(200)
const isEditingRaiseInput = ref(false)
const raiseInputText = ref('200')
const RAISE_STEP_MULTIPLIERS = [1, 5, 10, 50] as const
const raiseStepIdx = ref(0)
const currentRaiseStep = computed(
  () => gameStore.currentRoom.bigBlind * RAISE_STEP_MULTIPLIERS[raiseStepIdx.value]
)
function cycleRaiseStep() {
  raiseStepIdx.value = (raiseStepIdx.value + 1) % RAISE_STEP_MULTIPLIERS.length
  sound.playClick()
}
const showQuickChat = ref(false)
const showMoreMenu = ref(false)
const showDealerToast = ref(false)
const showGiantStage = ref(false)
let autoNextHandTimerId: number | null = null
let dealerToastTimerId: number | null = null
let holdDelayTimerId: number | null = null
let holdRepeatTimerId: number | null = null

function clearAutoNextTimer() {
  if (autoNextHandTimerId !== null) {
    clearTimeout(autoNextHandTimerId)
    autoNextHandTimerId = null
  }
}

function triggerDealerToast(duration = 2200) {
  showDealerToast.value = true
  if (dealerToastTimerId !== null) {
    clearTimeout(dealerToastTimerId)
  }
  dealerToastTimerId = window.setTimeout(() => {
    showDealerToast.value = false
    dealerToastTimerId = null
  }, duration)
}

watch(
  () => gameStore.stage,
  (st) => {
    clearAutoNextTimer()
    if (['FLOP', 'TURN', 'RIVER', 'SETTLEMENT'].includes(st)) {
      triggerDealerToast(st === 'SETTLEMENT' ? 2800 : 2000)
    }
    if (st === 'SETTLEMENT') {
      // 结算默认不自动展开大牌弹窗，直接在牌桌中央结算条展示结果，可按需点击「展开赢牌」
      showGiantStage.value = false
      // 若玩家本局已弃牌且开启了“弃牌后自动下一局”，结算展示 1.2s 后自动开下一局
      if (humanPlayer.value?.folded && userStore.autoNextHandAfterFold) {
        autoNextHandTimerId = window.setTimeout(() => {
          if (gameStore.stage === 'SETTLEMENT') {
            handleNextHand()
          }
        }, 1250)
      }
    }
  }
)

const isCompact = computed(() => props.compact || userStore.moyuMode)

const QUICK_CHATS = [
  '快点吧，我等得花儿都谢了！🌸',
  '底裤都All-in啦，敢接吗？🔥',
  '不好意思，又是坚果大牌~ 😎',
  '各位老铁，手下留情呀！🙏',
  '哈哈，这把牌简直绝了！🎉',
]

function sendQuickChat(msg: string) {
  sound.playClick()
  gameStore.setPlayerBubble(0, msg)
  showQuickChat.value = false
}

function toggleMoyuMode() {
  userStore.moyuMode = !userStore.moyuMode
  if (userStore.moyuMode) {
    sound.enabled = false
  }
  sound.playClick()
}

// 根据装备的桌布主题切换颜色（《雀魂》樱花夜宴深靛烫金风；摸鱼模式为低饱和二次元靛灰极简工作区）
const tableThemeClasses = computed(() => {
  if (userStore.moyuMode) {
    return 'from-[#11152c]/55 via-[#0e1124]/45 to-[#0a0c1b]/55 border-indigo-300/20 shadow-none'
  }
  switch (userStore.equippedTableTheme) {
    case 'table_ocean':
      return 'from-[#10264a] via-[#131d45] to-[#0b1029] border-sky-300/65 shadow-[inset_0_0_90px_rgba(56,189,248,0.22),0_25px_70px_rgba(4,6,18,0.88)]'
    case 'table_crimson':
      return 'from-[#361433] via-[#261130] to-[#120b21] border-rose-300/70 shadow-[inset_0_0_90px_rgba(244,114,182,0.28),0_25px_70px_rgba(6,4,16,0.88)]'
    default:
      return 'from-[#1b1c42] via-[#141736] to-[#0c0f26] border-rose-300/60 shadow-[inset_0_0_95px_rgba(244,114,182,0.2),0_25px_70px_rgba(5,7,20,0.9)]'
  }
})

// 5个AI座位在椭圆桌周围的定位样式 (大屏与小窗摸鱼双态防遮挡适配)
const aiSeatPositions = computed<Record<number, string>>(() => {
  if (isCompact.value) {
    return {
      1: 'left-1.5 bottom-2', // 左下
      2: 'left-1.5 top-12', // 左上
      3: 'left-[21%] top-2.5', // 上左（略微下移，绝不触碰顶部账单流水导航栏）
      4: 'right-1.5 top-12', // 右上
      5: 'right-1.5 bottom-2', // 右下
    }
  }
  return {
    1: 'left-4 bottom-4', // 左下
    2: 'left-4 top-20', // 左上
    3: 'left-[22%] top-3', // 上左
    4: 'right-4 top-20', // 右上
    5: 'right-4 bottom-4', // 右下
  }
})

const aiPlayers = computed(() => gameStore.players.filter((p) => !p.isHuman))
const humanPlayer = computed(() => gameStore.humanPlayer)

// 滑块加注最小值与最大值
const minRaiseAdd = computed(() => {
  if (!humanPlayer.value) return gameStore.currentRoom.bigBlind
  return Math.min(
    humanPlayer.value.chips,
    gameStore.humanToCall + gameStore.minRaiseDelta
  )
})

const maxRaiseAdd = computed(() => {
  return humanPlayer.value?.chips || 0
})

watch(
  () => gameStore.isHumanTurn,
  (isTurn) => {
    if (isTurn) {
      customRaiseExtra.value = minRaiseAdd.value
      raiseInputText.value = String(minRaiseAdd.value)
    } else {
      stopHoldStep()
      isEditingRaiseInput.value = false
    }
  }
)

// 仅在有玩家全下（All-in）产生真实分池时才显示边池胶囊
const hasActiveSidePots = computed(() => {
  return (
    gameStore.sidePots.length > 1 &&
    gameStore.players.some((p) => p.allIn)
  )
})

// 快捷底池比例加注计算 (1/3底池, 1/2底池, 2/3底池, 1倍底池)
function getPotRatioRaise(ratio: number): number {
  if (!humanPlayer.value) return 0
  const raw =
    gameStore.humanToCall +
    Math.floor(
      ((gameStore.potTotal + gameStore.humanToCall) * ratio) /
        gameStore.currentRoom.bigBlind
    ) *
      gameStore.currentRoom.bigBlind
  return Math.min(humanPlayer.value.chips, Math.max(minRaiseAdd.value, raw))
}

// 5档智能一键直出快捷加注（显示档位名+具体金额，点击或按数字键 1~5 直接一键完成加注！）
const quickRaisePresets = computed(() => {
  if (!humanPlayer.value) return []
  const bb = gameStore.currentRoom.bigBlind
  const chips = humanPlayer.value.chips
  const minR = minRaiseAdd.value

  const isPreFlop = gameStore.stage === 'PRE_FLOP'
  const secondAmt = isPreFlop
    ? Math.min(chips, Math.max(minR, bb * 3 - humanPlayer.value.currentBet))
    : getPotRatioRaise(0.33)

  return [
    { key: '1', label: '最小', amount: minR },
    { key: '2', label: isPreFlop ? '3倍盲' : '1/3池', amount: secondAmt },
    { key: '3', label: '半池', amount: getPotRatioRaise(0.5) },
    { key: '4', label: '2/3池', amount: getPotRatioRaise(0.67) },
    { key: '5', label: '满池', amount: getPotRatioRaise(1) },
  ]
})

function handleQuickRaiseAmount(amount: number) {
  if (!gameStore.isHumanTurn || !humanPlayer.value) return
  const clamped = Math.min(
    humanPlayer.value.chips,
    Math.max(minRaiseAdd.value, amount)
  )
  customRaiseExtra.value = clamped
  gameStore.humanAction('raise', clamped)
}

// 微调自定义加注金额（按当前选定的步进值，支持点击/长按 +/-、鼠标滚轮与上下方向键）
function stepCustomRaise(direction: number) {
  if (!humanPlayer.value) return
  const delta = direction * currentRaiseStep.value
  customRaiseExtra.value = Math.min(
    maxRaiseAdd.value,
    Math.max(minRaiseAdd.value, customRaiseExtra.value + delta)
  )
}

function stopHoldStep() {
  if (holdDelayTimerId !== null) {
    clearTimeout(holdDelayTimerId)
    holdDelayTimerId = null
  }
  if (holdRepeatTimerId !== null) {
    clearInterval(holdRepeatTimerId)
    holdRepeatTimerId = null
  }
}

function startHoldStep(direction: number) {
  stopHoldStep()
  stepCustomRaise(direction)
  let ticks = 0
  holdDelayTimerId = window.setTimeout(() => {
    holdRepeatTimerId = window.setInterval(() => {
      ticks++
      // 长按超过 ~0.8 秒后平滑加速步长，方便大筹码快速微调
      const accel = ticks > 20 ? 4 : ticks > 10 ? 2 : 1
      stepCustomRaise(direction * accel)
    }, 70)
  }, 300)
}

function handleRaiseInputFocus(e: FocusEvent) {
  isEditingRaiseInput.value = true
  raiseInputText.value = String(customRaiseExtra.value)
  ;(e.target as HTMLInputElement).select()
}

function handleRaiseInput(e: Event) {
  const digits = (e.target as HTMLInputElement).value.replace(/\D/g, '')
  raiseInputText.value = digits
  const parsed = Number(digits)
  if (digits.length > 0 && Number.isFinite(parsed)) {
    customRaiseExtra.value = Math.min(maxRaiseAdd.value, parsed)
  }
}

function commitRaiseInput() {
  isEditingRaiseInput.value = false
  const parsed = Number(raiseInputText.value)
  const clamped = Number.isFinite(parsed)
    ? Math.min(maxRaiseAdd.value, Math.max(minRaiseAdd.value, parsed))
    : minRaiseAdd.value
  customRaiseExtra.value = clamped
  raiseInputText.value = String(clamped)
}

function submitRaiseFromInput() {
  commitRaiseInput()
  if (gameStore.isHumanTurn && humanPlayer.value) {
    gameStore.humanAction('raise', customRaiseExtra.value)
  }
}

function handleRaiseWheel(e: WheelEvent) {
  const dir = e.deltaY < 0 ? 1 : -1
  stepCustomRaise(dir)
}

// 键盘快捷键打牌支持：1~5 一键档位加注，空格/C 过跟，F 弃牌，R/Enter 自定义加注，A 全下，上下键调额
function handleTableKeydown(e: KeyboardEvent) {
  if (activeModal.value !== 'none') return
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return

  if (gameStore.stage === 'SETTLEMENT') {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault()
      handleNextHand()
    }
    return
  }

  // 如果玩家已弃牌、处于加速快进阶段，按空格或回车可直接跳到本局结算
  if (gameStore.isFastForwarding) {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault()
      gameStore.skipToSettlementNow()
    }
    return
  }

  if (!gameStore.isHumanTurn || !humanPlayer.value) return

  const key = e.key.toLowerCase()
  if (key === 'f') {
    e.preventDefault()
    gameStore.humanAction('fold')
  } else if (e.code === 'Space' || key === 'c') {
    e.preventDefault()
    if (gameStore.humanToCall === 0) {
      gameStore.humanAction('check')
    } else {
      gameStore.humanAction('call')
    }
  } else if (key === 'a') {
    e.preventDefault()
    gameStore.humanAction('allin')
  } else if (
    (key === 'r' || e.code === 'Enter') &&
    humanPlayer.value.chips > gameStore.humanToCall
  ) {
    e.preventDefault()
    gameStore.humanAction('raise', customRaiseExtra.value)
  } else if (e.key === 'ArrowUp' || e.key === '+' || e.key === '=') {
    e.preventDefault()
    stepCustomRaise(1)
  } else if (e.key === 'ArrowDown' || e.key === '-') {
    e.preventDefault()
    stepCustomRaise(-1)
  } else if (
    ['1', '2', '3', '4', '5'].includes(key) &&
    humanPlayer.value.chips > gameStore.humanToCall
  ) {
    e.preventDefault()
    const preset = quickRaisePresets.value[Number(key) - 1]
    if (preset) {
      handleQuickRaiseAmount(preset.amount)
    }
  }
}

// 是否处于摊牌或结算阶段
const isShowdownOrSettlement = computed(
  () => gameStore.stage === 'SHOWDOWN' || gameStore.stage === 'SETTLEMENT'
)

// 检查某张公共牌是否高亮：
// - 下注阶段：高亮玩家本人的最佳成牌组合
// - 摊牌/结算阶段：高亮【本局赢家】的最佳成牌组合，让谁赢了、用哪几张公牌赢的一目了然！
function isCommunityCardHighlighted(cardId: string): boolean {
  if (
    isShowdownOrSettlement.value &&
    gameStore.mainWinnerResult &&
    !gameStore.mainWinnerResult.winByFold
  ) {
    return gameStore.mainWinnerResult.coreCardIds.includes(cardId)
  }
  if (!userStore.showHandHelper || !gameStore.humanEvaluation?.usesHoleInCore) return false
  return gameStore.humanEvaluation.coreCardIds.includes(cardId)
}

function isCommunityCardInBestFive(cardId: string): boolean {
  if (
    isShowdownOrSettlement.value &&
    gameStore.mainWinnerResult &&
    !gameStore.mainWinnerResult.winByFold
  ) {
    return gameStore.mainWinnerResult.bestFiveIds.includes(cardId)
  }
  if (!userStore.showHandHelper || !gameStore.humanEvaluation?.usesHoleInCore) return false
  return gameStore.humanEvaluation.bestFiveIds.includes(cardId)
}

function isCommunityCardDimmed(cardId: string): boolean {
  if (
    isShowdownOrSettlement.value &&
    gameStore.mainWinnerResult &&
    !gameStore.mainWinnerResult.winByFold &&
    gameStore.mainWinnerResult.bestFiveIds.length === 5
  ) {
    return !gameStore.mainWinnerResult.bestFiveIds.includes(cardId)
  }
  return false
}

// 检查玩家本人手牌是否属于最佳成牌组合
function isCardHighlighted(cardId: string): boolean {
  if (!userStore.showHandHelper || !gameStore.humanEvaluation) return false
  return gameStore.humanEvaluation.coreCardIds.includes(cardId)
}

function isCardInBestFive(cardId: string): boolean {
  if (!userStore.showHandHelper || !gameStore.humanEvaluation) return false
  return gameStore.humanEvaluation.bestFiveIds.includes(cardId)
}

// 玩家本局净盈亏
const humanNetProfit = computed(() => {
  if (!humanPlayer.value) return 0
  return humanPlayer.value.roundWinnings - humanPlayer.value.totalHandBet
})

const CHIP_DENOM_ASSETS = [
  { d: 5000, src: resolvePublicAsset('assets/chips/chip_5000.png') },
  { d: 1000, src: resolvePublicAsset('assets/chips/chip_1000.png') },
  { d: 500, src: resolvePublicAsset('assets/chips/chip_500.png') },
  { d: 100, src: resolvePublicAsset('assets/chips/chip_100.png') },
] as const

// 将任意筹码金额拆解为用于 UI 展示的真实筹码图片列表（100 / 500 / 1000 / 5000，最多展示 5 枚代表性筹码）
function getDisplayChipList(amount: number, maxCount = 5): { denom: number; src: string }[] {
  const list: { denom: number; src: string }[] = []
  let rem = Math.max(100, amount)
  for (const item of CHIP_DENOM_ASSETS) {
    while (rem >= item.d && list.length < maxCount) {
      list.push({ denom: item.d, src: item.src })
      rem -= item.d
    }
  }
  if (list.length === 0) {
    list.push({ denom: 100, src: CHIP_DENOM_ASSETS[CHIP_DENOM_ASSETS.length - 1].src })
  }
  return list
}

// 将底池金额按面额精确拆解并分组（5000 / 1000 / 500 / 100 各几枚），保证图片筹码总和与底池数字一致
function getGroupedChipList(
  amount: number
): { denom: number; src: string; count: number }[] {
  const result: { denom: number; src: string; count: number }[] = []
  let rem = Math.max(0, Math.floor(amount))
  for (const item of CHIP_DENOM_ASSETS) {
    const count = Math.floor(rem / item.d)
    if (count > 0) {
      result.push({ denom: item.d, src: item.src, count })
      rem -= count * item.d
    }
  }
  return result
}

// 根据中央总底池大小（相对于大盲注 BB 的倍数）动态计算底池等级与背景光环
const potVisualTier = computed(() => {
  const bb = Math.max(1, gameStore.currentRoom.bigBlind)
  const ratio = gameStore.potTotal / bb
  const chips = getGroupedChipList(gameStore.potTotal)

  if (ratio >= 80) {
    return {
      level: 4,
      tag: '✦ 樱月豪池',
      icon: 'mdi:sparkles',
      chips,
      boxClass: userStore.moyuMode
        ? 'bg-[#21152c]/90 border-rose-300/60 text-rose-100 shadow-[0_0_20px_rgba(244,114,182,0.3)]'
        : 'bg-gradient-to-r from-[#361334]/95 via-[#521a45]/95 to-[#361334]/95 border-amber-200/90 shadow-[0_0_32px_rgba(244,114,182,0.65)] ring-1 ring-rose-300/70',
      auraClass: 'from-rose-400/30 via-amber-300/20 to-transparent',
    }
  }
  if (ratio >= 30) {
    return {
      level: 3,
      tag: '✦ 灵石巨池',
      icon: 'mdi:crown-outline',
      chips,
      boxClass: userStore.moyuMode
        ? 'bg-[#1a1833]/90 border-amber-200/50 text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.22)]'
        : 'bg-gradient-to-r from-[#261a42]/95 via-[#3d2352]/90 to-[#261a42]/95 border-amber-300/80 shadow-[0_0_24px_rgba(251,191,36,0.45)]',
      auraClass: 'from-amber-300/25 via-rose-300/15 to-transparent',
    }
  }
  if (ratio >= 10) {
    return {
      level: 2,
      tag: '激战灵池',
      icon: 'mdi:flower-tulip-outline',
      chips,
      boxClass: userStore.moyuMode
        ? 'bg-[#13172e]/95 border-indigo-300/45 text-indigo-100'
        : 'bg-[#131733]/85 border-rose-300/60 shadow-[0_0_20px_rgba(192,132,252,0.35)]',
      auraClass: 'from-purple-400/20 via-rose-300/12 to-transparent',
    }
  }
  return {
    level: 1,
    tag: '总底池',
    icon: 'mdi:poker-chip',
    chips,
    boxClass: userStore.moyuMode
      ? 'bg-[#12162b]/90 border-indigo-400/25 text-slate-300'
      : 'bg-[#111530]/80 border-amber-200/55 shadow-[0_0_16px_rgba(253,164,175,0.2)]',
    auraClass: 'from-indigo-400/15 to-transparent',
  }
})

// 5个AI座位朝向牌桌内侧的“桌前已下筹码堆”定位
const aiFrontChipPositions: Record<number, string> = {
  1: '-top-7 right-3', // 左下座位 -> 筹码放在右上方朝向桌面中心
  2: '-bottom-7 right-3', // 左上座位 -> 筹码放在右下方朝向桌面中心
  3: '-bottom-7 left-1/2 -translate-x-1/2', // 顶部偏左座位 -> 筹码放在正下方
  4: '-bottom-7 left-3', // 右上座位 -> 筹码放在左下方朝向桌面中心
  5: '-top-7 left-3', // 右下座位 -> 筹码放在左上方朝向桌面中心
}

// 摸鱼模式下内联文字牌面的四色花色样式（蓝白=♠、亮红=♥、亮绿=♣、亮橙=♦）
function getInlineCardSuitColor(suit: string, onWhiteBg = false): string {
  if (userStore.moyuMode) {
    switch (suit) {
      case 'spades':
        return 'text-sky-300'
      case 'hearts':
        return 'text-rose-400'
      case 'clubs':
        return 'text-emerald-400'
      case 'diamonds':
        return 'text-amber-400'
    }
  }
  const isRed = suit === 'hearts' || suit === 'diamonds'
  if (onWhiteBg) {
    return isRed ? 'text-red-600' : 'text-slate-950'
  }
  return isRed ? 'text-rose-400' : 'text-slate-200'
}

// 实时监听账户欢乐豆增加（如转盘中奖、领取救济金），自动同步到牌桌上的玩家筹码
watch(
  () => userStore.beans,
  (newBeans) => {
    if (humanPlayer.value && newBeans > humanPlayer.value.chips) {
      humanPlayer.value.chips = newBeans
    }
  }
)

// 是否向玩家展示某位 AI 的底牌 (摊牌阶段、结算阶段且未弃牌，或全员 All-in 跑马阶段)
function shouldRevealAICards(ai: TablePlayer): boolean {
  if (ai.folded) return false
  if (gameStore.isAllInRunout) return true
  return gameStore.stage === 'SHOWDOWN' || gameStore.stage === 'SETTLEMENT'
}

function handleBackLobby() {
  sound.playClick()
  gameStore.leaveTable()
  emit('back-lobby')
}

function handleNextHand() {
  clearAutoNextTimer()
  sound.playClick()
  if ((humanPlayer.value?.chips || 0) < gameStore.currentRoom.bigBlind * 2) {
    activeModal.value = 'bankruptcy'
    return
  }
  gameStore.startNewHand()
}

function toggleAutoNextAfterFold() {
  userStore.autoNextHandAfterFold = !userStore.autoNextHandAfterFold
  sound.playClick()
  if (!userStore.autoNextHandAfterFold) {
    clearAutoNextTimer()
  } else if (
    gameStore.stage === 'SETTLEMENT' &&
    humanPlayer.value?.folded
  ) {
    clearAutoNextTimer()
    autoNextHandTimerId = window.setTimeout(() => {
      if (gameStore.stage === 'SETTLEMENT') {
        handleNextHand()
      }
    }, 800)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleTableKeydown)
  window.addEventListener('pointerup', stopHoldStep)
  // 进入牌桌后自动发第一局牌
  if (gameStore.stage === 'IDLE') {
    setTimeout(() => {
      gameStore.startNewHand()
    }, 350)
  }
})

onUnmounted(() => {
  clearAutoNextTimer()
  stopHoldStep()
  if (dealerToastTimerId !== null) {
    clearTimeout(dealerToastTimerId)
    dealerToastTimerId = null
  }
  window.removeEventListener('keydown', handleTableKeydown)
  window.removeEventListener('pointerup', stopHoldStep)
  gameStore.clearTimers()
})
</script>

<template>
  <div
    class="relative w-full h-full overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#181636] via-[#0d0e22] to-[#070814] select-none flex flex-col justify-between"
  >
    <!-- 全屏大牌演出特效层 (摸鱼模式下隐藏火箭/炸弹全屏动画) -->
    <ArcadeVfxOverlay v-if="!userStore.moyuMode" />

    <!-- 1. 顶部精简状态栏 (左：大厅 + 场次；右：摸鱼 + 牌型 + 更多菜单) -->
    <header
      class="relative z-30 flex items-center justify-between gap-2"
      :class="isCompact ? 'px-2.5 py-1' : 'px-5 py-2.5'"
    >
      <!-- 左上：返回大厅 + 场次胶囊 -->
      <div class="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
        <button
          class="rounded-xl bg-black/60 hover:bg-black/80 border border-amber-400/60 flex items-center gap-1 font-black text-amber-200 shadow transition shrink-0"
          :class="isCompact ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'"
          @click="handleBackLobby"
        >
          <Icon icon="mdi:arrow-left-bold-circle" class="text-base text-yellow-300" />
          <span>大厅</span>
        </button>

        <div
          class="rounded-xl bg-black/50 border border-white/15 flex items-center gap-2 text-xs shrink-0"
          :class="isCompact ? 'px-2.5 py-1' : 'px-3.5 py-1.5'"
        >
          <span class="font-black text-amber-300">{{ gameStore.currentRoom.name }}</span>
          <span class="text-slate-300">
            盲注:<strong class="text-white">{{ gameStore.currentRoom.smallBlind }}/{{ gameStore.currentRoom.bigBlind }}</strong>
          </span>
          <span class="text-slate-400">#{{ gameStore.handNumber }}局</span>
        </div>
      </div>

      <!-- 右上：摸鱼模式 + 牌型 + 更多菜单 -->
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          class="rounded-xl border text-xs font-black flex items-center gap-1 transition"
          :class="[
            isCompact ? 'px-2 py-1' : 'px-3 py-1.5',
            userStore.moyuMode
              ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
              : 'bg-white/10 hover:bg-white/20 border-white/15 text-slate-300',
          ]"
          title="切换上班摸鱼紧凑模式（缩小卡片、收敛炫光，适合小窗口）"
          @click="toggleMoyuMode"
        >
          <Icon icon="mdi:fish" class="text-sm text-cyan-300" />
          <span>{{ userStore.moyuMode ? '摸鱼中' : '摸鱼模式' }}</span>
        </button>

        <button
          class="rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold flex items-center gap-1 transition"
          :class="isCompact ? 'px-2 py-1' : 'px-3 py-1.5'"
          @click="activeModal = 'rules'"
        >
          <Icon icon="mdi:help-circle-outline" class="text-sm text-sky-300" />
          <span class="hidden sm:inline">牌型</span>
        </button>

        <!-- 更多功能收纳菜单 -->
        <div class="relative">
          <button
            class="rounded-xl border text-xs font-bold flex items-center gap-1 transition"
            :class="[
              isCompact ? 'px-2 py-1' : 'px-3 py-1.5',
              showMoreMenu
                ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                : 'bg-white/10 hover:bg-white/20 border-white/15 text-slate-200',
            ]"
            title="账单流水、隐蔽设置、牌力提示、转盘等更多功能"
            @click="showMoreMenu = !showMoreMenu"
          >
            <Icon icon="mdi:dots-horizontal" class="text-base" />
            <span class="hidden sm:inline">更多</span>
          </button>

          <!-- 点击空白处关闭下拉菜单 -->
          <div
            v-if="showMoreMenu"
            class="fixed inset-0 z-30"
            @click="showMoreMenu = false"
          ></div>

          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 -translate-y-1 scale-95"
            enter-to-class="opacity-100 translate-y-0 scale-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0 scale-95"
          >
            <div
              v-if="showMoreMenu"
              class="absolute right-0 mt-1.5 z-40 w-52 p-1.5 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-2xl space-y-1 text-xs"
            >
              <button
                class="w-full px-2.5 py-2 rounded-xl hover:bg-white/10 flex items-center justify-between text-amber-200 font-bold transition"
                @click="activeModal = 'ledger'; showMoreMenu = false"
              >
                <span class="flex items-center gap-2">
                  <Icon icon="mdi:receipt-text-clock" class="text-sm text-yellow-300" />
                  账单流水
                </span>
                <span
                  class="px-1.5 py-0.5 rounded-full text-[10px] font-mono"
                  :class="
                    userStore.netGameProfit >= 0
                      ? 'bg-emerald-500/25 text-emerald-300'
                      : 'bg-rose-500/25 text-rose-300'
                  "
                >
                  {{ userStore.netGameProfit >= 0 ? '+' : '' }}{{ formatChips(userStore.netGameProfit) }}
                </span>
              </button>

              <button
                class="w-full px-2.5 py-2 rounded-xl hover:bg-white/10 flex items-center justify-between text-slate-200 font-bold transition"
                @click="emit('toggle-boss'); showMoreMenu = false"
              >
                <span class="flex items-center gap-2">
                  <Icon icon="mdi:file-excel-outline" class="text-sm text-emerald-400" />
                  一键隐蔽
                </span>
                <span class="text-[10px] font-mono text-slate-400">
                  {{ userStore.stealthKey === 'Escape' ? '退出键' : userStore.stealthKey }}
                </span>
              </button>

              <button
                class="w-full px-2.5 py-2 rounded-xl hover:bg-white/10 flex items-center justify-between text-slate-200 font-bold transition"
                @click="activeModal = 'stealth'; showMoreMenu = false"
              >
                <span class="flex items-center gap-2">
                  <Icon icon="mdi:shield-lock-outline" class="text-sm text-cyan-300" />
                  隐蔽设置
                </span>
                <span
                  v-if="userStore.autoStealthOnLeave"
                  class="text-[10px] text-emerald-300 font-black"
                >
                  防窥:开
                </span>
              </button>

              <button
                class="w-full px-2.5 py-2 rounded-xl hover:bg-white/10 flex items-center justify-between text-slate-200 font-bold transition"
                @click="userStore.showHandHelper = !userStore.showHandHelper"
              >
                <span class="flex items-center gap-2">
                  <Icon icon="mdi:eye-check" class="text-sm text-emerald-300" />
                  牌力提示
                </span>
                <span
                  class="px-1.5 py-0.5 rounded-full text-[10px] font-black"
                  :class="
                    userStore.showHandHelper
                      ? 'bg-emerald-500/25 text-emerald-300'
                      : 'bg-slate-700 text-slate-400'
                  "
                >
                  {{ userStore.showHandHelper ? '开' : '关' }}
                </span>
              </button>

              <button
                class="w-full px-2.5 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2 text-amber-200 font-bold transition"
                @click="activeModal = 'wheel'; showMoreMenu = false"
              >
                <Icon icon="mdi:ferris-wheel" class="text-sm text-amber-300" />
                <span>幸运转盘</span>
              </button>

              <button
                v-if="!userStore.moyuMode"
                class="w-full px-2.5 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2 text-rose-300 font-bold transition"
                @click="gameStore.tipDealer(); triggerDealerToast(2400); showMoreMenu = false"
              >
                <Icon icon="mdi:heart-flash" class="text-sm text-rose-400" />
                <span>打赏荷官</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </header>

    <!-- 2. 中央 6人工作区 / 椭圆牌桌区域 -->
    <main
      class="relative flex-1 flex items-center justify-center min-h-0"
      :class="isCompact ? 'px-8 py-1.5' : 'px-16 py-5'"
    >
      <!-- 外框：摸鱼模式下为扁平矩形数据看板，街机模式下为椭圆大牌桌 -->
      <div
        class="relative z-10 w-full h-full bg-gradient-to-b flex flex-col items-center justify-between transition-colors duration-300"
        :class="[
          tableThemeClasses,
          userStore.moyuMode
            ? 'max-w-[960px] max-h-[390px] rounded-2xl border py-2.5 px-6 font-mono'
            : isCompact
              ? 'max-w-[920px] max-h-[380px] rounded-[180px] border-[6px] py-2.5 px-6'
              : 'max-w-[1160px] max-h-[550px] rounded-[260px] border-[14px] py-6 px-12',
        ]"
      >
        <!-- 桌面 PixiJS 真实 3D 筹码散落与抛投物理特效画布 (置于牌桌桌布正上方，让扔出的 100/500/1000/5000 筹码真实散落在桌面上！) -->
        <PixiTableCanvas />

        <!-- 内圈烫金樱月装饰细线 (摸鱼模式下隐藏) -->
        <div
          v-if="!userStore.moyuMode"
          class="absolute border border-rose-200/20 pointer-events-none"
          :class="isCompact ? 'inset-2 rounded-[170px]' : 'inset-4 rounded-[240px]'"
        ></div>

        <!-- 荷官阶段播报：仅在发公共牌/结算/打赏时短暂淡入淡出，不占常驻空间 -->
        <Transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="opacity-0 -translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-300 ease-in"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div
            v-if="showDealerToast && gameStore.dealerQuote"
            class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-md px-3.5 py-1 rounded-full backdrop-blur-md text-xs font-bold truncate shadow-lg border"
            :class="
              userStore.moyuMode
                ? 'bg-slate-900/90 border-slate-700 text-slate-300 font-mono'
                : 'bg-black/75 border-amber-400/60 text-amber-100'
            "
          >
            {{ gameStore.dealerQuote }}
          </div>
        </Transition>

        <!-- 牌桌中心：精简总底池胶囊 + 5张公共牌卡槽 -->
        <div class="relative z-20 flex flex-col items-center my-auto">
          <!-- 动态底池背景能量光环 (仅街机模式显示) -->
          <div
            v-if="gameStore.potTotal > 0 && !userStore.moyuMode"
            class="pointer-events-none absolute -top-6 w-72 sm:w-96 h-24 rounded-full bg-radial bg-gradient-to-b blur-2xl transition-all duration-500"
            :class="potVisualTier.auraClass"
          ></div>

          <!-- 主底池胶囊 + 仅在 All-in 产生分池时显示的边池 -->
          <div
            class="relative flex flex-wrap items-center justify-center gap-2"
            :class="isCompact ? 'mb-3' : 'mb-5'"
          >
            <div
              :key="`pot_tier_${potVisualTier.level}`"
              class="relative flex items-center gap-2.5 transition-all duration-300"
              :class="[
                potVisualTier.boxClass,
                userStore.moyuMode
                  ? 'px-3.5 py-1 rounded-xl border font-mono'
                  : isCompact
                    ? 'px-4 py-1 rounded-full border-2'
                    : 'px-6 py-1.5 rounded-full border-2',
              ]"
            >
              <!-- 左侧：按面额精确拆解的真实 3D 筹码图标 -->
              <div
                v-if="potVisualTier.chips.length > 0"
                class="flex items-center gap-1 shrink-0"
              >
                <div
                  v-for="chipItem in potVisualTier.chips"
                  :key="chipItem.denom"
                  class="relative shrink-0"
                  :title="`${chipItem.denom} × ${chipItem.count}`"
                >
                  <div
                    class="rounded-full overflow-hidden border border-yellow-200/80 shadow-[0_3px_8px_rgba(0,0,0,0.85)] bg-black"
                    :class="isCompact ? 'w-7 h-7' : 'w-9 h-9'"
                  >
                    <img
                      :src="chipItem.src"
                      :alt="`${chipItem.denom}`"
                      class="w-full h-full object-cover scale-[1.09] rounded-full"
                    />
                  </div>
                  <span
                    class="absolute -bottom-1 -right-1 min-w-[18px] px-1 rounded-full bg-black/90 border border-yellow-300/80 text-[9px] font-mono font-black leading-[14px] text-center text-yellow-200"
                  >
                    ×{{ chipItem.count }}
                  </span>
                </div>
              </div>

              <!-- 中部：底池标签 + 总额数字 -->
              <div class="flex flex-col items-start">
                <div class="flex items-center gap-1 leading-none">
                  <Icon
                    :icon="potVisualTier.icon"
                    class="text-xs"
                    :class="
                      potVisualTier.level >= 3
                        ? 'text-yellow-200'
                        : 'text-yellow-300'
                    "
                  />
                  <span
                    class="text-[10px] font-black tracking-wider"
                    :class="
                      potVisualTier.level >= 3
                        ? 'text-yellow-200'
                        : 'text-amber-200/90'
                    "
                  >
                    {{ potVisualTier.tag }}
                  </span>
                </div>

                <div class="flex items-baseline gap-1.5 mt-0.5">
                  <span
                    class="font-black tracking-tight leading-none"
                    :class="[
                      isCompact ? 'text-base' : 'text-2xl',
                      potVisualTier.level >= 4
                        ? 'text-yellow-200 drop-shadow-[0_0_10px_rgba(253,224,71,0.9)]'
                        : 'text-yellow-300',
                    ]"
                    :title="`底池总额：${gameStore.potTotal.toLocaleString()}`"
                  >
                    {{ formatChips(gameStore.potTotal) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 边池列表（仅在有玩家全下产生真实边池时显示） -->
            <template v-if="hasActiveSidePots">
              <div
                v-for="pot in gameStore.sidePots"
                :key="pot.name"
                class="px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-400/50 text-[10px] font-bold text-amber-200"
              >
                {{ pot.name }}: {{ formatChips(pot.amount) }}
              </div>
            </template>
          </div>

          <!-- 5张极简小方牌标签公共牌 (如 [♠8] [♠5] [♣J] [♦5]，缩小一圈、清爽紧凑，为桌面散乱堆叠的筹码留出充足视野) -->
          <div
            class="flex items-center justify-center rounded-2xl bg-black/45 backdrop-blur-xs border border-white/15 shadow-lg"
            :class="isCompact ? 'gap-1.5 px-2.5 py-1.5' : 'gap-2.5 px-4 py-2'"
          >
            <template v-if="gameStore.communityCards.length > 0">
              <div
                v-for="cCard in gameStore.communityCards"
                :key="cCard.id"
                class="relative select-none rounded-xl border-2 font-mono font-black flex items-center justify-center gap-0.5 transition-all duration-200 shadow-md"
                :class="[
                  isCompact ? 'px-2.5 py-1 text-sm min-w-[44px]' : 'px-3.5 py-1.5 text-lg min-w-[58px]',
                  userStore.moyuMode
                    ? [
                        'bg-slate-900/95',
                        getInlineCardSuitColor(cCard.suit, false),
                        isCommunityCardHighlighted(cCard.id)
                          ? '-translate-y-1.5 border-cyan-300 ring-2 ring-cyan-400/70 shadow-[0_0_16px_rgba(34,211,238,0.65)] z-10'
                          : isCommunityCardInBestFive(cCard.id)
                            ? '-translate-y-0.5 border-slate-300'
                            : 'border-slate-700',
                      ]
                    : [
                        'bg-white',
                        getInlineCardSuitColor(cCard.suit, true),
                        isCommunityCardHighlighted(cCard.id)
                          ? '-translate-y-1.5 border-amber-400 ring-3 ring-yellow-300 shadow-[0_0_20px_rgba(251,191,36,0.9)] z-10'
                          : isCommunityCardInBestFive(cCard.id)
                            ? '-translate-y-0.5 border-emerald-400 ring-2 ring-emerald-400/60'
                            : 'border-slate-300',
                      ],
                  isCommunityCardDimmed(cCard.id) ? 'opacity-40 scale-95' : '',
                ]"
              >
                <span>{{ cCard.suitSymbol }}</span>
                <span>{{ cCard.label }}</span>
              </div>
            </template>

            <!-- 翻牌前尚未发出公共牌时的极简占位条 -->
            <div
              v-else
              class="px-4 py-1 text-xs font-mono font-bold text-slate-400/70 tracking-widest"
            >
              等待发出公共牌（翻牌 / 转牌 / 河牌）
            </div>
          </div>

          <!-- 桌面精简结算条（结算时默认直接在桌面显示，不自动弹大弹窗遮挡牌局，可按需点击展开赢牌） -->
          <div
            v-if="gameStore.stage === 'SETTLEMENT' && gameStore.mainWinnerResult"
            class="relative z-30 mt-2 px-4 py-2 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-yellow-400/60 shadow-xl flex items-center justify-between gap-3 flex-wrap"
          >
            <div class="flex items-center gap-2 text-xs sm:text-sm">
              <span class="font-black text-yellow-300">
                👑 {{ gameStore.mainWinnerResult.name }}
              </span>
              <span class="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-xs">
                {{ gameStore.mainWinnerResult.handDescription }}
              </span>
              <span class="font-mono font-bold text-emerald-300">
                +{{ formatChips(gameStore.mainWinnerResult.winnings) }}
              </span>
              <span
                class="font-mono font-bold text-xs ml-1"
                :class="humanNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
              >
                (你 {{ humanNetProfit >= 0 ? '+' : '' }}{{ formatChips(humanNetProfit) }})
              </span>
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              <button
                class="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-slate-200 font-bold text-xs transition"
                @click="showGiantStage = true"
              >
                展开赢牌
              </button>
              <button
                v-if="gameStore.canBluffShow && !gameStore.humanShowedBluff"
                class="px-2.5 py-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow transition"
                @click="gameStore.triggerHumanBluffShow()"
              >
                亮牌炫耀
              </button>
              <button
                class="px-2.5 py-1 rounded-xl border font-bold text-xs flex items-center gap-1 transition"
                :class="
                  userStore.autoNextHandAfterFold
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                    : 'bg-white/10 hover:bg-white/20 border-white/20 text-slate-300'
                "
                title="开启后：当你弃牌时，加速结算后将自动开启下一局"
                @click="toggleAutoNextAfterFold"
              >
                <Icon icon="mdi:autorenew" class="text-xs" />
                <span>弃牌自动下一局:{{ userStore.autoNextHandAfterFold ? '开' : '关' }}</span>
              </button>
              <button
                class="px-4 py-1 rounded-xl bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-500 text-red-950 font-black text-xs sm:text-sm shadow hover:brightness-110 transition"
                @click="handleNextHand"
              >
                继续下一局 (空格)
              </button>
            </div>
          </div>
        </div>

        <div :class="isCompact ? 'h-1' : 'h-4'"></div>
      </div>

      <!-- 环绕工作区/牌桌的 5 个 AI 座位组件 (摸鱼模式下隐藏头像，化为深灰节点数据卡片组；加注/全下/跟注时触发醒目爆点特效) -->
      <div
        v-for="ai in aiPlayers"
        :key="ai.id"
        class="absolute z-20 transition-all duration-300"
        :class="[
          aiSeatPositions[ai.seatIndex],
          ai.folded
            ? 'opacity-45'
            : isShowdownOrSettlement && !ai.isWinner
              ? 'opacity-75'
              : '',
        ]"
      >
        <div
          :key="`seat_${ai.id}_${ai.actionVfxId}`"
          class="relative flex items-center backdrop-blur-md transition-all duration-300"
          :class="[
            ai.lastActionType === 'allin' && !isShowdownOrSettlement
              ? 'seat-action-allin'
              : ai.lastActionType === 'raise' && !isShowdownOrSettlement
                ? 'seat-action-raise'
                : ai.lastActionType === 'call' && !isShowdownOrSettlement
                  ? 'seat-action-call'
                  : '',
            userStore.moyuMode
              ? [
                  'gap-2 p-2 rounded-xl min-w-[155px] border font-mono shadow-md',
                  ai.isWinner
                    ? 'bg-[#1c1f3d]/95 border-rose-300/80 ring-1 ring-rose-300/50 z-30'
                    : ai.lastActionType === 'allin' && !isShowdownOrSettlement
                      ? 'bg-[#2b142c]/95 border-rose-400/85 ring-2 ring-rose-400/60 shadow-[0_0_22px_rgba(244,114,182,0.55)]'
                      : ai.lastActionType === 'raise' && !isShowdownOrSettlement
                        ? 'bg-[#241b36]/90 border-amber-300/75 ring-1 ring-amber-300/60 shadow-[0_0_18px_rgba(251,191,36,0.4)]'
                        : ai.lastActionType === 'call' && !isShowdownOrSettlement
                          ? 'bg-[#151d3b]/90 border-indigo-300/65 ring-1 ring-indigo-300/45 shadow-[0_0_14px_rgba(129,140,248,0.35)]'
                          : gameStore.activeSeatIndex === ai.seatIndex
                            ? 'bg-[#181c38]/95 border-rose-200/60'
                            : 'bg-[#11152b]/90 border-indigo-400/20',
                ]
              : [
                  'border shadow-2xl',
                  isCompact
                    ? 'gap-1.5 p-1.5 rounded-2xl min-w-[152px]'
                    : 'gap-2.5 p-2.5 rounded-2xl min-w-[235px]',
                  ai.isWinner
                    ? 'bg-gradient-to-r from-[#36173b]/95 via-[#2a1742]/95 to-[#151836]/95 border-amber-200 ring-2 ring-rose-300/80 shadow-[0_0_32px_rgba(253,164,175,0.75)] scale-105 z-30'
                    : ai.lastActionType === 'allin' && !isShowdownOrSettlement
                      ? 'bg-gradient-to-r from-[#3d1432]/95 via-[#2c1538]/95 to-[#141733]/95 border-rose-300 ring-2 ring-rose-400/80 shadow-[0_0_30px_rgba(244,114,182,0.75)] z-30'
                      : ai.lastActionType === 'raise' && !isShowdownOrSettlement
                        ? 'bg-gradient-to-r from-[#2e1e42]/95 via-[#211a3d]/95 to-[#141733]/95 border-amber-200/90 ring-2 ring-amber-300/65 shadow-[0_0_26px_rgba(251,191,36,0.6)] z-30'
                        : ai.lastActionType === 'call' && !isShowdownOrSettlement
                          ? 'bg-gradient-to-r from-[#182147]/95 via-[#141938]/95 to-[#111530]/95 border-indigo-300/80 ring-1 ring-indigo-300/60 shadow-[0_0_20px_rgba(129,140,248,0.5)]'
                          : gameStore.activeSeatIndex === ai.seatIndex
                            ? 'bg-[#161a38]/95 border-rose-200/85 ring-2 ring-rose-300/45 shadow-[0_0_24px_rgba(253,164,175,0.5)]'
                            : 'bg-[#121630]/88 border-rose-200/20',
                ],
          ]"
        >
          <!-- 对手加注 / 全下 / 跟注 边框扩散光波环 -->
          <div
            v-if="
              !isShowdownOrSettlement &&
              (ai.lastActionType === 'raise' ||
                ai.lastActionType === 'allin' ||
                ai.lastActionType === 'call') &&
              ai.actionVfxId > 0
            "
            :key="`vfx_${ai.actionVfxId}`"
            class="pointer-events-none absolute inset-0 rounded-[inherit] overflow-visible z-40"
          >
            <div
              class="absolute -inset-1 rounded-[inherit] action-ring-burst"
              :class="
                ai.lastActionType === 'allin'
                  ? 'border-2 border-red-400'
                  : ai.lastActionType === 'raise'
                    ? 'border-2 border-amber-300'
                    : 'border-2 border-sky-300'
              "
            ></div>
          </div>
          <!-- 赢家专属皇冠与收池飘字横幅 (移至左侧上方，绝不遮挡右侧底牌) -->
          <div
            v-if="ai.isWinner"
            class="absolute -top-3.5 left-2 z-30 px-2 py-0.5 rounded-full font-black text-[10px] flex items-center gap-1"
            :class="
              userStore.moyuMode
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60'
                : 'bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 text-red-950 shadow-[0_0_15px_rgba(251,191,36,0.9)] border border-white'
            "
          >
            <span>{{ userStore.moyuMode ? `★胜 +${formatChips(ai.roundWinnings)}` : `👑 赢家 +${formatChips(ai.roundWinnings)}` }}</span>
          </div>

          <!-- 庄家 / 大小盲角标 -->
          <div v-else class="absolute -top-2.5 left-2 z-30 flex items-center gap-1">
            <span
              v-if="ai.isDealer"
              class="px-1.5 py-0.5 rounded font-black text-[9px] shadow"
              :class="userStore.moyuMode ? 'bg-slate-700 text-slate-200 border border-slate-500' : 'rounded-full bg-yellow-400 text-slate-950'"
            >
              庄
            </span>
            <span
              v-if="ai.isSmallBlind"
              class="px-1.5 py-0.5 rounded font-black text-[9px] shadow"
              :class="userStore.moyuMode ? 'bg-slate-800 text-slate-300 border border-slate-600' : 'rounded-full bg-sky-500 text-white'"
            >
              小盲
            </span>
            <span
              v-if="ai.isBigBlind"
              class="px-1.5 py-0.5 rounded font-black text-[9px] shadow"
              :class="userStore.moyuMode ? 'bg-slate-800 text-slate-300 border border-slate-600' : 'rounded-full bg-orange-500 text-white'"
            >
              大盲
            </span>
            <span
              v-if="!isCompact && !ai.isWinner && !userStore.moyuMode"
              class="px-2 py-0.5 rounded-full bg-gradient-to-r text-white font-bold text-[10px] shadow"
              :class="ai.tagColor"
            >
              {{ ai.styleTag }}
            </span>
          </div>

          <!-- 角色立绘头像 (摸鱼模式下完全隐藏头像！) -->
          <div
            v-if="!userStore.moyuMode"
            class="relative cursor-pointer group shrink-0"
            title="点击向TA投掷互动道具"
            @click="selectedSeatForProp = selectedSeatForProp === ai.seatIndex ? null : ai.seatIndex"
          >
            <img
              :src="ai.avatar"
              :alt="ai.name"
              class="rounded-xl object-cover border border-amber-300 group-hover:scale-105 transition"
              :class="isCompact ? 'w-10 h-10' : 'w-16 h-16 rounded-2xl border-2'"
            />
            <div
              v-if="ai.hitReactionEmoji"
              class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl text-xl sm:text-3xl animate-bounce"
            >
              {{ ai.hitReactionEmoji }}
            </div>
          </div>

          <!-- 道具投掷快捷气泡菜单 -->
          <div
            v-if="selectedSeatForProp === ai.seatIndex"
            class="absolute -top-11 left-0 z-40 flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-slate-950 border-2 border-amber-400 shadow-2xl"
          >
            <button
              class="hover:scale-125 transition text-base"
              title="扔西红柿"
              @click="gameStore.throwPropAtSeat(ai.seatIndex, 'tomato'); selectedSeatForProp = null"
            >
              🍅
            </button>
            <button
              class="hover:scale-125 transition text-base"
              title="泼冷水"
              @click="gameStore.throwPropAtSeat(ai.seatIndex, 'water'); selectedSeatForProp = null"
            >
              🪣
            </button>
            <button
              class="hover:scale-125 transition text-base"
              title="送红玫瑰"
              @click="gameStore.throwPropAtSeat(ai.seatIndex, 'rose'); selectedSeatForProp = null"
            >
              🌹
            </button>
            <button
              class="hover:scale-125 transition text-base"
              title="拍拖鞋"
              @click="gameStore.throwPropAtSeat(ai.seatIndex, 'slipper'); selectedSeatForProp = null"
            >
              🩴
            </button>
          </div>

          <!-- AI 名字、欢乐豆、当前行动状态 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1">
              <span
                class="font-black text-white truncate"
                :class="isCompact ? 'text-xs' : 'text-sm'"
              >
                {{ isCompact ? ai.name : `${ai.title}·${ai.name}` }}
              </span>
              <span
                v-if="(gameStore.isAllInRunout || gameStore.stage === 'SHOWDOWN') && !ai.folded"
                class="px-1 py-0.5 rounded bg-red-600 text-yellow-200 font-black text-[10px] shrink-0"
              >
                {{ ai.winProbability }}%
              </span>
            </div>

            <div class="flex items-center gap-0.5 text-amber-300 font-black text-[11px]">
              <Icon icon="mdi:peanut" />
              <span :title="ai.chips.toLocaleString()">{{ formatChips(ai.chips) }}</span>
            </div>

            <!-- 当前街下注额或行动标签 + 摊牌时内嵌牌型与底牌标签（彻底移入左侧信息栏，绝不与右侧扑克牌重叠遮挡！） -->
            <div class="mt-1 flex flex-col items-start gap-1">
              <!-- 摊牌/结算/跑马时：第一行显示底牌花色点数，第二行直接显示完整成牌牌型 -->
              <template v-if="shouldRevealAICards(ai)">
                <div class="flex items-center gap-1 flex-wrap">
                  <div
                    class="px-1.5 py-0.5 rounded shadow flex items-center gap-1 font-mono font-black text-xs"
                    :class="
                      userStore.moyuMode
                        ? 'bg-slate-950 border border-slate-600'
                        : 'bg-white border border-amber-400'
                    "
                  >
                    <span
                      v-for="(hc, hIdx) in ai.holeCards"
                      :key="hc.id || hIdx"
                      :class="getInlineCardSuitColor(hc.suit, !userStore.moyuMode)"
                    >
                      {{ hc.suitSymbol }}{{ hc.label }}
                    </span>
                  </div>

                  <!-- 牌型直接并排或换行显示在左侧信息区内，绝不被右侧卡牌遮挡 -->
                  <span
                    v-if="ai.handEvaluation"
                    class="px-2 py-0.5 rounded-md font-black text-[11px] shadow whitespace-nowrap"
                    :class="
                      ai.isWinner
                        ? userStore.moyuMode
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-400'
                          : 'bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 text-red-950'
                        : 'bg-slate-800 text-slate-200 border border-slate-600'
                    "
                  >
                    {{ ai.handEvaluation.description }}
                  </span>
                </div>
              </template>

              <!-- 未摊牌时：座位卡内仅显示紧凑动作小标签，金额由桌前筹码胶囊展示 -->
              <div v-else class="flex items-center gap-1 flex-wrap">
                <span
                  v-if="ai.lastActionText"
                  class="px-2 py-0.5 rounded-md font-black text-[11px] shadow flex items-center gap-0.5"
                  :class="
                    ai.lastActionType === 'allin'
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 text-yellow-200 border border-yellow-300 animate-pulse'
                      : ai.lastActionType === 'raise'
                        ? 'bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 text-red-950 border border-white'
                        : ai.lastActionType === 'call'
                          ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white border border-sky-200'
                          : ai.lastActionType === 'fold'
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-emerald-600 text-white'
                  "
                >
                  <span v-if="ai.lastActionType === 'allin'">⚡</span>
                  <span v-else-if="ai.lastActionType === 'raise'">🔥</span>
                  <span v-else-if="ai.lastActionType === 'call'">💰</span>
                  <span>{{ ai.lastActionType === 'raise' ? '加注' : ai.lastActionText }}</span>
                </span>
              </div>
            </div>
          </div>

          <!-- AI 右侧手牌展示 (专属独立区域，无任何悬浮角标遮挡) -->
          <div
            class="flex items-center shrink-0 transition-all duration-300"
            :class="shouldRevealAICards(ai) ? 'gap-1' : '-space-x-3'"
          >
            <PlayingCard
              v-for="(c, cIdx) in ai.holeCards"
              :key="c.id || cIdx"
              :card="c"
              :face-down="!shouldRevealAICards(ai)"
              :size="
                shouldRevealAICards(ai)
                  ? isCompact
                    ? 'xs'
                    : 'sm'
                  : isCompact
                    ? 'xs'
                    : 'sm'
              "
              :highlighted="
                shouldRevealAICards(ai) &&
                ai.isWinner &&
                !!ai.handEvaluation?.coreCardIds.includes(c.id)
              "
              :core-matched="
                shouldRevealAICards(ai) &&
                ai.isWinner &&
                !!ai.handEvaluation?.bestFiveIds.includes(c.id)
              "
            />
          </div>

          <!-- AI 座位前方桌面上的“当前街已下真实 3D 筹码堆” (彻底移除信号竖条，统一使用 AI 生成的 100/500/1000/5000 真实筹码贴图) -->
          <div
            v-if="ai.currentBet > 0 && !isShowdownOrSettlement"
            :key="`front_bet_${ai.id}_${ai.currentBet}`"
            class="chip-slam-drop pointer-events-none absolute z-30 flex items-center gap-1.5 px-2 py-0.5 rounded-full shadow-xl border"
            :class="[
              aiFrontChipPositions[ai.seatIndex],
              ai.lastActionType === 'allin'
                ? 'bg-red-950/95 border-yellow-300 text-yellow-200 shadow-[0_0_16px_rgba(239,68,68,0.85)]'
                : ai.lastActionType === 'raise'
                  ? 'bg-amber-950/95 border-amber-300 text-yellow-200 shadow-[0_0_14px_rgba(245,158,11,0.8)]'
                  : 'bg-black/90 border-amber-400/70 text-yellow-300',
            ]"
          >
            <div class="flex items-center -space-x-2 shrink-0">
              <div
                v-for="(cItem, cIdx) in getDisplayChipList(ai.currentBet, 3)"
                :key="cIdx"
                class="w-5 h-5 rounded-full overflow-hidden border border-yellow-200/80 shadow bg-black shrink-0"
              >
                <img
                  :src="cItem.src"
                  :alt="`${cItem.denom}`"
                  class="w-full h-full object-cover scale-[1.09] rounded-full"
                />
              </div>
            </div>
            <span class="text-[10px] font-mono font-black leading-none">
              {{ formatChips(ai.currentBet) }}
            </span>
          </div>

          <!-- AI 趣味性格台词气泡 (当头顶已有加注/全下/跟注大字特效时下移至底部避免重叠) -->
          <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 translate-y-2 scale-90"
            enter-to-class="opacity-100 translate-y-0 scale-100"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
          >
            <div
              v-if="ai.bubbleQuote"
              class="absolute right-1 z-30 max-w-[190px] px-2.5 py-1 rounded-xl bg-white text-slate-900 font-bold text-[11px] shadow-xl border border-amber-400 truncate"
              :class="
                ai.lastActionType === 'raise' ||
                ai.lastActionType === 'allin' ||
                ai.lastActionType === 'call'
                  ? '-bottom-8'
                  : '-top-9'
              "
            >
              💬 {{ ai.bubbleQuote }}
            </div>
          </Transition>
        </div>
      </div>
    </main>

    <!-- 3. 底部玩家主视角 HUD (支持大屏与摸鱼小窗单行紧凑模式) -->
    <footer
      v-if="humanPlayer"
      class="relative z-20 bg-gradient-to-t from-black/90 via-black/65 to-transparent flex items-center justify-between max-w-[1440px] w-full mx-auto"
      :class="isCompact ? 'px-3 pb-2 pt-1 gap-2' : 'px-6 pb-4 pt-2 gap-4'"
    >
      <!-- 左侧：玩家达文西头像、欢乐豆与快捷搞怪语音 -->
      <div class="flex items-center gap-2.5 relative shrink-0">
        <!-- 玩家获胜皇冠角标 -->
        <div
          v-if="humanPlayer.isWinner"
          class="absolute -top-9 left-0 z-30 whitespace-nowrap px-3 py-0.5 rounded-full bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 text-red-950 font-black text-xs shadow-[0_0_20px_rgba(251,191,36,0.9)] border-2 border-white animate-bounce"
        >
          👑 本局赢家 +{{ formatChips(humanPlayer.roundWinnings) }} 豆
        </div>

        <!-- 玩家台词气泡 -->
        <div
          v-else-if="humanPlayer.bubbleQuote"
          class="absolute -top-10 left-0 z-30 whitespace-nowrap px-3 py-1 rounded-xl bg-yellow-300 text-red-950 font-black text-xs shadow-xl border border-white animate-bounce"
        >
          💬 {{ humanPlayer.bubbleQuote }}
        </div>

        <!-- 玩家头像 (摸鱼模式下隐藏头像) -->
        <div v-if="!userStore.moyuMode" class="relative">
          <img
            :src="humanPlayer.avatar"
            alt="达文西"
            class="rounded-xl object-cover border-2"
            :class="[
              isCompact ? 'w-10 h-10' : 'w-16 h-16 rounded-2xl border-2',
              gameStore.isHumanTurn
                ? 'border-yellow-300 ring-2 sm:ring-4 ring-yellow-400/60 shadow-[0_0_20px_rgba(251,191,36,0.9)]'
                : 'border-amber-400',
            ]"
          />
          <span
            v-if="humanPlayer.isDealer"
            class="absolute -top-1.5 -left-1.5 px-1.5 py-0.5 rounded-full bg-yellow-400 text-slate-950 font-black text-[9px] shadow"
          >
            庄
          </span>
        </div>

        <div>
          <div class="flex items-center gap-1.5">
            <span
              class="font-black text-white"
              :class="isCompact ? 'text-sm' : 'text-lg'"
            >
              {{ humanPlayer.name }}
            </span>
            <span
              v-if="humanPlayer.isSmallBlind"
              class="px-1.5 py-0.5 rounded-full bg-sky-500 text-white font-black text-[9px]"
            >
              小盲
            </span>
            <span
              v-if="humanPlayer.isBigBlind"
              class="px-1.5 py-0.5 rounded-full bg-orange-500 text-white font-black text-[9px]"
            >
              大盲
            </span>
          </div>

          <div
            class="flex items-center gap-1 text-yellow-300 font-black"
            :class="isCompact ? 'text-xs' : 'text-base'"
          >
            <Icon icon="mdi:peanut" />
            <span :title="humanPlayer.chips.toLocaleString()">{{ formatChips(humanPlayer.chips) }}</span>
          </div>
        </div>

        <!-- 快捷搞怪台词按钮 -->
        <div class="relative">
          <button
            class="rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-amber-300"
            :class="isCompact ? 'w-8 h-8 text-base' : 'w-10 h-10 text-xl rounded-2xl'"
            title="发送欢乐斗地主风快捷台词"
            @click="showQuickChat = !showQuickChat"
          >
            <Icon icon="mdi:chat-processing" />
          </button>

          <div
            v-if="showQuickChat"
            class="absolute bottom-11 left-0 z-40 w-60 p-2 rounded-2xl bg-slate-900 border-2 border-amber-400 shadow-2xl space-y-1"
          >
            <button
              v-for="(msg, idx) in QUICK_CHATS"
              :key="idx"
              class="w-full text-left px-2.5 py-1 rounded-xl hover:bg-amber-500/20 text-xs font-bold text-slate-200 transition truncate"
              @click="sendQuickChat(msg)"
            >
              {{ msg }}
            </button>
          </div>
        </div>
      </div>

      <!-- 中央：玩家底牌 + 桌前已下筹码摞 + 实时牌力提示器 (优化间距，防止上浮手牌遮挡桌面或提示框) -->
      <div class="relative flex items-center" :class="isCompact ? 'gap-2.5' : 'gap-4'">
        <!-- 玩家本人面前桌面上的“当前街已下真实 3D 筹码堆” -->
        <div
          v-if="humanPlayer.currentBet > 0 && !isShowdownOrSettlement"
          :key="`human_front_bet_${humanPlayer.currentBet}`"
          class="chip-slam-drop pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-0.5 rounded-full shadow-2xl border whitespace-nowrap"
          :class="
            humanPlayer.lastActionType === 'allin'
              ? 'bg-red-950/95 border-yellow-300 text-yellow-200 shadow-[0_0_18px_rgba(239,68,68,0.9)]'
              : 'bg-black/90 border-amber-400 text-yellow-300 shadow-[0_0_15px_rgba(245,158,11,0.75)]'
          "
        >
          <div class="flex items-center -space-x-2 shrink-0">
            <div
              v-for="(cItem, cIdx) in getDisplayChipList(humanPlayer.currentBet, 4)"
              :key="cIdx"
              class="w-5 h-5 rounded-full overflow-hidden border border-yellow-200/80 shadow bg-black shrink-0"
            >
              <img
                :src="cItem.src"
                :alt="`${cItem.denom}`"
                class="w-full h-full object-cover scale-[1.09] rounded-full"
              />
            </div>
          </div>
          <span class="text-xs font-mono font-black">
            本轮已下: {{ formatChips(humanPlayer.currentBet) }}
          </span>
        </div>
        <div
          class="flex items-center"
          :class="isCompact ? 'gap-1.5' : 'gap-2.5 -mt-2'"
        >
          <PlayingCard
            v-for="card in humanPlayer.holeCards"
            :key="card.id"
            :card="card"
            :size="isCompact ? 'md' : 'xl'"
            :highlighted="isCardHighlighted(card.id)"
            :core-matched="isCardInBestFive(card.id)"
            :dimmed="humanPlayer.folded"
          />
        </div>

        <!-- 实时牌力与胜率/听牌提示器 -->
        <div
          v-if="userStore.showHandHelper && gameStore.humanEvaluation"
          class="rounded-2xl bg-[#121630]/90 backdrop-blur-md border border-rose-300/35 shadow-xl"
          :class="isCompact ? 'px-2.5 py-1.5 min-w-[140px]' : 'px-4 py-2.5 min-w-[210px]'"
        >
          <div class="flex items-center justify-between gap-1.5">
            <span class="text-[10px] text-slate-400 font-bold">牌力提示</span>
            <span
              v-if="!humanPlayer.folded && !isShowdownOrSettlement"
              class="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-black text-[10px]"
            >
              胜率~{{ humanPlayer.winProbability }}%
            </span>
          </div>
          <div
            class="font-black"
            :class="[
              isCompact ? 'text-xs mt-0.5' : 'text-lg mt-0.5',
              gameStore.humanEvaluation.usesHoleInCore
                ? 'text-emerald-300'
                : 'text-slate-400',
            ]"
          >
            {{ gameStore.humanEvaluation.helperDescription }}
          </div>
          <div
            v-if="gameStore.humanEvaluation.draws.length > 0"
            class="mt-0.5 space-y-0.5"
          >
            <div
              v-for="(d, idx) in gameStore.humanEvaluation.draws"
              :key="idx"
              class="text-[10px] font-bold text-yellow-200 truncate max-w-[180px]"
            >
              {{ d }}
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：快捷加注与行动控制台 -->
      <div
        class="flex flex-col items-end gap-1.5 shrink-0"
        :class="isCompact ? '' : 'min-w-[430px]'"
        @wheel.prevent="handleRaiseWheel"
      >
        <!-- 当玩家本局已弃牌、剩余 AI 正在对局时：自动启动 8x 加速，并展示快进状态栏与「直接跳到结算 / 直接下一局」按钮 -->
        <div
          v-if="gameStore.isFastForwarding"
          class="flex items-center flex-wrap justify-end gap-2 rounded-2xl border shadow-xl"
          :class="[
            isCompact ? 'px-2.5 py-1.5' : 'px-4 py-2.5',
            userStore.moyuMode
              ? 'bg-slate-900 border-cyan-500/50 text-slate-200 font-mono'
              : 'bg-black/80 border-amber-400/80 text-white',
          ]"
        >
          <div class="flex items-center gap-1.5 text-xs sm:text-sm font-black">
            <Icon
              icon="mdi:fast-forward"
              class="text-lg animate-pulse"
              :class="userStore.moyuMode ? 'text-cyan-400' : 'text-yellow-300'"
            />
            <span :class="userStore.moyuMode ? 'text-cyan-300' : 'text-yellow-300'">
              已弃牌 · 8x 加速结算中...
            </span>
          </div>

          <button
            class="px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1 transition active:scale-95"
            :class="
              userStore.moyuMode
                ? 'bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-slate-600'
                : 'bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-500 text-red-950 shadow'
            "
            title="立即跳过剩余 AI 过程，直接弹出本局结算 (快捷键: 空格)"
            @click="gameStore.skipToSettlementNow()"
          >
            <Icon icon="mdi:skip-next" class="text-base" />
            <span>直接跳到结算 [空格]</span>
          </button>

          <button
            class="px-2.5 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1 transition"
            :class="
              userStore.autoNextHandAfterFold
                ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                : 'bg-white/10 hover:bg-white/20 border-white/20 text-slate-300'
            "
            title="开启后：只要你弃牌，加速结算展示 1.2 秒后将自动开启下一局"
            @click="toggleAutoNextAfterFold"
          >
            <Icon icon="mdi:autorenew" class="text-sm" />
            <span>弃牌自动下一局:{{ userStore.autoNextHandAfterFold ? '开' : '关' }}</span>
          </button>
        </div>

        <!-- 轮到玩家行动时直接展开：5档快捷加注 + 滑杆微调 -->
        <div
          v-if="gameStore.isHumanTurn && humanPlayer.chips > gameStore.humanToCall"
          class="flex flex-col gap-1.5 bg-black/70 rounded-2xl border border-white/15 w-full"
          :class="isCompact ? 'p-1.5' : 'p-2.5'"
        >
          <div class="grid grid-cols-5 gap-1.5 w-full">
            <button
              v-for="preset in quickRaisePresets"
              :key="preset.key"
              class="group relative rounded-xl border px-1.5 py-1 flex flex-col items-center justify-center transition active:scale-95"
              :class="
                userStore.moyuMode
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200 font-mono'
                  : 'bg-gradient-to-b from-amber-500/25 to-orange-600/20 hover:from-amber-400 hover:to-orange-500 border-amber-400/60 text-amber-100 hover:text-red-950 shadow'
              "
              :title="`点击或按键盘 [${preset.key}] 直接加注 ${preset.amount.toLocaleString()}`"
              @click="handleQuickRaiseAmount(preset.amount)"
            >
              <div class="flex items-center gap-0.5 text-[10px] opacity-80 font-bold leading-tight">
                <span class="px-1 rounded bg-black/30 text-[9px] font-mono">{{ preset.key }}</span>
                <span>{{ preset.label }}</span>
              </div>
              <div
                class="font-black font-mono leading-tight mt-0.5"
                :class="isCompact ? 'text-[11px]' : 'text-xs sm:text-sm'"
              >
                {{ formatChips(preset.amount) }}
              </div>
            </button>
          </div>

          <!-- 滑块 + 长按 [-]/[+]/[+5盲] 微调 + 手动输入下注额 -->
          <div class="flex items-center gap-1.5 w-full pt-0.5">
            <button
              class="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white font-black transition active:scale-90 shrink-0 select-none"
              title="点击或长按连续减少（向下滚动滚轮 / 按 ↓ 键）"
              @pointerdown.prevent="startHoldStep(-1)"
              @pointerup="stopHoldStep"
              @pointerleave="stopHoldStep"
              @pointercancel="stopHoldStep"
            >
              <Icon icon="mdi:minus" class="text-sm" />
            </button>

            <input
              v-model.number="customRaiseExtra"
              type="range"
              :min="minRaiseAdd"
              :max="maxRaiseAdd"
              :step="gameStore.currentRoom.smallBlind"
              class="flex-1 accent-amber-400 cursor-pointer h-2"
            />

            <button
              class="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white font-black transition active:scale-90 shrink-0 select-none"
              title="点击或长按连续增加（向上滚动滚轮 / 按 ↑ 键）"
              @pointerdown.prevent="startHoldStep(1)"
              @pointerup="stopHoldStep"
              @pointerleave="stopHoldStep"
              @pointercancel="stopHoldStep"
            >
              <Icon icon="mdi:plus" class="text-sm" />
            </button>

            <button
              class="px-2 h-7 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 font-black text-[11px] font-mono transition active:scale-95 shrink-0 select-none"
              :title="`当前每次加减步进：${currentRaiseStep.toLocaleString()}，点击切换步进档位（1倍/5倍/10倍/50倍大盲）`"
              @click="cycleRaiseStep"
            >
              步进:{{ formatChipStep(currentRaiseStep) }}
            </button>

            <input
              type="text"
              inputmode="numeric"
              :value="isEditingRaiseInput ? raiseInputText : formatChips(customRaiseExtra)"
              class="w-[74px] h-7 px-2 rounded-lg bg-black/60 border border-amber-400/50 focus:border-rose-300 focus:outline-none text-xs font-black text-yellow-300 text-center font-mono shrink-0"
              :title="`当前自定义加注额：${customRaiseExtra.toLocaleString()}（点击直接输入数字，回车立即加注）`"
              @focus="handleRaiseInputFocus"
              @input="handleRaiseInput"
              @blur="commitRaiseInput"
              @keydown.enter.prevent="submitRaiseFromInput"
            />
          </div>
        </div>

        <!-- 四大主行动按钮：弃牌[F] / 过牌或跟注[空格] / 加注具体金额[R] / 超级全下[A] -->
        <div
          v-if="!gameStore.isFastForwarding"
          class="flex items-center"
          :class="isCompact ? 'gap-1.5' : 'gap-2'"
        >
          <!-- 弃牌 -->
          <button
            :disabled="!gameStore.isHumanTurn"
            class="font-black transition disabled:opacity-40 flex items-center gap-1"
            :class="[
              isCompact ? 'px-3 py-2 text-xs rounded-xl' : 'px-4 py-2.5 rounded-2xl text-sm sm:text-base',
              userStore.moyuMode
                ? 'bg-[#161b36] hover:bg-[#1e2447] text-slate-300 border border-indigo-400/25 font-mono'
                : 'bg-[#181c3a]/90 hover:bg-[#232852] text-slate-200 border border-indigo-300/35 shadow-lg active:scale-95',
            ]"
            title="快捷键: F"
            @click="gameStore.humanAction('fold')"
          >
            <Icon v-if="!userStore.moyuMode" icon="mdi:close-octagon" />
            <span>弃牌</span>
          </button>

          <!-- 过牌 或 跟注 -->
          <button
            v-if="gameStore.humanToCall === 0"
            :disabled="!gameStore.isHumanTurn"
            class="font-black transition disabled:opacity-40 flex items-center gap-1"
            :class="[
              isCompact ? 'px-3.5 py-2 text-xs rounded-xl' : 'px-5 py-2.5 rounded-2xl text-sm sm:text-base',
              userStore.moyuMode
                ? 'bg-[#1a2245] hover:bg-[#232e59] text-rose-100 border border-indigo-300/35 font-mono'
                : 'bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 text-[#0a1d1f] border border-emerald-200/80 shadow-[0_0_18px_rgba(52,211,153,0.4)] hover:brightness-105 active:scale-95',
            ]"
            title="快捷键: 空格键 或 C"
            @click="gameStore.humanAction('check')"
          >
            <Icon v-if="!userStore.moyuMode" icon="mdi:check-bold" />
            <span>过牌</span>
            <span class="text-[10px] opacity-70 font-mono">[空]</span>
          </button>
          <button
            v-else
            :disabled="!gameStore.isHumanTurn"
            class="relative font-black transition disabled:opacity-40 flex items-center gap-1"
            :class="[
              isCompact ? 'px-3.5 py-2 text-xs rounded-xl' : 'px-5 py-2.5 rounded-2xl text-sm sm:text-base',
              gameStore.isHumanTurn
                ? 'call-btn-alert ring-2 ring-yellow-300 shadow-[0_0_22px_rgba(56,189,248,0.9)]'
                : '',
              userStore.moyuMode
                ? 'bg-[#1f2957] hover:bg-[#2a3770] text-indigo-100 border border-indigo-300/50 font-mono'
                : 'bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600 text-white border border-indigo-200/80 shadow-[0_0_20px_rgba(129,140,248,0.55)] hover:brightness-110 active:scale-95',
            ]"
            title="快捷键: 空格键 或 C"
            @click="gameStore.humanAction('call')"
          >
            <Icon icon="mdi:arrow-up-bold-circle" />
            <span>
              跟注 {{ formatChips(Math.min(humanPlayer.chips, gameStore.humanToCall)) }}
            </span>
            <span class="text-[10px] opacity-75 font-mono">[空]</span>
          </button>

          <!-- 加注（实时显示当前自定义加注的具体金额） -->
          <button
            v-if="humanPlayer.chips > gameStore.humanToCall"
            :disabled="!gameStore.isHumanTurn"
            class="font-black transition disabled:opacity-40 flex items-center gap-1"
            :class="[
              isCompact ? 'px-3.5 py-2 text-xs rounded-xl' : 'px-5 py-2.5 rounded-2xl text-sm sm:text-base',
              userStore.moyuMode
                ? 'bg-[#261b38] hover:bg-[#33234a] text-amber-200 border border-amber-300/40 font-mono'
                : 'bg-gradient-to-r from-rose-300 via-amber-200 to-rose-300 text-[#23102b] border border-white/70 shadow-[0_0_20px_rgba(253,164,175,0.45)] hover:brightness-105 active:scale-95',
            ]"
            title="按当前滑块金额加注 (快捷键: R 或 Enter)"
            @click="gameStore.humanAction('raise', customRaiseExtra)"
          >
            <Icon v-if="!userStore.moyuMode" icon="mdi:trending-up" />
            <span>加注 {{ formatChips(customRaiseExtra) }}</span>
          </button>

          <!-- 超级全下 All-in -->
          <button
            :disabled="!gameStore.isHumanTurn"
            class="font-black transition disabled:opacity-40 flex items-center gap-1"
            :class="[
              isCompact ? 'px-3.5 py-2 text-xs rounded-xl' : 'px-5 py-2.5 rounded-2xl text-sm sm:text-base',
              userStore.moyuMode
                ? 'bg-[#2e152c] hover:bg-[#3d1c3a] text-rose-200 border border-rose-300/45 font-mono'
                : 'bg-gradient-to-r from-rose-500 via-pink-600 to-fuchsia-600 text-white border border-rose-200/80 shadow-[0_0_22px_rgba(244,114,182,0.55)] hover:brightness-110 active:scale-95',
            ]"
            title="快捷键: A"
            @click="gameStore.humanAction('allin')"
          >
            <Icon v-if="!userStore.moyuMode" icon="mdi:fire" class="text-yellow-300" />
            <span>全下!</span>
          </button>
        </div>
      </div>
    </footer>

    <!-- 极简三要素结算大牌弹窗 (1.赢家+牌型大字+盈亏 -> 2.干净排开5张赢牌(主成牌放大发光/踢脚牌缩小半透明，无任何繁杂文字标签) -> 3.下一局按钮) -->
    <Transition
      enter-active-class="transition duration-250 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="
          gameStore.stage === 'SETTLEMENT' &&
          gameStore.mainWinnerResult &&
          showGiantStage
        "
        class="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
        @click.self="showGiantStage = false"
      >
        <div
          class="relative w-full max-w-2xl px-5 py-5 sm:px-8 sm:py-6 flex flex-col items-center text-center overflow-hidden"
          :class="
            userStore.moyuMode
              ? 'rounded-2xl bg-slate-900/98 border border-slate-700 shadow-2xl font-mono'
              : 'rounded-3xl bg-gradient-to-b from-slate-900/98 via-stone-950/98 to-black border-2 border-yellow-400/80 shadow-[0_0_70px_rgba(0,0,0,0.9)]'
          "
        >
          <!-- 要素 1：顶部一行「赢家 + 收池 + 你的净盈亏」 & 超大牌型标题 -->
          <div class="w-full flex flex-col items-center">
            <div class="flex items-center justify-center gap-2.5 flex-wrap text-xs sm:text-sm">
              <span
                class="px-3 py-0.5 rounded-full font-black"
                :class="
                  userStore.moyuMode
                    ? 'bg-slate-800 text-cyan-300 border border-slate-600'
                    : gameStore.mainWinnerResult.isHuman
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-yellow-400 text-red-950'
                "
              >
                👑 赢家: {{ gameStore.mainWinnerResult.name }}
              </span>

              <span class="font-mono font-black text-yellow-300">
                +{{ formatChips(gameStore.mainWinnerResult.winnings) }}
              </span>

              <span class="opacity-30">|</span>

              <span
                class="font-mono font-bold"
                :class="
                  humanNetProfit > 0
                    ? 'text-emerald-400'
                    : humanNetProfit < 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                "
              >
                你的盈亏: {{ humanNetProfit > 0 ? '+' : '' }}{{ formatChips(humanNetProfit) }}
              </span>
            </div>

            <!-- 超大醒目赢牌牌型名称 -->
            <h2
              class="mt-2 text-3xl sm:text-5xl font-black tracking-wide"
              :class="
                userStore.moyuMode
                  ? 'text-slate-100'
                  : 'text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-300 to-amber-500 drop-shadow-[0_4px_12px_rgba(251,191,36,0.6)]'
              "
            >
              {{ gameStore.mainWinnerResult.handDescription }}
            </h2>
          </div>

          <!-- 要素 2：正中央干净排开 5 张赢牌卡片（增加顶部内边距，防止主成牌上浮时遮挡上方牌型标题） -->
          <div
            v-if="gameStore.mainWinnerResult.bestFiveCards.length > 0"
            class="mt-6 mb-5 pt-3 pb-1 flex items-center justify-center gap-2.5 sm:gap-4 flex-wrap"
          >
            <PlayingCard
              v-for="(wCard, wIdx) in gameStore.mainWinnerResult.bestFiveCards"
              :key="wCard.id || wIdx"
              :card="wCard"
              :size="
                gameStore.mainWinnerResult.coreCardIds.includes(wCard.id)
                  ? isCompact
                    ? 'xl'
                    : '2xl'
                  : isCompact
                    ? 'md'
                    : 'lg'
              "
              :highlighted="gameStore.mainWinnerResult.coreCardIds.includes(wCard.id)"
              :dimmed="!gameStore.mainWinnerResult.coreCardIds.includes(wCard.id)"
            />
          </div>

          <!-- 若是对手全弃牌未亮牌的情况 -->
          <div
            v-else
            class="my-6 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm text-slate-300 font-bold"
          >
            全场其余玩家均已弃牌，【{{ gameStore.mainWinnerResult.name }}】直接收池
          </div>

          <!-- 要素 3：底部清爽操作按钮 + 弃牌后自动下一局开关 -->
          <div class="flex items-center justify-center gap-2.5 flex-wrap">
            <button
              class="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-slate-300 font-bold text-xs sm:text-sm transition"
              @click="showGiantStage = false"
            >
              看桌面
            </button>

            <button
              class="px-3.5 py-2.5 rounded-xl border font-bold text-xs sm:text-sm flex items-center gap-1 transition"
              :class="
                userStore.autoNextHandAfterFold
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                  : 'bg-white/10 hover:bg-white/20 border-white/20 text-slate-300'
              "
              title="开启后：当你弃牌时，加速结算后将自动开启下一局"
              @click="toggleAutoNextAfterFold"
            >
              <Icon icon="mdi:autorenew" class="text-base" />
              <span>弃牌自动下一局:{{ userStore.autoNextHandAfterFold ? '开' : '关' }}</span>
            </button>

            <button
              v-if="gameStore.canBluffShow && !gameStore.humanShowedBluff"
              class="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs sm:text-sm shadow transition"
              @click="gameStore.triggerHumanBluffShow()"
            >
              亮牌炫耀偷鸡
            </button>

            <button
              class="px-7 py-2.5 rounded-xl font-black text-base sm:text-lg transition flex items-center gap-1.5"
              :class="
                userStore.moyuMode
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-500'
                  : 'bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-500 text-red-950 border border-yellow-100 shadow-[0_4px_0_#b45309] hover:brightness-110 active:translate-y-0.5'
              "
              @click="handleNextHand"
            >
              <span>继续下一局 (空格)</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 弹窗组件 (支持在牌桌内直接打开账单流水、转盘、破产救济与规则) -->
    <LobbyModals :active-modal="activeModal" @close="activeModal = 'none'" />
  </div>
</template>

<style scoped>
/* 座位加注/全下/跟注弹跳与震动反馈 */
@keyframes seatRaiseBump {
  0% {
    transform: scale(1);
  }
  25% {
    transform: scale(1.1) translateY(-4px);
  }
  55% {
    transform: scale(0.97) translateY(1px);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes seatAllinShake {
  0% {
    transform: scale(1);
  }
  15% {
    transform: scale(1.13) rotate(-2deg) translateY(-5px);
  }
  30% {
    transform: scale(1.13) rotate(2deg) translateY(-5px);
  }
  45% {
    transform: scale(1.08) rotate(-1.5deg);
  }
  65% {
    transform: scale(1.04) rotate(1deg);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes seatCallPulse {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.06) translateY(-2px);
  }
  100% {
    transform: scale(1);
  }
}

/* 扩散光波冲击环 */
@keyframes ringBurst {
  0% {
    transform: scale(0.95);
    opacity: 1;
  }
  100% {
    transform: scale(1.32);
    opacity: 0;
  }
}

/* 动作大字徽章弹射 */
@keyframes badgePop {
  0% {
    transform: scale(0.4) translateY(12px);
    opacity: 0;
  }
  45% {
    transform: scale(1.18) translateY(-3px);
    opacity: 1;
  }
  75% {
    transform: scale(0.96) translateY(0);
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

/* 跟注按钮呼吸高光 */
@keyframes callBtnBreath {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.75);
  }
  50% {
    transform: scale(1.04);
    box-shadow: 0 0 26px rgba(250, 204, 21, 0.95);
  }
}

.seat-action-raise {
  animation: seatRaiseBump 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}

.seat-action-allin {
  animation: seatAllinShake 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

.seat-action-call {
  animation: seatCallPulse 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

.action-ring-burst {
  animation: ringBurst 0.85s ease-out forwards;
}

.action-badge-pop {
  animation: badgePop 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.action-alert-pop {
  animation: badgePop 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.call-btn-alert {
  animation: callBtnBreath 1.3s ease-in-out infinite;
}

/* 筹码重砸上桌弹跳动效 */
@keyframes chipSlamDrop {
  0% {
    transform: translateY(-18px) scale(1.35);
    opacity: 0;
  }
  45% {
    transform: translateY(2px) scale(0.92);
    opacity: 1;
  }
  75% {
    transform: translateY(-2px) scale(1.06);
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

/* 底池入池 +金额 跳字动效 */
@keyframes potChipDropPop {
  0% {
    transform: scale(0.3) translateY(-10px);
    opacity: 0;
  }
  50% {
    transform: scale(1.22) translateY(2px);
    opacity: 1;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

.chip-slam-drop {
  animation: chipSlamDrop 0.42s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.pot-chip-drop-pop {
  animation: potChipDropPop 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
</style>
