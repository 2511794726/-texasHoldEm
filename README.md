# 欢乐德州扑克（网页版）

基于 Vue 3 + TypeScript + Pinia + Pixi.js + Tailwind CSS 构建的纯前端单机 6 人德州扑克网页游戏，支持智能 AI 对战、街机筹码特效以及一键隐蔽 / 摸鱼伪装模式。

## 在线体验

- GitHub Pages 地址：`https://2511794726.github.io/-texasHoldEm/`

## 核心特性

- **6 人单机 AI 牌桌**：独立德州扑克发牌、边池与比牌结算引擎，不同风格的 AI 对手陪练。
- **街机视觉与动效**：Pixi.js + GSAP 飞筹码动画、实时牌力提示器、多场次房间与装扮商城。
- **一键隐蔽 / 摸鱼伪装**：支持老板键（默认 `Esc` / `` ` `` / `Alt+Z` / 鼠标中键）秒切 Excel 财务核算表或 API 接口文档界面，并支持小窗紧凑模式。
- **纯前端零后端**：Web Audio API 本地合成音效，对局资产与账单通过浏览器本地持久化保存。

## 本地开发与构建

```bash
# 安装依赖
npm install

# 启动本地开发服务器
npm run dev

# 类型检查与生产构建
npm run build
```
