<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useUserStore, SHOP_ITEMS, ACHIEVEMENTS, BillType } from '@/store/user'
import { useGameStore } from '@/store/game'
import { sound } from '@/core/sound'

export type ModalType =
  | 'none'
  | 'wheel'
  | 'shop'
  | 'achievements'
  | 'bankruptcy'
  | 'rules'
  | 'ledger'
  | 'stealth'

const props = defineProps<{
  activeModal: ModalType
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const userStore = useUserStore()
const gameStore = useGameStore()

// 幸运大转盘状态
const isSpinning = ref(false)
const wheelRotation = ref(0)
const wheelResultText = ref('')
let wheelTimerId: number | null = null
let pendingPrize: { label: string; amount: number } | null = null

const WHEEL_PRIZES = [
  { label: '5,000 欢乐豆', amount: 5000, color: '#10b981' },
  { label: '15,000 欢乐豆', amount: 15000, color: '#3b82f6' },
  { label: '8,888 吉利豆', amount: 8888, color: '#f59e0b' },
  { label: '30,000 暴富豆', amount: 30000, color: '#ec4899' },
  { label: '12,000 欢乐豆', amount: 12000, color: '#8b5cf6' },
  { label: '88,888 锦鲤大奖', amount: 88888, color: '#ef4444' },
]

// 结算并发放转盘奖励（采用直接响应式 State 赋值 + 牌桌筹码同步，100% 免疫 HMR 缓存且0延迟入账！）
function awardWheelPrize(prize: { label: string; amount: number }) {
  const amount = Number(prize.amount) || 0
  const currentBeans = Number(userStore.beans) || 0
  const nextBeans = Math.max(0, currentBeans + amount)

  // 1. 直接更新总账户欢乐豆
  userStore.beans = nextBeans
  userStore.wheelSpinsToday = (Number(userStore.wheelSpinsToday) || 0) + 1

  // 2. 直接同步增加当前牌桌上的玩家筹码
  if (Array.isArray(gameStore.players) && gameStore.players[0]) {
    gameStore.players[0].chips = Math.max(
      0,
      (Number(gameStore.players[0].chips) || 0) + amount
    )
  }

  // 3. 写入账单流水明细
  if (!Array.isArray(userStore.ledger)) {
    userStore.ledger = []
  }
  userStore.ledger.unshift({
    id: `bill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    type: 'wheel',
    title: '🎡 幸运大转盘中奖',
    detail: `转盘抽中【${prize.label}】`,
    delta: amount,
    balanceAfter: nextBeans,
  })

  sound.playWinFanfare()
  wheelResultText.value = `🎉 鸿运当头！抽中【${prize.label}】(+${amount.toLocaleString()}豆) 已到账！当前共 ${nextBeans.toLocaleString()} 豆`
  pendingPrize = null
}

function flushPendingWheelPrize() {
  if (wheelTimerId !== null) {
    clearTimeout(wheelTimerId)
    wheelTimerId = null
  }
  if (isSpinning.value && pendingPrize) {
    isSpinning.value = false
    awardWheelPrize(pendingPrize)
  }
}

function spinLuckyWheel(instant = false) {
  if (isSpinning.value) {
    flushPendingWheelPrize()
    return
  }
  sound.playClick()

  const prizeIndex = Math.floor(Math.random() * WHEEL_PRIZES.length)
  const prize = WHEEL_PRIZES[prizeIndex]
  const extraSpins = 4 * 360
  const targetAngle = extraSpins + (360 - prizeIndex * 60)
  wheelRotation.value += targetAngle

  // 立即入账加豆！不再受动画等待或提前关弹窗影响
  awardWheelPrize(prize)

  if (instant) {
    return
  }

  isSpinning.value = true
  wheelTimerId = window.setTimeout(() => {
    wheelTimerId = null
    isSpinning.value = false
  }, 1500)
}

// 如果玩家在转盘还在转的时候提前关闭了弹窗，立即补发奖励绝不吞豆！
watch(
  () => props.activeModal,
  (newVal) => {
    if (newVal !== 'wheel' && isSpinning.value) {
      flushPendingWheelPrize()
    }
    if (newVal !== 'stealth') {
      isRecordingKey.value = false
    }
  }
)

onUnmounted(() => {
  flushPendingWheelPrize()
})

// 装扮商店提示（同步扣减牌桌筹码）
const shopToast = ref('')
function handleShopClick(item: (typeof SHOP_ITEMS)[0]) {
  sound.playClick()
  const beforeBeans = userStore.beans
  const res = userStore.buyOrEquipShopItem(item)
  const delta = userStore.beans - beforeBeans
  if (delta !== 0) {
    gameStore.syncExternalBeansDelta(delta)
  }
  shopToast.value = res.message
  if (res.success) {
    sound.playChipBet()
  }
  setTimeout(() => {
    shopToast.value = ''
  }, 2500)
}

// 领取成就奖励（同步增加牌桌筹码）
const achievementToast = ref('')
function handleClaimAchievement(id: string) {
  const reward = userStore.claimAchievementReward(id)
  if (reward > 0) {
    gameStore.syncExternalBeansDelta(reward)
    sound.playWinFanfare()
    achievementToast.value = `🎉 领取成功！获得 +${reward.toLocaleString()} 欢乐豆！`
    setTimeout(() => {
      achievementToast.value = ''
    }, 2500)
  }
}

// 领取破产救济金（直接赋值同步增加账户与牌桌筹码）
function handleClaimRelief() {
  const gift = 15000
  const nextBeans = Math.max(0, (Number(userStore.beans) || 0) + gift)
  userStore.beans = nextBeans
  userStore.bankruptcyReliefCount = (Number(userStore.bankruptcyReliefCount) || 0) + 1

  if (Array.isArray(gameStore.players) && gameStore.players[0]) {
    gameStore.players[0].chips = Math.max(
      0,
      (Number(gameStore.players[0].chips) || 0) + gift
    )
  }

  if (!Array.isArray(userStore.ledger)) {
    userStore.ledger = []
  }
  userStore.ledger.unshift({
    id: `bill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    type: 'relief',
    title: '🎁 破产救济金扶持',
    detail: `荷官小甜发放第 ${userStore.bankruptcyReliefCount} 次东山再起补贴`,
    delta: gift,
    balanceAfter: nextBeans,
  })

  sound.playWinFanfare()
  sound.speak('恭喜领取一万五千欢乐豆救济金，祝您东山再起！')
  wheelResultText.value = `已发放 +${gift.toLocaleString()} 救济欢乐豆！`
  emit('close')
}

// 防老板一键隐蔽快捷键录制状态
const isRecordingKey = ref(false)

function startRecordStealthKey() {
  sound.playClick()
  isRecordingKey.value = true
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    userStore.stealthKey = e.key
    isRecordingKey.value = false
    window.removeEventListener('keydown', onKey, true)
  }
  window.addEventListener('keydown', onKey, true)
}

