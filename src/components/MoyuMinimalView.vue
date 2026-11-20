<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useGameStore, TablePlayer } from '@/store/game'
import { ROOM_CONFIGS, RoomConfig, useUserStore } from '@/store/user'
import { sound } from '@/core/sound'

const emit = defineEmits<{
  (e: 'toggle-boss'): void
  (e: 'exit-moyu'): void
}>()

const gameStore = useGameStore()
const userStore = useUserStore()

// 极简后台主题：'light' (默认办公白灰，最像后台管理系统/表格) | 'dark' (深色终端日志风)
const theme = ref<'light' | 'dark'>('light')
const activeTab = ref<'table' | 'ledger' | 'supply'>('table')
const ledgerFilter = ref<'all' | 'game' | 'reward' | 'spend'>('all')
const customRaiseExtra = ref<number>(200)
const supplyMsg = ref('')

// 进入摸鱼模式时自动静音，防止办公室外放社死
let savedSoundState = sound.enabled
let savedBgmState = sound.bgmEnabled

onMounted(() => {
  savedSoundState = sound.enabled
  savedBgmState = sound.bgmEnabled
  sound.enabled = false
  if (sound.bgmEnabled) {
    sound.toggleBgm()
  }

  // 如果还没进房间或处于 IDLE，自动初始化当前场次并开局
  if (gameStore.players.length === 0) {
    gameStore.enterRoom(gameStore.currentRoom || ROOM_CONFIGS[0])
  }
  if (gameStore.stage === 'IDLE') {
    gameStore.startNewHand()
  }

  window.addEventListener('keydown', handleShortcut)
})

onUnmounted(() => {
  sound.enabled = savedSoundState
  if (savedBgmState && !sound.bgmEnabled) {
    sound.toggleBgm()
  }
  window.removeEventListener('keydown', handleShortcut)
})

const humanPlayer = computed(() => gameStore.humanPlayer)

const minRaiseAdd = computed(() => {
  if (!humanPlayer.value) return gameStore.currentRoom.bigBlind
  return Math.min(
    humanPlayer.value.chips,
    gameStore.humanToCall + gameStore.minRaiseDelta
  )
})

const maxRaiseAdd = computed(() => humanPlayer.value?.chips || 0)

watch(
  () => gameStore.isHumanTurn,
  (isTurn) => {
    if (isTurn) {
      customRaiseExtra.value = minRaiseAdd.value
    }
  }
)

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

function handlePresetRaise(ratio: number) {
  const amt = getPotRatioRaise(ratio)
  gameStore.humanAction('raise', amt)
}

function switchRoom(room: RoomConfig) {
  if (userStore.beans < room.minBeans) {
    supplyMsg.value = `配额不足 ${room.minBeans.toLocaleString()}，请先在[配额补给]领取`
    activeTab.value = 'supply'
    return
  }
  gameStore.leaveTable()
  gameStore.enterRoom(room)
  gameStore.startNewHand()
  activeTab.value = 'table'
}

function handleNextHand() {
  if ((humanPlayer.value?.chips || 0) < gameStore.currentRoom.bigBlind * 2) {
    activeTab.value = 'supply'
    supplyMsg.value = '当前配额不足盲注，请点击下方[申请救济补贴]或[随机抽取配额]'
    return
  }
  gameStore.startNewHand()
}

// 键盘快捷键支持：空格键继续下一局
function handleShortcut(e: KeyboardEvent) {
  if (e.code === 'Space' && activeTab.value === 'table') {
    if (gameStore.stage === 'SETTLEMENT') {
      e.preventDefault()
      handleNextHand()
    }
  }
}

// 是否揭示某位 AI 的手牌
function shouldRevealAICards(p: TablePlayer): boolean {
  if (p.isHuman) return true
  if (p.folded) return false
  if (gameStore.isAllInRunout) return true
  return gameStore.stage === 'SHOWDOWN' || gameStore.stage === 'SETTLEMENT'
}

// 检查某张公牌是否属于当前高亮组合（下注时看玩家，结算时看赢家）
function isCommunityCardMatched(cardId: string): boolean {
  if (
    (gameStore.stage === 'SHOWDOWN' || gameStore.stage === 'SETTLEMENT') &&
    gameStore.mainWinnerResult &&
    !gameStore.mainWinnerResult.winByFold
  ) {
    return gameStore.mainWinnerResult.bestFiveIds.includes(cardId)
  }
  return !!gameStore.humanEvaluation?.bestFiveIds.includes(cardId)
}

function isCommunityCardCore(cardId: string): boolean {
  if (
    (gameStore.stage === 'SHOWDOWN' || gameStore.stage === 'SETTLEMENT') &&
    gameStore.mainWinnerResult &&
    !gameStore.mainWinnerResult.winByFold
  ) {
    return gameStore.mainWinnerResult.coreCardIds.includes(cardId)
  }
  return !!gameStore.humanEvaluation?.coreCardIds.includes(cardId)
}

