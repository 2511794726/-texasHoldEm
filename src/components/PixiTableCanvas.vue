<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as PIXI from 'pixi.js'
import gsap from 'gsap'
import { useGameStore } from '@/store/game'
import { useUserStore } from '@/store/user'
import { resolvePublicAsset } from '@/core/assets'

const gameStore = useGameStore()
const userStore = useUserStore()
const canvasContainer = ref<HTMLDivElement | null>(null)

let app: PIXI.Application | null = null
let starContainer: PIXI.Container | null = null
let potBgAuraContainer: PIXI.Container | null = null
let flyingContainer: PIXI.Container | null = null
const processedChipEventIds = new Set<string>()
let ambientTicker: ((ticker: PIXI.Ticker) => void) | null = null
let auraGraphic: PIXI.Graphics | null = null
let auraPhase = 0

export type ChipDenom = 100 | 500 | 1000 | 5000

const CHIP_ASSET_MAP: Record<ChipDenom, string> = {
  100: resolvePublicAsset('assets/chips/chip_100.webp'),
  500: resolvePublicAsset('assets/chips/chip_500.webp'),
  1000: resolvePublicAsset('assets/chips/chip_1000.webp'),
  5000: resolvePublicAsset('assets/chips/chip_5000.webp'),
}

const CHIP_COLOR_MAP: Record<ChipDenom, number> = {
  100: 0x10b981, // 翡翠绿
  500: 0x9333ea, // 皇家紫
  1000: 0xf59e0b, // 流光金
  5000: 0xef4444, // 至尊红金
}

const chipTextures: Partial<Record<ChipDenom, PIXI.Texture>> = {}

async function preloadChipTextures() {
  const denoms: ChipDenom[] = [100, 500, 1000, 5000]
  await Promise.all(
    denoms.map(async (d) => {
      try {
        const tex = await PIXI.Assets.load<PIXI.Texture>(CHIP_ASSET_MAP[d])
        chipTextures[d] = tex
      } catch {
        // fallback if load fails
      }
    })
  )
}

// 将任意下注金额拆解为真实的 5000 / 1000 / 500 / 100 筹码组合
function decomposeAmountToChipDenoms(amount: number, maxCount = 14): ChipDenom[] {
  const result: ChipDenom[] = []
  let rem = Math.max(100, amount)

  const denoms: ChipDenom[] = [5000, 1000, 500, 100]
  for (const d of denoms) {
    while (rem >= d && result.length < maxCount) {
      result.push(d)
      rem -= d
    }
  }

  if (result.length === 0) {
    result.push(100)
  }
  return result
}

// 将金额按面额精确拆解为 { 面额: 枚数 }，余数 (<100) 单独返回，保证 Σ(面额×枚数)+余数 === amount
function decomposeAmountExact(amount: number): {
  counts: { denom: ChipDenom; count: number }[]
  remainder: number
} {
  let rem = Math.max(0, Math.floor(amount))
  const counts: { denom: ChipDenom; count: number }[] = []
  const denoms: ChipDenom[] = [5000, 1000, 500, 100]
  for (const d of denoms) {
    const c = Math.floor(rem / d)
    if (c > 0) {
      counts.push({ denom: d, count: c })
      rem -= c * d
    }
  }
  return { counts, remainder: rem }
}

const POT_STACK_MAX_LAYERS = 12

// 实际6个座位相对于牌桌容器的坐标映射 (0:正下玩家, 1:左下AI, 2:左上AI, 3:上左AI, 4:右上AI, 5:右下AI)
function getSeatPixelPos(seatIndex: number): { x: number; y: number } {
  const w = app?.screen.width || 960
  const h = app?.screen.height || 450

  const map: Record<number, { x: number; y: number }> = {
    [-1]: { x: w * 0.5, y: h * 0.42 }, // 赌桌中央筹码堆放与散落区
    0: { x: w * 0.5, y: h * 0.96 }, // 玩家本人 (正下边缘投出)
    1: { x: w * 0.04, y: h * 0.82 }, // 左下 AI
    2: { x: w * 0.04, y: h * 0.22 }, // 左上 AI
    3: { x: w * 0.28, y: h * 0.05 }, // 上左 AI
    4: { x: w * 0.96, y: h * 0.22 }, // 右上 AI
    5: { x: w * 0.96, y: h * 0.82 }, // 右下 AI
  }
  return map[seatIndex] || { x: w * 0.5, y: h * 0.42 }
}