function setPresetStealthKey(k: string) {
  sound.playClick()
  userStore.stealthKey = k
  isRecordingKey.value = false
}

// 账单流水筛选与格式化
const ledgerFilter = ref<'all' | 'game' | 'reward' | 'spend'>('all')

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

function getBillIcon(type: BillType): { icon: string; badgeClass: string } {
  switch (type) {
    case 'game_win':
      return {
        icon: 'mdi:trophy-variant',
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
      }
    case 'game_loss':
      return {
        icon: 'mdi:cards-playing-outline',
        badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/40',
      }
    case 'game_even':
      return {
        icon: 'mdi:handshake-outline',
        badgeClass: 'bg-slate-500/20 text-slate-300 border-slate-400/40',
      }
    case 'wheel':
      return {
        icon: 'mdi:ferris-wheel',
        badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
      }
    case 'relief':
      return {
        icon: 'mdi:hand-coin',
        badgeClass: 'bg-pink-500/20 text-pink-300 border-pink-400/40',
      }
    case 'achievement':
      return {
        icon: 'mdi:medal',
        badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
      }
    case 'shop':
      return {
        icon: 'mdi:tshirt-crew',
        badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-400/40',
      }
    case 'dealer_tip':
      return {
        icon: 'mdi:heart-flash',
        badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/40',
      }
    default:
      return {
        icon: 'mdi:gift-open',
        badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40',
      }
  }
}

function handleClearLedger() {
  sound.playClick()
  userStore.clearLedger()
}
</script>