// 获取某个座位在结算时的详细条目
function getPlayerSettlement(playerId: string) {
  return gameStore.settlementResults.find((r) => r.id === playerId)
}

// 极简无动画配额补给（替代大转盘与救济弹窗）
const WHEEL_PRIZES = [
  { label: '5,000 配额', amount: 5000 },
  { label: '15,000 配额', amount: 15000 },
  { label: '8,888 配额', amount: 8888 },
  { label: '30,000 配额', amount: 30000 },
  { label: '12,000 配额', amount: 12000 },
  { label: '88,888 峰值配额', amount: 88888 },
]

function silentSpinSupply() {
  const idx = Math.floor(Math.random() * WHEEL_PRIZES.length)
  const prize = WHEEL_PRIZES[idx]
  userStore.recordWheelPrize(prize.label, prize.amount)
  if (humanPlayer.value && gameStore.stage === 'SETTLEMENT') {
    humanPlayer.value.chips = userStore.beans
  }
  supplyMsg.value = `[系统日志] 随机配额同步完成：+${prize.amount.toLocaleString()} (当前余额: ${userStore.beans.toLocaleString()})`
}

function silentClaimRelief() {
  const gift = userStore.claimBankruptcyRelief()
  if (humanPlayer.value && gameStore.stage === 'SETTLEMENT') {
    humanPlayer.value.chips = userStore.beans
  }
  supplyMsg.value = `[系统日志] 救济补贴下发完成：+${gift.toLocaleString()} (当前余额: ${userStore.beans.toLocaleString()})`
}

// 账单流水过滤
const filteredLedger = computed(() => {
  const list = userStore.ledger || []
  if (ledgerFilter.value === 'game') {
    return list.filter((b) =>
      ['game_win', 'game_loss', 'game_even'].includes(b.type)
    )
  }
  if (ledgerFilter.value === 'reward') {
    return list.filter((b) =>
      ['wheel', 'relief', 'achievement', 'initial'].includes(b.type)
    )
  }
  if (ledgerFilter.value === 'spend') {
    return list.filter((b) => ['shop', 'dealer_tip'].includes(b.type))
  }
  return list
})

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const humanNetProfit = computed(() => {
  if (!humanPlayer.value) return 0
  return humanPlayer.value.roundWinnings - humanPlayer.value.totalHandBet
})
</script>