// 创建一枚带立体侧边厚度、真实投影与圆形裁剪贴图的 3D 筹码精灵
function createRealisticChipNode(
  denom: ChipDenom,
  customRadius?: number
): PIXI.Container {
  const node = new PIXI.Container()
  const radius =
    customRadius || (denom === 5000 ? 19 : denom === 1000 ? 18 : 17)
  const rimColor = CHIP_COLOR_MAP[denom]

  // 1. 桌面真实底部软阴影
  const shadow = new PIXI.Graphics()
  shadow.ellipse(2, 3.5, radius + 1.5, radius * 0.92)
  shadow.fill({ color: 0x000000, alpha: 0.55 })
  node.addChild(shadow)

  // 2. 筹码 3D 侧边厚度环
  const sideEdge = new PIXI.Graphics()
  sideEdge.circle(0, 2, radius)
  sideEdge.fill({ color: rimColor })
  sideEdge.stroke({ width: 1.4, color: 0xfef08a, alpha: 0.9 })
  node.addChild(sideEdge)

  // 3. AI 生成的真实筹码纹理 + 精确圆形遮罩
  const tex = chipTextures[denom]
  const faceContainer = new PIXI.Container()
  if (tex) {
    const sprite = new PIXI.Sprite(tex)
    sprite.anchor.set(0.5)
    const diameter = radius * 2 * 1.09
    sprite.width = diameter
    sprite.height = diameter

    const mask = new PIXI.Graphics()
    mask.circle(0, 0, radius)
    mask.fill({ color: 0xffffff })

    faceContainer.addChild(sprite)
    faceContainer.addChild(mask)
    sprite.mask = mask
  } else {
    const g = new PIXI.Graphics()
    g.circle(0, 0, radius)
    g.fill({ color: rimColor })
    g.stroke({ width: 2.2, color: 0xffffff })
    faceContainer.addChild(g)
  }

  // 4. 顶部金属高光细外圈
  const topRim = new PIXI.Graphics()
  topRim.circle(0, 0, radius)
  topRim.stroke({
    width: denom >= 1000 ? 1.6 : 1.1,
    color: denom >= 1000 ? 0xfde047 : 0xffffff,
    alpha: 0.85,
  })
  faceContainer.addChild(topRim)

  node.addChild(faceContainer)
  return node
}

// 创建一摞具有 3D 堆叠高度且带轻微错位倾倒感的“筹码柱” (用于赌桌背景散乱堆放 & All-in 双手整排平推)
function create3DChipColumnStack(
  denom: ChipDenom,
  layers: number,
  radius = 17,
  messyFactor = 1
): PIXI.Container {
  const stack = new PIXI.Container()
  for (let l = 0; l < layers; l++) {
    const chip = createRealisticChipNode(denom, radius)
    // 每往上一层 Y 轴向上偏移 3.4px，且 X 轴带有自然的错位歪斜感
    chip.x = (Math.random() - 0.5) * 4.5 * messyFactor
    chip.y = -l * 3.4
    chip.rotation = (Math.random() - 0.5) * 0.9
    stack.addChild(chip)
  }
  return stack
}

