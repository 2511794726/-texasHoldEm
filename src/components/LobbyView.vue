<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useUserStore, ROOM_CONFIGS, RoomConfig, ACHIEVEMENTS } from '@/store/user'
import { AI_PERSONAS } from '@/core/ai'
import { sound } from '@/core/sound'
import { formatChips } from '@/core/format'
import { resolvePublicAsset } from '@/core/assets'
import LobbyModals, { ModalType } from './LobbyModals.vue'

const dealerAvatar = resolvePublicAsset('assets/characters/dealer_girl.png')

const props = defineProps<{
  compact?: boolean
}>()

const emit = defineEmits<{
  (e: 'enter-room', room: RoomConfig): void
  (e: 'toggle-boss'): void
}>()

const userStore = useUserStore()
const activeModal = ref<ModalType>('none')
const soundOn = ref(sound.enabled)
const bgmOn = ref(sound.bgmEnabled)
const lobbyAlert = ref('')

const isCompact = computed(() => props.compact || userStore.moyuMode)

function openModal(type: ModalType) {
  sound.playClick()
  activeModal.value = type
}

function toggleSound() {
  sound.enabled = !sound.enabled
  soundOn.value = sound.enabled
  if (soundOn.value) sound.playClick()
}

function toggleBgm() {
  bgmOn.value = sound.toggleBgm()
  sound.playClick()
}

function toggleMoyuMode() {
  userStore.moyuMode = !userStore.moyuMode
  sound.playClick()
}

function handleSelectRoom(room: RoomConfig) {
  sound.playClick()
  if (userStore.beans < room.minBeans) {
    if (userStore.beans < 2000) {
      activeModal.value = 'bankruptcy'
    } else {
      lobbyAlert.value = `进入【${room.name}】至少需要 ${room.minBeans.toLocaleString()} 欢乐豆！可先去新手场或转盘抽奖哦~`
      setTimeout(() => {
        lobbyAlert.value = ''
      }, 3200)
    }
    return
  }
  emit('enter-room', room)
}

// 快速开局：自动匹配玩家当前欢乐豆最适合的场次
function quickStartGame() {
  sound.playClick()
  if (userStore.beans < 1000) {
    activeModal.value = 'bankruptcy'
    return
  }
  const eligible = [...ROOM_CONFIGS]
    .reverse()
    .find((r) => userStore.beans >= r.recommendedBeans * 0.4)
  emit('enter-room', eligible || ROOM_CONFIGS[0])
}
</script>

