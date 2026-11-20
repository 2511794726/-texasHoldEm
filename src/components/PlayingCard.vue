<script setup lang="ts">
import { computed } from 'vue'
import { Card } from '@/core/card'
import { useUserStore } from '@/store/user'

const props = withDefaults(
  defineProps<{
    card?: Card
    faceDown?: boolean
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
    highlighted?: boolean
    coreMatched?: boolean
    dimmed?: boolean
    badgeText?: string
    badgeClass?: string
  }>(),
  {
    faceDown: false,
    size: 'md',
    highlighted: false,
    coreMatched: false,
    dimmed: false,
    badgeText: '',
    badgeClass: '',
  }
)

const userStore = useUserStore()

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'w-10 h-14 rounded-lg text-xs'
    case 'sm':
      return 'w-13 h-18 rounded-xl text-sm'
    case 'md':
      return 'w-16 h-24 rounded-xl text-base'
    case 'lg':
      return 'w-20 h-28 rounded-xl text-lg'
    case 'xl':
      return 'w-24 h-36 rounded-2xl text-xl'
    case '2xl':
      return 'w-32 h-44 rounded-2xl text-2xl'
  }
})

// 为 w-13 / h-18 提供精确像素尺寸兼容，避免 Tailwind 缺失工具类
const customDimensionStyle = computed(() => {
  if (props.size === 'sm') {
    return { width: '52px', height: '74px' }
  }
  return {}
})

const cardBackGradient = computed(() => {
  switch (userStore.equippedCardBack) {
    case 'card_royal_gold':
      return 'from-[#2e1f47] via-[#4c2859] to-[#1e1b4b] border-amber-300/80'
    case 'card_cyber_neon':
      return 'from-[#1e1b4b] via-[#4a1d6a] to-[#0f2942] border-pink-300/80'
    default:
      return 'from-[#1a1638] via-[#311b4f] to-[#17122e] border-rose-300/80'
  }
})

// 摸鱼模式下的四色花色配置（蓝白=♠黑桃、亮红=♥红桃、亮绿=♣梅花、亮橙=♦方片）
const moyuFourColor = computed(() => {
  if (!props.card) {
    return {
      text: 'text-slate-200',
      suitText: 'text-slate-400',
      border: 'border-slate-700',
      bar: 'bg-slate-500',
    }
  }
  switch (props.card.suit) {
    case 'spades': // ♠ 蓝白
      return {
        text: 'text-sky-200',
        suitText: 'text-sky-300',
        border: 'border-sky-500/50',
        bar: 'bg-sky-400',
      }
    case 'hearts': // ♥ 亮红
      return {
        text: 'text-rose-400',
        suitText: 'text-rose-500',
        border: 'border-rose-500/50',
        bar: 'bg-rose-500',
      }
    case 'clubs': // ♣ 亮绿
      return {
        text: 'text-emerald-300',
        suitText: 'text-emerald-400',
        border: 'border-emerald-500/50',
        bar: 'bg-emerald-400',
      }
    case 'diamonds': // ♦ 亮橙
      return {
        text: 'text-amber-300',
        suitText: 'text-amber-400',
        border: 'border-amber-500/50',
        bar: 'bg-amber-400',
      }
  }
})

</script>