// 筹码砸到桌面时的扩散波纹与碰撞火花
function triggerTableDropPhysics(
  landX: number,
  landY: number,
  denom: ChipDenom,
  isBigBet: boolean
) {
  if (!flyingContainer) return
  const colorHex = CHIP_COLOR_MAP[denom]

  // 1. 桌面扩散波纹
  const ring = new PIXI.Graphics()
  ring.circle(0, 0, isBigBet ? 26 : 19)
  ring.stroke({ width: isBigBet ? 3.2 : 2, color: isBigBet ? 0xfde047 : colorHex })
  ring.x = landX
  ring.y = landY
  ring.scale.set(0.45)
  flyingContainer.addChild(ring)

  gsap.to(ring, {
    alpha: 0,
    duration: isBigBet ? 0.52 : 0.35,
    ease: 'power2.out',
    onUpdate() {
      const s = 0.45 + this.progress() * (isBigBet ? 2.6 : 1.65)
      ring.scale.set(s)
    },
    onComplete: () => {
      ring.destroy()
    },
  })

  // 3. 金色碰撞火花粒子
  const sparkCount = isBigBet ? 12 : 4
  for (let i = 0; i < sparkCount; i++) {
    const spark = new PIXI.Graphics()
    spark.circle(0, 0, isBigBet ? 3 : 2)
    spark.fill({ color: i % 2 === 0 ? 0xfef08a : colorHex })
    spark.x = landX
    spark.y = landY
    flyingContainer.addChild(spark)

    const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.4
    const dist = (isBigBet ? 42 : 20) + Math.random() * 24

    gsap.to(spark, {
      x: landX + Math.cos(angle) * dist,
      y: landY + Math.sin(angle) * dist * 0.7,
      alpha: 0,
      duration: 0.34 + Math.random() * 0.18,
      ease: 'power2.out',
      onComplete: () => {
        spark.destroy()
      },
    })
  }
}

// 创建“双手推弧线气浪”矢量特效（All-in 时模拟双手把整排筹码柱从座位推向赌桌中央！）
function createTwoHandsPushWave(angleRad: number): PIXI.Container {
  const container = new PIXI.Container()
  container.rotation = angleRad

  // 左右两只推掌金色气浪弧线
  const g = new PIXI.Graphics()
  // 左手推掌弧
  g.arc(-10, -24, 20, -0.45 * Math.PI, 0.45 * Math.PI)
  g.stroke({ width: 5, color: 0xfde047, alpha: 0.95 })
  // 右手推掌弧
  g.arc(-10, 24, 20, -0.45 * Math.PI, 0.45 * Math.PI)
  g.stroke({ width: 5, color: 0xfde047, alpha: 0.95 })
  // 前方主冲击气浪
  g.arc(4, 0, 42, -0.42 * Math.PI, 0.42 * Math.PI)
  g.stroke({ width: 3.5, color: 0xef4444, alpha: 0.85 })

  container.addChild(g)
  return container
}