<template>
  <div
    class="w-screen h-screen overflow-hidden flex flex-col font-mono text-xs select-none"
    :class="
      theme === 'light'
        ? 'bg-[#f8fafc] text-slate-800'
        : 'bg-[#121316] text-zinc-300'
    "
  >
    <!-- 1. 顶部 B 端系统导航栏 (极简灰白线条，无任何游戏图标与色彩) -->
    <header
      class="px-3 py-1.5 border-b flex items-center justify-between gap-2 flex-wrap shrink-0"
      :class="
        theme === 'light'
          ? 'bg-white border-slate-200 text-slate-700'
          : 'bg-[#18191d] border-zinc-800 text-zinc-300'
      "
    >
      <!-- 左侧：伪装系统名称 + 节点(场次)切换 + 主视图 Tab -->
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-bold tracking-tight">SysMonitor v2.4</span>
        <span class="opacity-30">|</span>

        <!-- 场次节点快速切换 -->
        <div class="flex items-center gap-1">
          <button
            v-for="(room, idx) in ROOM_CONFIGS"
            :key="room.id"
            class="px-1.5 py-0.5 rounded border text-[11px] transition"
            :class="
              gameStore.currentRoom.id === room.id
                ? theme === 'light'
                  ? 'bg-slate-800 text-white border-slate-800 font-bold'
                  : 'bg-zinc-200 text-zinc-900 border-zinc-200 font-bold'
                : theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                  : 'bg-zinc-800/70 hover:bg-zinc-700 text-zinc-400 border-zinc-700'
            "
            :title="`${room.name} (盲注 ${room.smallBlind}/${room.bigBlind}, 准入 ${room.minBeans})`"
            @click="switchRoom(room)"
          >
            N{{ idx + 1 }}({{ room.smallBlind }}/{{ room.bigBlind }})
          </button>
        </div>

        <span class="opacity-30">|</span>

        <!-- 功能 Tab：牌桌监控 / 账单流水 / 配额补给 -->
        <div class="flex items-center gap-1">
          <button
            v-for="t in [
              { id: 'table', label: '实时监控' },
              { id: 'ledger', label: `流水日志(${userStore.ledger.length})` },
              { id: 'supply', label: '配额补给' },
            ]"
            :key="t.id"
            class="px-2 py-0.5 rounded border text-[11px] transition"
            :class="
              activeTab === t.id
                ? theme === 'light'
                  ? 'bg-slate-200 text-slate-900 border-slate-400 font-bold'
                  : 'bg-zinc-700 text-white border-zinc-500 font-bold'
                : theme === 'light'
                  ? 'bg-transparent hover:bg-slate-100 text-slate-500 border-transparent'
                  : 'bg-transparent hover:bg-zinc-800 text-zinc-400 border-transparent'
            "
            @click="activeTab = t.id as any"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <!-- 右侧：当前配额(欢乐豆)、净盈亏、明暗主题、老板键、退出摸鱼 -->
      <div class="flex items-center gap-2 text-[11px] shrink-0">
        <span>
          配额:<strong class="ml-0.5">{{ userStore.beans.toLocaleString() }}</strong>
        </span>
        <span>
          净值:<strong
            class="ml-0.5"
            :class="
              userStore.netGameProfit > 0
                ? theme === 'light'
                  ? 'text-emerald-700'
                  : 'text-emerald-400'
                : userStore.netGameProfit < 0
                  ? theme === 'light'
                    ? 'text-rose-700'
                    : 'text-rose-400'
                  : ''
            "
          >
            {{ userStore.netGameProfit >= 0 ? '+' : '' }}{{ userStore.netGameProfit.toLocaleString() }}
          </strong>
        </span>

        <button
          class="px-1.5 py-0.5 rounded border"
          :class="
            theme === 'light'
              ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
              : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
          "
          @click="theme = theme === 'light' ? 'dark' : 'light'"
        >
          {{ theme === 'light' ? '深色' : '浅色' }}
        </button>

        <button
          class="px-1.5 py-0.5 rounded border"
          :class="
            theme === 'light'
              ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
              : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
          "
          title="切换 Excel 报表伪装 (快捷键 `)"
          @click="emit('toggle-boss')"
        >
          Excel(`)
        </button>

        <button
          class="px-1.5 py-0.5 rounded border"
          :class="
            theme === 'light'
              ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-600'
              : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-400'
          "
          title="退出超简约摸鱼模式，返回街机画面"
          @click="emit('exit-moyu')"
        >
          街机版
        </button>
      </div>
    </header>

    <!-- ==================== TAB 1: 实时监控主面板 (极简文字牌桌) ==================== -->
    <div v-if="activeTab === 'table'" class="flex-1 flex flex-col overflow-hidden p-2 gap-2">
      <!-- 顶部三栏核心指标条：我方底牌&牌力 | 公共牌序列&底池 | 操作按钮栏 -->
      <div
        class="grid grid-cols-1 md:grid-cols-12 gap-2 p-2 rounded border shrink-0"
        :class="
          theme === 'light'
            ? 'bg-white border-slate-200'
            : 'bg-[#18191d] border-zinc-800'
        "
      >
        <!-- 左栏 (4列)：我方手牌 + 实时牌力提示 + 胜率与听牌 -->
        <div
          class="md:col-span-4 flex flex-col justify-between border-b md:border-b-0 md:border-r pb-1.5 md:pb-0 md:pr-2"
          :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'"
        >
          <div class="flex items-center justify-between">
            <span class="opacity-60 text-[11px]">
              本地节点 (我方手牌) · {{ humanPlayer?.isDealer ? '[D]' : '' }}{{ humanPlayer?.isSmallBlind ? '[SB]' : '' }}{{ humanPlayer?.isBigBlind ? '[BB]' : '' }}
            </span>
            <span
              v-if="humanPlayer && !humanPlayer.folded"
              class="text-[11px] font-bold"
            >
              胜率 ~{{ humanPlayer.winProbability }}%
            </span>
          </div>

          <div class="flex items-baseline gap-3 my-1">
            <!-- 我方 2 张底牌（纯字符大号高辨识度展示） -->
            <div
              v-if="humanPlayer && humanPlayer.holeCards.length > 0"
              class="flex items-center gap-2 text-base font-black tracking-tight"
            >
              <span
                v-for="(c, idx) in humanPlayer.holeCards"
                :key="c.id || idx"
                class="px-1.5 py-0.5 rounded border"
                :class="[
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-300'
                    : 'bg-zinc-900 border-zinc-700',
                  c.color === 'red'
                    ? theme === 'light'
                      ? 'text-rose-700'
                      : 'text-rose-400'
                    : theme === 'light'
                      ? 'text-slate-900'
                      : 'text-zinc-100',
                ]"
              >
                {{ c.suitSymbol }}{{ c.label }}
              </span>
            </div>
            <span v-else class="opacity-40">-- --</span>

            <!-- 当前最佳牌力与详细构成 -->
            <div v-if="gameStore.humanEvaluation" class="min-w-0 flex-1">
              <div class="font-bold truncate">
                {{ gameStore.humanEvaluation.description }}
              </div>
              <div class="text-[10px] opacity-70 truncate">
                {{ gameStore.humanEvaluation.detailText }}
              </div>
            </div>
          </div>

          <!-- 听牌提示 -->
          <div
            v-if="gameStore.humanEvaluation && gameStore.humanEvaluation.draws.length > 0"
            class="text-[10px] opacity-80 truncate"
          >
            {{ gameStore.humanEvaluation.draws.join(' | ') }}
          </div>
        </div>

        <!-- 中栏 (4列)：公共牌 5 张序列 + 底池汇总 + 阶段 -->
        <div
          class="md:col-span-4 flex flex-col justify-between border-b md:border-b-0 md:border-r pb-1.5 md:pb-0 md:px-2"
          :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'"
        >
          <div class="flex items-center justify-between text-[11px]">
            <span class="opacity-60">
              批次 #{{ gameStore.handNumber }} · 阶段: <strong>{{ gameStore.stage }}</strong>
            </span>
            <span>
              底池: <strong class="text-sm">{{ gameStore.potTotal.toLocaleString() }}</strong>
            </span>
          </div>

          <!-- 5张公共牌纯文字卡槽 (命中最佳5张或赢家成牌时自动带 * 号与底线加粗) -->
          <div class="flex items-center gap-1.5 my-1">
            <div
              v-for="slotIdx in 5"
              :key="slotIdx"
              class="px-2 py-1 rounded border text-center min-w-[44px] font-bold"
              :class="[
                gameStore.communityCards[slotIdx - 1]
                  ? isCommunityCardCore(gameStore.communityCards[slotIdx - 1].id)
                    ? theme === 'light'
                      ? 'bg-amber-50 border-slate-800 ring-1 ring-slate-800'
                      : 'bg-zinc-800 border-zinc-300 ring-1 ring-zinc-300'
                    : isCommunityCardMatched(gameStore.communityCards[slotIdx - 1].id)
                      ? theme === 'light'
                        ? 'bg-slate-100 border-slate-400'
                        : 'bg-zinc-800/80 border-zinc-500'
                      : theme === 'light'
                        ? 'bg-white border-slate-200 opacity-65'
                        : 'bg-zinc-900 border-zinc-800 opacity-60'
                  : theme === 'light'
                    ? 'bg-slate-50 border-dashed border-slate-200 text-slate-300'
                    : 'bg-zinc-900/40 border-dashed border-zinc-800 text-zinc-600',
              ]"
            >
              <template v-if="gameStore.communityCards[slotIdx - 1]">
                <span
                  :class="
                    gameStore.communityCards[slotIdx - 1].color === 'red'
                      ? theme === 'light'
                        ? 'text-rose-700'
                        : 'text-rose-400'
                      : theme === 'light'
                        ? 'text-slate-900'
                        : 'text-zinc-100'
                  "
                >
                  {{ gameStore.communityCards[slotIdx - 1].suitSymbol }}{{ gameStore.communityCards[slotIdx - 1].label }}
                </span>
              </template>
              <template v-else>--</template>
            </div>
          </div>

          <div class="text-[10px] opacity-65 truncate">
            <template v-if="gameStore.sidePots.length > 1">
              分池: {{ gameStore.sidePots.map((p) => `${p.name}:${p.amount}`).join(' / ') }}
            </template>
            <template v-else>
              带框公牌表示构成当前最佳 5 张成牌组合
            </template>
          </div>
        </div>

        <!-- 右栏 (4列)：极简灰白小字操作按钮 (过 / 跟 / 加 / 弃 / 下一局) -->
        <div class="md:col-span-4 flex flex-col justify-between md:pl-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="opacity-60">指令操作台</span>
            <span
              class="font-bold"
              :class="
                gameStore.isHumanTurn
                  ? theme === 'light'
                    ? 'text-slate-900'
                    : 'text-white'
                  : 'opacity-50'
              "
            >
              {{
                gameStore.isHumanTurn
                  ? `● 待操作 (需跟:${gameStore.humanToCall})`
                  : gameStore.stage === 'SETTLEMENT'
                    ? '● 本局已结算'
                    : '○ 节点同步中...'
              }}
            </span>
          </div>

          <!-- 轮到玩家行动时：极简灰白小字按钮 (弃 / 过 / 跟 / 加 / 全下) -->
          <div v-if="gameStore.isHumanTurn && humanPlayer" class="space-y-1.5 my-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <button
                class="px-2.5 py-1 rounded border font-bold transition"
                :class="
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                "
                @click="gameStore.humanAction('fold')"
              >
                弃
              </button>

              <button
                v-if="gameStore.humanToCall === 0"
                class="px-3 py-1 rounded border font-bold transition"
                :class="
                  theme === 'light'
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-800 text-white'
                    : 'bg-zinc-200 hover:bg-white border-zinc-200 text-zinc-900'
                "
                @click="gameStore.humanAction('check')"
              >
                过
              </button>
              <button
                v-else
                class="px-3 py-1 rounded border font-bold transition"
                :class="
                  theme === 'light'
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-800 text-white'
                    : 'bg-zinc-200 hover:bg-white border-zinc-200 text-zinc-900'
                "
                @click="gameStore.humanAction('call')"
              >
                跟 {{ Math.min(humanPlayer.chips, gameStore.humanToCall).toLocaleString() }}
              </button>

              <template v-if="humanPlayer.chips > gameStore.humanToCall">
                <button
                  class="px-2 py-1 rounded border font-bold transition"
                  :class="
                    theme === 'light'
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                  "
                  @click="handlePresetRaise(0.5)"
                >
                  加1/2
                </button>
                <button
                  class="px-2 py-1 rounded border font-bold transition"
                  :class="
                    theme === 'light'
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                  "
                  @click="handlePresetRaise(1)"
                >
                  加满池
                </button>
                <button
                  class="px-2.5 py-1 rounded border font-bold transition"
                  :class="
                    theme === 'light'
                      ? 'bg-slate-200 hover:bg-slate-300 border-slate-400 text-slate-900'
                      : 'bg-zinc-700 hover:bg-zinc-600 border-zinc-500 text-white'
                  "
                  @click="gameStore.humanAction('raise', customRaiseExtra)"
                >
                  加 {{ customRaiseExtra.toLocaleString() }}
                </button>
              </template>

              <button
                class="px-2 py-1 rounded border font-bold transition"
                :class="
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                "
                @click="gameStore.humanAction('allin')"
              >
                全下
              </button>
            </div>

            <!-- 极简滑块调额 -->
            <div
              v-if="humanPlayer.chips > gameStore.humanToCall"
              class="flex items-center gap-2 text-[10px]"
            >
              <span class="opacity-60">调额:</span>
              <input
                v-model.number="customRaiseExtra"
                type="range"
                :min="minRaiseAdd"
                :max="maxRaiseAdd"
                :step="gameStore.currentRoom.smallBlind"
                class="flex-1 h-1 accent-slate-600 cursor-pointer"
              />
              <span>{{ customRaiseExtra.toLocaleString() }}</span>
            </div>
          </div>

          <!-- 结算阶段：极简下一局按钮 -->
          <div
            v-else-if="gameStore.stage === 'SETTLEMENT'"
            class="flex items-center justify-between gap-2 my-1"
          >
            <div class="text-[11px] truncate">
              <span class="font-bold">
                本局净值:
                <span
                  :class="
                    humanNetProfit > 0
                      ? theme === 'light'
                        ? 'text-emerald-700'
                        : 'text-emerald-400'
                      : humanNetProfit < 0
                        ? theme === 'light'
                          ? 'text-rose-700'
                          : 'text-rose-400'
                        : ''
                  "
                >
                  {{ humanNetProfit >= 0 ? '+' : '' }}{{ humanNetProfit.toLocaleString() }}
                </span>
              </span>
            </div>
            <button
              class="px-3 py-1 rounded border font-bold transition shrink-0"
              :class="
                theme === 'light'
                  ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-800'
                  : 'bg-zinc-200 hover:bg-white text-zinc-900 border-zinc-200'
              "
              @click="handleNextHand"
            >
              下一局 (Space)
            </button>
          </div>

          <div v-else class="my-2 text-[11px] opacity-50">
            正在等待其他节点返回数据...
          </div>
        </div>
      </div>

      <!-- 结算期专属：一目了然的【赢家 & 赢牌 5 张组合拆解条】(摸鱼模式下保持纯文字B端表格低调放大字符，不弹扑克牌图形) -->
      <div
        v-if="gameStore.stage === 'SETTLEMENT' && gameStore.mainWinnerResult"
        class="px-3 py-2 rounded border flex items-center justify-between gap-3 flex-wrap shrink-0"
        :class="
          theme === 'light'
            ? 'bg-slate-100 border-slate-300 text-slate-900'
            : 'bg-zinc-800/70 border-zinc-600 text-zinc-100'
        "
      >
        <div class="flex items-center gap-2 flex-wrap">
          <span
            class="px-2 py-0.5 rounded text-xs font-black"
            :class="
              theme === 'light'
                ? 'bg-slate-800 text-white'
                : 'bg-zinc-200 text-zinc-900'
            "
          >
            ★ 赢家: {{ gameStore.mainWinnerResult.name }} (+{{ gameStore.mainWinnerResult.winnings.toLocaleString() }})
          </span>
          <span class="text-sm font-black">
            赢牌牌型: 【{{ gameStore.mainWinnerResult.handDescription }}】
          </span>
          <span class="opacity-80 text-xs">
            {{ gameStore.mainWinnerResult.handDetail }}
          </span>
        </div>

        <!-- 赢家最佳5张牌明细（核心成牌大字加粗加框，踢脚牌稍小半级，直接标注 [底] 与 [公]） -->
        <div
          v-if="gameStore.mainWinnerResult.bestFiveCards.length > 0"
          class="flex items-center gap-1.5"
        >
          <span class="opacity-60 text-[11px]">赢牌组合:</span>
          <span
            v-for="(wc, wIdx) in gameStore.mainWinnerResult.bestFiveCards"
            :key="wc.id || wIdx"
            class="rounded border transition-all"
            :class="[
              gameStore.mainWinnerResult.coreCardIds.includes(wc.id)
                ? theme === 'light'
                  ? 'px-2 py-0.5 text-sm font-black bg-white border-slate-800 ring-1 ring-slate-800'
                  : 'px-2 py-0.5 text-sm font-black bg-zinc-900 border-zinc-200 ring-1 ring-zinc-200'
                : theme === 'light'
                  ? 'px-1.5 py-0.5 text-[11px] font-semibold bg-slate-50 border-slate-300 opacity-65'
                  : 'px-1.5 py-0.5 text-[11px] font-semibold bg-zinc-900/50 border-zinc-700 opacity-60',
              wc.color === 'red'
                ? theme === 'light'
                  ? 'text-rose-700'
                  : 'text-rose-400'
                : '',
            ]"
          >
            {{ wc.suitSymbol }}{{ wc.label }}<sub class="ml-0.5 opacity-75 font-normal text-[10px]">{{
              gameStore.mainWinnerResult.holeCardIds.includes(wc.id) ? '底' : '公'
            }}</sub>
          </span>
        </div>
      </div>

      <!-- 2. 主体 6 人节点数据监控列表 (纯 B 端表格，对方底牌与成牌组合极其清晰) -->
      <div
        class="flex-1 overflow-auto rounded border"
        :class="
          theme === 'light'
            ? 'bg-white border-slate-200'
            : 'bg-[#18191d] border-zinc-800'
        "
      >
        <table class="w-full border-collapse text-left">
          <thead>
            <tr
              class="border-b text-[11px]"
              :class="
                theme === 'light'
                  ? 'bg-slate-100 border-slate-200 text-slate-600'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              "
            >
              <th class="py-1.5 px-2.5 border-r" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">节点</th>
              <th class="py-1.5 px-2.5 border-r" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">位置</th>
              <th class="py-1.5 px-2.5 border-r" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">当前状态</th>
              <th class="py-1.5 px-2.5 border-r" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">底牌数据</th>
              <th class="py-1.5 px-2.5 border-r" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">本轮/总投入</th>
              <th class="py-1.5 px-2.5 border-r" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">剩余配额</th>
              <th class="py-1.5 px-2.5">成牌组合拆解 & 结算净值</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in gameStore.players"
              :key="p.id"
              class="border-b transition-colors"
              :class="[
                theme === 'light' ? 'border-slate-200' : 'border-zinc-800',
                p.isWinner
                  ? theme === 'light'
                    ? 'bg-amber-50/90 font-bold'
                    : 'bg-amber-950/30 font-bold'
                  : gameStore.activeSeatIndex === p.seatIndex
                    ? theme === 'light'
                      ? 'bg-sky-50/80'
                      : 'bg-zinc-800/80'
                    : p.folded
                      ? 'opacity-45'
                      : '',
              ]"
            >
              <!-- 1. 节点名称 -->
              <td class="py-1.5 px-2.5 border-r whitespace-nowrap" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">
                <span v-if="p.isWinner" class="mr-1">★</span>
                <span v-else-if="gameStore.activeSeatIndex === p.seatIndex" class="mr-1">●</span>
                <span :class="p.isHuman ? 'font-bold underline' : ''">
                  {{ p.name }}{{ p.isHuman ? '(我)' : '' }}
                </span>
              </td>

              <!-- 2. 庄家/盲注位置 -->
              <td class="py-1.5 px-2.5 border-r whitespace-nowrap text-[11px]" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">
                <span v-if="p.isDealer" class="px-1 rounded border mr-1">D</span>
                <span v-if="p.isSmallBlind" class="px-1 rounded border mr-1">SB</span>
                <span v-if="p.isBigBlind" class="px-1 rounded border">BB</span>
                <span v-if="!p.isDealer && !p.isSmallBlind && !p.isBigBlind" class="opacity-40">-</span>
              </td>

              <!-- 3. 当前动作状态 -->
              <td class="py-1.5 px-2.5 border-r whitespace-nowrap" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">
                <span v-if="p.isWinner" class="font-bold">
                  [赢家收池 +{{ p.roundWinnings.toLocaleString() }}]
                </span>
                <span v-else-if="p.lastActionText">
                  {{ p.lastActionText }}
                </span>
                <span v-else class="opacity-40">等待</span>
              </td>

              <!-- 4. 底牌数据 (我方常亮，对方在摊牌/结算/跑马时清晰展开展示) -->
              <td class="py-1.5 px-2.5 border-r whitespace-nowrap" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">
                <div v-if="shouldRevealAICards(p)" class="flex items-center gap-1.5 font-black text-xs">
                  <span
                    v-for="(c, cIdx) in p.holeCards"
                    :key="c.id || cIdx"
                    class="px-1.5 py-0.5 rounded border"
                    :class="[
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-300'
                        : 'bg-zinc-900 border-zinc-700',
                      c.color === 'red'
                        ? theme === 'light'
                          ? 'text-rose-700'
                          : 'text-rose-400'
                        : theme === 'light'
                          ? 'text-slate-900'
                          : 'text-zinc-100',
                    ]"
                  >
                    {{ c.suitSymbol }}{{ c.label }}
                  </span>
                </div>
                <span v-else-if="p.folded" class="opacity-40">已弃</span>
                <span v-else class="opacity-50">[** **]</span>
              </td>

              <!-- 5. 本轮/总投入 -->
              <td class="py-1.5 px-2.5 border-r whitespace-nowrap" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">
                {{ p.currentBet.toLocaleString() }} / {{ p.totalHandBet.toLocaleString() }}
              </td>

              <!-- 6. 剩余配额 -->
              <td class="py-1.5 px-2.5 border-r whitespace-nowrap" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">
                {{ p.chips.toLocaleString() }}
              </td>

              <!-- 7. 成牌组合拆解 & 结算净值 -->
              <td class="py-1.5 px-2.5">
                <!-- 结算或摊牌阶段：显示完整成牌牌型、5张组合与净盈亏 -->
                <template v-if="gameStore.stage === 'SETTLEMENT' || gameStore.stage === 'SHOWDOWN'">
                  <div v-if="getPlayerSettlement(p.id)" class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="font-bold">
                        {{ getPlayerSettlement(p.id)!.handDescription }}
                      </span>
                      <span class="opacity-70 text-[11px]">
                        ({{ getPlayerSettlement(p.id)!.handDetail }})
                      </span>
                    </div>
                    <span
                      class="font-bold shrink-0"
                      :class="
                        getPlayerSettlement(p.id)!.netProfit > 0
                          ? theme === 'light'
                            ? 'text-emerald-700'
                            : 'text-emerald-400'
                          : getPlayerSettlement(p.id)!.netProfit < 0
                            ? theme === 'light'
                              ? 'text-rose-700'
                              : 'text-rose-400'
                            : 'opacity-60'
                      "
                    >
                      {{ getPlayerSettlement(p.id)!.netProfit > 0 ? '+' : '' }}{{ getPlayerSettlement(p.id)!.netProfit.toLocaleString() }}
                    </span>
                  </div>
                  <span v-else class="opacity-40">已弃牌 (损耗 -{{ p.totalHandBet.toLocaleString() }})</span>
                </template>

                <!-- 对局进行中 -->
                <template v-else>
                  <span v-if="p.isHuman && gameStore.humanEvaluation">
                    {{ gameStore.humanEvaluation.description }} · {{ gameStore.humanEvaluation.detailText }}
                  </span>
                  <span v-else-if="!p.folded && gameStore.isAllInRunout">
                    胜率 {{ p.winProbability }}%
                  </span>
                  <span v-else class="opacity-50">
                    {{ p.bubbleQuote || '-' }}
                  </span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ==================== TAB 2: 内嵌极简账单流水表 ==================== -->
    <div v-else-if="activeTab === 'ledger'" class="flex-1 flex flex-col overflow-hidden p-2 gap-2">
      <div
        class="p-2 rounded border flex items-center justify-between gap-2 flex-wrap shrink-0"
        :class="
          theme === 'light'
            ? 'bg-white border-slate-200'
            : 'bg-[#18191d] border-zinc-800'
        "
      >
        <div class="flex items-center gap-3 text-[11px] flex-wrap">
          <span>当前余额: <strong>{{ userStore.beans.toLocaleString() }}</strong></span>
          <span>牌局净利: <strong>{{ userStore.netGameProfit >= 0 ? '+' : '' }}{{ userStore.netGameProfit.toLocaleString() }}</strong></span>
          <span>累计总入: <strong>+{{ userStore.totalIncome.toLocaleString() }}</strong></span>
          <span>累计总出: <strong>-{{ userStore.totalExpense.toLocaleString() }}</strong></span>
        </div>

        <div class="flex items-center gap-1">
          <button
            v-for="f in [
              { id: 'all', label: '全部' },
              { id: 'game', label: '对局' },
              { id: 'reward', label: '补给' },
              { id: 'spend', label: '支出' },
            ]"
            :key="f.id"
            class="px-2 py-0.5 rounded border text-[11px]"
            :class="
              ledgerFilter === f.id
                ? theme === 'light'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-zinc-200 text-zinc-900 border-zinc-200'
                : theme === 'light'
                  ? 'bg-slate-100 text-slate-600 border-slate-300'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            "
            @click="ledgerFilter = f.id as any"
          >
            {{ f.label }}
          </button>
          <button
            class="px-2 py-0.5 rounded border text-[11px] ml-2"
            :class="
              theme === 'light'
                ? 'bg-slate-100 hover:bg-rose-50 text-slate-600 border-slate-300'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-700'
            "
            @click="userStore.clearLedger()"
          >
            重置快照
          </button>
        </div>
      </div>

      <div
        class="flex-1 overflow-auto rounded border"
        :class="
          theme === 'light'
            ? 'bg-white border-slate-200'
            : 'bg-[#18191d] border-zinc-800'
        "
      >
        <table class="w-full border-collapse text-left text-[11px]">
          <thead>
            <tr
              class="border-b"
              :class="
                theme === 'light'
                  ? 'bg-slate-100 border-slate-200 text-slate-600'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              "
            >
              <th class="py-1.5 px-2.5 border-r" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">时间</th>
              <th class="py-1.5 px-2.5 border-r" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">项目摘要</th>
              <th class="py-1.5 px-2.5 border-r" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">明细说明</th>
              <th class="py-1.5 px-2.5 border-r text-right" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">变动额</th>
              <th class="py-1.5 px-2.5 text-right">结余</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in filteredLedger"
              :key="item.id"
              class="border-b"
              :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'"
            >
              <td class="py-1 px-2.5 border-r whitespace-nowrap opacity-60" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">
                {{ formatTime(item.timestamp) }}
              </td>
              <td class="py-1 px-2.5 border-r font-bold" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">
                {{ item.title }}
              </td>
              <td class="py-1 px-2.5 border-r opacity-80" :class="theme === 'light' ? 'border-slate-200' : 'border-zinc-800'">
                {{ item.detail }}
              </td>
              <td
                class="py-1 px-2.5 border-r text-right font-bold whitespace-nowrap"
                :class="[
                  theme === 'light' ? 'border-slate-200' : 'border-zinc-800',
                  item.delta > 0
                    ? theme === 'light'
                      ? 'text-emerald-700'
                      : 'text-emerald-400'
                    : item.delta < 0
                      ? theme === 'light'
                        ? 'text-rose-700'
                        : 'text-rose-400'
                      : '',
                ]"
              >
                {{ item.delta > 0 ? '+' : '' }}{{ item.delta.toLocaleString() }}
              </td>
              <td class="py-1 px-2.5 text-right whitespace-nowrap">
                {{ item.balanceAfter.toLocaleString() }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ==================== TAB 3: 极简无动画配额补给 ==================== -->
    <div v-else-if="activeTab === 'supply'" class="flex-1 p-3 overflow-auto">
      <div
        class="p-4 rounded border max-w-xl space-y-3"
        :class="
          theme === 'light'
            ? 'bg-white border-slate-200'
            : 'bg-[#18191d] border-zinc-800'
        "
      >
        <div class="font-bold text-sm">系统配额快速同步 (无动画静默补给)</div>
        <p class="opacity-70 text-[11px]">
          在超简约摸鱼模式下，无需打开大转盘动画，直接点击下方指令即可静默补充欢乐豆并记入流水日志。
        </p>

        <div class="flex items-center gap-2 flex-wrap pt-1">
          <button
            class="px-3 py-1.5 rounded border font-bold transition"
            :class="
              theme === 'light'
                ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-800'
                : 'bg-zinc-200 hover:bg-white text-zinc-900 border-zinc-200'
            "
            @click="silentSpinSupply"
          >
            [随机抽取配额 (+5,000 ~ +88,888)]
          </button>

          <button
            class="px-3 py-1.5 rounded border font-bold transition"
            :class="
              theme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
            "
            @click="silentClaimRelief"
          >
            [申请救济补贴 (+15,000)]
          </button>

          <button
            class="px-3 py-1.5 rounded border transition"
            :class="
              theme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-700'
            "
            @click="activeTab = 'table'"
          >
            返回实时监控
          </button>
        </div>

        <div
          v-if="supplyMsg"
          class="p-2 rounded border text-[11px] font-bold"
          :class="
            theme === 'light'
              ? 'bg-slate-50 border-slate-300 text-slate-800'
              : 'bg-zinc-900 border-zinc-700 text-zinc-200'
          "
        >
          {{ supplyMsg }}
        </div>
      </div>
    </div>
  </div>
</template>