<template>
  <!-- ==================== A. 摸鱼模式：低饱和二次元极简星月牌面 ==================== -->
  <div
    v-if="userStore.moyuMode"
    class="relative select-none transition-all duration-200 transform font-mono shrink-0"
    :style="customDimensionStyle"
    :class="[
      sizeClasses,
      '!rounded-xl',
      highlighted
        ? '-translate-y-2 ring-2 ring-rose-300/90 shadow-[0_4px_18px_rgba(253,164,175,0.38)] z-10'
        : '',
      coreMatched && !highlighted
        ? '-translate-y-1 ring-1 ring-amber-200/75 z-10'
        : '',
      dimmed ? 'opacity-35 scale-95' : 'hover:-translate-y-0.5',
    ]"
  >
    <!-- 摸鱼模式：背面（低饱和星月符纹） -->
    <div
      v-if="faceDown || !card"
      class="w-full h-full rounded-xl border border-indigo-400/25 bg-[#12162b]/95 p-1 flex items-center justify-center overflow-hidden"
    >
      <div class="w-full h-full rounded-lg border border-rose-200/15 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(253,164,175,0.08),transparent_70%)]">
        <span class="text-xs text-rose-200/40 select-none">✦</span>
      </div>
    </div>

    <!-- 摸鱼模式：正面（深靛微光卡 + 四色清晰花色） -->
    <div
      v-else
      class="w-full h-full rounded-xl border flex flex-col justify-between p-1 sm:p-1.5 overflow-hidden relative bg-[#12172e]/95"
      :class="
        highlighted
          ? 'border-rose-300/90 bg-[#1a1d38]/95'
          : moyuFourColor.border
      "
    >
      <!-- 左上角：大号四色点数 + 花色符号 -->
      <div
        class="flex items-baseline gap-0.5 leading-none z-10 font-black tracking-tight"
        :class="moyuFourColor.text"
      >
        <span
          :class="
            size === '2xl'
              ? 'text-3xl'
              : size === 'xl'
                ? 'text-xl'
                : size === 'lg'
                  ? 'text-lg'
                  : size === 'md'
                    ? 'text-base'
                    : 'text-sm'
          "
        >
          {{ card.label }}
        </span>
        <span
          :class="
            size === '2xl'
              ? 'text-2xl'
              : size === 'xl' || size === 'lg'
                ? 'text-base'
                : 'text-xs'
          "
        >
          {{ card.suitSymbol }}
        </span>
      </div>

      <!-- 右下角：大幅放大的四色花色符号 (♠蓝白 / ♥亮红 / ♣亮绿 / ♦亮橙) -->
      <div class="flex items-end justify-end w-full mt-auto leading-none">
        <span
          class="leading-none font-black drop-shadow"
          :class="[
            moyuFourColor.suitText,
            size === '2xl'
              ? 'text-5xl'
              : size === 'xl'
                ? 'text-3xl'
                : size === 'lg'
                  ? 'text-2xl'
                  : size === 'md'
                    ? 'text-2xl'
                    : size === 'sm'
                      ? 'text-xl'
                      : 'text-lg',
          ]"
        >
          {{ card.suitSymbol }}
        </span>
      </div>
    </div>
  </div>

  <!-- ==================== B. 樱花夜宴模式：和风烫金二次元扑克牌 ==================== -->
  <div
    v-else
    class="relative select-none transition-all duration-300 transform shadow-xl shrink-0"
    :style="customDimensionStyle"
    :class="[
      sizeClasses,
      highlighted
        ? '-translate-y-2.5 ring-3 ring-rose-300 shadow-[0_0_26px_rgba(253,164,175,0.9)] z-10'
        : '',
      coreMatched && !highlighted
        ? '-translate-y-1.5 ring-2 ring-amber-300/90 shadow-[0_0_16px_rgba(251,191,36,0.6)]'
        : '',
      dimmed ? 'opacity-40 scale-95 grayscale-[35%]' : 'hover:-translate-y-1',
    ]"
  >
    <!-- 牌背 (Face Down) — 靛蓝烫金樱月法阵 -->
    <div
      v-if="faceDown || !card"
      class="w-full h-full rounded-[inherit] border bg-gradient-to-br p-1 flex items-center justify-center overflow-hidden shadow-inner"
      :class="cardBackGradient"
    >
      <div
        class="w-full h-full rounded-[inherit] border border-amber-200/40 flex flex-col items-center justify-center relative bg-[radial-gradient(circle_at_center,rgba(253,164,175,0.22)_0%,transparent_65%)]"
      >
        <div
          class="w-6 h-6 rounded-full bg-rose-300/15 backdrop-blur-sm border border-amber-200/60 flex items-center justify-center text-amber-200 font-black text-[11px] shadow-[0_0_10px_rgba(251,191,36,0.35)]"
        >
          ✦
        </div>
      </div>
    </div>

    <!-- 牌面 (Face Up) — 和纸象牙白 + 烫金细边，清晰优雅 -->
    <div
      v-else
      class="w-full h-full rounded-[inherit] bg-[#fffcf7] border border-amber-300/75 flex flex-col justify-between p-1 sm:p-1.5 overflow-hidden relative shadow-[0_4px_14px_rgba(15,10,35,0.45)]"
    >
      <!-- 顶部左上角大号点数 + 花色 -->
      <div
        class="flex flex-col items-start leading-none z-10"
        :class="card.color === 'red' ? 'text-red-600' : 'text-slate-950'"
      >
        <span
          class="font-black tracking-tighter leading-none"
          :class="
            size === '2xl'
              ? 'text-4xl'
              : size === 'xl'
                ? 'text-2xl'
                : size === 'lg'
                  ? 'text-xl'
                  : size === 'md'
                    ? 'text-lg'
                    : size === 'sm'
                      ? 'text-base'
                      : 'text-sm'
          "
        >
          {{ card.label }}
        </span>
        <span
          class="leading-none mt-0.5"
          :class="
            size === '2xl'
              ? 'text-2xl'
              : size === 'xl' || size === 'lg'
                ? 'text-base'
                : 'text-xs'
          "
        >
          {{ card.suitSymbol }}
        </span>
      </div>

      <!-- 右下角大号清晰花色（与左上角点数错位排布，绝不互相遮挡） -->
      <div
        class="self-end leading-none pointer-events-none"
        :class="card.color === 'red' ? 'text-red-600' : 'text-slate-900'"
      >
        <span
          class="drop-shadow-sm leading-none"
          :class="
            size === '2xl'
              ? 'text-6xl'
              : size === 'xl'
                ? 'text-4xl'
                : size === 'lg'
                  ? 'text-3xl'
                  : size === 'md'
                    ? 'text-2xl'
                    : size === 'sm'
                      ? 'text-xl'
                      : 'text-lg'
          "
        >
          {{ card.suitSymbol }}
        </span>
      </div>
    </div>
  </div>
</template>