// All-in 专属特效：「双手把整排 3D 筹码柱平推滑入赌桌中央」
// 筹码柱的面额与高度严格来自本次全下金额的精确拆解，落地后并入中央底池筹码柱
function animateAllInTwoHandedPush(fromSeat: number, amount: number) {
  if (!app || !flyingContainer) return

  const startPos = getSeatPixelPos(fromSeat)
  const endPos = getSeatPixelPos(-1)

  const dirX = endPos.x - startPos.x
  const dirY = endPos.y - startPos.y
  const dirLen = Math.max(1, Math.hypot(dirX, dirY))
  const normX = dirX / dirLen
  const normY = dirY / dirLen
  // 垂直于推进方向的横向向量（用于并排摆放筹码柱）
  const perpX = -normY
  const perpY = normX
  const angleRad = Math.atan2(dirY, dirX)

  // 1. 生成“双手推行组”（按实际面额组成的筹码塔 + 身后的双手推行金色气浪）
  const pushGroup = new PIXI.Container()
  pushGroup.x = startPos.x
  pushGroup.y = startPos.y
  flyingContainer.addChild(pushGroup)

  const pushWave = createTwoHandsPushWave(angleRad)
  pushWave.x = -normX * 18
  pushWave.y = -normY * 18
  pushGroup.addChild(pushWave)

  const { counts } = decomposeAmountExact(amount)
  const columns = counts.length > 0 ? counts : [{ denom: 100 as ChipDenom, count: 1 }]
  const spacing = 24
  columns.forEach(({ denom, count }, idx) => {
    const offset = (idx - (columns.length - 1) / 2) * spacing
    const col = create3DChipColumnStack(
      denom,
      Math.min(count, POT_STACK_MAX_LAYERS),
      18,
      0.8
    )
    col.x = perpX * offset
    col.y = perpY * offset
    pushGroup.addChild(col)
  })

  // 目标平推停靠位置（贴近赌桌中央）
  const targetX = endPos.x - normX * 22
  const targetY = endPos.y - normY * 14

  // 2. 沿桌面加速平推滑行，并沿途留下金色摩擦尾迹
  let trailStep = 0
  gsap.to(pushGroup, {
    x: targetX,
    y: targetY,
    duration: 0.52,
    ease: 'power3.out',
    onUpdate: () => {
      trailStep++
      if (trailStep % 3 === 0 && flyingContainer) {
        const trail = new PIXI.Graphics()
        trail.circle(0, 0, 10 + Math.random() * 8)
        trail.fill({ color: 0xfde047, alpha: 0.28 })
        trail.x = pushGroup.x + (Math.random() - 0.5) * 35
        trail.y = pushGroup.y + (Math.random() - 0.5) * 25
        flyingContainer.addChild(trail)
        gsap.to(trail, {
          alpha: 0,
          duration: 0.25,
          onComplete: () => trail.destroy(),
        })
      }
    },
    onComplete: () => {
      // 3. 推到中央：冲击波纹 + 筹码塔淡出融入底池胶囊
      triggerTableDropPhysics(targetX, targetY, 5000, true)
      gsap.to(pushGroup, {
        alpha: 0,
        duration: 0.2,
        onComplete: () => {
          pushGroup.destroy({ children: true })
        },
      })
    },
  })
}

// 播放筹码动画：
// - 结算时：中央底池筹码按赢家实际所得金额飞向赢家
// - All-in 全下时：双手整排把 3D 筹码柱平推滑入桌面
// - 普通下注/跟注/加注时：按真实面额将筹码旋转扔进赌桌，落地后并入中央底池筹码柱
function animateChipFly(
  fromSeat: number,
  toSeat: number,
  amount: number,
  isAllIn = false
) {
  if (!app || !flyingContainer) return

  const startPos = getSeatPixelPos(fromSeat)
  const endPos = getSeatPixelPos(toSeat)

  // 结算派彩：按该赢家实际赢得的金额从底池中央飞出对应面额的筹码
  if (fromSeat === -1) {
    const payoutDenoms = decomposeAmountToChipDenoms(amount, 12)
    payoutDenoms.forEach((denom, idx) => {
      const chip = createRealisticChipNode(denom)
      chip.x = startPos.x + (Math.random() - 0.5) * 28
      chip.y = startPos.y + (Math.random() - 0.5) * 14 - idx * 2
      flyingContainer!.addChild(chip)
      gsap.to(chip, {
        x: endPos.x + (Math.random() - 0.5) * 30,
        y: endPos.y + (Math.random() - 0.5) * 20,
        rotation: Math.PI * 1.5,
        alpha: 0,
        delay: idx * 0.03,
        duration: 0.5,
        ease: 'back.in(1.1)',
        onComplete: () => {
          chip.destroy()
        },
      })
    })
    return
  }

  // 如果是 All-in 全下：调用专属的“双手整排推出去”特效！
  if (isAllIn) {
    animateAllInTwoHandedPush(fromSeat, amount)
    return
  }

  // 普通下注/加注：按真实面额拆解为 5000 / 1000 / 500 / 100 筹码旋转扔进底池中央
  const denoms = decomposeAmountToChipDenoms(amount, 10)
  const bb = Math.max(1, gameStore.currentRoom.bigBlind)
  const isBigBet = amount >= bb * 4

  denoms.forEach((denom, i) => {
    const chip = createRealisticChipNode(denom)
    const sx = startPos.x + (Math.random() - 0.5) * 22
    const sy = startPos.y + (Math.random() - 0.5) * 18
    chip.x = sx
    chip.y = sy
    chip.scale.set(0.65)
    flyingContainer!.addChild(chip)

    // 直接飞向底池中央胶囊位置，落地爆光后融入底池
    const landX = endPos.x + (Math.random() - 0.5) * 36
    const landY = endPos.y + (Math.random() - 0.5) * 14

    const arcHeight = 46 + Math.random() * 34
    const flyDur = 0.34 + i * 0.038
    const isLast = i === denoms.length - 1

    const proxy = { t: 0 }
    gsap.to(proxy, {
      t: 1,
      duration: flyDur,
      ease: 'power2.in',
      onUpdate: () => {
        const p = proxy.t
        chip.x = sx + (landX - sx) * p
        chip.y = sy + (landY - sy) * p - Math.sin(p * Math.PI) * arcHeight
        const s = 0.78 + Math.sin(p * Math.PI) * 0.42
        chip.scale.set(s)
        chip.rotation = p * Math.PI * 2.2
      },
      onComplete: () => {
        if (i === 0 || (isBigBet && isLast)) {
          triggerTableDropPhysics(landX, landY, denom, isBigBet)
        }
        chip.destroy()
      },
    })
  })
}

