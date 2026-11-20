/**
 * 将 public 目录下的静态资源路径解析为兼容任意 Vite base（包括 GitHub Pages 项目子路径）的 URL。
 * 支持传入 `'assets/...'`、`'/assets/...'` 或 `'./assets/...'`，同时自动将旧版内置 `.png` 路径迁移到 `.webp`，并透传完整外部 URL。
 */
export function resolvePublicAsset(path: string): string {
  if (!path) return path
  if (/^(https?:|data:|blob:)/i.test(path)) return path
  const base = import.meta.env.BASE_URL || './'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = path.replace(/^\.\//, '').replace(/^\/+/, '')
  const migratedPath = normalizedPath.replace(
    /^assets\/(characters|chips)\/(.+)\.png$/i,
    'assets/$1/$2.webp'
  )
  return `${normalizedBase}${migratedPath}`
}
