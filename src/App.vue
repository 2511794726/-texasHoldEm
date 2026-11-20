<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import LobbyView from '@/components/LobbyView.vue'
import PokerTableView from '@/components/PokerTableView.vue'
import { useGameStore } from '@/store/game'
import { RoomConfig, useUserStore } from '@/store/user'
import { sound } from '@/core/sound'

const currentView = ref<'lobby' | 'table'>('lobby')
const gameStore = useGameStore()
const userStore = useUserStore()

// 窗口尺寸监听（用于自适应小窗口与等比缩放）
const vw = ref(window.innerWidth)
const vh = ref(window.innerHeight)

function handleResize() {
  vw.value = window.innerWidth
  vh.value = window.innerHeight
}

// 当窗口较小 (<1060x680) 或手动开启摸鱼模式时，自动启用紧凑小窗布局
const isSmallViewport = computed(() => vw.value < 1060 || vh.value < 680)
const isCompact = computed(() => userStore.moyuMode || isSmallViewport.value)

// 当窗口被缩放到极小尺寸时自动按比例平滑缩放
const viewportStyle = computed(() => {
  const minW = isCompact.value ? 780 : 1160
  const minH = isCompact.value ? 470 : 680
  const s = Math.min(1, vw.value / minW, vh.value / minH)
  if (s >= 0.99) {
    return {
      width: '100vw',
      height: '100vh',
    }
  }
  return {
    width: `${Math.ceil(vw.value / s)}px`,
    height: `${Math.ceil(vh.value / s)}px`,
    transform: `scale(${s})`,
    transformOrigin: 'top left',
  }
})

// 老板键 (Boss Key) 伪装状态
const bossMode = ref(false)
let prevSoundEnabled = true

function syncWindowTitle() {
  if (bossMode.value) {
    document.title =
      userStore.stealthDisguiseType === 'code_doc'
        ? '内部微服务网关 API 接口规范 v3.2 - 文档中心'
        : '2026_Q4_研发效能与现金流核算表.xlsx - 表格'
  } else if (userStore.moyuMode) {
    document.title = 'SysMonitor v2.4 - 节点实时监控面板'
  } else {
    document.title = '欢乐德州扑克 - 街机狂欢版'
  }
}

// 触发或切换一键隐蔽 (forceOn=true 用于鼠标移出窗口时强制进入隐蔽状态)
function toggleBossMode(forceOn?: boolean) {
  if (userStore.stealthDisguiseType === 'moyu_card') {
    const nextState = forceOn !== undefined ? forceOn : !userStore.moyuMode
    userStore.moyuMode = nextState
    if (nextState) {
      sound.enabled = false
      if (sound.bgmEnabled) sound.toggleBgm()
    }
    syncWindowTitle()
    return
  }

  const nextBoss = forceOn !== undefined ? forceOn : !bossMode.value
  if (nextBoss === bossMode.value) return
  bossMode.value = nextBoss

  if (bossMode.value) {
    prevSoundEnabled = sound.enabled
    sound.enabled = false
    if (sound.bgmEnabled) sound.toggleBgm()
  } else {
    sound.enabled = prevSoundEnabled
  }
  syncWindowTitle()
}

function handleKeydown(e: KeyboardEvent) {
  const customKey = (userStore.stealthKey || 'Escape').toLowerCase()
  const pressedKey = e.key.toLowerCase()

  // 匹配用户自定义隐蔽键（默认 Esc）或反引号 ` / Alt+Z
  if (
    pressedKey === customKey ||
    e.key === '`' ||
    e.key === '~' ||
    (e.altKey && pressedKey === 'z')
  ) {
    e.preventDefault()
    toggleBossMode()
  } else if (e.key === 'Escape' && bossMode.value) {
    e.preventDefault()
    toggleBossMode(false)
  }
}

// 鼠标移出浏览器窗口自动隐蔽
function handleDocumentMouseLeave() {
  if (userStore.autoStealthOnLeave) {
    toggleBossMode(true)
  }
}

// 鼠标滚轮中键按下一键隐蔽
function handleGlobalMousedown(e: MouseEvent) {
  if (userStore.middleClickStealth && e.button === 1) {
    e.preventDefault()
    toggleBossMode()
  }
}

watch(
  () => [userStore.moyuMode, userStore.stealthDisguiseType],
  () => {
    syncWindowTitle()
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('mousedown', handleGlobalMousedown)
  document.documentElement.addEventListener('mouseleave', handleDocumentMouseLeave)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('mousedown', handleGlobalMousedown)
  document.documentElement.removeEventListener('mouseleave', handleDocumentMouseLeave)
})