// 根据底池大小动态绘制桌面中央聚宝盘高光背景圈
function updatePotAura(phaseDelta: number) {
  if (!app || !auraGraphic) return
  auraPhase += phaseDelta * 0.04
  auraGraphic.clear()

  if (userStore.moyuMode) return
  const pot = gameStore.potTotal
  if (pot <= 0) return

  const bb = Math.max(1, gameStore.currentRoom.bigBlind)
  const ratio = pot / bb
  const center = getSeatPixelPos(-1)

  let color = 0xf472b6
  let baseRadiusX = 125
  let baseRadiusY = 44
  let alpha = 0.11

  if (ratio >= 80) {
    color = 0xfb7185
    baseRadiusX = 200
    baseRadiusY = 68
    alpha = 0.22
  } else if (ratio >= 30) {
    color = 0xf59e0b
    baseRadiusX = 175
    baseRadiusY = 58
    alpha = 0.18
  } else if (ratio >= 10) {
    color = 0xc084fc
    baseRadiusX = 150
    baseRadiusY = 50
    alpha = 0.15
  }

  const pulse = 1 + Math.sin(auraPhase) * 0.05

  auraGraphic.ellipse(
    center.x,
    center.y,
    baseRadiusX * pulse,
    baseRadiusY * pulse
  )
  auraGraphic.fill({ color, alpha })
  auraGraphic.stroke({
    width: ratio >= 30 ? 2 : 1.2,
    color: 0xfde047,
    alpha: alpha * 1.6,
  })
}

