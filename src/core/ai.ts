import { Card } from './card'
import { evaluateHand, evaluatePreFlopStrength, HandCategory } from './evaluator'
import { resolvePublicAsset } from '@/core/assets'

export type AIStyleTag =
  | '铁血刀客 · 硬汉跟注'
  | '掩月仙子 · 紧凶凌厉'
  | '极阴老祖 · 狂傲松凶'
  | '器灵狐仙 · 诡变诈唬'
  | '青元剑尊 · 稳健推演'
  | '锦鲤佳人 · 追梦少女'

export interface AIPersona {
  id: string
  name: string
  title: string
  avatar: string
  styleTag: AIStyleTag
  tagColor: string
  vpip: number // 入池倾向 0~1 (越高越松)
  aggression: number // 攻击性 0~1 (越高越爱加注)
  bluffRate: number // 诈唬概率 0~1
  callStickiness: number // 跟注粘性 0~1 (越高越难被吓跑)
  quotes: {
    fold: string[]
    check: string[]
    call: string[]
    raise: string[]
    allin: string[]
    win: string[]
    lose: string[]
    hitByItem: string[]
  }
}

export const AI_PERSONAS: AIPersona[] = [
  {
    id: 'ai_landlord',
    name: '厉飞雨',
    title: '铁血刀客',
    avatar: resolvePublicAsset('assets/characters/ai_landlord.png'),
    styleTag: '铁血刀客 · 硬汉跟注',
    tagColor: 'from-rose-600 to-amber-600',
    vpip: 0.72,
    aggression: 0.25,
    bluffRate: 0.08,
    callStickiness: 0.85,
    quotes: {
      fold: ['此局无胜算，暂避锋芒。', '收刀退步，下局再战！', '不恋残局，弃牌。'],
      check: ['先观其变，过牌。', '不动如山，过。'],
      call: ['厉某从不轻言退缩，跟了！', '区区筹码，吓不倒我，跟！', '且看下张牌如何，跟注！'],
      raise: ['刀锋已出，岂容试探？加注！', '这一手，厉某势在必得，加！'],
      allin: ['背水一战，全部押上！All-in！', '抽髓燃血，放手一搏！全下！'],
      win: ['痛快！这池灵石归我了！', '承让，刀下不留情面。'],
      lose: ['技不如人，输得心服口服！', '好牌！下局定要讨回来。'],
      hitByItem: ['哼，雕虫小技也敢暗算厉某？', '手下留情，别弄湿了我的刀鞘！'],
    },
  },
  {
    id: 'ai_farmer',
    name: '南宫婉',
    title: '掩月仙子',
    avatar: resolvePublicAsset('assets/characters/ai_farmer.png'),
    styleTag: '掩月仙子 · 紧凶凌厉',
    tagColor: 'from-pink-400 to-indigo-500',
    vpip: 0.35,
    aggression: 0.75,
    bluffRate: 0.05,
    callStickiness: 0.45,
    quotes: {
      fold: ['牌面杂乱，掩月宗不涉险局，弃。', '既无良机，便先行退下。'],
      check: ['静待月明，过牌。', '且看诸位道友如何出手。'],
      call: ['尚有一战之力，跟注。', '这一注，本座接下了。'],
      raise: ['素女轮回，剑光既出便无退路——加注！', '莫要小瞧了掩月宗，加注。'],
      allin: ['皓月当空，此局定鼎！全下！', '倾尽灵石，一决高下！All-in！'],
      win: ['承让了，诸位道友。', '月华所至，胜局已定~'],
      lose: ['竟被道友算计了一筹...', '倒是我轻敌了，下局再会。'],
      hitByItem: ['放肆！休得对本座无礼~', '道友这般顽皮，可别怪我不客气。'],
    },
  },
  {
    id: 'ai_tycoon',
    name: '玄骨上人',
    title: '极阴老祖',
    avatar: resolvePublicAsset('assets/characters/ai_tycoon.png'),
    styleTag: '极阴老祖 · 狂傲松凶',
    tagColor: 'from-purple-500 to-fuchsia-600',
    vpip: 0.85,
    aggression: 0.88,
    bluffRate: 0.35,
    callStickiness: 0.65,
    quotes: {
      fold: ['哼，无趣之局，本座不陪你们玩了！', '且让你们得意片刻，弃！'],
      check: ['先让尔等小辈蹦跶两下，过！'],
      call: ['区区灵石，本座多的是，跟！', '有意思，老夫便陪你看看！'],
      raise: ['桀桀桀！加注！胆小之辈速速弃牌！', '在本座面前，还轮不到你嚣张！加！'],
      allin: ['乾蓝冰焰起！全部灵石押上，谁敢接招？！', '桀桀桀，通吃全场！All-in！'],
      win: ['哈哈哈！姜还是老魔头辣！', '多谢诸位小辈孝敬的灵石~'],
      lose: ['可恶！居然栽在小辈手里！', '哼，不过一时大意罢了！'],
      hitByItem: ['大胆小辈！敢拿这等凡物砸本座？！', '找死不成？下把必将你筹码榨干！'],
    },
  },
  {
    id: 'ai_joker',
    name: '银月',
    title: '器灵狐仙',
    avatar: resolvePublicAsset('assets/characters/ai_joker.png'),
    styleTag: '器灵狐仙 · 诡变诈唬',
    tagColor: 'from-violet-400 to-rose-500',
    vpip: 0.65,
    aggression: 0.82,
    bluffRate: 0.52,
    callStickiness: 0.4,
    quotes: {
      fold: ['嘻嘻，风头不对，银月先溜啦~', '这把就不陪主人冒险了，弃牌！'],
      check: ['悄悄看一眼，过牌哟~', '银月先按兵不动~'],
      call: ['猜猜我手里藏着什么底牌？跟注~', '狐仙的直觉告诉我，这手要跟！'],
      raise: ['真真假假，你分得清吗？加注！', '幻术时间到~ 敢跟上银月吗？'],
      allin: ['月华幻境全开！All-in！敢揭穿我吗？', '嘻嘻，全部押上，心跳加速了吗~'],
      win: ['嘻嘻，兵不血刃！这就是妖狐的谋略~', '大获全胜，多谢各位道友赏脸啦~'],
      lose: ['呜哇，幻术被看穿了...', '主人别笑我，下把一定赢回来！'],
      hitByItem: ['哎呀！弄乱银月的银发啦！', '坏蛋！居然欺负可爱的器灵~'],
    },
  },
  {
    id: 'ai_abacus',
    name: '韩立',
    title: '青元剑尊',
    avatar: resolvePublicAsset('assets/characters/ai_abacus.png'),
    styleTag: '青元剑尊 · 稳健推演',
    tagColor: 'from-teal-400 to-emerald-600',
    vpip: 0.48,
    aggression: 0.68,
    bluffRate: 0.18,
    callStickiness: 0.55,
    quotes: {
      fold: ['赔率不妥，韩某先行撤退。', '留得青山在，此局弃牌。'],
      check: ['且慢，先控池观望，过牌。', '不动声色，过。'],
      call: ['神识推演过，底池赔率尚可，跟注。', '此局期望为正，韩某跟了。'],
      raise: ['青竹蜂云剑已成阵势，加注。', '既然露出破绽，韩某便不客气了，加！'],
      allin: ['掌天瓶灵光已现，此局必胜！全下！', '韩某从不打无把握之仗——All-in！'],
      win: ['稳扎稳打，方能大道可期。承让。', '侥幸而已，多谢诸位道友。'],
      lose: ['嘶...小概率天劫竟真落在我头上。', '看来得再回去闭关推演一番。'],
      hitByItem: ['道友莫闹，差点打翻我的掌天瓶！', '暗器？早被韩某神识察觉了。'],
    },
  },
  {
    id: 'ai_koi',
    name: '墨彩环',
    title: '锦鲤佳人',
    avatar: resolvePublicAsset('assets/characters/ai_koi.png'),
    styleTag: '锦鲤佳人 · 追梦少女',
    tagColor: 'from-pink-400 to-rose-500',
    vpip: 0.68,
    aggression: 0.42,
    bluffRate: 0.12,
    callStickiness: 0.78,
    quotes: {
      fold: ['这牌不太顺心呢，彩环先弃啦~', '不急不急，下一局一定有好运！'],
      check: ['轻轻过牌，看看花落谁家~', '彩环过牌~'],
      call: ['总觉得下一张会来好牌呢，跟注~', '请紫灵姐姐发张樱花好牌吧，跟！'],
      raise: ['呀，凑成好牌啦！加注~', '灵运眷顾，彩环也要加注一次！'],
      allin: ['难得一遇的好牌，彩环全部押上啦！', '赌上全部好运！All-in！'],
      win: ['太好了！谢谢各位公子承让~', '樱花飘落，果然带来好运了呢~'],
      lose: ['哎呀，只差一点点就成牌了呢...', '没关系，开心打牌最重要~'],
      hitByItem: ['呀，公子怎么如此顽皮呀~', '别欺负彩环嘛，哼~'],
    },
  },
]