<template>
  <div
    class="relative w-full h-full overflow-hidden flex flex-col justify-between select-none"
    :class="
      userStore.moyuMode
        ? 'bg-gradient-to-b from-[#0d1021] via-[#0b0d1b] to-[#080914]'
        : 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1d163b] via-[#11122b] to-[#080917]'
    "
  >
    <!-- 樱花夜宴背景柔光（深靛夜空 + 樱粉月华 + 淡金星辉） -->
    <div v-if="!userStore.moyuMode" class="absolute inset-0 pointer-events-none overflow-hidden">
      <div class="absolute -top-28 left-1/4 w-[520px] h-[520px] rounded-full bg-rose-400/15 blur-[130px]"></div>
      <div class="absolute bottom-0 right-1/4 w-[460px] h-[460px] rounded-full bg-indigo-500/20 blur-[120px]"></div>
      <div class="absolute top-1/3 right-1/3 w-[300px] h-[300px] rounded-full bg-amber-300/10 blur-[110px]"></div>
    </div>

    <!-- 1. 顶部街机导航栏 (玩家信息 + 欢乐豆资产 + 账单入口 + 摸鱼模式/老板键) -->
    <header
      class="relative z-20 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent backdrop-blur-sm border-b border-amber-400/20"
      :class="isCompact ? 'px-3 py-1.5 gap-2' : 'px-6 py-3 gap-4'"
    >
      <!-- 左侧玩家头像与称号 (摸鱼模式下隐藏头像) -->
      <div class="flex items-center gap-2.5 min-w-0">
        <div
          v-if="!userStore.moyuMode"
          class="relative group cursor-pointer shrink-0"
          @click="openModal('achievements')"
        >
          <img
            :src="resolvePublicAsset(userStore.avatar)"
            alt="达文西"
            class="rounded-xl object-cover border-2 border-amber-300 shadow shrink-0"
            :class="isCompact ? 'w-9 h-9' : 'w-12 h-12'"
          />
          <span
            class="absolute -bottom-1 -right-1 px-1 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] shadow"
          >
            尊享
          </span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span
              class="font-black tracking-wide truncate"
              :class="[
                isCompact ? 'text-sm' : 'text-lg',
                userStore.moyuMode ? 'text-slate-200 font-mono' : 'text-white',
              ]"
            >
              {{ userStore.nickname }}
            </span>
            <span
              v-if="!userStore.moyuMode"
              class="px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[10px] font-bold truncate"
            >
              {{ userStore.playerTitle }}
            </span>
          </div>
          <div
            class="flex items-center gap-2 text-[11px]"
            :class="userStore.moyuMode ? 'text-slate-400 font-mono' : 'text-amber-200/80'"
          >
            <span>胜率 {{ userStore.winRate }}% ({{ userStore.winGames }}/{{ userStore.totalGames }})</span>
            <span v-if="userStore.currentStreak > 0" class="text-orange-400 font-bold">
              {{ userStore.moyuMode ? `+${userStore.currentStreak}连` : `🔥 ${userStore.currentStreak}连胜` }}
            </span>
          </div>
        </div>
      </div>

      <!-- 中部欢乐豆大胶囊 + 快捷账单按钮 -->
      <div class="flex items-center gap-2 shrink-0">
        <div
          class="flex items-center gap-2 rounded-full shadow-inner"
          :class="[
            isCompact ? 'px-3 py-1' : 'px-4 py-1.5',
            userStore.moyuMode
              ? 'bg-slate-900 border border-slate-700 font-mono'
              : 'bg-black/60 border-2 border-amber-400',
          ]"
        >
          <div
            v-if="!userStore.moyuMode"
            class="rounded-full bg-gradient-to-b from-yellow-300 to-amber-500 flex items-center justify-center text-red-950 shadow shrink-0"
            :class="isCompact ? 'w-5 h-5' : 'w-7 h-7'"
          >
            <Icon icon="mdi:peanut" :class="isCompact ? 'text-sm' : 'text-lg'" />
          </div>
          <div>
            <div v-if="!isCompact" class="text-[10px] text-amber-200/70 leading-none">
              持有欢乐豆
            </div>
            <div
              class="font-black tracking-tight leading-tight"
              :class="[
                isCompact ? 'text-sm' : 'text-lg',
                userStore.moyuMode ? 'text-slate-200' : 'text-yellow-300',
              ]"
              :title="userStore.beans.toLocaleString()"
            >
              {{ formatChips(userStore.beans) }}
            </div>
          </div>

          <button
            class="px-2 py-0.5 rounded-full font-black text-[11px] flex items-center gap-0.5 transition"
            :class="
              userStore.moyuMode
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600'
                : 'bg-gradient-to-b from-yellow-300 to-amber-500 text-red-950 hover:brightness-110 shadow'
            "
            title="免费转盘领豆"
            @click="openModal('wheel')"
          >
            <Icon v-if="!userStore.moyuMode" icon="mdi:plus-circle" /> 领豆
          </button>

          <button
            class="px-2 py-0.5 rounded-full font-black text-[11px] flex items-center gap-0.5 transition"
            :class="
              userStore.moyuMode
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600'
                : 'bg-amber-500/20 hover:bg-amber-500/35 border border-amber-300/50 text-amber-200'
            "
            title="查看欢乐豆收支账单流水"
            @click="openModal('ledger')"
          >
            <Icon v-if="!userStore.moyuMode" icon="mdi:receipt-text-clock" /> 账单
          </button>
        </div>

        <button
          v-if="userStore.beans < 5000"
          class="px-2.5 py-1 rounded-full bg-gradient-to-r from-rose-500 to-red-600 border border-yellow-200 text-white font-black text-[11px] shadow animate-bounce flex items-center gap-1"
          @click="openModal('bankruptcy')"
        >
          <Icon icon="mdi:gift" /> 救济金
        </button>
      </div>

      <!-- 右侧功能按钮组 (摸鱼模式 + 老板键 + 牌型指南 + 音量) -->
      <div class="flex items-center gap-1.5 shrink-0">
        <!-- 摸鱼小窗模式切换 -->
        <button
          class="px-2.5 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1 transition"
          :class="
            userStore.moyuMode
              ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
              : 'bg-white/10 hover:bg-white/20 border-white/15 text-slate-200'
          "
          title="切换上班摸鱼紧凑小窗模式（精简视觉、紧凑排布）"
          @click="toggleMoyuMode"
        >
          <Icon icon="mdi:fish" class="text-base text-cyan-300" />
          <span>{{ userStore.moyuMode ? '摸鱼模式:开' : '摸鱼小窗' }}</span>
        </button>

        <!-- 老板键一键隐蔽 + 快捷键设置 -->
        <button
          class="px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-500/60 text-xs font-bold text-slate-200 flex items-center gap-1 transition"
          :title="`一键隐蔽 (当前快捷键: ${userStore.stealthKey} 或 \` 键，支持鼠标中键)`"
          @click="emit('toggle-boss')"
        >
          <Icon icon="mdi:file-excel-outline" class="text-base text-emerald-400" />
          <span class="hidden sm:inline">一键隐蔽</span>
        </button>

        <button
          class="px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition"
          :class="
            userStore.autoStealthOnLeave
              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
              : 'bg-white/10 hover:bg-white/20 border-white/15 text-slate-200'
          "
          title="自定义一键隐蔽快捷键、开启鼠标移出窗口自动隐蔽"
          @click="openModal('stealth')"
        >
          <Icon icon="mdi:shield-lock-outline" class="text-base text-cyan-300" />
          <span class="hidden md:inline">{{ userStore.autoStealthOnLeave ? '防窥:开' : '隐蔽设置' }}</span>
        </button>

        <button
          v-if="!isCompact"
          class="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center gap-1 text-xs font-bold transition"
          @click="openModal('rules')"
        >
          <Icon icon="mdi:cards-playing-outline" class="text-base text-amber-300" />
          <span>牌型指南</span>
        </button>

        <button
          class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-base transition"
          :class="bgmOn ? 'text-amber-300 border-amber-400/50' : 'text-slate-400'"
          title="背景音乐开关"
          @click="toggleBgm"
        >
          <Icon :icon="bgmOn ? 'mdi:music' : 'mdi:music-off'" />
        </button>
        <button
          class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-base transition"
          :class="soundOn ? 'text-emerald-300 border-emerald-400/50' : 'text-slate-400'"
          title="街机音效与语音开关"
          @click="toggleSound"
        >
          <Icon :icon="soundOn ? 'mdi:volume-high' : 'mdi:volume-off'" />
        </button>
      </div>
    </header>

    <!-- 提示横幅 -->
    <div
      v-if="lobbyAlert"
      class="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2 rounded-2xl bg-red-600/95 border-2 border-yellow-300 text-white text-xs font-black shadow-2xl animate-bounce"
    >
      {{ lobbyAlert }}
    </div>

    <!-- 2. 主体区域：自适应大屏（荷官+场次）与小窗摸鱼紧凑模式 -->
    <main
      class="relative z-10 flex-1 flex flex-col lg:flex-row items-center justify-center max-w-[1440px] w-full mx-auto overflow-hidden"
      :class="isCompact ? 'gap-2.5 px-3 py-1.5' : 'gap-6 px-8 py-2'"
    >
      <!-- 大屏模式：左侧看板娘紫灵仙子 & 樱花夜宴标题 -->
      <div
        v-if="!isCompact"
        class="w-full lg:w-[310px] flex flex-col items-center text-center shrink-0"
      >
        <div class="relative">
          <div class="absolute -inset-2 rounded-full bg-gradient-to-r from-rose-300 via-purple-400 to-amber-300 blur-xl opacity-45 animate-pulse"></div>
          <img
            :src="dealerAvatar"
            alt="紫灵仙子"
            class="relative w-44 h-44 lg:w-52 lg:h-52 rounded-3xl object-cover border-2 border-rose-200/80 shadow-[0_15px_40px_rgba(12,10,30,0.8)] animate-float"
          />
          <div
            class="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-1 rounded-full bg-gradient-to-r from-[#2e1745] via-[#5c204e] to-[#2e1745] border border-amber-200/80 text-rose-100 font-black text-xs shadow-lg"
          >
            ✦ 执牌仙子 · 紫灵 ✦
          </div>
        </div>

        <h1
          class="mt-5 text-4xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-rose-100 via-amber-200 to-rose-300 drop-shadow-[0_4px_14px_rgba(244,114,182,0.35)]"
        >
          樱月仙途 · 德州
        </h1>
        <p class="mt-1 text-xs text-rose-200/75 font-bold tracking-wider">
          凡人修仙传全明星 · 樱花夜宴六人雅桌
        </p>

        <!-- 6大凡人修仙角色头像预览条 -->
        <div class="mt-3 p-2.5 rounded-2xl bg-[#12152e]/75 backdrop-blur-md border border-rose-200/20 w-full">
          <div class="text-xs text-rose-200 font-bold mb-1.5 flex items-center justify-center gap-1">
            <Icon icon="mdi:sparkles" class="text-amber-200" /> 凡人修仙六大名宿共赴夜宴
          </div>
          <div class="flex items-center justify-center gap-2">
            <div v-for="ai in AI_PERSONAS" :key="ai.id" class="group relative">
              <img
                :src="ai.avatar"
                :alt="ai.name"
                class="w-9 h-9 rounded-xl object-cover border border-rose-200/50 group-hover:scale-110 group-hover:border-amber-300 transition shadow"
              />
              <div
                class="opacity-0 group-hover:opacity-100 pointer-events-none transition absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-lg bg-[#141730] border border-rose-300/60 text-[11px] z-30 shadow-xl"
              >
                <div class="font-black text-amber-200">{{ ai.title }}·{{ ai.name }}</div>
                <div class="text-[10px] text-rose-200/80">{{ ai.styleTag }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：四大阶梯场次选择卡片 (摸鱼模式下伪装为深灰数据节点卡片组) -->
      <div
        class="flex-1 grid grid-cols-2 w-full max-w-4xl"
        :class="isCompact ? 'gap-2.5' : 'gap-4'"
      >
        <div
          v-for="(room, rIdx) in ROOM_CONFIGS"
          :key="room.id"
          class="group relative cursor-pointer transition-all duration-200 overflow-hidden flex flex-col justify-between"
          :class="[
            userStore.moyuMode
              ? 'rounded-xl bg-[#12162c]/95 border border-indigo-400/25 hover:border-rose-300/50 font-mono p-3 min-h-[110px]'
              : [
                  'rounded-2xl sm:rounded-3xl bg-gradient-to-br border shadow-xl hover:-translate-y-1 hover:shadow-[0_0_28px_rgba(253,164,175,0.35)]',
                  room.themeGradient,
                  room.borderColor,
                  isCompact ? 'p-3 min-h-[118px]' : 'p-5 min-h-[180px]',
                ],
          ]"
          @click="handleSelectRoom(room)"
        >
          <!-- 右上角装饰图标水印 (摸鱼模式隐藏) -->
          <Icon
            v-if="!userStore.moyuMode"
            :icon="room.icon"
            class="absolute -right-3 -bottom-3 text-white/15 group-hover:scale-110 transition-transform duration-300"
            :class="isCompact ? 'text-6xl' : 'text-8xl'"
          />

          <div class="relative z-10">
            <div class="flex items-center justify-between">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-bold"
                :class="
                  userStore.moyuMode
                    ? 'bg-slate-800 border border-slate-700 text-slate-400'
                    : 'rounded-full bg-black/35 border border-white/25 text-yellow-200 font-black'
                "
              >
                {{ userStore.moyuMode ? `场次 0${rIdx + 1}` : room.badgeText }}
              </span>
              <span class="text-[11px] font-bold text-slate-400 flex items-center gap-0.5">
                6人桌
              </span>
            </div>

            <h2
              class="font-black"
              :class="[
                isCompact ? 'mt-1 text-base' : 'mt-2 text-2xl sm:text-3xl',
                userStore.moyuMode ? 'text-slate-200' : 'text-white drop-shadow',
              ]"
            >
              {{ room.name }}
            </h2>
            <p
              class="text-[11px]"
              :class="userStore.moyuMode ? 'text-slate-500' : 'text-white/85 font-medium'"
            >
              {{ room.subtitle }}
            </p>
          </div>

          <div
            class="relative z-10 border-t flex items-end justify-between"
            :class="[
              isCompact ? 'mt-2 pt-1.5' : 'mt-4 pt-3',
              userStore.moyuMode ? 'border-slate-800' : 'border-white/20',
            ]"
          >
            <div class="space-y-0.5">
              <div class="text-[11px]" :class="userStore.moyuMode ? 'text-slate-400' : 'text-white/85'">
                盲注：<span
                  class="font-black"
                  :class="userStore.moyuMode ? 'text-slate-200' : 'text-yellow-200'"
                >{{ formatChips(room.smallBlind) }}/{{ formatChips(room.bigBlind) }}</span>
              </div>
              <div class="text-[10px]" :class="userStore.moyuMode ? 'text-slate-500' : 'text-white/75'">
                准入：<span class="font-bold">{{ formatChips(room.minBeans) }}+</span>
              </div>
            </div>

            <div
              class="rounded-lg font-black transition flex items-center gap-1"
              :class="[
                isCompact ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm',
                userStore.moyuMode
                  ? 'bg-[#1a1f3d] hover:bg-[#23294f] border border-rose-200/30 text-rose-100'
                  : 'rounded-xl bg-gradient-to-r from-rose-300 via-amber-200 to-rose-300 text-[#23102b] shadow-md group-hover:scale-105',
              ]"
            >
              <span>{{ userStore.moyuMode ? '接入' : '入座' }}</span>
              <Icon v-if="!userStore.moyuMode" icon="mdi:arrow-right-bold-circle" />
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 3. 底部黄金 Dock 导航 + 账单流水 + 快速开始按钮 -->
    <footer
      class="relative z-20 bg-gradient-to-t from-black/85 via-black/50 to-transparent flex flex-wrap items-center justify-between gap-2 max-w-[1440px] w-full mx-auto"
      :class="isCompact ? 'px-3 py-2' : 'px-8 py-3.5'"
    >
      <!-- 左侧外围系统入口按钮 -->
      <div class="flex items-center flex-wrap" :class="isCompact ? 'gap-1.5' : 'gap-2.5'">
        <button
          class="rounded-xl bg-gradient-to-b from-amber-500/25 to-amber-700/25 hover:from-amber-500/40 hover:to-amber-600/40 border border-amber-400/60 flex items-center gap-1.5 font-black text-amber-200 shadow transition"
          :class="isCompact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'"
          @click="openModal('ledger')"
        >
          <Icon icon="mdi:receipt-text-clock" class="text-base text-yellow-300" />
          <span>账单流水</span>
          <span
            class="px-1.5 py-0.5 rounded-full text-[10px] font-mono"
            :class="
              userStore.netGameProfit >= 0
                ? 'bg-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/30 text-rose-300'
            "
          >
            {{ userStore.netGameProfit >= 0 ? '+' : '' }}{{ formatChips(userStore.netGameProfit) }}
          </span>
        </button>

        <button
          class="rounded-xl bg-gradient-to-b from-amber-500/20 to-orange-700/20 hover:from-amber-500/35 hover:to-orange-600/35 border border-amber-400/50 flex items-center gap-1.5 font-black text-amber-200 shadow transition"
          :class="isCompact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'"
          @click="openModal('wheel')"
        >
          <Icon icon="mdi:ferris-wheel" class="text-base text-yellow-300 animate-spin" style="animation-duration: 8s" />
          <span>幸运转盘</span>
        </button>

        <button
          class="rounded-xl bg-gradient-to-b from-purple-500/25 to-indigo-700/25 hover:from-purple-500/40 hover:to-indigo-600/40 border border-purple-400/60 flex items-center gap-1.5 font-black text-purple-200 shadow transition"
          :class="isCompact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'"
          @click="openModal('shop')"
        >
          <Icon icon="mdi:tshirt-crew" class="text-base text-pink-300" />
          <span>装扮商城</span>
        </button>

        <button
          class="rounded-xl bg-gradient-to-b from-emerald-500/25 to-teal-700/25 hover:from-emerald-500/40 hover:to-teal-600/40 border border-emerald-400/60 flex items-center gap-1.5 font-black text-emerald-200 shadow transition"
          :class="isCompact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'"
          @click="openModal('achievements')"
        >
          <Icon icon="mdi:medal" class="text-base text-emerald-300" />
          <span>荣誉 ({{ userStore.unlockedAchievements.length }}/{{ ACHIEVEMENTS.length }})</span>
        </button>

        <button
          class="rounded-xl bg-gradient-to-b from-rose-500/25 to-red-700/25 hover:from-rose-500/40 hover:to-red-600/40 border border-rose-400/60 flex items-center gap-1.5 font-black text-rose-200 shadow transition"
          :class="isCompact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'"
          @click="openModal('bankruptcy')"
        >
          <Icon icon="mdi:hand-coin" class="text-base text-yellow-300" />
          <span>救济豆</span>
        </button>
      </div>

      <!-- 右侧：斗地主标志性“快速开始”黄金大按钮 (摸鱼模式下为低调深灰按钮) -->
      <button
        class="font-black transition flex items-center gap-2"
        :class="[
          isCompact ? 'px-5 py-2 text-sm' : 'px-8 py-3 text-xl',
          userStore.moyuMode
            ? 'rounded-xl bg-[#1a1f3d] hover:bg-[#252b52] text-rose-100 border border-rose-200/35 font-mono'
            : 'rounded-2xl bg-gradient-to-r from-rose-300 via-amber-200 to-rose-300 text-[#23102b] border border-white/60 shadow-[0_0_24px_rgba(253,164,175,0.45)] hover:brightness-105 active:scale-95',
        ]"
        @click="quickStartGame"
      >
        <Icon v-if="!userStore.moyuMode" icon="mdi:play-circle" :class="isCompact ? 'text-xl' : 'text-2xl'" />
        <span>{{ userStore.moyuMode ? '[快速接入]' : '快速开始' }}</span>
      </button>
    </footer>

    <!-- 弹窗组件 -->
    <LobbyModals :active-modal="activeModal" @close="activeModal = 'none'" />
  </div>
</template>