<template>
  <div
    v-if="props.activeModal !== 'none'"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4"
    @click.self="emit('close')"
  >
    <!-- 1. 幸运大转盘弹窗 -->
    <div
      v-if="props.activeModal === 'wheel'"
      class="relative w-full max-w-lg max-h-[94vh] overflow-y-auto rounded-3xl bg-gradient-to-b from-amber-600 via-red-700 to-rose-950 border-4 border-yellow-300 p-4 sm:p-6 text-center shadow-[0_0_70px_rgba(251,191,36,0.65)]"
    >
      <button
        class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white"
        @click="emit('close')"
      >
        <Icon icon="mdi:close" class="text-xl" />
      </button>

      <div class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-black/40 border border-yellow-300/60 text-yellow-300 text-xs font-black mb-1.5">
        <Icon icon="mdi:peanut" class="text-base" />
        <span>当前持有欢乐豆: {{ userStore.beans.toLocaleString() }}</span>
      </div>
      <h2 class="text-2xl sm:text-3xl font-black text-yellow-200 drop-shadow">
        🎡 欢乐锦鲤大转盘
      </h2>
      <p class="text-amber-100/80 text-xs sm:text-sm mt-0.5">
        单机爽玩特权：抽取后实时同步到牌桌筹码与账户余额！
      </p>

      <!-- 转盘圆盘 -->
      <div class="relative w-52 h-52 sm:w-60 sm:h-60 mx-auto my-3 sm:my-5">
        <div class="absolute -top-4 left-1/2 -translate-x-1/2 z-20 text-yellow-300 drop-shadow-lg">
          <Icon icon="mdi:map-marker-down" class="text-4xl sm:text-5xl" />
        </div>

        <div
          class="w-full h-full rounded-full border-8 border-yellow-300 shadow-2xl overflow-hidden relative transition-transform duration-[1800ms] ease-out bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center"
          :style="{ transform: `rotate(${wheelRotation}deg)` }"
        >
          <div
            v-for="(prize, idx) in WHEEL_PRIZES"
            :key="idx"
            class="absolute inset-0 flex items-start justify-center pt-4 sm:pt-5 font-black text-[11px] sm:text-xs text-white drop-shadow"
            :style="{ transform: `rotate(${idx * 60}deg)` }"
          >
            <span class="px-1.5 py-0.5 rounded bg-black/30 backdrop-blur-sm">
              {{ prize.label }}
            </span>
          </div>
          <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-yellow-300 border-4 border-white shadow-inner flex items-center justify-center text-red-700 font-black text-base sm:text-lg">
            鸿运
          </div>
        </div>
      </div>

      <div v-if="wheelResultText" class="mb-3 py-1.5 px-3 rounded-xl bg-yellow-400/25 border border-yellow-300 text-yellow-200 text-xs sm:text-sm font-black animate-bounce">
        {{ wheelResultText }}
      </div>

      <div class="flex items-center justify-center gap-3">
        <button
          class="px-6 py-2.5 sm:py-3 rounded-2xl font-black text-base sm:text-lg bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-500 text-red-950 border-2 border-yellow-100 shadow-[0_4px_0_#b45309] active:translate-y-0.5 transition"
          @click="spinLuckyWheel(false)"
        >
          {{ isSpinning ? '点击立即开奖！' : '🎡 旋转抽奖' }}
        </button>

        <button
          class="px-4 py-2.5 sm:py-3 rounded-2xl font-black text-sm sm:text-base bg-white/15 hover:bg-white/25 text-yellow-200 border border-yellow-300/60 transition"
          title="跳过转盘动画，0延迟直接抽取欢乐豆入账"
          @click="spinLuckyWheel(true)"
        >
          ⚡ 秒抽领豆
        </button>
      </div>
    </div>

    <!-- 2. 账单流水弹窗 (新增核心功能) -->
    <div
      v-else-if="props.activeModal === 'ledger'"
      class="relative w-full max-w-3xl rounded-3xl bg-gradient-to-b from-[#1a1838] via-[#11142c] to-[#0a0c1c] border border-rose-300/45 p-4 sm:p-6 shadow-[0_0_50px_rgba(12,10,30,0.85)] max-h-[92vh] flex flex-col"
    >
      <!-- 顶部标题栏 -->
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-amber-300">
            <Icon icon="mdi:receipt-text-clock" class="text-2xl" />
          </div>
          <div>
            <h2 class="text-lg sm:text-2xl font-black text-amber-300">欢乐豆账单流水明细</h2>
            <p class="text-[11px] sm:text-xs text-slate-400">
              实时记录每一局胜负收支、转盘抽奖、救济补贴与商城消费
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-400/40 text-xs text-slate-300 hover:text-rose-200 font-bold flex items-center gap-1 transition"
            title="重置并清空历史流水"
            @click="handleClearLedger"
          >
            <Icon icon="mdi:delete-sweep-outline" class="text-base" />
            <span class="hidden sm:inline">重置流水</span>
          </button>
          <button
            class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            @click="emit('close')"
          >
            <Icon icon="mdi:close" class="text-lg" />
          </button>
        </div>
      </div>

      <!-- 四宫格收支统计汇总 -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3">
        <div class="p-2.5 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-[11px] text-slate-400">当前账户余额</div>
          <div class="text-base sm:text-lg font-black text-yellow-300 mt-0.5 flex items-center gap-1">
            <Icon icon="mdi:peanut" />
            <span>{{ userStore.beans.toLocaleString() }}</span>
          </div>
        </div>

        <div class="p-2.5 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-[11px] text-slate-400">牌局累计净盈亏</div>
          <div
            class="text-base sm:text-lg font-black mt-0.5"
            :class="
              userStore.netGameProfit > 0
                ? 'text-emerald-400'
                : userStore.netGameProfit < 0
                  ? 'text-rose-400'
                  : 'text-slate-200'
            "
          >
            {{ userStore.netGameProfit > 0 ? '+' : '' }}{{ userStore.netGameProfit.toLocaleString() }}
          </div>
        </div>

        <div class="p-2.5 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-[11px] text-slate-400">累计总赢入/福利</div>
          <div class="text-base sm:text-lg font-black text-emerald-400 mt-0.5">
            +{{ userStore.totalIncome.toLocaleString() }}
          </div>
        </div>

        <div class="p-2.5 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-[11px] text-slate-400">累计总支出/损耗</div>
          <div class="text-base sm:text-lg font-black text-rose-400 mt-0.5">
            -{{ userStore.totalExpense.toLocaleString() }}
          </div>
        </div>
      </div>

      <!-- 筛选分类切换条 -->
      <div class="flex items-center justify-between gap-2 mb-2.5">
        <div class="flex items-center gap-1.5 flex-wrap">
          <button
            v-for="tab in [
              { id: 'all', label: '全部流水', icon: 'mdi:format-list-bulleted' },
              { id: 'game', label: '牌局盈亏', icon: 'mdi:cards-playing' },
              { id: 'reward', label: '福利入账', icon: 'mdi:gift-outline' },
              { id: 'spend', label: '消费打赏', icon: 'mdi:shopping-outline' },
            ]"
            :key="tab.id"
            class="px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1 border transition"
            :class="
              ledgerFilter === tab.id
                ? 'bg-amber-400 text-slate-950 border-yellow-200 shadow'
                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
            "
            @click="ledgerFilter = tab.id as any"
          >
            <Icon :icon="tab.icon" />
            <span>{{ tab.label }}</span>
          </button>
        </div>
        <span class="text-[11px] text-slate-400 shrink-0">
          共 {{ filteredLedger.length }} 条记录
        </span>
      </div>

      <!-- 账单流水滚动列表 -->
      <div class="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[180px]">
        <div
          v-if="filteredLedger.length === 0"
          class="py-12 text-center text-slate-400 text-sm flex flex-col items-center gap-2"
        >
          <Icon icon="mdi:text-box-search-outline" class="text-4xl text-slate-600" />
          <span>该分类下暂无账单流水记录~</span>
        </div>

        <div
          v-for="item in filteredLedger"
          :key="item.id"
          class="p-2.5 sm:p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between gap-3 transition"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <div
              class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center text-lg sm:text-xl shrink-0"
              :class="getBillIcon(item.type).badgeClass"
            >
              <Icon :icon="getBillIcon(item.type).icon" />
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-black text-xs sm:text-sm text-white truncate">
                  {{ item.title }}
                </span>
                <span class="text-[10px] text-slate-400 font-mono">
                  {{ formatTime(item.timestamp) }}
                </span>
              </div>
              <p class="text-[11px] text-slate-300 truncate mt-0.5">
                {{ item.detail }}
              </p>
            </div>
          </div>

          <!-- 右侧金额变动与结余 -->
          <div class="text-right shrink-0">
            <div
              class="text-sm sm:text-base font-black font-mono"
              :class="
                item.delta > 0
                  ? 'text-emerald-400'
                  : item.delta < 0
                    ? 'text-rose-400'
                    : 'text-slate-300'
              "
            >
              {{ item.delta > 0 ? '+' : '' }}{{ item.delta.toLocaleString() }}
            </div>
            <div class="text-[10px] text-slate-400 font-mono">
              余额 {{ item.balanceAfter.toLocaleString() }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 装扮商店弹窗 -->
    <div
      v-else-if="props.activeModal === 'shop'"
      class="relative w-full max-w-3xl rounded-3xl bg-gradient-to-b from-[#1a1838] via-[#11142c] to-[#0a0c1c] border border-rose-300/45 p-4 sm:p-6 shadow-[0_0_50px_rgba(12,10,30,0.85)] max-h-[92vh] flex flex-col"
    >
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <div class="flex items-center gap-2.5">
          <Icon icon="mdi:storefront" class="text-3xl sm:text-4xl text-amber-400" />
          <div>
            <h2 class="text-lg sm:text-2xl font-black text-amber-300">欢乐装扮商城</h2>
            <p class="text-xs text-slate-400">使用欢乐豆解锁专属皇家桌布与炫酷牌背</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center gap-1.5 text-amber-300 font-black text-sm">
            <Icon icon="mdi:peanut" class="text-lg" />
            <span>{{ userStore.beans.toLocaleString() }}</span>
          </div>
          <button
            class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            @click="emit('close')"
          >
            <Icon icon="mdi:close" class="text-lg" />
          </button>
        </div>
      </div>

      <div
        v-if="shopToast"
        class="mt-2.5 py-1.5 px-4 rounded-xl bg-amber-500/20 border border-amber-400 text-amber-200 text-center font-bold text-xs sm:text-sm"
      >
        {{ shopToast }}
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 my-4 overflow-y-auto pr-1">
        <div
          v-for="item in SHOP_ITEMS"
          :key="item.id"
          class="rounded-2xl bg-slate-800/80 border-2 p-3.5 flex flex-col justify-between transition hover:border-amber-400"
          :class="
            userStore.equippedTableTheme === item.id ||
            userStore.equippedCardBack === item.id
              ? 'border-emerald-400 bg-emerald-950/30'
              : 'border-white/10'
          "
        >
          <div>
            <div
              class="h-20 rounded-xl bg-gradient-to-br border border-white/20 flex items-center justify-center mb-2.5 shadow-inner"
              :class="item.previewClass"
            >
              <Icon :icon="item.icon" class="text-4xl text-white/90 drop-shadow" />
            </div>
            <div class="flex items-center justify-between">
              <span class="font-black text-sm text-white">{{ item.name }}</span>
              <span class="text-[10px] px-2 py-0.5 rounded bg-white/10 text-slate-300">
                {{ item.type === 'table_theme' ? '桌布' : '牌背' }}
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-1">{{ item.description }}</p>
          </div>

          <button
            class="mt-3 w-full py-2 rounded-xl font-black text-xs sm:text-sm transition flex items-center justify-center gap-1"
            :class="
              userStore.equippedTableTheme === item.id ||
              userStore.equippedCardBack === item.id
                ? 'bg-emerald-500 text-slate-950'
                : userStore.ownedItems.includes(item.id)
                  ? 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                  : 'bg-gradient-to-r from-amber-400 to-orange-500 hover:brightness-110 text-slate-950'
            "
            @click="handleShopClick(item)"
          >
            <template
              v-if="
                userStore.equippedTableTheme === item.id ||
                userStore.equippedCardBack === item.id
              "
            >
              <Icon icon="mdi:check-circle" /> 已装备使用中
            </template>
            <template v-else-if="userStore.ownedItems.includes(item.id)">
              点击立即装备
            </template>
            <template v-else>
              <Icon icon="mdi:peanut" /> {{ item.price.toLocaleString() }} 豆购买
            </template>
          </button>
        </div>
      </div>
    </div>

    <!-- 4. 个人战绩与荣誉成就图鉴 -->
    <div
      v-else-if="props.activeModal === 'achievements'"
      class="relative w-full max-w-3xl rounded-3xl bg-gradient-to-b from-[#1d183c] via-[#12142e] to-[#0a0c1c] border border-rose-300/45 p-4 sm:p-6 shadow-[0_0_50px_rgba(12,10,30,0.85)] max-h-[92vh] flex flex-col"
    >
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <div class="flex items-center gap-2.5">
          <Icon icon="mdi:trophy" class="text-3xl sm:text-4xl text-amber-400" />
          <div>
            <h2 class="text-lg sm:text-2xl font-black text-amber-300">达文西的荣誉图鉴与战绩</h2>
            <p class="text-xs text-slate-400">达成高光牌型与连胜成就，领取丰厚欢乐豆悬赏</p>
          </div>
        </div>
        <button
          class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          @click="emit('close')"
        >
          <Icon icon="mdi:close" class="text-lg" />
        </button>
      </div>

      <!-- 战绩概览四宫格 -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3">
        <div class="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-center">
          <div class="text-[11px] text-slate-400">总对局 / 胜率</div>
          <div class="text-base sm:text-lg font-black text-white mt-0.5">
            {{ userStore.totalGames }} 局 · {{ userStore.winRate }}%
          </div>
        </div>
        <div class="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-center">
          <div class="text-[11px] text-slate-400">最高连胜纪录</div>
          <div class="text-base sm:text-lg font-black text-amber-400 mt-0.5">
            🔥 {{ userStore.bestStreak }} 连胜
          </div>
        </div>
        <div class="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-center">
          <div class="text-[11px] text-slate-400">单局最大赢取</div>
          <div class="text-base sm:text-lg font-black text-emerald-400 mt-0.5">
            +{{ userStore.biggestPotWon.toLocaleString() }}
          </div>
        </div>
        <div class="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-center">
          <div class="text-[11px] text-slate-400">历史最佳成牌</div>
          <div class="text-sm sm:text-base font-black text-pink-400 mt-0.5 truncate">
            {{ userStore.bestHandDescription }}
          </div>
        </div>
      </div>

      <div
        v-if="achievementToast"
        class="mb-2.5 py-1.5 px-4 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-200 text-center font-bold text-xs sm:text-sm"
      >
        {{ achievementToast }}
      </div>

      <!-- 勋章列表 -->
      <div class="space-y-2 overflow-y-auto pr-1">
        <div
          v-for="ach in ACHIEVEMENTS"
          :key="ach.id"
          class="p-3 rounded-2xl border flex items-center justify-between transition"
          :class="
            userStore.unlockedAchievements.includes(ach.id)
              ? 'bg-amber-500/15 border-amber-400/50'
              : 'bg-white/5 border-white/10 opacity-70'
          "
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-xl sm:text-2xl shadow shrink-0"
              :class="
                userStore.unlockedAchievements.includes(ach.id)
                  ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950'
                  : 'bg-slate-800 text-slate-500'
              "
            >
              <Icon :icon="ach.icon" />
            </div>
            <div>
              <div class="font-black text-sm sm:text-base text-white flex items-center gap-2 flex-wrap">
                <span>{{ ach.title }}</span>
                <span class="text-[11px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-bold">
                  奖励 +{{ ach.rewardBeans.toLocaleString() }} 豆
                </span>
              </div>
              <p class="text-xs text-slate-300 mt-0.5">{{ ach.description }}</p>
            </div>
          </div>

          <div class="shrink-0 ml-2">
            <button
              v-if="
                userStore.unlockedAchievements.includes(ach.id) &&
                !userStore.claimedAchievements.includes(ach.id)
              "
              class="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black text-xs shadow animate-pulse"
              @click="handleClaimAchievement(ach.id)"
            >
              领取悬赏
            </button>
            <span
              v-else-if="userStore.claimedAchievements.includes(ach.id)"
              class="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold text-xs flex items-center gap-1"
            >
              <Icon icon="mdi:check-decagram" /> 已领取
            </span>
            <span
              v-else
              class="px-2.5 py-1 rounded-xl bg-white/5 text-slate-400 font-bold text-xs"
            >
              未解锁
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. 破产救济金礼包弹窗 -->
    <div
      v-else-if="props.activeModal === 'bankruptcy'"
      class="relative w-full max-w-md rounded-3xl bg-gradient-to-b from-rose-700 via-red-800 to-stone-950 border-4 border-amber-300 p-5 sm:p-6 text-center shadow-[0_0_70px_rgba(244,63,94,0.8)]"
    >
      <div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-amber-400/20 border-2 border-amber-300 flex items-center justify-center text-4xl sm:text-5xl mb-2 animate-bounce">
        🎁
      </div>
      <h2 class="text-2xl sm:text-3xl font-black text-yellow-200">欢乐破产救济金</h2>
      <p class="text-xs sm:text-sm text-rose-100 mt-1.5">
        胜败乃兵家常事！荷官小甜特地为达文西准备了东山再起大礼包~
      </p>

      <div class="my-4 py-3.5 px-5 rounded-2xl bg-black/35 border border-yellow-400/40">
        <div class="text-xs text-amber-200">本次免费扶持补贴</div>
        <div class="text-3xl sm:text-4xl font-black text-yellow-300 mt-1 flex items-center justify-center gap-2">
          <Icon icon="mdi:peanut" /> +15,000 欢乐豆
        </div>
      </div>

      <div class="flex gap-3 justify-center">
        <button
          class="flex-1 py-2.5 sm:py-3 rounded-2xl font-black text-base sm:text-lg bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-500 text-red-950 border-2 border-yellow-100 shadow-lg hover:brightness-110 transition"
          @click="handleClaimRelief"
        >
          立即免费领取
        </button>
      </div>
    </div>

    <!-- 6. 德扑牌型与街机特效指南弹窗 -->
    <div
      v-else-if="props.activeModal === 'rules'"
      class="relative w-full max-w-2xl rounded-3xl bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 border-4 border-sky-400 p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
    >
      <div class="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
        <div class="flex items-center gap-2">
          <Icon icon="mdi:book-open-page-variant" class="text-2xl sm:text-3xl text-sky-400" />
          <h2 class="text-base sm:text-xl font-black text-white">欢乐德州扑克 · 牌型与街机特效指南</h2>
        </div>
        <button
          class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          @click="emit('close')"
        >
          <Icon icon="mdi:close" />
        </button>
      </div>

      <div class="space-y-2 text-xs sm:text-sm">
        <div class="p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-red-500/20 border border-amber-400/40 flex items-center justify-between gap-2">
          <div>
            <span class="font-black text-amber-300">👑 皇家同花顺 / 同花顺</span>
            <p class="text-[11px] text-slate-300 mt-0.5">同花色的最大顺子或任意五张同花连顺</p>
          </div>
          <span class="px-2.5 py-1 rounded-full bg-rose-600 text-amber-100 font-black text-[11px] shrink-0">
            ✦ 绝世奥义特效
          </span>
        </div>

        <div class="p-2.5 sm:p-3 rounded-xl bg-orange-500/15 border border-orange-400/40 flex items-center justify-between gap-2">
          <div>
            <span class="font-black text-orange-300">⚔️ 金刚（四条）</span>
            <p class="text-[11px] text-slate-300 mt-0.5">4 张相同点数的牌</p>
          </div>
          <span class="px-2.5 py-1 rounded-full bg-orange-600 text-white font-black text-[11px] shrink-0">
            ⚔️ 剑阵破空震屏
          </span>
        </div>

        <div class="p-2.5 sm:p-3 rounded-xl bg-sky-500/15 border border-sky-400/40 flex items-center justify-between gap-2">
          <div>
            <span class="font-black text-sky-300">🌸 葫芦</span>
            <p class="text-[11px] text-slate-300 mt-0.5">3 张相同点数 + 1 对</p>
          </div>
          <span class="px-2.5 py-1 rounded-full bg-indigo-600 text-white font-black text-[11px] shrink-0">
            🌸 樱月结界特效
          </span>
        </div>

        <div class="p-2.5 sm:p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-between gap-2">
          <div>
            <span class="font-black text-emerald-300">✨ 同花 / 顺子 / 三条</span>
            <p class="text-[11px] text-slate-300 mt-0.5">5 张同花色 / 5 张连续点数 / 3 张同点数</p>
          </div>
          <span class="px-2.5 py-1 rounded-full bg-emerald-700 text-white font-bold text-[11px] shrink-0">
            ✨ 流光成牌特效
          </span>
        </div>

        <div class="p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2">
          <div>
            <span class="font-bold text-slate-200">🃏 两对 / 一对 / 高牌</span>
            <p class="text-[11px] text-slate-400 mt-0.5">基础成牌，用高牌逼退全场可触发【偷鸡亮牌炫耀】彩蛋！</p>
          </div>
          <span class="px-2.5 py-1 rounded-full bg-white/10 text-slate-300 text-[11px] shrink-0">
            基础牌型
          </span>
        </div>
      </div>
    </div>

    <!-- 7. 防老板一键隐蔽与全局快捷键设置弹窗 -->
    <div
      v-else-if="props.activeModal === 'stealth'"
      class="relative w-full max-w-xl rounded-3xl bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 border-2 border-cyan-400/80 p-4 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
    >
      <div class="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
        <div class="flex items-center gap-2.5">
          <div class="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300">
            <Icon icon="mdi:shield-lock-outline" class="text-2xl" />
          </div>
          <div>
            <h2 class="text-lg sm:text-xl font-black text-white">防老板「一键隐蔽」全局设置</h2>
            <p class="text-xs text-slate-400">支持自定义单键秒切、鼠标移出窗口自动隐蔽、滚轮中键秒切</p>
          </div>
        </div>
        <button
          class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          @click="emit('close')"
        >
          <Icon icon="mdi:close" />
        </button>
      </div>

      <div class="space-y-4 text-xs sm:text-sm">
        <!-- 1. 键盘全局单键快捷键录制 -->
        <div class="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-black text-cyan-300 flex items-center gap-1.5">
                <Icon icon="mdi:keyboard-outline" class="text-lg" />
                <span>全局一键隐蔽快捷键 (0延迟秒切)</span>
              </div>
              <p class="text-[11px] text-slate-400 mt-0.5">
                在任何界面（哪怕开着弹窗）按下该键或反引号 <code class="text-amber-300">`</code> 键，立即触发隐蔽并静音
              </p>
            </div>
            <span class="px-3 py-1 rounded-xl bg-cyan-950 border border-cyan-400 text-cyan-200 font-mono font-black text-sm">
              {{ userStore.stealthKey === ' ' ? 'Space(空格)' : userStore.stealthKey }}
            </span>
          </div>

          <div class="flex items-center gap-2 flex-wrap pt-1">
            <button
              class="px-3.5 py-1.5 rounded-xl font-black text-xs border transition"
              :class="
                isRecordingKey
                  ? 'bg-rose-600 text-white border-yellow-300 animate-pulse'
                  : 'bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 border-cyan-400/60'
              "
              @click="startRecordStealthKey"
            >
              {{ isRecordingKey ? '👉 请在键盘按下任意想要绑定的按键...' : '🎯 点击自定义录制按键' }}
            </button>

            <button
              v-for="preset in [
                { key: 'Escape', label: '设为 Esc 键' },
                { key: '`', label: '设为 ` 键(Tab上方)' },
                { key: 'F1', label: '设为 F1 键' },
                { key: 'q', label: '设为 Q 键' },
              ]"
              :key="preset.key"
              class="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-xs text-slate-300 font-mono transition"
              :class="userStore.stealthKey === preset.key ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10' : ''"
              @click="setPresetStealthKey(preset.key)"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>

        <!-- 2. 鼠标防偷窥自动感应开关 -->
        <div class="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
          <div class="font-black text-amber-300">🖱️ 鼠标防偷窥自动感应（强烈推荐上班开启）</div>

          <label class="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/10 cursor-pointer hover:border-cyan-400/50 transition">
            <div>
              <div class="font-bold text-white">👀 鼠标移出浏览器窗口自动隐蔽</div>
              <div class="text-[11px] text-slate-400">老板走过来时，手一推把鼠标移出游戏窗口，0毫秒自动变成工作界面并静音！</div>
            </div>
            <input
              v-model="userStore.autoStealthOnLeave"
              type="checkbox"
              class="w-5 h-5 accent-cyan-400 cursor-pointer"
            />
          </label>

          <label class="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/10 cursor-pointer hover:border-cyan-400/50 transition">
            <div>
              <div class="font-bold text-white">🖱️ 按下鼠标滚轮(中键)一键隐蔽</div>
              <div class="text-[11px] text-slate-400">手放在鼠标上无需找键盘，直接按下滚轮中键即可一键切换隐蔽/恢复</div>
            </div>
            <input
              v-model="userStore.middleClickStealth"
              type="checkbox"
              class="w-5 h-5 accent-cyan-400 cursor-pointer"
            />
          </label>
        </div>

        <!-- 3. 触发隐蔽时的伪装画面形态 -->
        <div class="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
          <div class="font-black text-emerald-300">🎭 触发一键隐蔽时的画面效果</div>

          <div class="grid grid-cols-1 gap-2">
            <button
              v-for="mode in [
                {
                  id: 'excel',
                  title: '📊 伪装为财务核算报表（推荐）',
                  desc: '全屏变成逼真财务表格并静音，且支持在表内隐蔽看底牌和点击审批按钮打牌',
                },
                {
                  id: 'code_doc',
                  title: '📄 伪装为技术接口规范文档',
                  desc: '全屏变成纯静态系统架构与接口规范文档，无任何数字跳动，安全系数拉满',
                },
                {
                  id: 'moyu_card',
                  title: '🐟 切换为「摸鱼极简低饱和界面」',
                  desc: '隐藏头像与强光效，将牌桌切换为低饱和极简靛灰界面并静音',
                },
              ]"
              :key="mode.id"
              class="p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2"
              :class="
                userStore.stealthDisguiseType === mode.id
                  ? 'bg-cyan-500/20 border-cyan-400 text-white'
                  : 'bg-black/30 border-white/10 text-slate-300 hover:bg-white/10'
              "
              @click="userStore.stealthDisguiseType = mode.id as any"
            >
              <div>
                <div class="font-black text-xs sm:text-sm">{{ mode.title }}</div>
                <div class="text-[11px] text-slate-400 mt-0.5">{{ mode.desc }}</div>
              </div>
              <span
                v-if="userStore.stealthDisguiseType === mode.id"
                class="px-2 py-0.5 rounded-full bg-cyan-400 text-slate-950 font-black text-[10px] shrink-0"
              >
                当前选用
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