export interface AIDecisionInput {
  persona: AIPersona
  holeCards: Card[]
  communityCards: Card[]
  myChips: number
  myCurrentBet: number
  highestBet: number
  potTotal: number
  bigBlind: number
  stage: 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER'
}

export interface AIDecisionResult {
  action: 'fold' | 'check' | 'call' | 'raise' | 'allin'
  raiseAmount: number // 如果 action 是 raise 或 allin，表示加注后的总单轮注额 (或额外投入额)
  quote: string
}

function pickQuote(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)]
}

export function makeAIDecision(input: AIDecisionInput): AIDecisionResult {
  const {
    persona,
    holeCards,
    communityCards,
    myChips,
    myCurrentBet,
    highestBet,
    potTotal,
    bigBlind,
    stage,
  } = input

  const toCall = Math.max(0, highestBet - myCurrentBet)
  const evalRes = evaluateHand(holeCards, communityCards)
  const hasDraw = evalRes.draws.length > 0

  // 计算归一化牌力强度 (0.0 ~ 1.0)
  let strength = 0.3
  if (stage === 'PRE_FLOP') {
    const chen = evaluatePreFlopStrength(holeCards) // 1~20
    strength = Math.min(1, chen / 15)
  } else {
    switch (evalRes.category) {
      case HandCategory.HIGH_CARD:
        strength = hasDraw ? 0.42 : 0.18
        break
      case HandCategory.ONE_PAIR:
        strength = hasDraw ? 0.62 : 0.52
        break
      case HandCategory.TWO_PAIR:
        strength = 0.74
        break
      case HandCategory.THREE_OF_A_KIND:
        strength = 0.83
        break
      case HandCategory.STRAIGHT:
      case HandCategory.FLUSH:
        strength = 0.91
        break
      default:
        strength = 0.98
        break
    }
  }

  // 加入随机波动与性格修正
  const effectiveStrength =
    strength + (Math.random() - 0.48) * 0.16 + (persona.vpip - 0.5) * 0.15

  // 是否触发诈唬
  const isBluffing =
    stage !== 'PRE_FLOP' &&
    strength < 0.4 &&
    Math.random() < persona.bluffRate * (toCall === 0 ? 0.7 : 0.35)

  // 情况 1：无需跟注 (toCall === 0)，可以免费 Check 或主动 Bet/Raise
  if (toCall === 0) {
    if (
      effectiveStrength > 0.65 ||
      (effectiveStrength > 0.48 && Math.random() < persona.aggression) ||
      isBluffing
    ) {
      // 主动下注
      const betFactor =
        effectiveStrength > 0.85 ? 0.85 : isBluffing ? 0.75 : 0.5
      let addChips = Math.max(
        bigBlind,
        Math.floor((potTotal * betFactor) / bigBlind) * bigBlind
      )

      if (addChips >= myChips * 0.8 || (effectiveStrength > 0.92 && Math.random() < 0.4)) {
        return {
          action: 'allin',
          raiseAmount: myChips,
          quote: pickQuote(persona.quotes.allin),
        }
      }

      return {
        action: 'raise',
        raiseAmount: Math.min(myChips, addChips),
        quote: pickQuote(persona.quotes.raise),
      }
    }

    return {
      action: 'check',
      raiseAmount: 0,
      quote: pickQuote(persona.quotes.check),
    }
  }

  // 情况 2：面临别人的下注 (toCall > 0)
  const potOdds = toCall / Math.max(1, potTotal + toCall)
  const chipPressure = toCall / Math.max(1, myChips)

  // 如果需要跟注的金额已经 >= 自己的全部筹码
  if (toCall >= myChips) {
    const allInThreshold = 0.58 - persona.callStickiness * 0.18
    if (effectiveStrength >= allInThreshold || (hasDraw && persona.id === 'ai_koi')) {
      return {
        action: 'allin',
        raiseAmount: myChips,
        quote: pickQuote(persona.quotes.allin),
      }
    }
    return {
      action: 'fold',
      raiseAmount: 0,
      quote: pickQuote(persona.quotes.fold),
    }
  }

  // 强牌或诈唬反加 (Re-raise)
  if (
    (effectiveStrength > 0.76 && Math.random() < persona.aggression) ||
    (isBluffing && chipPressure < 0.35)
  ) {
    let raiseExtra = Math.max(
      toCall + bigBlind * 2,
      Math.floor(((potTotal + toCall) * 0.75) / bigBlind) * bigBlind
    )
    if (raiseExtra >= myChips * 0.75 || effectiveStrength > 0.93) {
      return {
        action: 'allin',
        raiseAmount: myChips,
        quote: pickQuote(persona.quotes.allin),
      }
    }
    return {
      action: 'raise',
      raiseAmount: Math.min(myChips, raiseExtra),
      quote: pickQuote(persona.quotes.raise),
    }
  }

  // 决定是否 Call
  const callThreshold =
    0.36 + potOdds * 0.45 - persona.callStickiness * 0.18 + chipPressure * 0.2
  if (
    effectiveStrength >= callThreshold ||
    (toCall <= bigBlind * 2 && Math.random() < persona.vpip) ||
    (hasDraw && Math.random() < persona.callStickiness)
  ) {
    return {
      action: 'call',
      raiseAmount: toCall,
      quote: pickQuote(persona.quotes.call),
    }
  }

  return {
    action: 'fold',
    raiseAmount: 0,
    quote: pickQuote(persona.quotes.fold),
  }
}
