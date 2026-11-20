/**
 * 将筹码/欢乐豆数量格式化为紧凑缩写（如 10k、119.3k、1.25M）
 * 小于 10,000 保留千分位完整数字，避免低盲注场次丢失精度
 */
export function formatChips(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(value))

  if (abs >= 1_000_000) {
    const m = abs / 1_000_000
    const text = Number(m.toFixed(2)).toString()
    return `${sign}${text}M`
  }

  if (abs >= 10_000) {
    const k = abs / 1_000
    const text = Number(k.toFixed(1)).toString()
    return `${sign}${text}k`
  }

  return `${sign}${abs.toLocaleString()}`
}

/**
 * 紧凑步进显示（1,000 起即缩写为 1k，用于步进按钮如 100 / 500 / 1k / 5k）
 */
export function formatChipStep(value: number): string {
  const abs = Math.abs(Math.trunc(value))
  if (abs >= 1_000_000) {
    return `${Number((abs / 1_000_000).toFixed(2))}M`
  }
  if (abs >= 1_000) {
    return `${Number((abs / 1_000).toFixed(1))}k`
  }
  return abs.toString()
}