onMounted(async () => {
  if (!canvasContainer.value) return

  await preloadChipTextures()

  if (!canvasContainer.value) return
  app = new PIXI.Application()
  await app.init({
    resizeTo: canvasContainer.value,
    backgroundAlpha: 0,
    antialias: true,
  })

  canvasContainer.value.appendChild(app.canvas)

  starContainer = new PIXI.Container()
  potBgAuraContainer = new PIXI.Container()
  flyingContainer = new PIXI.Container()

  auraGraphic = new PIXI.Graphics()
  potBgAuraContainer.addChild(auraGraphic)

  app.stage.addChild(starContainer)
  app.stage.addChild(potBgAuraContainer)
  app.stage.addChild(flyingContainer)

  // 挂载前已发生的筹码事件不再重播
  gameStore.chipFlyQueue.forEach((e) => processedChipEventIds.add(e.id))

  // 创建樱花花瓣与星屑微光粒子（《雀魂》樱花夜宴氛围）
  const petals: {
    g: PIXI.Graphics
    speedY: number
    speedX: number
    rotSpeed: number
    phase: number
    isPetal: boolean
  }[] = []
  for (let i = 0; i < 24; i++) {
    const isPetal = i < 14
    const g = new PIXI.Graphics()
    if (isPetal) {
      const len = 4.5 + Math.random() * 4
      g.ellipse(0, 0, len, len * 0.55)
      g.fill({
        color: i % 2 === 0 ? 0xfda4af : 0xfbcfe8,
        alpha: 0.35 + Math.random() * 0.3,
      })
    } else {
      g.circle(0, 0, 1.3 + Math.random() * 1.8)
      g.fill({ color: 0xfde68a, alpha: 0.28 + Math.random() * 0.3 })
    }
    g.x = Math.random() * app.screen.width
    g.y = Math.random() * app.screen.height
    g.rotation = Math.random() * Math.PI * 2
    starContainer.addChild(g)
    petals.push({
      g,
      speedY: isPetal ? 0.28 + Math.random() * 0.38 : -(0.18 + Math.random() * 0.25),
      speedX: isPetal ? -(0.15 + Math.random() * 0.25) : 0,
      rotSpeed: isPetal ? (Math.random() - 0.5) * 0.035 : 0,
      phase: Math.random() * Math.PI * 2,
      isPetal,
    })
  }

  ambientTicker = (ticker: PIXI.Ticker) => {
    if (!app) return
    const dt = ticker.deltaTime
    if (starContainer) {
      starContainer.visible = !userStore.moyuMode
    }
    petals.forEach((s) => {
      s.phase += 0.025 * dt
      s.g.y += s.speedY * dt
      s.g.x += (s.speedX + (s.isPetal ? Math.sin(s.phase) * 0.22 : 0)) * dt
      s.g.rotation += s.rotSpeed * dt
      s.g.alpha = (s.isPetal ? 0.35 : 0.22) + Math.sin(s.phase) * 0.18
      if (s.isPetal && (s.g.y > app!.screen.height + 12 || s.g.x < -12)) {
        s.g.y = -10
        s.g.x = Math.random() * (app!.screen.width + 80)
      } else if (!s.isPetal && s.g.y < -10) {
        s.g.y = app!.screen.height + 10
        s.g.x = Math.random() * app!.screen.width
      }
    })
    updatePotAura(dt)
  }
  app.ticker.add(ambientTicker)
})

// 处理筹码飞行事件队列：按 id 逐个处理所有尚未播放的事件
// （修复：同一时刻多条事件只播最后一条、队列满 25 条后长度不变导致不再播放的问题）
function processChipFlyQueue() {
  const queue = gameStore.chipFlyQueue
  for (const ev of queue) {
    if (processedChipEventIds.has(ev.id)) continue
    processedChipEventIds.add(ev.id)
    animateChipFly(ev.fromSeat, ev.toSeat, ev.amount, !!ev.isAllIn)
  }
  // 清理已移出队列的旧 id，避免集合无限增长
  const alive = new Set(queue.map((e) => e.id))
  for (const id of processedChipEventIds) {
    if (!alive.has(id)) processedChipEventIds.delete(id)
  }
}

// 监听筹码飞行事件队列
watch(
  () => gameStore.chipFlyQueue.map((e) => e.id).join('|'),
  () => {
    processChipFlyQueue()
  }
)

onUnmounted(() => {
  if (app) {
    if (ambientTicker) {
      app.ticker.remove(ambientTicker)
    }
    app.destroy(true, { children: true })
    app = null
  }
  flyingContainer = null
})
</script>

<template>
  <div
    ref="canvasContainer"
    class="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-[inherit]"
  ></div>
</template>
