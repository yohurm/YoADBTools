# YoUI Motion 分层（L1–L5）

壳与模块只走 `@yohu/ui` 公开 Yo*。禁止引擎互 import；跨层只经过 `spec/` 与 `reduced.ts`。

L5 包入口是 `@yohu/ui` 的 `packages/ui/src/index.ts`。`motion/index.ts` 只是族内桶，不是第二套 L5。

```
motion/
  spec/                 L1+L3：配方时长表 + MotionCatalog
  engines/
    presence/           L2 进出树（含 keyframes / list / chip）
    collapse/           L2 0fr/1fr
    rail/               L2 200↔48 一拍软弹簧
    travel/             L2 Travel + Reveal
    indicator/          L2 选中滑块
    swap/               L2 文案换牌
    theme/              L2 主题圆形揭示
  recipes/              L3 无 Solid 的壳配方 CSS
  reduced.ts / reduced.css
  css.ts                测试展开 @import
  index.ts              族内桶（不是 L5）
```

`tokens/motion.css` 只做 `@import` 桶。关键帧只许 `motion/**/*.css`。

实现只在 `engines/<layer>/`。根上没有 `.tsx` 转发。
