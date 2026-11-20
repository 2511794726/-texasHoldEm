<script setup lang="ts">
import { watch } from 'vue'
import confetti from 'canvas-confetti'
import { Icon } from '@iconify/vue'
import { useGameStore } from '@/store/game'

const gameStore = useGameStore()

// 当触发奥义大牌时，喷射樱花花瓣与星金礼花
watch(
  () => gameStore.activeVfx,
  (vfx) => {
    if (vfx === 'rocket' || vfx === 'bomb') {
      confetti({
        particleCount: 110,
        spread: 95,
        origin: { y: 0.52 },
        colors: ['#fda4af', '#f9a8d4', '#fde047', '#c084fc', '#fff1f2'],
      })
    } else if (vfx === 'plane') {
      confetti({
        particleCount: 60,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#fda4af', '#fde047', '#e9d5ff'],
      })
      confetti({
        particleCount: 60,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#fda4af', '#fde047', '#e9d5ff'],
      })
    }
  }
)
</script>

<template>
  <!-- 全屏 All-in 跑马樱月灵阵预警 -->
  <div
    v-if="gameStore.isAllInRunout"
    class="fixed inset-0 pointer-events-none z-30 border-[6px] border-rose-400/60 shadow-[inset_0_0_80px_rgba(244,114,182,0.45)] animate-pulse flex flex-col items-center justify-start pt-16"
  >
    <div
      class="px-7 py-1.5 rounded-full bg-gradient-to-r from-[#241338]/95 via-[#4c1d45]/95 to-[#241338]/95 border border-amber-300/80 shadow-[0_0_32px_rgba(251,113,133,0.75)] flex items-center gap-2.5"
    >
      <Icon icon="mdi:sparkles" class="text-xl text-rose-300" />
      <span class="text-lg font-black tracking-[0.2em] text-amber-100 drop-shadow">
        ✦ 决胜跑马 · 胜率锁定中 ✦
      </span>
      <Icon icon="mdi:sparkles" class="text-xl text-rose-300" />
    </div>
  </div>

  <!-- 《雀魂》风格二次元奥义 Cut-in 演出横幅 -->
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 scale-x-110 scale-y-75"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition duration-250 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div
      v-if="gameStore.activeVfx !== 'none'"
      class="fixed inset-0 pointer-events-none z-40 flex items-center justify-center bg-[#090b1a]/55 backdrop-blur-[2px]"
      :class="gameStore.activeVfx === 'bomb' ? 'animate-shake' : ''"
    >
      <!-- 全宽斜切奥义光带 -->
      <div
        class="relative w-full py-7 sm:py-9 flex flex-col items-center justify-center text-center border-y-2 overflow-hidden shadow-[0_0_90px_rgba(0,0,0,0.85)]"
        :class="
          gameStore.activeVfx === 'rocket'
            ? 'bg-gradient-to-r from-transparent via-[#3b1236]/95 to-transparent border-amber-300/90 shadow-[0_0_80px_rgba(251,191,36,0.55)]'
            : gameStore.activeVfx === 'bomb'
              ? 'bg-gradient-to-r from-transparent via-[#2c123d]/95 to-transparent border-rose-300/90 shadow-[0_0_75px_rgba(244,114,182,0.55)]'
              : gameStore.activeVfx === 'plane'
                ? 'bg-gradient-to-r from-transparent via-[#1c1b4b]/95 to-transparent border-pink-300/80 shadow-[0_0_65px_rgba(192,132,252,0.5)]'
                : 'bg-gradient-to-r from-transparent via-[#15223d]/95 to-transparent border-amber-200/70'
        "
      >
        <!-- 二次元速度线装饰背景 -->
        <div
          class="pointer-events-none absolute inset-0 opacity-20 bg-[repeating-linear-gradient(-25deg,transparent,transparent_18px,rgba(253,224,71,0.35)_18px,rgba(253,224,71,0.35)_20px)]"
        ></div>

        <!-- 顶部星月纹章 -->
        <div class="relative z-10 flex items-center gap-3 text-xs tracking-[0.35em] font-black text-rose-200/90 mb-1.5">
          <span>── ✦</span>
          <span>
            {{
              gameStore.activeVfx === 'rocket'
                ? '绝世奥义'
                : gameStore.activeVfx === 'bomb'
                  ? '剑阵破空'
                  : gameStore.activeVfx === 'plane'
                    ? '樱月结界'
                    : '灵光一闪'
            }}
          </span>
          <span>✦ ──</span>
        </div>

        <!-- 主标题 -->
        <h2
          class="relative z-10 text-4xl sm:text-5xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-rose-200 to-amber-200 drop-shadow-[0_4px_16px_rgba(244,114,182,0.65)]"
        >
          {{ gameStore.vfxTitle }}
        </h2>

        <!-- 副标题 -->
        <p class="relative z-10 mt-2 text-base sm:text-xl font-bold tracking-wider text-rose-100/90">
          {{ gameStore.vfxSubtitle }}
        </p>
      </div>
    </div>
  </Transition>
</template>