function handleEnterRoom(room: RoomConfig) {
  gameStore.enterRoom(room)
  currentView.value = 'table'
}

function handleBackLobby() {
  currentView.value = 'lobby'
}

// 老板键伪装表格中的隐蔽牌局信息
const stealthHoleCards = computed(() => {
  const h = gameStore.humanPlayer
  if (!h || !h.holeCards.length) return '待立项'
  return h.holeCards.map((c) => `${c.suitSymbol}${c.label}`).join(' ')
})

const stealthCommunityCards = computed(() => {
  if (!gameStore.communityCards.length) return 'PRE-FLOP (阶段一)'
  return gameStore.communityCards.map((c) => `${c.suitSymbol}${c.label}`).join(' ')
})
</script>

<template>
  <div class="w-screen h-screen overflow-hidden bg-slate-950 text-white relative">
    <!-- 1A. 老板键伪装层：Excel 财务报表形态 -->
    <div
      v-if="bossMode && userStore.stealthDisguiseType !== 'code_doc'"
      class="fixed inset-0 z-[100] bg-white text-slate-800 font-sans text-xs flex flex-col select-text"
    >
      <div class="bg-[#107c41] text-white px-3 py-1.5 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Icon icon="mdi:microsoft-excel" class="text-base" />
          <span class="font-bold">2026_Q4_项目成本与现金流明细核算表.xlsx - 已保存</span>
        </div>
        <button
          class="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 text-[11px] flex items-center gap-1"
          @click="toggleBossMode(false)"
        >
          <span>返回工作台 ({{ userStore.stealthKey }} 或 `)</span>
        </button>
      </div>

      <div class="bg-slate-100 border-b border-slate-300 px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-2 text-slate-600 font-mono text-[11px]">
          <span class="px-2 py-0.5 bg-white border border-slate-300 rounded">fx</span>
          <span>
            =SUM(资产余额:{{ userStore.beans.toLocaleString() }}, 累计净利:{{ userStore.netGameProfit >= 0 ? '+' : '' }}{{ userStore.netGameProfit.toLocaleString() }})
          </span>
        </div>

        <div v-if="gameStore.players.length > 0" class="flex items-center gap-1.5">
          <template v-if="gameStore.isHumanTurn">
            <button
              class="px-2 py-0.5 bg-white hover:bg-slate-200 border border-slate-300 rounded text-[11px] text-slate-700"
              @click="gameStore.humanAction('fold')"
            >
              [驳回/弃]
            </button>
            <button
              v-if="gameStore.humanToCall === 0"
              class="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded text-[11px] text-emerald-800 font-semibold"
              @click="gameStore.humanAction('check')"
            >
              [已阅/过牌]
            </button>
            <button
              v-else
              class="px-2 py-0.5 bg-sky-50 hover:bg-sky-100 border border-sky-300 rounded text-[11px] text-sky-800 font-semibold"
              @click="gameStore.humanAction('call')"
            >
              [批准/跟 {{ gameStore.humanToCall }}]
            </button>
            <button
              class="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded text-[11px] text-amber-800"
              @click="gameStore.humanAction('raise', gameStore.humanToCall + gameStore.minRaiseDelta)"
            >
              [追加预算/加注]
            </button>
          </template>
          <button
            v-else-if="gameStore.stage === 'SETTLEMENT'"
            class="px-2 py-0.5 bg-emerald-600 text-white rounded text-[11px]"
            @click="gameStore.startNewHand()"
          >
            [核算下一单]
          </button>
          <span v-else class="text-[11px] text-slate-400">正在同步其他部门审批数据...</span>
        </div>
      </div>

      <div class="flex-1 overflow-auto">
        <table class="w-full border-collapse text-left font-mono text-[11px]">
          <thead>
            <tr class="bg-slate-200 text-slate-700 border-b border-slate-300">
              <th class="border-r border-slate-300 px-2 py-1 w-10 text-center">#</th>
              <th class="border-r border-slate-300 px-3 py-1">核算项目代码</th>
              <th class="border-r border-slate-300 px-3 py-1">关联指标说明</th>
              <th class="border-r border-slate-300 px-3 py-1 text-right">本期变动额</th>
              <th class="px-3 py-1 text-right">期末结余</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="gameStore.players.length > 0" class="border-b border-slate-200 bg-emerald-50/40">
              <td class="border-r border-slate-200 px-2 py-1 text-center text-slate-400">1</td>
              <td class="border-r border-slate-200 px-3 py-1 font-bold text-slate-900">
                手牌指标: {{ stealthHoleCards }}
              </td>
              <td class="border-r border-slate-200 px-3 py-1 text-slate-700">
                公共节点: {{ stealthCommunityCards }} | 评估: {{ gameStore.humanEvaluation?.description || '-' }}
              </td>
              <td class="border-r border-slate-200 px-3 py-1 text-right font-semibold text-emerald-700">
                底池: {{ gameStore.potTotal.toLocaleString() }}
              </td>
              <td class="px-3 py-1 text-right text-slate-600">
                {{ gameStore.isHumanTurn ? '● 待您审批' : gameStore.stage }}
              </td>
            </tr>
            <tr
              v-for="(bill, idx) in userStore.ledger.slice(0, 15)"
              :key="bill.id"
              class="border-b border-slate-200 hover:bg-slate-50"
            >
              <td class="border-r border-slate-200 px-2 py-1 text-center text-slate-400">
                {{ idx + 2 }}
              </td>
              <td class="border-r border-slate-200 px-3 py-1 text-slate-700">
                {{ bill.title }}
              </td>
              <td class="border-r border-slate-200 px-3 py-1 text-slate-500">
                {{ bill.detail }}
              </td>
              <td
                class="border-r border-slate-200 px-3 py-1 text-right font-semibold"
                :class="bill.delta >= 0 ? 'text-emerald-700' : 'text-rose-600'"
              >
                {{ bill.delta >= 0 ? '+' : '' }}{{ bill.delta.toLocaleString() }}
              </td>
              <td class="px-3 py-1 text-right text-slate-700">
                {{ bill.balanceAfter.toLocaleString() }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 1B. 老板键伪装层：纯静态 API 技术接口规范文档形态 -->
    <div
      v-else-if="bossMode && userStore.stealthDisguiseType === 'code_doc'"
      class="fixed inset-0 z-[100] bg-[#1e1e1e] text-zinc-300 font-mono text-xs flex flex-col select-text p-6 overflow-auto"
    >
      <div class="flex items-center justify-between border-b border-zinc-700 pb-3 mb-4">
        <div class="text-sm font-bold text-zinc-100">
          docs / api-gateway / cluster-state-sync.md
        </div>
        <button
          class="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-[11px] text-zinc-300"
          @click="toggleBossMode(false)"
        >
          关闭预览 ({{ userStore.stealthKey }})
        </button>
      </div>
      <div class="max-w-3xl space-y-4 leading-relaxed text-zinc-400">
        <h3 class="text-zinc-200 font-bold text-sm">1. 分布式节点状态同步协议 (Cluster State Sync)</h3>
        <p>
          在高并发网关集群中，各工作节点通过增量快照 (`DeltaSnapshot`) 与主池协调器同步状态配额。当请求到达边缘节点时，系统根据权重阈值自动完成路由分发。
        </p>
        <pre class="p-3 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 overflow-x-auto">
interface NodeSyncPayload {
  clusterId: string;
  localNodePair: string;   // status: {{ stealthHoleCards }}
  sharedSequence: string;  // pipe: {{ stealthCommunityCards }}
  poolBufferSize: number;  // buffer: {{ gameStore.potTotal }}
  quotaBalance: number;    // quota: {{ userStore.beans }}
}</pre>
        <h3 class="text-zinc-200 font-bold text-sm">2. 异常处理与幂等重试规范</h3>
        <p>
          所有跨节点事务均需携带唯一流水号 `trace_id`，在超时回滚时写入本地审计日志表，确保主从账目最终一致性。
        </p>
      </div>
    </div>

    <!-- 2. 主视图容器（保持原有大厅与6人牌桌结构常驻，切换摸鱼模式绝不卸载组件、不中断对局，同时支持小窗口自动等比缩放） -->
    <main :style="viewportStyle" class="overflow-hidden bg-slate-950 text-white">
      <Transition
        mode="out-in"
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-105"
      >
        <LobbyView
          v-if="currentView === 'lobby'"
          :compact="isCompact"
          @enter-room="handleEnterRoom"
          @toggle-boss="toggleBossMode()"
        />
        <PokerTableView
          v-else
          :compact="isCompact"
          @back-lobby="handleBackLobby"
          @toggle-boss="toggleBossMode()"
        />
      </Transition>
    </main>
  </div>
</template>
