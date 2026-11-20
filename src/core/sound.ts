// Web Audio API 纯合成欢乐街机音效 & 趣味语音引擎 (零外部音频依赖，开箱即响)

class ArcadeSoundEngine {
  private ctx: AudioContext | null = null
  public enabled = true
  public voiceEnabled = true
  public bgmEnabled = false
  private bgmTimer: number | null = null
  private bgmStep = 0

  private getContext(): AudioContext | null {
    if (!this.enabled) return null
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  // 播放单音合成器
  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.2,
    delay = 0,
    slideToFreq?: number
  ) {
    const ctx = this.getContext()
    if (!ctx) return

    const now = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(slideToFreq, now + duration)
    }

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(volume, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + duration + 0.02)
  }

  // 1. UI 点击音效 (清脆气泡音)
  playClick() {
    this.playTone(580, 0.07, 'sine', 0.18, 0, 880)
  }

  // 2. 发牌音效 (轻快刷牌声)
  playDealCard() {
    this.playTone(320, 0.06, 'triangle', 0.15, 0, 660)
  }

  // 3. 筹码入池音效 (清脆金属叮当声)
  playChipBet() {
    this.playTone(1850, 0.08, 'sine', 0.12, 0)
    this.playTone(2450, 0.12, 'sine', 0.1, 0.035)
  }

  // 4. 过牌敲桌声 (低沉木头笃笃声)
  playCheck() {
    this.playTone(160, 0.06, 'triangle', 0.25, 0, 90)
    this.playTone(170, 0.07, 'triangle', 0.22, 0.08, 95)
  }

  // 5. 弃牌滑出声
  playFold() {
    this.playTone(360, 0.14, 'sine', 0.12, 0, 140)
  }

  // 6. 加注上扬音
  playRaise() {
    this.playTone(523.25, 0.09, 'triangle', 0.2, 0)
    this.playTone(659.25, 0.09, 'triangle', 0.2, 0.07)
    this.playTone(783.99, 0.16, 'triangle', 0.24, 0.14)
  }

  // 7. All-in 超级加倍警报高燃音效
  playAllIn() {
    this.playTone(440, 0.15, 'sawtooth', 0.22, 0, 880)
    this.playTone(554.37, 0.15, 'sawtooth', 0.22, 0.14, 1108.73)
    this.playTone(659.25, 0.35, 'sawtooth', 0.28, 0.28, 1318.5)
  }

  // 8. 炸弹/王炸爆炸声 (低频轰鸣+高频闪烁)
  playBomb() {
    this.playTone(150, 0.55, 'sawtooth', 0.35, 0, 32)
    this.playTone(110, 0.6, 'square', 0.3, 0.05, 28)
    this.playTone(880, 0.25, 'triangle', 0.2, 0.1, 1760)
  }

  // 9. 飞机/火箭呼啸声
  playRocket() {
    this.playTone(220, 0.45, 'sawtooth', 0.22, 0, 1200)
    this.playTone(523.25, 0.15, 'triangle', 0.22, 0.35)
    this.playTone(659.25, 0.15, 'triangle', 0.22, 0.48)
    this.playTone(783.99, 0.15, 'triangle', 0.22, 0.61)
    this.playTone(1046.5, 0.4, 'triangle', 0.28, 0.74)
  }

  // 10. 胜利欢呼号角 (欢乐斗地主赢牌曲风)
  playWinFanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5]
    const times = [0, 0.11, 0.22, 0.33, 0.5, 0.63]
    const durs = [0.1, 0.1, 0.1, 0.16, 0.12, 0.4]
    notes.forEach((n, i) => {
      this.playTone(n, durs[i], 'triangle', 0.25, times[i])
    })
  }

  // 11. 惜败叹息音效
  playLoseSound() {
    const notes = [440, 415.3, 392, 349.23]
    notes.forEach((n, i) => {
      this.playTone(n, 0.22, 'sine', 0.18, i * 0.18)
    })
  }

  // 12. 互动道具投掷与命中音效
  playItemThrow() {
    this.playTone(300, 0.22, 'sine', 0.18, 0, 750)
    this.playTone(180, 0.18, 'square', 0.22, 0.24, 80)
  }

  // 13. 欢乐语音播报 (使用浏览器原生 SpeechSynthesis 朗读经典短语)
  speak(text: string, pitch = 1.1, rate = 1.25) {
    if (!this.enabled || !this.voiceEnabled) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = 'zh-CN'
      utter.pitch = pitch
      utter.rate = rate
      utter.volume = 0.75
      window.speechSynthesis.speak(utter)
    } catch {
      // 忽略部分浏览器语音限制
    }
  }

  // 14. 轻快街机背景音乐循环 (合成器轻音乐)
  toggleBgm(force?: boolean) {
    this.bgmEnabled = force !== undefined ? force : !this.bgmEnabled
    if (this.bgmEnabled) {
      this.startBgmLoop()
    } else {
      this.stopBgmLoop()
    }
    return this.bgmEnabled
  }

  private startBgmLoop() {
    this.stopBgmLoop()
    // 欢快五声音阶旋律 (C5, D5, E5, G5, A5)
    const melody = [523.25, 587.33, 659.25, 783.99, 659.25, 880, 783.99, 587.33]
    this.bgmTimer = window.setInterval(() => {
      if (!this.bgmEnabled || !this.enabled) return
      const note = melody[this.bgmStep % melody.length]
      this.playTone(note, 0.18, 'sine', 0.04, 0)
      if (this.bgmStep % 2 === 0) {
        this.playTone(note / 2, 0.15, 'triangle', 0.03, 0)
      }
      this.bgmStep++
    }, 320)
  }

  private stopBgmLoop() {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer)
      this.bgmTimer = null
    }
  }
}

export const sound = new ArcadeSoundEngine()
